// Publisher space. Any feed works without it; a publisher who proves they control a domain
// gets their name and welcome text on the subscribe page of that domain's feeds, and sees
// how many people follow them — never who.
//
// Sign-in is by magic link, like subscribers. The account (whose email is personal data)
// is created only when the link is opened.

import { randomBytes } from 'node:crypto';
import dns from 'node:dns';
import type { Ctx } from './context.ts';
import { transaction } from './db.ts';
import { fetchFeed } from './feed/fetch.ts';
import type { Locale } from './i18n/index.ts';
import { sendInBackground } from './mail/quota.ts';
import { renderPublisherLinkMail } from './mail/render.ts';
import { allow, DAY, HOUR } from './ratelimit.ts';
import { normalizeEmail } from './subscriptions.ts';
import { fingerprint, signEmailToken } from './tokens.ts';

export interface PublisherRow {
  id: number;
  email: string;
  name: string;
  welcome_text: string;
  plan: 'free' | 'pro' | 'business';
  locale: Locale;
  created_at: number;
  terms_version: number | null;
  terms_accepted_at: number | null;
}

export interface DomainRow {
  id: number;
  publisher_id: number;
  domain: string;
  token: string;
  verified_at: number | null;
  method: 'file' | 'dns' | null;
  checked_at: number | null;
  failures: number;
  created_at: number;
}

/** Version of the terms of use; bump it (and TERMS_DATE) when they change. */
export const TERMS_VERSION = 1;
export const TERMS_DATE = Date.UTC(2026, 10, 4);

export const MAX_DOMAINS = 10;
export const NAME_MAX = 80;
export const WELCOME_MAX = 500;
/** Counts below this are shown as "fewer than 5": nobody can work out who subscribed. */
export const COUNT_FLOOR = 5;
const RECHECK_EVERY = 30 * DAY;
const FAILURES_BEFORE_LOSS = 3;

/** What the publisher publishes, as a file or a DNS TXT record. */
export function verificationRecord(domain: Pick<DomainRow, 'token'>): string {
  return `feednotice-verification=${domain.token}`;
}

export function verificationFileUrl(domain: Pick<DomainRow, 'domain'>): string {
  return `https://${domain.domain}/.well-known/feednotice.txt`;
}

export function verificationDnsName(domain: Pick<DomainRow, 'domain'>): string {
  return `_feednotice.${domain.domain}`;
}

/** "https://www.Example.org/blog" → "www.example.org". Rejects IP addresses and single labels. */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw || raw.length > 300) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, '');
  if (!host.includes('.') || host.length > 253 || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  return host;
}

/** Sends the sign-in link. Same answer whatever the address; nothing is stored. */
export async function requestPublisherLink(ctx: Ctx, rawEmail: string, ip: string, locale: Locale): Promise<'sent' | 'invalid' | 'rate-limited'> {
  const { config, db } = ctx;
  const email = normalizeEmail(rawEmail);
  if (!email) return 'invalid';
  const now = ctx.now();
  if (!allow(db, `pub-ip:${fingerprint(config.secret, ip)}`, 20, HOUR, now)) return 'rate-limited';
  if (!allow(db, `pub-mail:${fingerprint(config.secret, email)}`, 3, HOUR, now)) return 'sent';
  const token = signEmailToken(config.secret, email, now + DAY);
  sendInBackground(ctx, renderPublisherLinkMail(config, locale, email, `${config.baseUrl}/p/${token}`));
  return 'sent';
}

/**
 * Opening the link creates the account if needed: that click is the confirmation. The link is
 * only sent once the terms are accepted, so opening it records that acceptance.
 */
export function openPublisher(ctx: Ctx, email: string, locale: Locale): PublisherRow {
  const now = ctx.now();
  ctx.db.prepare(`INSERT INTO publishers (email, locale, created_at, terms_version, terms_accepted_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (email) DO UPDATE SET terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at
    WHERE publishers.terms_version IS NULL OR publishers.terms_version < excluded.terms_version`).run(email, locale, now, TERMS_VERSION, now);
  return ctx.db.prepare('SELECT * FROM publishers WHERE email = ?').get(email) as unknown as PublisherRow;
}

export function updateProfile(ctx: Ctx, publisherId: number, name: string, welcome: string): void {
  ctx.db.prepare('UPDATE publishers SET name = ?, welcome_text = ? WHERE id = ?')
    .run(name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX), welcome.trim().replace(/\r\n?/g, '\n').slice(0, WELCOME_MAX), publisherId);
}

export function listDomains(ctx: Ctx, publisherId: number): DomainRow[] {
  return ctx.db.prepare('SELECT * FROM publisher_domains WHERE publisher_id = ? ORDER BY domain').all(publisherId) as unknown as DomainRow[];
}

export function addDomain(ctx: Ctx, publisherId: number, input: string): 'added' | 'invalid' | 'limit' {
  const domain = normalizeDomain(input);
  if (!domain) return 'invalid';
  const count = (ctx.db.prepare('SELECT COUNT(*) AS n FROM publisher_domains WHERE publisher_id = ?').get(publisherId) as { n: number }).n;
  if (count >= MAX_DOMAINS) return 'limit';
  ctx.db.prepare('INSERT INTO publisher_domains (publisher_id, domain, token, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (publisher_id, domain) DO NOTHING')
    .run(publisherId, domain, randomBytes(18).toString('base64url'), ctx.now());
  return 'added';
}

export function removeDomain(ctx: Ctx, publisherId: number, domainId: number): void {
  ctx.db.prepare('DELETE FROM publisher_domains WHERE id = ? AND publisher_id = ?').run(domainId, publisherId);
}

