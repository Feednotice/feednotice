// The operator's counters, daily report and alerts.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkAlerts, sendOpsReport, statsText } from '../src/ops.ts';
import { count, dayOf, totals } from '../src/stats.ts';
import { handleMailEvent } from '../src/subscriptions.ts';
import { HOUR, makeCtx } from './helpers.ts';

describe('operator', () => {
  it('counts per day in the service time zone, without any address', () => {
    const ctx = makeCtx();
    ctx.db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('x@example.org', 0)").run();
    handleMailEvent(ctx, 'x@example.org', 'hard_bounce');
    handleMailEvent(ctx, 'x@example.org', 'hard_bounce');
    count(ctx, 'mail.sent', 3);
    const day = dayOf(ctx.now(), 'Europe/Paris');
    assert.deepEqual(totals(ctx.db, day, day), { 'bounce.hard': 1, 'mail.sent': 3 });
    assert.doesNotMatch(JSON.stringify(ctx.db.prepare('SELECT * FROM stats_daily').all()), /@/);
    assert.match(statsText(ctx, 3), new RegExp(`${day}\\s+3`));
  });

  it('emails a daily report once, at the set hour, flagging what needs attention', async () => {
    const ctx = makeCtx({ opsEmail: 'ops@example.org', opsReportHour: 8 });
    // 1 September 2026, 12:00 in Paris: yesterday's numbers are written as if it were yesterday.
    ctx.clock.t -= 24 * HOUR;
    count(ctx, 'mail.sent', 100);
    count(ctx, 'bounce.hard', 9);
    ctx.clock.t += 24 * HOUR;
    assert.equal(await sendOpsReport(ctx), true);
    assert.equal(await sendOpsReport(ctx), false, 'once per day');
    const mail = ctx.mailer.messages[0];
    assert.equal(mail.to, 'ops@example.org');
    assert.equal(mail.subject, '[Example Feeds] Needs attention: report for 2026-08-31');
    assert.match(mail.text, /hard bounce rate 9\.0% \(limit 5\.0%\)/);
    assert.match(mail.text, /emails sent\s+100/);
    ctx.clock.t += 24 * HOUR;
    assert.equal(await sendOpsReport(ctx), true, 'the next day');
    assert.equal(ctx.mailer.messages[1].subject, '[Example Feeds] report for 2026-09-01');
  });

  it('alerts on a bad day as it happens, at most every 6 hours', async () => {
    const ctx = makeCtx({ opsEmail: 'ops@example.org' });
    count(ctx, 'mail.sent', 60);
    assert.deepEqual(await checkAlerts(ctx), []);
    count(ctx, 'complaint', 1);
    const raised = await checkAlerts(ctx);
    assert.equal(raised.length, 1);
    assert.match(raised[0], /^spam complaint rate 1\.\d%/);
    assert.match(ctx.mailer.messages[0].subject, /^\[Example Feeds\] Alert: spam complaint rate/);
    assert.deepEqual(await checkAlerts(ctx), []);
    ctx.clock.t += 6 * HOUR + 1;
    assert.equal((await checkAlerts(ctx)).length, 1);
    assert.ok(ctx.logs.some((l) => l.startsWith('ALERT: spam complaint rate')));
  });

  it('sends nothing without OPS_EMAIL, but still logs alerts', async () => {
    const ctx = makeCtx();
    count(ctx, 'mail.failed', 20);
    count(ctx, 'mail.sent', 5);
    assert.equal(await sendOpsReport(ctx), false);
    assert.equal((await checkAlerts(ctx)).length, 1);
    assert.equal(ctx.mailer.messages.length, 0);
  });
});
