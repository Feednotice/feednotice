// HTTP server: subscription, confirmation, unsubscribe and account pages, plus the hooks
// used by the MTA container (bounces) and, later, by email provider webhooks.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import type { Ctx } from '../context.ts';
import { loadFeedCached, normalizeFeedUrl } from '../feeds.ts';
import { isLocale, negotiate, type Locale } from '../i18n/index.ts';
import { parseBounce } from '../mail/bounce.ts';
import { recipientTagger } from '../mail/mailer.ts';
import { unsubscribeUrl } from '../mail/render.ts';
import { allow, HOUR } from '../ratelimit.ts';
import {
  confirmSubscription, deleteSubscriber, digestFeeds, getSubscriber, getSubscription, handleMailEvent, isCadence,
  listSubscriptions, requestManageLink, requestSubscription, setCadence, setDigestSchedule, setLocale,
  stopDigests, unsubscribe, type MailEventType,
} from '../subscriptions.ts';
import {
  addDomain, defaultVerifyDeps, deletePublisher, listDomains, openPublisher, publisherForFeedUrl, publisherStats,
  removeDomain, requestPublisherLink, updateProfile, verifyDomain,
} from '../publishers.ts';
import { fingerprint, verifyEmailToken, verifyToken } from '../tokens.ts';
import { feedForCallback, notify, verifyIntent } from '../websub.ts';
import { loadBrand, type Brand } from './brand.ts';
import * as v from './views.ts';

type Req = http.IncomingMessage;
type Res = http.ServerResponse;

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  // URLs carry tokens: they must never leak to another site.
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

function send(res: Res, status: number, body: string | Buffer, type = 'text/html; charset=utf-8', extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, ...extra });
  res.end(body);
}

function redirect(res: Res, location: string): void {
  res.writeHead(303, { ...SECURITY_HEADERS, Location: location });
  res.end();
}

