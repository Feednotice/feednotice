// WebSub: subscribing to the hub, answering its verification, acting on signed notifications only.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { pollFeed } from '../src/feeds.ts';
import type { FeedRow } from '../src/model.ts';
import { createServer } from '../src/web/server.ts';
import { hubSecret, renewWebSub } from '../src/websub.ts';
import { fixture, HOUR, makeCtx, MINUTE } from './helpers.ts';

const ctx = makeCtx();
const hubRequests: URLSearchParams[] = [];
let origin = '';
const remote = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/hub') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hubRequests.push(new URLSearchParams(body));
      res.writeHead(202);
      res.end();
    });
    return;
  }
  if (req.url === '/feed.xml') {
    res.writeHead(200, { 'Content-Type': 'application/atom+xml' });
    // The feed keeps announcing its hub, as a WebSub publisher does.
    return res.end(fixture('civic-99001.xml').replace('<author>', `<link rel="hub" href="${origin}/hub"/>\n  <author>`));
  }
  res.writeHead(404);
  res.end();
});
const app = createServer(ctx);
let site = '';

function feed(): FeedRow {
  return ctx.db.prepare('SELECT * FROM feeds WHERE id = 1').get() as unknown as FeedRow;
}

before(async () => {
  await new Promise<void>((r) => remote.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
  site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  const { db } = ctx;
  db.prepare('INSERT INTO feeds (url, title, hub_url, self_url, created_at, next_fetch_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(`${origin}/feed.xml`, 'Pushed', `${origin}/hub`, 'https://pushed.example/feed.xml', ctx.now() + HOUR);
  db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('a@exemple.fr', 0)").run();
  db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (1, 1, 'immediate', 'active', 0)").run();
});
after(() => {
  remote.close();
  app.close();
});

let callbackPath = '';

describe('WebSub', () => {
  it('subscribes to the hub the feed announces, once', async () => {
    assert.equal(await renewWebSub(ctx), 1);
    assert.equal(hubRequests.length, 1);
    const r = hubRequests[0];
    assert.equal(r.get('hub.mode'), 'subscribe');
    assert.equal(r.get('hub.topic'), 'https://pushed.example/feed.xml');
    assert.equal(r.get('hub.secret'), hubSecret(ctx.config, 1));
    assert.match(r.get('hub.callback') ?? '', /^https:\/\/service\.test\/websub\/1\.[\w-]+$/);
    callbackPath = new URL(r.get('hub.callback') as string).pathname;
    // Not asked again while waiting for the hub's verification.
    assert.equal(await renewWebSub(ctx), 0);
  });

  it("answers the hub's verification for this topic only", async () => {
    const wrong = await fetch(`${site}${callbackPath}?hub.mode=subscribe&hub.topic=https://other.example/&hub.challenge=x`);
    assert.equal(wrong.status, 404);
    const forged = await fetch(`${site}/websub/1.AAAAAAAAAAAAAAAAAAAAAAAAAAA?hub.mode=subscribe&hub.topic=https://pushed.example/feed.xml&hub.challenge=x`);
    assert.equal(forged.status, 404);
    const ok = await fetch(`${site}${callbackPath}?hub.mode=subscribe&hub.topic=${encodeURIComponent('https://pushed.example/feed.xml')}&hub.challenge=c4a11e&hub.lease_seconds=864000`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'c4a11e');
    assert.equal(feed().websub_expires_at, ctx.now() + 864000 * 1000);
  });

  it('ignores a notification without a valid signature', async () => {
    const before = feed().next_fetch_at;
    const body = '<feed/>';
    const r = await fetch(`${site}${callbackPath}`, { method: 'POST', body, headers: { 'X-Hub-Signature': 'sha256=00ff' } });
    assert.equal(r.status, 202);
    const unsigned = await fetch(`${site}${callbackPath}`, { method: 'POST', body });
    assert.equal(unsigned.status, 202);
    assert.equal(feed().next_fetch_at, before);
  });

  it('reads the feed right away after a signed notification', async () => {
    const body = '<feed/>';
    const sig = createHmac('sha256', hubSecret(ctx.config, 1)).update(body).digest('hex');
    const r = await fetch(`${site}${callbackPath}`, { method: 'POST', body, headers: { 'X-Hub-Signature': `sha256=${sig}` } });
    assert.equal(r.status, 202);
    assert.ok(feed().next_fetch_at <= ctx.now());
  });

  it('then polls only every 6 hours, as a safety net', async () => {
    await pollFeed(ctx, feed());
    const next = feed().next_fetch_at - ctx.now();
    assert.ok(next > 5 * HOUR && next < 7 * HOUR, `${next / MINUTE} min`);
  });

  it('never reads more than once a minute, however many notifications arrive', async () => {
    const body = 'x';
    const sig = createHmac('sha1', hubSecret(ctx.config, 1)).update(body).digest('hex');
    await fetch(`${site}${callbackPath}`, { method: 'POST', body, headers: { 'X-Hub-Signature': `sha1=${sig}` } });
    assert.equal(feed().next_fetch_at, (feed().last_fetched_at as number) + MINUTE);
  });

  it('renews the lease a day before it ends', async () => {
    assert.equal(feed().hub_url, `${origin}/hub`);
    ctx.clock.t += 9 * 24 * HOUR + MINUTE;
    assert.equal(await renewWebSub(ctx), 1);
    assert.equal(hubRequests.length, 2);
  });

  it('starts over with a new hub when the feed changes hub', async () => {
    const { db } = ctx;
    const expires = feed().websub_expires_at;
    assert.ok(expires && expires > ctx.now());
    db.prepare("UPDATE feeds SET hub_url = 'https://old-hub.example/', body_hash = NULL, next_fetch_at = 0 WHERE id = 1").run();
    await pollFeed(ctx, feed());
    assert.equal(feed().hub_url, `${origin}/hub`);
    assert.equal(feed().websub_expires_at, null);
  });
});
