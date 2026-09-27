// Publisher space: magic-link sign-in, domain proofs, branding, counts that reveal no one.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import {
  addDomain, listDomains, normalizeDomain, openPublisher, publisherForFeedUrl, publisherStats, purgePublishers,
  recheckDomains, verificationRecord, verifyDomain, type VerifyDeps,
} from '../src/publishers.ts';
import { createServer } from '../src/web/server.ts';
import { NO_BRAND } from '../src/web/brand.ts';
import { page, subscribePage } from '../src/web/views.ts';
import { parseFeed } from '../src/feed/parse.ts';
import { DAY, fixture, makeCtx } from './helpers.ts';

/** A fake Internet: which files and TXT records exist. */
function fakeDeps(files: Record<string, string>, txt: Record<string, string[]>): VerifyDeps {
  return {
    fetchText: async (url) => files[url] ?? null,
    resolveTxt: async (name) => txt[name] ?? [],
  };
}

describe('domains', () => {
  it('normalizes what publishers type', () => {
    assert.equal(normalizeDomain('https://Blog.Example.org/feed?x'), 'blog.example.org');
    assert.equal(normalizeDomain('example.org.'), 'example.org');
    for (const bad of ['', 'localhost', '192.168.1.1', 'http://[::1]/', 'not a domain']) assert.equal(normalizeDomain(bad), null, bad);
  });

  it('verifies by file or by DNS, and hands the domain to whoever proves it last', async () => {
    const ctx = makeCtx();
    const alice = openPublisher(ctx, 'alice@example.org', 'en');
    const bob = openPublisher(ctx, 'bob@example.org', 'fr');
    addDomain(ctx, alice.id, 'example.org');
    addDomain(ctx, bob.id, 'example.org');
    const [a] = listDomains(ctx, alice.id);
    const [b] = listDomains(ctx, bob.id);
    assert.notEqual(a.token, b.token);

    assert.equal(await verifyDomain(ctx, a, fakeDeps({}, {})), null);
    assert.equal(await verifyDomain(ctx, a, fakeDeps({ 'https://example.org/.well-known/feednotice.txt': `${verificationRecord(a)}\n` }, {})), 'file');
    assert.equal(publisherForFeedUrl(ctx, 'https://example.org/feed.xml')?.email, 'alice@example.org');

    assert.equal(await verifyDomain(ctx, b, fakeDeps({}, { '_feednotice.example.org': [verificationRecord(b)] })), 'dns');
    assert.equal(publisherForFeedUrl(ctx, 'https://example.org/feed.xml')?.email, 'bob@example.org');
    assert.equal(listDomains(ctx, alice.id)[0].verified_at, null);
  });

  it('matches subdomains, the most specific verified domain first', async () => {
    const ctx = makeCtx();
    const org = openPublisher(ctx, 'org@example.org', 'en');
    const blog = openPublisher(ctx, 'blog@example.org', 'en');
    addDomain(ctx, org.id, 'example.org');
    addDomain(ctx, blog.id, 'blog.example.org');
    const deps = (d: { domain: string; token: string }) => fakeDeps({}, { [`_feednotice.${d.domain}`]: [verificationRecord(d)] });
    for (const d of [...listDomains(ctx, org.id), ...listDomains(ctx, blog.id)]) await verifyDomain(ctx, d, deps(d));
    assert.equal(publisherForFeedUrl(ctx, 'https://news.example.org/rss')?.email, 'org@example.org');
    assert.equal(publisherForFeedUrl(ctx, 'https://blog.example.org/rss')?.email, 'blog@example.org');
    assert.equal(publisherForFeedUrl(ctx, 'https://example.net/rss'), null);
  });

  it('loses the proof after three failed monthly checks', async () => {
    const ctx = makeCtx();
    const pub = openPublisher(ctx, 'p@example.org', 'en');
    addDomain(ctx, pub.id, 'example.org');
    const [d] = listDomains(ctx, pub.id);
    await verifyDomain(ctx, d, fakeDeps({}, { '_feednotice.example.org': [verificationRecord(d)] }));
    const gone = fakeDeps({}, {});
    for (let i = 1; i <= 3; i++) {
      ctx.clock.t += 31 * DAY;
      await recheckDomains(ctx, gone);
      assert.equal(listDomains(ctx, pub.id)[0].verified_at === null, i === 3, `check ${i}`);
    }
  });

  it('erases accounts that never verified a domain after 30 days', () => {
    const ctx = makeCtx();
    openPublisher(ctx, 'idle@example.org', 'en');
    ctx.clock.t += 31 * DAY;
    assert.equal(purgePublishers(ctx), 1);
  });
});

