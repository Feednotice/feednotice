// Paid publisher plans: set by the operator, with an end date; the logo, the welcome text in the
// confirmation email, and confirmations and departures week by week. Readers are never affected.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { flushSends } from '../src/mail/quota.ts';
import {
  addDomain, effectivePlan, findPublisher, listDomains, logoImage, logoPath, openPublisher, publisherGrowth, publisherStats,
  setLogo, setPlan, verificationRecord, verifyDomain, type LogoDeps,
} from '../src/publishers.ts';
import { weekOf } from '../src/stats.ts';
import { confirmSubscription, requestSubscription, unsubscribe } from '../src/subscriptions.ts';
import { createServer } from '../src/web/server.ts';
import { DAY, fixture, makeCtx, type TestCtx } from './helpers.ts';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function logos(files: Record<string, Buffer>): LogoDeps {
  return { fetchBytes: async (url) => files[url] ?? null };
}

/** A publisher with example.org verified. */
async function verifiedPublisher(ctx: TestCtx, email = 'p@example.org', domain = 'example.org') {
  const pub = openPublisher(ctx, email, 'en');
  addDomain(ctx, pub.id, domain);
  const [d] = listDomains(ctx, pub.id);
  await verifyDomain(ctx, d, { fetchText: async () => null, resolveTxt: async () => [verificationRecord(d)] });
  return pub;
}

const row = (ctx: TestCtx, id: number) => findPublisher(ctx, `p${id}@example.org`) ?? findPublisher(ctx, 'p@example.org');

describe('plans', () => {
  it('ends on the date the operator gave; found by address or verified domain', async () => {
    const ctx = makeCtx();
    const pub = await verifiedPublisher(ctx);
    assert.equal(findPublisher(ctx, 'P@Example.org')?.id, pub.id);
    assert.equal(findPublisher(ctx, 'https://example.org/')?.id, pub.id);
    assert.equal(findPublisher(ctx, 'other.example'), null);

    setPlan(ctx, pub.id, 'pro', ctx.now() + 30 * DAY);
    assert.equal(effectivePlan(row(ctx, pub.id)!, ctx.now()), 'pro');
    ctx.clock.t += 31 * DAY;
    assert.equal(effectivePlan(row(ctx, pub.id)!, ctx.now()), 'free');
    setPlan(ctx, pub.id, 'pro', null);
    assert.equal(effectivePlan(row(ctx, pub.id)!, ctx.now()), 'pro', 'no end date');
    setPlan(ctx, pub.id, 'free', ctx.now() + DAY);
    assert.equal(row(ctx, pub.id)!.plan_until, null, 'a free plan has no end');
  });
});

describe('logos', () => {
  it('takes only a PNG, JPEG or WebP image from a verified domain, and shows it only with a paid plan', async () => {
    const ctx = makeCtx();
    const pub = await verifiedPublisher(ctx);
    const deps = logos({ 'https://www.example.org/logo.png': PNG, 'https://example.org/logo.svg': SVG, 'https://example.org/page': Buffer.from('<html>') });
    assert.equal(await setLogo(ctx, pub.id, 'https://evil.example/logo.png', deps), 'logo-domain');
    assert.equal(await setLogo(ctx, pub.id, 'javascript:alert(1)', deps), 'logo-invalid');
    assert.equal(await setLogo(ctx, pub.id, 'https://example.org/logo.svg', deps), 'logo-invalid', 'an SVG can carry scripts');
    assert.equal(await setLogo(ctx, pub.id, 'https://example.org/page', deps), 'logo-invalid');
    assert.equal(await setLogo(ctx, pub.id, 'https://example.org/missing.png', deps), 'logo-invalid');
    assert.equal(await setLogo(ctx, pub.id, 'https://www.example.org/logo.png', deps), 'logo-saved', 'subdomains of a verified domain count');

    assert.equal(logoPath(ctx, row(ctx, pub.id)!), null, 'free plan: not shown');
    setPlan(ctx, pub.id, 'pro', null);
    const path = logoPath(ctx, row(ctx, pub.id)!);
    assert.match(path ?? '', /^\/logo\/\d+-[0-9a-f]{16}$/);
    const [, id, hash] = /^\/logo\/(\d+)-(\w+)$/.exec(path!)!;
    assert.deepEqual(logoImage(ctx, Number(id), hash), { type: 'image/png', body: PNG });
    assert.equal(logoImage(ctx, Number(id), '0'.repeat(16)), null);

    // The domain proof lost: the logo goes with it.
    ctx.db.prepare('UPDATE publisher_domains SET verified_at = NULL').run();
    assert.equal(logoPath(ctx, row(ctx, pub.id)!), null);

    assert.equal(await setLogo(ctx, pub.id, '', deps), 'logo-removed');
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM publisher_logos').get() as { n: number }).n, 0);
  });
});

