import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sendDigests, sendImmediate, slotStart } from '../src/delivery.ts';
import type { ParsedEntry } from '../src/feed/parse.ts';
import { ingestEntries } from '../src/ingest.ts';
import type { Cadence } from '../src/model.ts';
import { purge } from '../src/purge.ts';
import { handleMailEvent, unsubscribe } from '../src/subscriptions.ts';
import { DAY, HOUR, makeCtx, MINUTE, type TestCtx } from './helpers.ts';

function entry(id: string): ParsedEntry {
  return { id, link: `https://x.example/${id}`, title: `Title ${id}`, summary: `Summary ${id}`, published: null };
}

/** A feed, its first read done, and one confirmed subscriber. */
function setup(cadence: Cadence = 'immediate', overrides = {}): { ctx: TestCtx; subId: number; publish: (...ids: string[]) => void } {
  const ctx = makeCtx(overrides);
  const { db } = ctx;
  db.prepare("INSERT INTO feeds (url, title, site_url, created_at) VALUES ('https://x.example/feed', 'Feed X', 'https://x.example/', ?)").run(ctx.now());
  ingestEntries(db, 1, [entry('ancienne')], ctx.now(), { baseline: true });
  db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('lecteur@exemple.fr', ?)").run(ctx.now());
  ctx.clock.t += MINUTE;
  db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at) VALUES (1, 1, ?, 'active', ?, ?)").run(cadence, ctx.now(), ctx.now());
  const known: string[] = ['ancienne'];
  const publish = (...ids: string[]) => {
    ctx.clock.t += 30 * MINUTE;
    known.unshift(...ids.reverse());
    ingestEntries(db, 1, known.map(entry), ctx.now(), { baseline: false });
  };
  return { ctx, subId: 1, publish };
}

describe('immediate sending', () => {
  it('sends each new entry once, with the unsubscribe headers', async () => {
    const { ctx, publish } = setup();
    publish('a');
    assert.deepEqual(await sendImmediate(ctx), { mails: 1, entries: 1, failures: 0, deferred: false });
    const mail = ctx.mailer.messages[0];
    assert.equal(mail.to, 'lecteur@exemple.fr');
    assert.equal(mail.subject, 'Title a');
    assert.match(mail.text, /Summary a/);
    assert.match(mail.text, /Read: https:\/\/x\.example\/a/);
    assert.match(mail.raw, /^List-Unsubscribe: <https:\/\/service\.test\/u\/1\.[\w-]+>$/m);
    assert.match(mail.raw, /^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m);
    assert.doesNotMatch(mail.raw, /<img/i);
    // Nothing more on the next round.
    assert.deepEqual(await sendImmediate(ctx), { mails: 0, entries: 0, failures: 0, deferred: false });
  });

  it('sends neither the backlog nor what appeared before the subscription request', async () => {
    const { ctx, publish } = setup();
    ctx.db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('tard@exemple.fr', 0)").run();
    publish('a');
    ctx.clock.t += MINUTE;
    ctx.db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at) VALUES (2, 1, 'immediate', 'active', ?, ?)").run(ctx.now(), ctx.now());
    publish('b');
    await sendImmediate(ctx);
    assert.deepEqual(ctx.mailer.messages.map((m) => `${m.to} ${m.subject}`), [
      'lecteur@exemple.fr Title a', 'lecteur@exemple.fr Title b', 'tard@exemple.fr Title b',
    ]);
  });

  it('groups a burst into a single email', async () => {
    const { ctx, publish } = setup('immediate', { burstLimit: 3 });
    publish('a', 'b', 'c', 'd');
    assert.deepEqual(await sendImmediate(ctx), { mails: 1, entries: 4, failures: 0, deferred: false });
    assert.equal(ctx.mailer.messages[0].subject, '4 updates — Feed X');
    for (const id of 'abcd') assert.match(ctx.mailer.messages[0].text, new RegExp(`Title ${id}`));
  });

  it('retries after a send failure, without duplicates', async () => {
    const { ctx, publish } = setup();
    publish('a');
    ctx.mailer.failNext = 1;
    assert.deepEqual(await sendImmediate(ctx), { mails: 0, entries: 0, failures: 1, deferred: false });
    assert.deepEqual(await sendImmediate(ctx), { mails: 0, entries: 0, failures: 0, deferred: false }, 'not before the delay');
    ctx.clock.t += 20 * MINUTE;
    assert.deepEqual(await sendImmediate(ctx), { mails: 1, entries: 1, failures: 0, deferred: false });
    assert.deepEqual(await sendImmediate(ctx), { mails: 0, entries: 0, failures: 0, deferred: false });
  });

  it('never sends twice, even if the process dies while sending', async () => {
    const { ctx, publish } = setup();
    publish('a');
    // Simulates a crash: the "sending" row is written, the send is never acknowledged.
    ctx.db.prepare("INSERT INTO deliveries (subscription_id, entry_id, status, updated_at) VALUES (1, 2, 'sending', ?)").run(ctx.now());
    ctx.clock.t += DAY;
    assert.equal((await sendImmediate(ctx)).mails, 0);
  });

  it('stops writing to an address suspended after a bounce', async () => {
    const { ctx, publish } = setup();
    handleMailEvent(ctx, 'Lecteur@Exemple.fr', 'hard_bounce');
    publish('a');
    assert.equal((await sendImmediate(ctx)).mails, 0);
  });

  it('erases the address and keeps a fingerprint after a complaint', async () => {
    const { ctx } = setup();
    handleMailEvent(ctx, 'lecteur@exemple.fr', 'complaint');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM subscribers').get()?.n, 0);
    const row = ctx.db.prepare('SELECT email_hash FROM suppressions').get() as { email_hash: string };
    assert.doesNotMatch(row.email_hash, /exemple/);
  });

  it('does not catch up beyond fourteen days', async () => {
    const { ctx, publish } = setup();
    publish('a');
    ctx.clock.t += 15 * DAY;
    publish('b');
    await sendImmediate(ctx);
    assert.deepEqual(ctx.mailer.messages.map((m) => m.subject), ['Title b']);
  });
});