export function deletePublisher(ctx: Ctx, publisherId: number): void {
  ctx.db.prepare('DELETE FROM publishers WHERE id = ?').run(publisherId);
}

/** How a proof is looked up; replaceable in tests. */
export interface VerifyDeps {
  fetchText(url: string): Promise<string | null>;
  resolveTxt(name: string): Promise<string[]>;
}

export function defaultVerifyDeps(ctx: Ctx): VerifyDeps {
  return {
    async fetchText(url) {
      // No redirect: the proof must be served by the domain itself.
      const res = await fetchFeed(url, { userAgent: ctx.config.userAgent, maxBytes: 4096, timeoutMs: 10_000, maxRedirects: 0, allowPrivate: ctx.config.allowPrivateFeeds });
      return res.kind === 'ok' ? res.body : null;
    },
    async resolveTxt(name) {
      try {
        return (await dns.promises.resolveTxt(name)).map((chunks) => chunks.join(''));
      } catch {
        return [];
      }
    },
  };
}

/**
 * Looks for the proof (file first, then DNS). On success the domain is verified for this
 * publisher, and for no one else: whoever controls the domain now is the one who counts.
 */
export async function verifyDomain(ctx: Ctx, domain: DomainRow, deps: VerifyDeps): Promise<'file' | 'dns' | null> {
  const record = verificationRecord(domain);
  const file = await deps.fetchText(verificationFileUrl(domain));
  let method: 'file' | 'dns' | null = file?.split(/\s+/).includes(record) ? 'file' : null;
  if (!method && (await deps.resolveTxt(verificationDnsName(domain))).some((t) => t.trim() === record)) method = 'dns';
  const now = ctx.now();
  const { db } = ctx;
  if (method) {
    transaction(db, () => {
      db.prepare('UPDATE publisher_domains SET verified_at = COALESCE(verified_at, ?), method = ?, checked_at = ?, failures = 0 WHERE id = ?')
        .run(now, method, now, domain.id);
      db.prepare('UPDATE publisher_domains SET verified_at = NULL, method = NULL WHERE domain = ? AND id <> ?').run(domain.domain, domain.id);
    });
  } else {
    db.prepare(`UPDATE publisher_domains SET checked_at = ?, failures = failures + 1,
        verified_at = CASE WHEN failures + 1 >= ? THEN NULL ELSE verified_at END,
        method = CASE WHEN failures + 1 >= ? THEN NULL ELSE method END
      WHERE id = ?`).run(now, FAILURES_BEFORE_LOSS, FAILURES_BEFORE_LOSS, domain.id);
  }
  return method;
}

/** Verified domains are checked again every 30 days; three failures in a row and the proof is lost. */
export async function recheckDomains(ctx: Ctx, deps: VerifyDeps = defaultVerifyDeps(ctx), limit = 10): Promise<void> {
  const due = ctx.db.prepare(`SELECT * FROM publisher_domains WHERE verified_at IS NOT NULL AND checked_at < ?
    ORDER BY checked_at LIMIT ?`).all(ctx.now() - RECHECK_EVERY, limit) as unknown as DomainRow[];
  for (const d of due) await verifyDomain(ctx, d, deps);
}

/** The verified publisher of a feed's host (the most specific domain wins), if any. */
export function publisherForFeedUrl(ctx: Ctx, url: string): (PublisherRow & { domain: string }) | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split('.');
  const candidates = labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'));
  if (candidates.length === 0) return null;
  const rows = ctx.db.prepare(`
    SELECT p.*, d.domain FROM publisher_domains d JOIN publishers p ON p.id = d.publisher_id
    WHERE d.verified_at IS NOT NULL AND d.domain IN (${candidates.map(() => '?').join(', ')})`).all(...candidates) as unknown as (PublisherRow & { domain: string })[];
  rows.sort((a, b) => b.domain.length - a.domain.length);
  return rows[0] ?? null;
}

export interface FeedStats {
  feedId: number;
  title: string;
  url: string;
  immediate: number;
  daily: number;
  weekly: number;
  total: number;
}

/** Active subscriptions to the feeds of the publisher's verified domains. Raw numbers: the view applies the floor. */
export function publisherStats(ctx: Ctx, publisherId: number): FeedStats[] {
  const domains = listDomains(ctx, publisherId).filter((d) => d.verified_at).map((d) => d.domain);
  if (domains.length === 0) return [];
  const rows = ctx.db.prepare(`
    SELECT f.id AS feedId, f.title, f.url,
      SUM(s.cadence = 'immediate') AS immediate, SUM(s.cadence = 'daily') AS daily, SUM(s.cadence = 'weekly') AS weekly,
      COUNT(s.id) AS total
    FROM feeds f LEFT JOIN subscriptions s ON s.feed_id = f.id AND s.status = 'active'
    GROUP BY f.id ORDER BY total DESC, f.title`).all() as unknown as FeedStats[];
  return rows
    .filter((r) => {
      try {
        const host = new URL(r.url).hostname.toLowerCase();
        return domains.some((d) => host === d || host.endsWith(`.${d}`));
      } catch {
        return false;
      }
    })
    .map((r) => ({ ...r, immediate: r.immediate ?? 0, daily: r.daily ?? 0, weekly: r.weekly ?? 0 }));
}

/** Accounts that never verified a domain are erased after 30 days. */
export function purgePublishers(ctx: Ctx): number {
  const res = ctx.db.prepare(`DELETE FROM publishers WHERE created_at < ?
    AND NOT EXISTS (SELECT 1 FROM publisher_domains d WHERE d.publisher_id = publishers.id AND d.verified_at IS NOT NULL)`).run(ctx.now() - 30 * DAY);
  return Number(res.changes);
}
