// One round: read the due feeds, then send what is owed.
// A database lock guarantees a single round at a time, even with several processes
// (the server's scheduler plus a manual `poll`, or several app containers later).

import { randomUUID } from 'node:crypto';
import type { Ctx } from './context.ts';
import { acquireLock, releaseLock } from './db.ts';
import { sendDeadFeedNotices } from './deadfeeds.ts';
import { sendDigests, sendImmediate } from './delivery.ts';
import { pollDueFeeds } from './feeds.ts';
import { checkAlerts, sendOpsReport } from './ops.ts';
import { defaultVerifyDeps, recheckDomains } from './publishers.ts';
import { count } from './stats.ts';
import { renewWebSub } from './websub.ts';

const LOCK_TTL = 30 * 60_000;

/** Returns false if another round was already running. */
export async function runCycle(ctx: Ctx): Promise<boolean> {
  const holder = randomUUID();
  if (!acquireLock(ctx.db, 'cycle', holder, ctx.now(), LOCK_TTL)) {
    ctx.log('previous round still running: nothing to do');
    return false;
  }
  try {
    const polled = await pollDueFeeds(ctx);
    const fresh = polled.filter((p) => p.status === 'new');
    if (polled.length) ctx.log(`read: ${polled.length} feed(s), ${fresh.reduce((n, p) => n + p.newEntries, 0)} new entry(ies)`);
    const imm = await sendImmediate(ctx);
    const dig = imm.deferred ? { mails: 0, failures: 0, deferred: true } : await sendDigests(ctx);
    if (imm.mails || dig.mails || imm.failures || dig.failures) {
      ctx.log(`sent: ${imm.mails} alert(s), ${dig.mails} digest(s), ${imm.failures + dig.failures} failure(s)`);
    }
    const dead = imm.deferred || dig.deferred ? { sent: 0, deferred: true } : await sendDeadFeedNotices(ctx);
    if (dead.sent) ctx.log(`sent: ${dead.sent} dead-feed notice(s)`);
    if (imm.deferred || dig.deferred || dead.deferred) {
      ctx.log('sending cap reached: the rest goes out on the next round');
      count(ctx, 'mail.deferred');
    }
    // The operator's report and alerts: never allowed to stop the round.
    await sendOpsReport(ctx).catch((e: Error) => ctx.log(`daily report failed: ${e.message}`));
    await checkAlerts(ctx).catch((e: Error) => ctx.log(`alert check failed: ${e.message}`));
    await renewWebSub(ctx).catch((e: Error) => ctx.log(`WebSub renewal failed: ${e.message}`));
    await recheckDomains(ctx, ctx.publisherVerify ?? defaultVerifyDeps(ctx)).catch((e: Error) => ctx.log(`domain recheck failed: ${e.message}`));
    return true;
  } finally {
    releaseLock(ctx.db, 'cycle', holder);
  }
}