describe('branding and counts', () => {
  it("shows the publisher's name and welcome text on the subscribe page", () => {
    const { config } = makeCtx();
    const feed = parseFeed(fixture('civic-99001.xml'), 'https://civic.example/commune/99001-flux.xml');
    const html = subscribePage(page(config, NO_BRAND, 'fr'), 'https://civic.example/commune/99001-flux.xml', feed, {
      publisher: { name: 'Civic', welcome_text: 'Les décisions de votre commune.\n\nSans publicité.', domain: 'civic.example' },
    });
    assert.match(html, /<strong>Publié par Civic<\/strong> <span class="muted">\(domaine vérifié civic\.example\)<\/span>/);
    assert.match(html, /<p>Les décisions de votre commune\.<\/p>\n<p>Sans publicité\.<\/p>/);
  });

  it('counts confirmed subscriptions per cadence on the verified domains only', async () => {
    const ctx = makeCtx();
    const pub = openPublisher(ctx, 'p@example.org', 'en');
    addDomain(ctx, pub.id, 'example.org');
    const [d] = listDomains(ctx, pub.id);
    await verifyDomain(ctx, d, fakeDeps({}, { '_feednotice.example.org': [verificationRecord(d)] }));
    const { db } = ctx;
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://blog.example.org/feed', 'Blog', 0), ('https://other.example.net/feed', 'Other', 0)").run();
    for (let i = 0; i < 7; i++) {
      db.prepare('INSERT INTO subscribers (email, created_at) VALUES (?, 0)').run(`r${i}@x.example`);
      db.prepare('INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (?, 1, ?, ?, 0)')
        .run(i + 1, i < 5 ? 'immediate' : 'weekly', i === 6 ? 'pending' : 'active');
      db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (?, 2, 'daily', 'active', 0)").run(i + 1);
    }
    assert.deepEqual(publisherStats(ctx, pub.id), [{ feedId: 1, title: 'Blog', url: 'https://blog.example.org/feed', immediate: 5, daily: 0, weekly: 1, total: 6 }]);
  });
});

describe('publisher space over HTTP', () => {
  const ctx = makeCtx();
  ctx.publisherVerify = fakeDeps({}, {});
  const app = createServer(ctx);
  let site = '';
  let spacePath = '';
  before(async () => {
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });
  after(() => app.close());

  async function post(path: string, form: Record<string, string>): Promise<Response> {
    return fetch(site + path, { method: 'POST', body: new URLSearchParams(form).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  }

  it('sends a sign-in link and creates nothing before it is opened', async () => {
    const r = await post('/publishers', { email: 'Editor@Example.org', lang: 'en' });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /sign-in link, valid for 24 hours/);
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM publishers').get() as { n: number }).n, 0);
    const mail = ctx.mailer.messages.at(-1);
    assert.ok(mail);
    assert.equal(mail.to, 'editor@example.org');
    spacePath = /https:\/\/service\.test(\/p\/[\w.-]+)/.exec(mail.text)?.[1] as string;
    assert.ok(spacePath);
  });

  it('opens the space, adds a domain and shows how to prove it', async () => {
    const page1 = await fetch(site + spacePath);
    assert.equal(page1.status, 200);
    assert.match(await page1.text(), /Signed in as editor@example\.org · Free plan/);
    assert.equal((await post(spacePath, { action: 'add', domain: 'https://www.Example.org/', lang: 'en' })).status, 303);
    const html = await (await fetch(site + spacePath)).text();
    assert.match(html, /<strong>www\.example\.org<\/strong> — Not verified yet/);
    assert.match(html, /https:\/\/www\.example\.org\/\.well-known\/feednotice\.txt/);
    assert.match(html, /_feednotice\.www\.example\.org/);
  });

  it('verifies the domain and saves the profile', async () => {
    const [d] = listDomains(ctx, 1);
    ctx.publisherVerify = fakeDeps({ 'https://www.example.org/.well-known/feednotice.txt': verificationRecord(d) }, {});
    const r = await post(spacePath, { action: 'verify', domain: String(d.id), lang: 'en' });
    assert.equal(r.headers.get('location'), `${spacePath}?lang=en&result=verified`);
    await post(spacePath, { action: 'profile', name: 'Example News', welcome: 'Hello readers', lang: 'en' });
    const html = await (await fetch(`${site}${spacePath}?lang=en&result=verified`)).text();
    assert.match(html, /The domain is verified\./);
    assert.match(html, /Verified by file on/);
    assert.equal(publisherForFeedUrl(ctx, 'https://www.example.org/feed')?.name, 'Example News');
  });

  it('shows counts below 5 as "fewer than 5", in French too', async () => {
    ctx.db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://www.example.org/feed', 'News', 0)").run();
    ctx.db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('one@x.example', 0)").run();
    ctx.db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (1, 1, 'daily', 'active', 0)").run();
    const en = await (await fetch(site + spacePath)).text();
    assert.match(en, /<td><a href="https:\/\/www\.example\.org\/feed">News<\/a><\/td><td>fewer than 5<\/td>/);
    assert.doesNotMatch(en, /<td>1<\/td>/);
    const fr = await (await fetch(`${site}${spacePath}?lang=fr`)).text();
    assert.match(fr, /Espace éditeur/);
    assert.match(fr, /moins de 5/);
  });

  it('deletes the space; readers keep their subscriptions', async () => {
    const r = await post(spacePath, { action: 'delete', lang: 'en' });
    assert.match(await r.text(), /Publisher space deleted/);
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM publishers').get() as { n: number }).n, 0);
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get() as { n: number }).n, 1);
  });

  it('refuses forged or expired links', async () => {
    assert.equal((await fetch(`${site}/p/ZWRpdG9yQGV4YW1wbGUub3Jn.zzzzzz.AAAAAAAAAAAAAAAAAAAAAAAAAAA`)).status, 404);
    ctx.clock.t += 2 * DAY;
    assert.equal((await fetch(site + spacePath)).status, 404);
  });
});

