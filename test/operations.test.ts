// Operations: sending caps (IP warm-up), lock between rounds, bounces returned by the MTA,
// digest times chosen by the subscriber.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCycle } from '../src/cycle.ts';
import { acquireLock, releaseLock } from '../src/db.ts';
import { sendDigests, sendImmediate } from '../src/delivery.ts';
import type { ParsedEntry } from '../src/feed/parse.ts';
import { ingestEntries } from '../src/ingest.ts';
import { parseBounce } from '../src/mail/bounce.ts';
import { OutboxMailer, recipientTagger } from '../src/mail/mailer.ts';
import { handleMailEvent, setDigestSchedule } from '../src/subscriptions.ts';
import { makeCtx, MINUTE, type TestCtx } from './helpers.ts';

function entry(id: string): ParsedEntry {
  return { id, link: `https://x.example/${id}`, title: `Title ${id}`, summary: '', published: null };
}

/** A feed followed by `n` confirmed subscribers. */
function setup(n: number, cadence = 'immediate', overrides = {}): TestCtx & { publish: (...ids: string[]) => void } {
  const ctx = makeCtx(overrides);
  const { db } = ctx;
  db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://x.example/feed', 'X', 0)").run();
  ingestEntries(db, 1, [], ctx.now(), { baseline: true });
  for (let i = 1; i <= n; i++) {
    db.prepare('INSERT INTO subscribers (email, created_at) VALUES (?, 0)').run(`abonne${i}@exemple.fr`);
    db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at) VALUES (?, 1, ?, 'active', ?, ?)")
      .run(i, cadence, ctx.now(), ctx.now());
  }
  const known: string[] = [];
  return Object.assign(ctx, {
    publish: (...ids: string[]) => {
      ctx.clock.t += MINUTE;
      known.unshift(...ids);
      ingestEntries(db, 1, known.map(entry), ctx.now(), { baseline: false });
    },
  });
}

describe('sending caps', () => {
  it('stops before the hourly cap and resumes the next hour, without duplicates', async () => {
    const ctx = setup(30, 'immediate', { mailMaxPerHour: 20 });
    ctx.publish('a');
    const first = await sendImmediate(ctx);
    // 20 per hour, 2 of which are kept for service emails.
    assert.equal(first.mails, 18);
    assert.equal(first.deferred, true);
    ctx.clock.t += 61 * MINUTE;
    const second = await sendImmediate(ctx);
    assert.equal(second.mails, 12);
    assert.equal(second.deferred, false);
    const recipients = ctx.mailer.messages.map((m) => m.to);
    assert.equal(new Set(recipients).size, 30);
  });

  it('lets service emails through within the reserve', async () => {
    const ctx = setup(30, 'immediate', { mailMaxPerHour: 20 });
    ctx.publish('a');
    await sendImmediate(ctx);
    const { requestManageLink } = await import('../src/subscriptions.ts');
    assert.equal(await requestManageLink(ctx, 'abonne1@exemple.fr', '192.0.2.1'), 'sent');
    const { flushSends } = await import('../src/mail/quota.ts');
    await flushSends();
    assert.match(ctx.mailer.messages.at(-1)?.subject ?? '', /access link/);
  });

  it('defers digests the same way', async () => {
    const ctx = setup(5, 'daily', { mailMaxPerHour: 4 });
    ctx.publish('a');
    ctx.clock.t = Date.UTC(2026, 8, 2, 5, 1);
    const r = await sendDigests(ctx);
    assert.equal(r.mails, 3);
    assert.equal(r.deferred, true);
    ctx.clock.t += 61 * MINUTE;
    assert.equal((await sendDigests(ctx)).mails, 2);
    assert.equal((await sendDigests(ctx)).mails, 0);
  });
});

describe('lock between rounds', () => {
  it('prevents two simultaneous rounds, and expires if the first one died', async () => {
    const ctx = setup(1);
    assert.equal(acquireLock(ctx.db, 'cycle', 'cron-1', ctx.now(), 30 * MINUTE), true);
    assert.equal(await runCycle(ctx), false);
    ctx.clock.t += 31 * MINUTE;
    assert.equal(await runCycle(ctx), true);
    releaseLock(ctx.db, 'cycle', 'cron-1');
  });
});