describe('language', () => {
  it("writes to each subscriber in their own language", async () => {
    const { ctx, publish } = setup('immediate', { burstLimit: 1 });
    ctx.db.prepare("UPDATE subscribers SET locale = 'fr'").run();
    publish('a', 'b');
    await sendImmediate(ctx);
    const mail = ctx.mailer.messages[0];
    assert.equal(mail.subject, '2 nouveautés — Feed X');
    assert.match(mail.text, /^2 nouveautés d'un coup — Feed X/);
    assert.match(mail.text, /Se désabonner en un clic : https:\/\/service\.test\/u\//);
    assert.match(mail.fromName, /^Feed X via Example Feeds$/);
  });
});

describe('digests', () => {
  it('sends a daily digest at the set time, only when there is something new', async () => {
    // Start clock: 1 September 2026, 10:00 UTC (12:00 in Paris).
    const { ctx, publish } = setup('daily');
    publish('a', 'b');
    assert.equal((await sendImmediate(ctx)).mails, 0, 'no immediate alert');
    assert.equal((await sendDigests(ctx)).mails, 0, 'not before 7:00 the next day');
    ctx.clock.t = Date.UTC(2026, 8, 2, 5, 1); // 7:01 in Paris
    assert.deepEqual(await sendDigests(ctx), { mails: 1, entries: 2, failures: 0, deferred: false });
    assert.match(ctx.mailer.messages[0].subject, /^Today's updates \(2 updates\)/);
    assert.equal((await sendDigests(ctx)).mails, 0);
    ctx.clock.t = Date.UTC(2026, 8, 3, 5, 1);
    assert.equal((await sendDigests(ctx)).mails, 0, 'nothing new, nothing sent');
  });

  it('sends the weekly digest on Monday', async () => {
    const { ctx, publish } = setup('weekly');
    publish('a');
    ctx.clock.t = Date.UTC(2026, 8, 6, 12); // Sunday
    assert.equal((await sendDigests(ctx)).mails, 0);
    ctx.clock.t = Date.UTC(2026, 8, 7, 5, 30); // Monday 7:30 in Paris
    assert.equal((await sendDigests(ctx)).mails, 1);
    assert.match(ctx.mailer.messages[0].subject, /^This week's updates/);
  });

  it('computes slots in the Paris time zone, summer and winter time', () => {
    assert.equal(new Date(slotStart(Date.UTC(2026, 8, 2, 12), 'Europe/Paris', 7, null)).toISOString(), '2026-09-02T05:00:00.000Z');
    assert.equal(new Date(slotStart(Date.UTC(2026, 8, 2, 4), 'Europe/Paris', 7, null)).toISOString(), '2026-09-01T05:00:00.000Z');
    assert.equal(new Date(slotStart(Date.UTC(2026, 0, 15, 12), 'Europe/Paris', 7, null)).toISOString(), '2026-01-15T06:00:00.000Z');
    // On Wednesday 2 September 2026, the last Monday 7:00 is 31 August.
    assert.equal(new Date(slotStart(Date.UTC(2026, 8, 2, 12), 'Europe/Paris', 7, 1)).toISOString(), '2026-08-31T05:00:00.000Z');
  });
});

describe('erasure', () => {
  it('erases the address with the last subscription, and the feed nobody follows', () => {
    const { ctx, subId } = setup();
    unsubscribe(ctx, subId);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM subscribers').get()?.n, 0);
    purge(ctx);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM feeds').get()?.n, 0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM entries').get()?.n, 0);
  });

  it('erases requests never confirmed', () => {
    const ctx = makeCtx();
    ctx.db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://x.example/feed', 'x', 0)").run();
    ctx.db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('jamais@exemple.fr', ?)").run(ctx.now());
    ctx.db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, created_at) VALUES (1, 1, 'weekly', ?)").run(ctx.now());
    ctx.clock.t += 6 * DAY;
    assert.equal(purge(ctx).subscribers, 0);
    ctx.clock.t += DAY + HOUR;
    assert.deepEqual(purge(ctx), { publishers: 0, pendingSubscriptions: 1, subscribers: 1, feeds: 1, deadFeedSubscriptions: 0 });
  });
});