async function readBody(req: Req, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readForm(req: Req): Promise<URLSearchParams> {
  return new URLSearchParams(await readBody(req, 16 * 1024));
}

/**
 * The visitor, as rate limits see it: an IPv4 address, or the /64 network of an IPv6 one (a
 * single IPv6 subscriber usually holds a whole /64, i.e. countless addresses).
 */
function clientIp(ctx: Ctx, req: Req): string {
  let ip = req.socket.remoteAddress ?? 'unknown';
  if (ctx.config.trustProxy) {
    // The last address is the one our own reverse proxy saw; earlier ones come from the
    // client and could be made up to get around the limits.
    const xff = req.headers['x-forwarded-for'];
    const last = (Array.isArray(xff) ? xff.join(',') : xff)?.split(',').pop()?.trim();
    if (last) ip = last;
  }
  return limitKey(ip);
}

export function limitKey(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!net.isIPv6(ip)) return ip;
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

function authorized(ctx: Ctx, req: Req): boolean {
  const { webhookSecret } = ctx.config;
  if (!webhookSecret) return false;
  // Compared as HMACs: same length, constant time.
  const digest = (v: string) => createHmac('sha256', 'webhook').update(v).digest();
  return timingSafeEqual(digest(req.headers.authorization ?? ''), digest(`Bearer ${webhookSecret}`));
}

/**
 * A verified publisher's name is shown only if the feed was really served by their site: a
 * redirect (an open redirect on their domain, say) must not lend it to someone else's feed.
 */
function brandingFor(ctx: Ctx, loaded: { url: string; fetched: { finalUrl: string } }): ReturnType<typeof publisherForFeedUrl> {
  try {
    if (new URL(loaded.url).host !== new URL(loaded.fetched.finalUrl).host) return null;
  } catch {
    return null;
  }
  return publisherForFeedUrl(ctx, loaded.url);
}

export function createServer(ctx: Ctx): http.Server {
  const brand = loadBrand(ctx.config.brandDir);
  return http.createServer((req, res) => {
    handle(ctx, brand, req, res).catch((e: Error & { status?: number }) => {
      ctx.log(`error ${req.method} ${req.url?.split('?')[0]}: ${e.stack}`);
      if (res.headersSent) return void res.end();
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = v.page(ctx.config, brand, negotiate(url.searchParams.get('lang'), req.headers['accept-language'], ctx.config.defaultLocale));
      send(res, e.status ?? 500, v.messagePage(p, p.m.errorTitle, p.m.errorText));
    });
  });
}

async function handle(ctx: Ctx, brand: Brand, req: Req, res: Res): Promise<void> {
  const { config } = ctx;
  // Parsed as a path only: "//host/…" must not be read as another site.
  const url = new URL(`http://localhost${(req.url ?? '/').startsWith('/') ? req.url : `/${req.url}`}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const now = ctx.now();
  const explicitLang = url.searchParams.get('lang');
  const locale = (explicit: string | null = explicitLang, fallback: Locale = config.defaultLocale): Locale =>
    negotiate(explicit, req.headers['accept-language'], fallback);
  const here = `${path}${url.search}`;

  if (method === 'GET' && path === '/') return send(res, 200, v.homePage(v.page(config, brand, locale(), here)));
  if (method === 'GET' && path === '/style.css') return send(res, 200, v.STYLE + brand.css, 'text/css; charset=utf-8', { 'Cache-Control': 'public, max-age=86400' });
  const asset = method === 'GET' ? brand.files.get(path) : undefined;
  if (asset) return send(res, 200, asset.body, asset.type, { 'Cache-Control': 'public, max-age=604800' });
  if (method === 'GET' && path === '/health') return send(res, 200, 'ok', 'text/plain; charset=utf-8');
  if (method === 'GET' && path === '/privacy') return send(res, 200, v.privacyPage(v.page(config, brand, locale(), here)));
  if (method === 'GET' && path === '/terms') return send(res, 200, v.termsPage(v.page(config, brand, locale(), here)));
  if (method === 'GET' && path === '/legal') return send(res, 200, v.legalPage(v.page(config, brand, locale(), here)));
  if (method === 'GET' && path === '/robot') return send(res, 200, v.robotPage(v.page(config, brand, locale(), here)));
  if (method === 'GET' && path === '/publishers') {
    const raw = url.searchParams.get('feed');
    const feed = raw ? normalizeFeedUrl(raw) : null;
    const readers = url.searchParams.get('readers');
    const color = /^#[0-9a-f]{6}$/i.test(url.searchParams.get('color') ?? '') ? (url.searchParams.get('color') as string).toLowerCase() : v.DEFAULT_BUTTON_COLOR;
    const html = v.publishersPage(v.page(config, brand, locale(), here), feed, undefined, { readers: isLocale(readers) ? readers : null, color });
    // The preview shows the button exactly as the publisher will paste it: its one inline style is allowed by hash.
    const styleHash = createHash('sha256').update(v.buttonStyle(color)).digest('base64');
    return send(res, 200, html, undefined, feed ? { 'Content-Security-Policy': SECURITY_HEADERS['Content-Security-Policy'].replace("style-src 'self'", `style-src 'self' 'unsafe-hashes' 'sha256-${styleHash}'`) } : {});
  }

  // --- Publisher space: sign-in link, then a dashboard reached by that link ---
  if (method === 'POST' && path === '/publishers') {
    const form = await readForm(req);
    const p = v.page(config, brand, locale(form.get('lang')));
    if (form.get('terms') !== '1') return send(res, 422, v.publishersPage(p, null, p.m.publisherTermsRequired));
    const r = await requestPublisherLink(ctx, form.get('email') ?? '', clientIp(ctx, req), p.locale);
    if (r === 'invalid') return send(res, 422, v.messagePage(p, p.m.publisherTitle, p.m.invalidEmail));
    if (r === 'rate-limited') return send(res, 429, v.messagePage(p, p.m.tooManyTitle, p.m.tooManyText));
    return send(res, 200, v.publisherSentPage(p));
  }
  const pm = /^\/p\/([\w.-]+)$/.exec(path);
  if (pm) {
    const email = verifyEmailToken(config.secret, pm[1], now);
    const form = method === 'POST' ? await readForm(req) : null;
    const p = v.page(config, brand, locale(form?.get('lang') ?? explicitLang), here);
    if (!email) return send(res, 404, v.messagePage(p, p.m.expiredTitle, p.m.publisherExpiredText));
    const publisher = openPublisher(ctx, email, p.locale);
    if (method === 'GET') {
      if (isLocale(explicitLang) && explicitLang !== publisher.locale) ctx.db.prepare('UPDATE publishers SET locale = ? WHERE id = ?').run(explicitLang, publisher.id);
      const fresh = openPublisher(ctx, email, p.locale);
      return send(res, 200, v.publisherPage(p, path, fresh, listDomains(ctx, fresh.id), publisherStats(ctx, fresh.id), url.searchParams.get('result')));
    }
    if (form) {
      const action = form.get('action');
      const domainId = Number(form.get('domain'));
      const owned = listDomains(ctx, publisher.id).find((d) => d.id === domainId);
      let result = '';
      if (action === 'delete') {
        deletePublisher(ctx, publisher.id);
        return send(res, 200, v.messagePage(p, p.m.publisherDeletedTitle, p.m.publisherDeletedText));
      }
      if (action === 'profile') {
        updateProfile(ctx, publisher.id, form.get('name') ?? '', form.get('welcome') ?? '');
        result = 'saved';
      }
      if (action === 'add') {
        const r = addDomain(ctx, publisher.id, form.get('domain') ?? '');
        result = r === 'added' ? '' : r;
      }
      if (action === 'remove' && owned) removeDomain(ctx, publisher.id, owned.id);
      if (action === 'verify' && owned) {
        // Each check reaches out to the publisher's server or DNS: limited per account.
        if (!allow(ctx.db, `pub-verify:${publisher.id}`, 30, HOUR, now)) return send(res, 429, v.messagePage(p, p.m.tooManyTitle, p.m.tooManyText));
        const method = await verifyDomain(ctx, owned, ctx.publisherVerify ?? defaultVerifyDeps(ctx));
        result = method ? 'verified' : 'failed';
      }
      return redirect(res, `${path}?lang=${p.locale}${result ? `&result=${result}` : ''}`);
    }
  }

  // --- Feed preview and subscription form ---
  if (method === 'GET' && path === '/s') {
    const p = v.page(config, brand, locale(), here);
    // "flux" is accepted too: links published before the switch to English use it.
    const raw = url.searchParams.get('feed') ?? url.searchParams.get('flux') ?? '';
    if (!raw) return send(res, 200, v.homePage(p));
    const feedUrl = normalizeFeedUrl(raw);
    if (!feedUrl) return send(res, 400, v.feedErrorPage(p, raw, p.m.invalidFeedUrl));
    // Each preview makes a request to a third party: limit them per visitor.
    if (!allow(ctx.db, `preview-ip:${fingerprint(config.secret, clientIp(ctx, req))}`, 60, HOUR, now)) {
      return send(res, 429, v.messagePage(p, p.m.tooManyTitle, p.m.tooManyText));
    }
    const loaded = await loadFeedCached(ctx, feedUrl);
    if (!loaded.ok && loaded.candidates) return send(res, 200, v.chooseFeedPage(p, loaded.candidates));
    if (!loaded.ok) return send(res, 422, v.feedErrorPage(p, feedUrl, p.m.feedError(loaded.code)));
    return send(res, 200, v.subscribePage(p, loaded.url, loaded.feed, { publisher: brandingFor(ctx, loaded) }));
  }
  if (method === 'POST' && path === '/s') {
    const form = await readForm(req);
    const p = v.page(config, brand, locale(form.get('lang')));
    const feedUrl = form.get('feed') ?? '';
    const email = form.get('email') ?? '';
    const cadence = form.get('cadence') ?? 'immediate';
    const outcome = await requestSubscription(ctx, { email, feedUrl, cadence, ip: clientIp(ctx, req), locale: p.locale });
    if (outcome.kind === 'sent') return send(res, 200, v.checkMailboxPage(p));
    if (outcome.kind === 'rate-limited') return send(res, 429, v.messagePage(p, p.m.tooManyTitle, p.m.tooManyText));
    if (outcome.kind === 'invalid-feed-url') return send(res, 422, v.feedErrorPage(p, feedUrl, p.m.invalidFeedUrl));
    if (outcome.kind === 'feed-error') return send(res, 422, v.feedErrorPage(p, feedUrl, p.m.feedError(outcome.code)));
    // Showing the form again may read the feed: counted like a preview.
    if (!allow(ctx.db, `preview-ip:${fingerprint(config.secret, clientIp(ctx, req))}`, 60, HOUR, now)) {
      return send(res, 429, v.messagePage(p, p.m.tooManyTitle, p.m.tooManyText));
    }
    const loaded = await loadFeedCached(ctx, normalizeFeedUrl(feedUrl) as string);
    if (!loaded.ok) return send(res, 422, v.feedErrorPage(p, feedUrl, p.m.feedError(loaded.code)));
    const error = outcome.kind === 'invalid-email' ? p.m.invalidEmail : p.m.chooseCadence;
    return send(res, 422, v.subscribePage(p, loaded.url, loaded.feed, { email, cadence, error, publisher: brandingFor(ctx, loaded) }));
  }

  // --- Confirmation (double opt-in) ---
  let m = /^\/c\/([\w.-]+)$/.exec(path);
  if (m) {
    const id = verifyToken(config.secret, 'confirm', m[1], now);
    const sub = id ? getSubscription(ctx, id) : null;
    if (method === 'GET') {
      const p = v.page(config, brand, locale(explicitLang, sub?.locale), here);
      if (!sub) return send(res, 404, v.messagePage(p, p.m.expiredTitle, p.m.confirmExpiredText));
      if (sub.status === 'active') return send(res, 200, v.confirmedPage(p, sub.feed.title, unsubscribeUrl(config, sub.id)));
      return send(res, 200, v.confirmPage(p, path, sub.feed.title, sub.cadence));
    }
    if (method === 'POST') {
      const form = await readForm(req);
      const p = v.page(config, brand, locale(form.get('lang'), sub?.locale));
      if (!sub) return send(res, 404, v.messagePage(p, p.m.expiredTitle, p.m.confirmExpiredText));
      confirmSubscription(ctx, sub.id);
      if (isLocale(form.get('lang'))) setLocale(ctx, sub.subscriber_id, p.locale);
      return send(res, 200, v.confirmedPage(p, sub.feed.title, unsubscribeUrl(config, sub.id)));
    }
  }

  // --- Unsubscribe: GET shows a button, POST unsubscribes (also RFC 8058, without further confirmation) ---
  m = /^\/u\/([\w.-]+)$/.exec(path);
  if (m) {
    const id = verifyToken(config.secret, 'unsubscribe', m[1], now);
    const sub = id ? getSubscription(ctx, id) : null;
    if (method === 'POST') {
      const form = await readForm(req).catch(() => new URLSearchParams());
      const p = v.page(config, brand, locale(form.get('lang'), sub?.locale));
      if (!id) return send(res, 404, v.messagePage(p, p.m.invalidUnsubscribeTitle, p.m.invalidUnsubscribeText));
      unsubscribe(ctx, id);
      return send(res, 200, v.unsubscribedPage(p));
    }
    if (method === 'GET') {
      const p = v.page(config, brand, locale(explicitLang, sub?.locale), here);
      if (!id) return send(res, 404, v.messagePage(p, p.m.invalidUnsubscribeTitle, p.m.invalidUnsubscribeText));
      if (!sub) return send(res, 200, v.unsubscribedPage(p));
      return send(res, 200, v.unsubscribePage(p, path, sub.feed.title));
    }
  }

  // --- Stop a merged digest (every feed it gathers): same GET/POST pattern, RFC 8058 included ---
  m = /^\/u\/(daily|weekly)\/([\w.-]+)$/.exec(path);
  if (m) {
    const kind = m[1] as 'daily' | 'weekly';
    const id = verifyToken(config.secret, kind === 'daily' ? 'stop-daily' : 'stop-weekly', m[2], now);
    const subscriber = id ? getSubscriber(ctx, id) : null;
    if (method === 'POST') {
      const form = await readForm(req).catch(() => new URLSearchParams());
      const p = v.page(config, brand, locale(form.get('lang'), subscriber?.locale));
      if (!id) return send(res, 404, v.messagePage(p, p.m.invalidUnsubscribeTitle, p.m.invalidUnsubscribeText));
      stopDigests(ctx, id, kind);
      return send(res, 200, v.stoppedDigestPage(p));
    }
    if (method === 'GET') {
      const p = v.page(config, brand, locale(explicitLang, subscriber?.locale), here);
      if (!id) return send(res, 404, v.messagePage(p, p.m.invalidUnsubscribeTitle, p.m.invalidUnsubscribeText));
      const feeds = subscriber ? digestFeeds(ctx, subscriber.id, kind) : [];
      if (feeds.length === 0) return send(res, 200, v.stoppedDigestPage(p));
      return send(res, 200, v.stopDigestPage(p, path, kind, feeds));
    }
  }

  // --- Account (magic link) ---
  if (path === '/account') {
    if (method === 'GET') return send(res, 200, v.accountRequestPage(v.page(config, brand, locale(), here)));
    if (method === 'POST') {
      const form = await readForm(req);
      const p = v.page(config, brand, locale(form.get('lang')));
      const r = await requestManageLink(ctx, form.get('email') ?? '', clientIp(ctx, req));
      if (r === 'invalid') return send(res, 422, v.accountRequestPage(p, p.m.invalidEmail));
      if (r === 'rate-limited') return send(res, 429, v.messagePage(p, p.m.tooManyTitle, p.m.tooManyText));
      return send(res, 200, v.accountLinkSentPage(p));
    }
  }
  m = /^\/m\/([\w.-]+)$/.exec(path);
  if (m) {
    const id = verifyToken(config.secret, 'manage', m[1], now);
    const subscriber = id ? getSubscriber(ctx, id) : null;
    if (method === 'GET') {
      const p = v.page(config, brand, locale(explicitLang, subscriber?.locale), here);
      if (!subscriber) return send(res, 404, v.messagePage(p, p.m.expiredTitle, p.m.manageExpiredText));
      // Switching language here also switches the language of the emails.
      if (isLocale(explicitLang) && explicitLang !== subscriber.locale) setLocale(ctx, subscriber.id, explicitLang);
      return send(res, 200, v.accountPage(p, path, subscriber.email, listSubscriptions(ctx, subscriber.id)));
    }
    if (method === 'POST') {
      const form = await readForm(req);
      const p = v.page(config, brand, locale(form.get('lang'), subscriber?.locale));
      if (!subscriber) return send(res, 404, v.messagePage(p, p.m.expiredTitle, p.m.manageExpiredText));
      const action = form.get('action');
      const subId = Number(form.get('subscription'));
      if (action === 'delete-all') {
        deleteSubscriber(ctx, subscriber.id);
        return send(res, 200, v.messagePage(p, p.m.accountErasedTitle, p.m.accountErasedText));
      }
      const owned = listSubscriptions(ctx, subscriber.id).some((s) => s.id === subId);
      if (owned && action === 'stop') unsubscribe(ctx, subId);
      if (owned && action === 'cadence') {
        const cadence = form.get('cadence');
        if (isCadence(cadence)) setCadence(ctx, subscriber.id, subId, cadence);
      }
      if (owned && action === 'schedule') {
        const hour = Number(form.get('hour'));
        const weekday = form.has('day') ? Number(form.get('day')) : null;
        setDigestSchedule(ctx, subscriber.id, subId, hour, weekday);
      }
      if (!getSubscriber(ctx, subscriber.id)) return send(res, 200, v.unsubscribedPage(p));
      return redirect(res, `${path}?lang=${p.locale}`);
    }
  }

  // --- WebSub callbacks: the hub verifies our intent (GET) and announces new content (POST) ---
  m = /^\/websub\/([\w.-]+)$/.exec(path);
  if (m) {
    const feed = feedForCallback(ctx, m[1]);
    if (!feed) return send(res, 404, 'unknown subscription', 'text/plain; charset=utf-8');
    if (method === 'GET') {
      const challenge = verifyIntent(ctx, feed, url.searchParams);
      if (challenge === null) return send(res, 404, 'not confirmed', 'text/plain; charset=utf-8');
      return send(res, 200, challenge, 'text/plain; charset=utf-8');
    }
    if (method === 'POST') {
      const sig = req.headers['x-hub-signature'];
      await notify(ctx, feed, req, Array.isArray(sig) ? sig[0] : sig);
      req.resume();
      // 2xx whatever the outcome: a bad signature is silently ignored, as the specification asks.
      return send(res, 202, '', 'text/plain; charset=utf-8');
    }
  }

  // --- Bounces from the MTA container: the raw message, as received ---
  if (method === 'POST' && path === '/hooks/bounce') {
    if (!authorized(ctx, req)) return send(res, 401, 'unauthorized', 'text/plain; charset=utf-8');
    const raw = await readBody(req, 1024 * 1024).catch(() => null);
    // Too large to be a bounce: accepted and dropped, or the MTA would retry it for days.
    if (raw === null) return send(res, 200, 'ok 0 (too large)', 'text/plain; charset=utf-8', { Connection: 'close' });
    const events = parseBounce(raw, recipientTagger(config.secret));
    for (const ev of events) handleMailEvent(ctx, ev.email, ev.type);
    // Always 200 once authenticated: a message we cannot use must not be retried forever.
    return send(res, 200, `ok ${events.length}`, 'text/plain; charset=utf-8');
  }

  // --- Bounces and complaints from an email provider webhook (generic format) ---
  if (method === 'POST' && path === '/hooks/mail-events') {
    if (!authorized(ctx, req)) return send(res, 401, 'unauthorized', 'text/plain; charset=utf-8');
    const payload = JSON.parse(await readBody(req, 1024 * 1024)) as { events?: { email?: string; type?: string }[] };
    const types: MailEventType[] = ['hard_bounce', 'soft_bounce', 'complaint', 'unsubscribe'];
    for (const ev of payload.events ?? []) {
      if (typeof ev.email === 'string' && types.includes(ev.type as MailEventType)) handleMailEvent(ctx, ev.email, ev.type as MailEventType);
    }
    return send(res, 200, 'ok', 'text/plain; charset=utf-8');
  }

  const p = v.page(config, brand, locale(), here);
  send(res, 404, v.messagePage(p, p.m.notFoundTitle, p.m.notFoundText));
}