describe('week by week', () => {
  it('weeks start on Monday, in the service time zone', () => {
    assert.equal(weekOf(Date.UTC(2026, 10, 15, 12), 'Europe/Paris'), '2026-11-09'); // a Sunday
    assert.equal(weekOf(Date.UTC(2026, 10, 15, 23, 30), 'Europe/Paris'), '2026-11-16'); // already Monday in Paris
    assert.equal(weekOf(Date.UTC(2026, 10, 16, 8), 'Europe/Paris'), '2026-11-16');
  });

  it('counts confirmations and readers who leave, per feed, never who', async () => {
    const ctx = makeCtx();
    const pub = await verifiedPublisher(ctx);
    const { db } = ctx;
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://example.org/feed', 'News', 0)").run();
    for (let i = 1; i <= 6; i++) {
      db.prepare('INSERT INTO subscribers (email, created_at) VALUES (?, 0)').run(`r${i}@x.example`);
      db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, created_at) VALUES (?, 1, 'immediate', 0)").run(i);
      confirmSubscription(ctx, i);
    }
    confirmSubscription(ctx, 1); // twice: counted once
    unsubscribe(ctx, 6);
    ctx.clock.t += 7 * DAY;
    db.prepare('INSERT INTO subscribers (email, created_at) VALUES (?, 0)').run('late@x.example');
    db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, created_at) VALUES (7, 1, 'daily', 0)").run();
    unsubscribe(ctx, 7); // never confirmed: not a departure
    unsubscribe(ctx, 5);

    const growth = publisherGrowth(ctx, publisherStats(ctx, pub.id));
    assert.deepEqual(growth.get(1)?.map((w) => ({ ...w })), [
      { week: '2026-09-07', confirmed: 0, stopped: 1 },
      { week: '2026-08-31', confirmed: 6, stopped: 1 },
    ]);
  });
});

