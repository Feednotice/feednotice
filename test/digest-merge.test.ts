// One digest per reader: a subscriber's digests due at the same time go out as one email.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { sendDigests } from '../src/delivery.ts';
import type { ParsedEntry } from '../src/feed/parse.ts';
import { ingestEntries } from '../src/ingest.ts';
import { stopDigestUrl } from '../src/mail/render.ts';
import { createServer } from '../src/web/server.ts';
import { makeCtx, MINUTE, type TestCtx } from './helpers.ts';

function entry(feed: number, id: string): ParsedEntry {
  return { id: `${feed}-${id}`, link: `https://f${feed}.example/${id}`, title: `F${feed} ${id}`, summary: `Summary ${id}`, published: null };
}

/** Three feeds; one reader follows all three with a daily digest (the third at 9:00). */
function setup(): { ctx: TestCtx; publish: (feed: number, ...ids: string[]) => void } {
  const ctx = makeCtx();
  const { db } = ctx;
  for (const n of [1, 2, 3]) {
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES (?, ?, ?)").run(`https://f${n}.example/feed`, `Feed ${n}`, ctx.now());
    ingestEntries(db, n, [entry(n, 'old')], ctx.now(), { baseline: true });
  }
  db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('reader@example.org', ?)").run(ctx.now());
  ctx.clock.t += MINUTE;
  for (const n of [1, 2, 3]) {
    db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at, digest_hour) VALUES (1, ?, 'daily', 'active', ?, ?, ?)")
      .run(n, ctx.now(), ctx.now(), n === 3 ? 9 : null);
  }
  const known = new Map<number, string[]>([[1, ['old']], [2, ['old']], [3, ['old']]]);
  const publish = (feed: number, ...ids: string[]) => {
    const list = known.get(feed) as string[];
    list.unshift(...ids);
    ingestEntries(db, feed, list.map((id) => entry(feed, id)), ctx.now(), { baseline: false });
  };
  return { ctx, publish };
}

describe('merged digests', () => {
  it('gathers the feeds due at the same time into one email, with a link per feed', async () => {
    const { ctx, publish } = setup();
    publish(1, 'a', 'b');
    publish(2, 'c');
    publish(3, 'd');
    ctx.clock.t = Date.UTC(2026, 8, 2, 5, 1); // 7:01 in Paris
    assert.deepEqual(await sendDigests(ctx), { mails: 1, entries: 3, failures: 0, deferred: false });
    const mail = ctx.mailer.messages[0];
    assert.equal(mail.subject, 'Your daily digest: 3 updates from 2 feeds');
    assert.match(mail.text, /== Feed 1 ==[\s\S]*F1 b[\s\S]*F1 a[\s\S]*== Feed 2 ==[\s\S]*F2 c/);
    assert.doesNotMatch(mail.text, /F3 d/, 'the 9:00 digest is separate');
    assert.equal((mail.text.match(/Unsubscribe from this feed: https:\/\/service\.test\/u\/\d+\.[\w-]+/g) ?? []).length, 2);
    const headers = mail.raw.replace(/\r?\n[ \t]+/g, ' ');
    assert.match(headers, /^List-Unsubscribe: <https:\/\/service\.test\/u\/daily\/1\.[\w-]+>\r?$/m);
    assert.match(headers, /^List-Id: <digest-daily\.service\.test>\r?$/im);

    ctx.clock.t = Date.UTC(2026, 8, 2, 7, 1); // 9:01 in Paris
    assert.deepEqual(await sendDigests(ctx), { mails: 1, entries: 1, failures: 0, deferred: false });
    assert.match(ctx.mailer.messages[1].subject, /^Today's updates \(1 update\) — Feed 3$/, 'a single feed keeps its own digest');
    assert.equal((await sendDigests(ctx)).mails, 0);
  });

  it('stops every daily digest from the one-click link, and erases the address with the last one', async () => {
    const { ctx } = setup();
    const app = createServer(ctx);
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    try {
      const url = stopDigestUrl(ctx.config, 1, 'daily').replace('https://service.test', `http://127.0.0.1:${(app.address() as AddressInfo).port}`);
      const page = await (await fetch(url)).text();
      assert.match(page, /It gathers 3 feeds/);
      assert.match(page, /<li>Feed 1<\/li><li>Feed 2<\/li><li>Feed 3<\/li>/);
      // RFC 8058: a POST from the mailbox provider, no further confirmation.
      const r = await fetch(url, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      assert.equal(r.status, 200);
      assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM subscribers').get()?.n, 0);
      assert.equal((await fetch(url.replace(/\.[\w-]+$/, '.forged'))).status, 404);
    } finally {
      app.close();
    }
  });
});
