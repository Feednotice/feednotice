// A feed that dies: subscribers are told once; it is still tried daily; it can come back;
// after the grace period, its subscriptions end and lone addresses are erased.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { sendDeadFeedNotices } from '../src/deadfeeds.ts';
import { pollDueFeeds } from '../src/feeds.ts';
import type { FeedRow } from '../src/model.ts';
import { purge } from '../src/purge.ts';
import { DAY, fixture, makeCtx, MINUTE } from './helpers.ts';

let up = false;
const server = http.createServer((_req, res) => {
  if (!up) {
    res.writeHead(500);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'application/atom+xml' });
  res.end(fixture('atom-xhtml.xml'));
});
let feedUrl = '';
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed.xml`;
});
after(() => server.close());

const ctx = makeCtx();
const feed = () => ctx.db.prepare('SELECT * FROM feeds WHERE id = 1').get() as unknown as FeedRow;

/** Runs rounds until the feed's next read, `times` times. */
async function failRounds(times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    ctx.clock.t = Math.max(ctx.clock.t, feed().next_fetch_at) + MINUTE;
    await pollDueFeeds(ctx);
  }
}

describe('dead feeds', () => {
  it('declares the feed dead after 25 failures in a row, and tells each subscriber once', async () => {
    const { db } = ctx;
    db.prepare("INSERT INTO feeds (url, title, created_at, last_success_at) VALUES (?, 'Town news', ?, ?)").run(feedUrl, ctx.now(), ctx.now());
    db.prepare("INSERT INTO subscribers (email, locale, created_at) VALUES ('a@example.org', 'en', 0), ('b@example.org', 'fr', 0)").run();
    db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (1, 1, 'immediate', 'active', 0), (2, 1, 'daily', 'active', 0)").run();
    await failRounds(24);
    assert.equal(feed().status, 'active');
    assert.equal((await sendDeadFeedNotices(ctx)).sent, 0);
    await failRounds(1);
    assert.equal(feed().status, 'dead');
    assert.equal((await sendDeadFeedNotices(ctx)).sent, 2);
    const [en, fr] = ctx.mailer.messages;
    assert.equal(en.subject, '"Town news" no longer answers');
    assert.match(en.text, /If it comes back, your updates resume by themselves/);
    assert.match(en.raw, /^List-Unsubscribe: /m);
    assert.equal(fr.subject, '« Town news » ne répond plus');
    assert.equal((await sendDeadFeedNotices(ctx)).sent, 0, 'only once');
  });

  it('keeps trying once a day, and resumes silently when the feed comes back', async () => {
    const before = ctx.clock.t;
    await failRounds(1);
    assert.ok(feed().next_fetch_at - ctx.clock.t > 23 * 60 * MINUTE, 'daily');
    assert.ok(ctx.clock.t - before < 2 * DAY);
    up = true;
    await failRounds(1);
    assert.equal(feed().status, 'active');
    assert.equal(feed().dead_at, null);
    assert.equal(feed().error_count, 0);
  });

  it('ends the subscriptions after 30 days dead, erasing lone addresses', async () => {
    up = false;
    await failRounds(25);
    assert.equal(feed().status, 'dead');
    assert.equal((await sendDeadFeedNotices(ctx)).sent, 2, 'a new death is a new notice');
    ctx.clock.t += 29 * DAY;
    assert.equal(purge(ctx).deadFeedSubscriptions, 0);
    ctx.clock.t += 2 * DAY;
    const report = purge(ctx);
    assert.equal(report.deadFeedSubscriptions, 2);
    assert.equal(report.subscribers, 2);
    assert.equal(report.feeds, 1);
  });
});
