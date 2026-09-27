// Sending. The deliveries table guarantees an entry is sent at most once per subscription: the
// row is written ("sending") and committed BEFORE sending. If the process dies in between, the
// entry is lost for that subscriber rather than sent twice: the "at most once" choice.

import type { Ctx } from './context.ts';
import { transaction } from './db.ts';
import { MailError } from './mail/mailer.ts';
import { canSendBulk, sendCounted } from './mail/quota.ts';
import { renderDigestMail, renderEntryMail, type DigestKind } from './mail/render.ts';
import type { Locale } from './i18n/index.ts';
import type { Cadence, EntryRow, FeedRow } from './model.ts';
import { DAY } from './ratelimit.ts';

const MAX_ATTEMPTS = 5;
/** An entry older than this is no longer sent (long suspension, prolonged outage). */
const HORIZON = 14 * DAY;
const RETRY_DELAY = 15 * 60_000;

// What a subscription is owed: entries that appeared after the subscription *request* (not after
// the confirmation). What is published between the request and the click is sent after the
// click, whether or not the feed was already followed; nothing leaves before the click.

interface Owed {
  subscription_id: number;
  email: string;
  locale: Locale;
  cadence: Cadence;
  feed_id: number;
  entry_id: number;
}

function owedEntries(ctx: Ctx, cadences: Cadence[], subscriptionId?: number): Owed[] {
  const now = ctx.now();
  const placeholders = cadences.map(() => '?').join(', ');
  return ctx.db.prepare(`
    SELECT s.id AS subscription_id, u.email, u.locale, s.cadence, s.feed_id, e.id AS entry_id
    FROM subscriptions s
    JOIN subscribers u ON u.id = s.subscriber_id AND u.status = 'active'
    JOIN feeds f ON f.id = s.feed_id
    JOIN entries e ON e.feed_id = s.feed_id AND e.baseline = 0 AND e.first_seen_at >= s.created_at AND e.first_seen_at >= ?
    LEFT JOIN deliveries d ON d.subscription_id = s.id AND d.entry_id = e.id
    WHERE s.status = 'active' AND s.cadence IN (${placeholders})
      ${subscriptionId === undefined ? '' : 'AND s.id = ?'}
      AND (d.status IS NULL OR (d.status = 'failed' AND d.attempts < ? AND d.updated_at <= ?))
    ORDER BY s.id, e.first_seen_at, e.id`)
    .all(now - HORIZON, ...cadences, ...(subscriptionId === undefined ? [] : [subscriptionId]), MAX_ATTEMPTS, now - RETRY_DELAY) as unknown as Owed[];
}

function groupBySubscription(rows: Owed[]): Map<number, Owed[]> {
  const map = new Map<number, Owed[]>();
  for (const r of rows) {
    const list = map.get(r.subscription_id) ?? [];
    list.push(r);
    map.set(r.subscription_id, list);
  }
  return map;
}

export interface SendReport {
  mails: number;
  entries: number;
  failures: number;
  /** Sending cap reached: the rest waits for the next round. */
  deferred: boolean;
}

/** Sends what "one email per item" subscriptions are owed. */
export async function sendImmediate(ctx: Ctx): Promise<SendReport> {
  const report: SendReport = { mails: 0, entries: 0, failures: 0, deferred: false };
  for (const [subId, rows] of groupBySubscription(owedEntries(ctx, ['immediate']))) {
    // A feed that publishes many entries at once must not flood the inbox: one grouped email.
    const batches = rows.length > ctx.config.burstLimit ? [rows] : rows.map((r) => [r]);
    for (const batch of batches) {
      if (!canSendBulk(ctx)) return { ...report, deferred: true };
      const ok = await deliver(ctx, subId, batch, batch.length > 1 ? 'burst' : null);
      report.mails += ok ? 1 : 0;
      report.entries += ok ? batch.length : 0;
      report.failures += ok ? 0 : 1;
    }
  }
  return report;
}