describe('bounces returned by the MTA', () => {
  const secret = 'un-secret-de-test-assez-long-pour-hmac';
  const tag = recipientTagger(secret);

  function dsn(rcpt: string, status: string, withTag: string | null): string {
    return `From: MAILER-DAEMON@s1.example.org (Mail Delivery System)
To: feedback@mail.example.org
Subject: Mail delivery failed: returning message to sender
Content-Type: multipart/report; report-type=delivery-status; boundary="b1"

--b1
Content-Type: text/plain

This message was created automatically by mail delivery software.

--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; s1.example.org

Action: failed
Final-Recipient: rfc822;${rcpt}
Status: ${status}

--b1
Content-Type: text/rfc822-headers

From: "X via FeedNotice" <updates@mail.example.org>
To: ${rcpt}
${withTag ? `X-FeedNotice-Ref: ${withTag}\n` : ''}Subject: Titre a

--b1--
`;
  }

  it('recognizes a genuine hard bounce', () => {
    assert.deepEqual(parseBounce(dsn('Abonne1@Exemple.fr', '5.1.1', tag('abonne1@exemple.fr')), tag), [{ email: 'abonne1@exemple.fr', type: 'hard_bounce' }]);
  });

  it('classifies temporary bounces separately', () => {
    assert.deepEqual(parseBounce(dsn('abonne1@exemple.fr', '4.2.2', tag('abonne1@exemple.fr')), tag), [{ email: 'abonne1@exemple.fr', type: 'soft_bounce' }]);
  });

  it('ignores a forged bounce (no mark, or the mark of another address)', () => {
    assert.deepEqual(parseBounce(dsn('abonne1@exemple.fr', '5.1.1', null), tag), []);
    assert.deepEqual(parseBounce(dsn('abonne1@exemple.fr', '5.1.1', tag('autre@exemple.fr')), tag), []);
  });

  it('also reads the Exim text format', () => {
    const exim = `Subject: Mail delivery failed

This message was created automatically by mail delivery software.

A message that you sent could not be delivered to one or more of its
recipients. This is a permanent error. The following address(es) failed:

  abonne1@exemple.fr
    host mx.exemple.fr said: 550 5.1.1 User unknown

------ This is a copy of the message, including all the headers. ------

X-FeedNotice-Ref: ${tag('abonne1@exemple.fr')}
Subject: Titre a
`;
    assert.deepEqual(parseBounce(exim, tag), [{ email: 'abonne1@exemple.fr', type: 'hard_bounce' }]);
  });

  it('ignores complaint reports, which cannot be authenticated', () => {
    const arf = `Content-Type: multipart/report; report-type="feedback-report"; boundary="b"\n\nFinal-Recipient: rfc822; abonne1@exemple.fr\nAction: failed\nStatus: 5.0.0\nX-FeedNotice-Ref: ${tag('abonne1@exemple.fr')}\n`;
    assert.deepEqual(parseBounce(arf, tag), []);
  });

  it('puts the mark on every email sent, with the bounce address as envelope sender', async () => {
    const mailer = new OutboxMailer('updates@mail.example.org', null, { bounceAddress: 'feedback@mail.example.org', recipientTag: tag });
    await mailer.send({ to: 'abonne1@exemple.fr', fromName: 'X', subject: 's', text: 't' });
    assert.match(mailer.messages[0].raw, new RegExp(`^X-FeedNotice-Ref: ${tag('abonne1@exemple.fr')}$`, 'mi'));
  });

  it('suspends the address after a hard bounce', async () => {
    const ctx = setup(1);
    for (const ev of parseBounce(dsn('abonne1@exemple.fr', '5.1.1', tag('abonne1@exemple.fr')), tag)) handleMailEvent(ctx, ev.email, ev.type);
    ctx.publish('a');
    assert.equal((await sendImmediate(ctx)).mails, 0);
  });
});

describe('digest times chosen by the subscriber', () => {
  it('sends the daily digest at the chosen time', async () => {
    const ctx = setup(1, 'daily');
    setDigestSchedule(ctx, 1, 1, 18, null);
    ctx.publish('a');
    ctx.clock.t = Date.UTC(2026, 8, 1, 15); // 17:00 in Paris, on the day of subscription
    assert.equal((await sendDigests(ctx)).mails, 0);
    ctx.clock.t = Date.UTC(2026, 8, 1, 16, 1); // 18:00 in Paris
    assert.equal((await sendDigests(ctx)).mails, 1);
  });

  it('sends the weekly digest on the chosen day', async () => {
    const ctx = setup(1, 'weekly');
    setDigestSchedule(ctx, 1, 1, 9, 5); // Friday 9:00
    ctx.publish('a');
    ctx.clock.t = Date.UTC(2026, 8, 3, 8); // Thursday
    assert.equal((await sendDigests(ctx)).mails, 0);
    ctx.clock.t = Date.UTC(2026, 8, 4, 7, 5); // Friday 4 September, 9:05 in Paris
    assert.equal((await sendDigests(ctx)).mails, 1);
  });

  it("ignores out-of-range values and does not touch other people's subscriptions", () => {
    const ctx = setup(2, 'weekly');
    setDigestSchedule(ctx, 1, 1, 25, null);
    setDigestSchedule(ctx, 1, 1, 8, 9);
    setDigestSchedule(ctx, 1, 2, 8, 2);
    const rows = ctx.db.prepare('SELECT digest_hour, digest_weekday FROM subscriptions ORDER BY id').all();
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ digest_hour: null, digest_weekday: null }, { digest_hour: null, digest_weekday: null }]);
  });
});