describe('a paid plan over HTTP', () => {
  const ctx = makeCtx();
  const feedPath = '/feed.xml';
  const feedServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    res.end(fixture('rss2-blog.xml'));
  });
  const app = createServer(ctx);
  let site = '';
  let feedUrl = '';
  let spacePath = '';
  let pubId = 0;

  before(async () => {
    await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    feedUrl = `http://127.0.0.1:${(feedServer.address() as AddressInfo).port}${feedPath}`;
    // The feed's host is an IP address, which the space refuses as a domain: the proof is written directly.
    const pub = openPublisher(ctx, 'editor@example.org', 'en');
    pubId = pub.id;
    ctx.db.prepare("INSERT INTO publisher_domains (publisher_id, domain, token, verified_at, method, checked_at, created_at) VALUES (?, '127.0.0.1', 't', 1, 'dns', ?, 0)")
      .run(pub.id, ctx.now());
    ctx.db.prepare("UPDATE publishers SET name = 'Example News', welcome_text = 'Thanks for following us.\nOne email per article.' WHERE id = ?").run(pub.id);
    await signIn();
  });

  async function signIn(): Promise<void> {
    const r = await fetch(`${site}/publishers`, { method: 'POST', body: 'email=editor%40example.org&terms=1&lang=en', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await r.text();
    await flushSends();
    spacePath = /https:\/\/service\.test(\/p\/[\w.-]+)/.exec(ctx.mailer.messages.at(-1)!.text)![1];
  }
  after(() => {
    app.close();
    feedServer.close();
  });

  async function post(path: string, form: Record<string, string>): Promise<Response> {
    const r = await fetch(site + path, { method: 'POST', body: new URLSearchParams(form).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    await flushSends();
    return r;
  }

  async function confirmationFor(email: string): Promise<string> {
    await requestSubscription(ctx, { email, feedUrl, cadence: 'immediate', ip: '192.0.2.1', locale: 'en' });
    await flushSends();
    return ctx.mailer.messages.at(-1)!.text;
  }

  it('free: says what a paid plan adds; no logo form, no welcome in the email', async () => {
    const html = await (await fetch(site + spacePath)).text();
    assert.match(html, /Free plan/);
    assert.match(html, /With the Pro plan: your logo/);
    assert.doesNotMatch(html, /name="logo"/);
    assert.equal((await post(spacePath, { action: 'logo', logo: 'https://127.0.0.1/x.png', lang: 'en' })).headers.get('location'), `${spacePath}?lang=en`, 'ignored');
    assert.doesNotMatch(await confirmationFor('a@x.example'), /A word from/);
  });

  it('pro: the welcome text in the confirmation email, set apart and attributed', async () => {
    setPlan(ctx, pubId, 'pro', ctx.now() + 30 * DAY);
    const text = await confirmationFor('b@x.example');
    assert.match(text, new RegExp(`  ${feedUrl.replace(/[.?]/g, '\\$&')}\n\nA word from Example News:\n\n  Thanks for following us\\.\n  One email per article\\.\n\nHow often:`));
  });

  it('pro: the logo is saved, served from here and shown on the subscribe page', async () => {
    ctx.publisherLogo = logos({ 'https://127.0.0.1/logo.png': PNG });
    const html = await (await fetch(site + spacePath)).text();
    assert.match(html, /Pro plan until/);
    assert.match(html, /name="logo"/);
    const r = await post(spacePath, { action: 'logo', logo: 'https://127.0.0.1/logo.png', lang: 'en' });
    assert.equal(r.headers.get('location'), `${spacePath}?lang=en&result=logo-saved`);
    const page = await (await fetch(`${site}/s?feed=${encodeURIComponent(feedUrl)}`)).text();
    const src = /<img class="publisher-logo" src="(\/logo\/[\w-]+)" alt="Logo of Example News">/.exec(page)?.[1];
    assert.ok(src, 'logo on the subscribe page');
    const img = await fetch(site + src);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  });

  it('pro: week by week, only for feeds followed by 5 or more', async () => {
    const before5 = await (await fetch(site + spacePath)).text();
    assert.match(before5, /Nothing to show yet/);
    for (let i = 0; i < 5; i++) {
      await confirmationFor(`c${i}@x.example`);
      const id = (ctx.db.prepare('SELECT MAX(id) AS id FROM subscriptions').get() as { id: number }).id;
      confirmSubscription(ctx, id);
    }
    const html = await (await fetch(site + spacePath)).text();
    assert.match(html, /<details class="growth" open><summary>/);
    assert.match(html, /<td>31 August 2026<\/td><td>5<\/td><td>0<\/td>/);
  });

  it('when the plan ends: the extras stop, every subscription stays', async () => {
    ctx.clock.t += 31 * DAY;
    await signIn(); // the link lasts a day
    const html = await (await fetch(site + spacePath)).text();
    assert.match(html, /Free plan/);
    assert.doesNotMatch(html, /growth/);
    const page = await (await fetch(`${site}/s?feed=${encodeURIComponent(feedUrl)}`)).text();
    assert.doesNotMatch(page, /publisher-logo/);
    assert.match(page, /Example News/, 'the verified name stays: it is free');
    assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'").get() as { n: number }).n, 5);
  });
});
