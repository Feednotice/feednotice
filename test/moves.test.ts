// Feeds that move (permanent redirects) or disappear (410 Gone).

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { pollFeed } from '../src/feeds.ts';
import type { FeedRow } from '../src/model.ts';
import { fixture, makeCtx } from './helpers.ts';

const server = http.createServer((req, res) => {
  const routes: Record<string, () => void> = {
    '/old.xml': () => { res.writeHead(301, { Location: '/middle.xml' }); res.end(); },
    '/middle.xml': () => { res.writeHead(308, { Location: '/new.xml' }); res.end(); },
    '/temporary.xml': () => { res.writeHead(302, { Location: '/new.xml' }); res.end(); },
    '/to-html': () => { res.writeHead(301, { Location: '/page.html' }); res.end(); },
    '/page.html': () => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><p>Login</p>'); },
    '/gone.xml': () => { res.writeHead(410); res.end(); },
    '/new.xml': () => { res.writeHead(200, { 'Content-Type': 'application/atom+xml' }); res.end(fixture('atom-xhtml.xml')); },
  };
  (routes[req.url ?? ''] ?? (() => { res.writeHead(404); res.end(); }))();
});
let base = '';
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

function feedAt(ctx: ReturnType<typeof makeCtx>, path: string): FeedRow {
  ctx.db.prepare('INSERT INTO feeds (url, title, created_at) VALUES (?, ?, 0)').run(`${base}${path}`, path);
  ctx.db.prepare("INSERT OR IGNORE INTO subscribers (id, email, created_at) VALUES (1, 'a@example.org', 0)").run();
  const id = Number((ctx.db.prepare('SELECT id FROM feeds WHERE url = ?').get(`${base}${path}`) as { id: number }).id);
  ctx.db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (1, ?, 'immediate', 'active', 0)").run(id);
  return ctx.db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as unknown as FeedRow;
}

describe('feeds that move', () => {
  it('follows permanent redirects, then reads the feed at its new address', async () => {
    const ctx = makeCtx();
    const feed = feedAt(ctx, '/old.xml');
    await pollFeed(ctx, feed);
    assert.equal((ctx.db.prepare('SELECT url FROM feeds WHERE id = ?').get(feed.id) as { url: string }).url, `${base}/new.xml`);
    assert.ok(ctx.logs.some((l) => l.includes('moved permanently')));
  });

  it('keeps the address after a temporary redirect, or a "move" to something that is not a feed', async () => {
    const ctx = makeCtx();
    const temp = feedAt(ctx, '/temporary.xml');
    await pollFeed(ctx, temp);
    assert.equal((ctx.db.prepare('SELECT url FROM feeds WHERE id = ?').get(temp.id) as { url: string }).url, `${base}/temporary.xml`);
    const html = feedAt(ctx, '/to-html');
    await pollFeed(ctx, html);
    assert.equal((ctx.db.prepare('SELECT url FROM feeds WHERE id = ?').get(html.id) as { url: string }).url, `${base}/to-html`);
  });

  it('merges into the feed already followed at the new address, without duplicate subscriptions', async () => {
    const ctx = makeCtx();
    const target = feedAt(ctx, '/new.xml');
    const old = feedAt(ctx, '/old.xml');
    ctx.db.prepare("INSERT INTO subscribers (id, email, created_at) VALUES (2, 'b@example.org', 0)").run();
    ctx.db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (2, ?, 'daily', 'active', 0)").run(old.id);
    await pollFeed(ctx, old);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM feeds WHERE id = ?').get(old.id)?.n, 0);
    const subs = ctx.db.prepare('SELECT subscriber_id, feed_id, created_at FROM subscriptions ORDER BY subscriber_id').all() as { subscriber_id: number; feed_id: number; created_at: number }[];
    assert.deepEqual(subs.map((s) => [s.subscriber_id, s.feed_id]), [[1, target.id], [2, target.id]]);
    assert.equal(subs[1].created_at, ctx.now(), 'starts from now: nothing already sent comes again');
  });

  it('declares a feed answering "410 Gone" dead at once', async () => {
    const ctx = makeCtx();
    const feed = feedAt(ctx, '/gone.xml');
    await pollFeed(ctx, feed);
    const row = ctx.db.prepare('SELECT status, dead_at FROM feeds WHERE id = ?').get(feed.id) as { status: string; dead_at: number };
    assert.equal(row.status, 'dead');
    assert.equal(row.dead_at, ctx.now());
  });
});
