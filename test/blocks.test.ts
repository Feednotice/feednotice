// The operator's blocks: feeds, domains, addresses.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { block, blockAddress, isBlocked, listBlocks, unblock } from '../src/blocks.ts';
import { loadFeedCached } from '../src/feeds.ts';
import { flushSends } from '../src/mail/quota.ts';
import { requestSubscription } from '../src/subscriptions.ts';
import { fixture, makeCtx } from './helpers.ts';

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/atom+xml' });
  res.end(fixture('atom-xhtml.xml'));
});
let base = '';
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

describe('blocks', () => {
  it('ends the subscriptions of a blocked feed, tells each subscriber, and refuses it afterwards', async () => {
    const ctx = makeCtx();
    const { db } = ctx;
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES (?, 'Bad news', 0)").run(`${base}/feed.xml`);
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://good.example/feed', 'Good', 0)").run();
    db.prepare("INSERT INTO subscribers (email, locale, created_at) VALUES ('a@example.org', 'fr', 0), ('b@example.org', 'en', 0)").run();
    db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (1, 1, 'immediate', 'active', 0), (2, 1, 'daily', 'active', 0), (2, 2, 'daily', 'active', 0)").run();

    const r = await block(ctx, 'feed', `${base}/feed.xml`, 'court order 123');
    assert.deepEqual(r, { pattern: `${base}/feed.xml`, feeds: 1, notified: 2 });
    assert.deepEqual(ctx.mailer.messages.map((m) => m.subject).sort(), ['"Bad news" is no longer available', '« Bad news » n\'est plus disponible']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM feeds').get()?.n, 1);
    assert.deepEqual(db.prepare('SELECT email FROM subscribers').all().map((s) => (s as { email: string }).email), ['b@example.org'], 'a lone address is erased');

    const again = await loadFeedCached(ctx, `${base}/feed.xml`);
    assert.equal(!again.ok && again.code, 'blocked');
    const sub = await requestSubscription(ctx, { email: 'c@example.org', feedUrl: `${base}/feed.xml`, cadence: 'immediate', ip: '192.0.2.1', locale: 'en' });
    assert.deepEqual(sub, { kind: 'feed-error', code: 'blocked' });
    assert.equal(listBlocks(ctx).feeds[0].reason, 'court order 123');
  });

  it('blocks a domain with its subdomains', async () => {
    const ctx = makeCtx();
    await block(ctx, 'domain', 'https://Evil.Example/whatever', '');
    assert.equal(isBlocked(ctx, 'https://evil.example/feed'), true);
    assert.equal(isBlocked(ctx, 'https://news.evil.example/rss'), true);
    assert.equal(isBlocked(ctx, 'https://notevil.example/rss'), false);
    assert.equal(unblock(ctx, 'domain', 'evil.example'), true);
    assert.equal(isBlocked(ctx, 'https://evil.example/feed'), false);
  });

  it('never writes again to a blocked address, until unblocked', async () => {
    const ctx = makeCtx();
    ctx.db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('x@example.org', 0)").run();
    assert.equal(blockAddress(ctx, 'X@Example.org'), true);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM subscribers').get()?.n, 0);
    const r = await requestSubscription(ctx, { email: 'x@example.org', feedUrl: `${base}/feed.xml`, cadence: 'immediate', ip: '192.0.2.2', locale: 'en' });
    assert.deepEqual(r, { kind: 'sent' }, 'same answer, nothing sent');
    await flushSends();
    assert.equal(ctx.mailer.messages.length, 0);
    assert.equal(listBlocks(ctx).addresses, 1);
    assert.equal(unblock(ctx, 'address', 'x@example.org'), true);
  });
});
