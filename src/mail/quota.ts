// Sending caps. A new IP has no reputation: mailbox providers throttle or junk senders whose
// volume jumps. The caps (MAIL_MAX_PER_HOUR, MAIL_MAX_PER_DAY) let the volume ramp up during
// warm-up. Subscription emails stop before the cap and resume on the next round; 10% is kept
// for service emails (confirmation, access link), which must never wait.

import type { Ctx } from '../context.ts';
import { bump, DAY, HOUR, peek } from '../ratelimit.ts';
import type { OutgoingMail } from './mailer.ts';

const RESERVE = 0.1;

function reserveOf(limit: number): number {
  return Math.max(1, Math.ceil(limit * RESERVE));
}

/** Is there room left for a subscription email? */
export function canSendBulk(ctx: Ctx): boolean {
  const { mailMaxPerHour, mailMaxPerDay } = ctx.config;
  const now = ctx.now();
  if (mailMaxPerHour > 0 && peek(ctx.db, 'mail-out', HOUR, now) >= mailMaxPerHour - reserveOf(mailMaxPerHour)) return false;
  if (mailMaxPerDay > 0 && peek(ctx.db, 'mail-out-day', DAY, now) >= mailMaxPerDay - reserveOf(mailMaxPerDay)) return false;
  return true;
}

/** Sends and counts. Always go through here rather than ctx.mailer directly. */
export async function sendCounted(ctx: Ctx, mail: OutgoingMail): Promise<void> {
  await ctx.mailer.send(mail);
  const now = ctx.now();
  bump(ctx.db, 'mail-out', HOUR, now);
  bump(ctx.db, 'mail-out-day', DAY, now);
}