/** Sends the daily and weekly digests that are due. */
export async function sendDigests(ctx: Ctx): Promise<SendReport> {
  const report: SendReport = { mails: 0, entries: 0, failures: 0, deferred: false };
  const now = ctx.now();
  const { timeZone, digestHour, digestWeekday } = ctx.config;
  // Each subscriber may pick their hour (and day); slots are computed once per combination.
  const slots = new Map<string, number>();
  const slotFor = (cadence: Cadence, hour: number, weekday: number): number => {
    const key = `${cadence}:${hour}:${weekday}`;
    let slot = slots.get(key);
    if (slot === undefined) {
      slot = slotStart(now, timeZone, hour, cadence === 'weekly' ? weekday : null);
      slots.set(key, slot);
    }
    return slot;
  };
  const candidates = ctx.db.prepare(`
    SELECT id, cadence, COALESCE(last_digest_at, confirmed_at) AS since, digest_hour, digest_weekday FROM subscriptions
    WHERE status = 'active' AND cadence IN ('daily', 'weekly')`).all() as {
    id: number; cadence: Cadence; since: number; digest_hour: number | null; digest_weekday: number | null;
  }[];
  const due = candidates.filter((s) => s.since < slotFor(s.cadence, s.digest_hour ?? digestHour, s.digest_weekday ?? digestWeekday));
  for (const sub of due) {
    const rows = owedEntries(ctx, [sub.cadence], sub.id);
    let ok = true;
    if (rows.length) {
      if (!canSendBulk(ctx)) return { ...report, deferred: true };
      ok = await deliver(ctx, sub.id, rows, sub.cadence as DigestKind);
      report.mails += ok ? 1 : 0;
      report.entries += ok ? rows.length : 0;
      report.failures += ok ? 0 : 1;
    }
    if (ok) ctx.db.prepare('UPDATE subscriptions SET last_digest_at = ? WHERE id = ?').run(now, sub.id);
  }
  return report;
}

async function deliver(ctx: Ctx, subscriptionId: number, rows: Owed[], digest: DigestKind | null): Promise<boolean> {
  const { db, config } = ctx;
  const now = ctx.now();
  const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(rows[0].feed_id) as unknown as FeedRow;
  const entries = rows.map((r) => db.prepare('SELECT * FROM entries WHERE id = ?').get(r.entry_id) as unknown as EntryRow);

  transaction(db, () => {
    const mark = db.prepare(`INSERT INTO deliveries (subscription_id, entry_id, status, attempts, updated_at) VALUES (?, ?, 'sending', 0, ?)
      ON CONFLICT (subscription_id, entry_id) DO UPDATE SET status = 'sending', updated_at = excluded.updated_at`);
    for (const r of rows) mark.run(subscriptionId, r.entry_id, now);
  });

  const mail = digest === null
    ? renderEntryMail(config, rows[0].locale, feed, entries[0], rows[0].email, subscriptionId)
    : renderDigestMail(config, rows[0].locale, feed, entries, rows[0].email, subscriptionId, digest);
  try {
    await sendCounted(ctx, mail);
  } catch (e) {
    const permanent = e instanceof MailError && e.permanent;
    transaction(db, () => {
      const fail = db.prepare(`UPDATE deliveries SET status = 'failed', attempts = attempts + 1, updated_at = ? WHERE subscription_id = ? AND entry_id = ?`);
      for (const r of rows) fail.run(ctx.now(), subscriptionId, r.entry_id);
      if (permanent) {
        db.prepare("UPDATE subscribers SET status = 'suspended', suspended_at = ?, suspended_reason = 'rejected' WHERE email = ?").run(ctx.now(), rows[0].email);
      }
    });
    ctx.log(`subscription ${subscriptionId}: send failed: ${(e as Error).message}`);
    return false;
  }
  const done = db.prepare(`UPDATE deliveries SET status = 'sent', attempts = attempts + 1, updated_at = ? WHERE subscription_id = ? AND entry_id = ?`);
  transaction(db, () => { for (const r of rows) done.run(ctx.now(), subscriptionId, r.entry_id); });
  return true;
}

/**
 * Start of the most recent digest slot (≤ now): every day at `hour` local time, or every week
 * on `weekday` (1 = Monday) at that hour.
 */
export function slotStart(now: number, timeZone: string, hour: number, weekday: number | null): number {
  const parts = localParts(now, timeZone);
  let dayOffset = 0;
  if (weekday !== null) dayOffset = (parts.weekday - weekday + 7) % 7;
  let candidate = zonedToUtc(parts.year, parts.month, parts.day - dayOffset, hour, timeZone);
  if (candidate > now) candidate = zonedToUtc(parts.year, parts.month, parts.day - dayOffset - (weekday === null ? 1 : 7), hour, timeZone);
  return candidate;
}

function localParts(ms: number, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { year: +p.year, month: +p.month, day: +p.day, weekday };
}

function zonedToUtc(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour);
  const offset = tzOffsetMinutes(guess, timeZone);
  return guess - offset * 60_000;
}

function tzOffsetMinutes(ms: number, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const v = +m[2] * 60 + +(m[3] ?? 0);
  return m[1] === '-' ? -v : v;
}
