// Sending. The deliveries table guarantees an entry is sent at most once per subscription: the
// row is written ("sending") and committed BEFORE sending. If the process dies in between, the
// entry is lost for that subscriber rather than sent twice: the "at most once" choice.

import type { Ctx } from './context.ts';
import { stmt, transaction } from './db.ts';
import { MailError } from './mail/mailer.ts';
import { canSendBulk, sendCounted } from './mail/quota.ts';
import { renderDigestMail, renderEntryMail, renderMergedDigestMail, type DigestKind } from './mail/render.ts';
import type { Locale } from './i18n/index.ts';
import type { Cadence, EntryRow, FeedRow } from './model.ts';
import { DAY } from './ratelimit.ts';
import { count, getState, setState } from './stats.ts';

const MAX_ATTEMPTS = 5;
/** An entry older than this is no longer sent (long suspension, prolonged outage). */
const HORIZON = 14 * DAY;
const RETRY_DELAY = 15 * 60_000;
/** Overlap with the previous pass, against clock jitter; the deliveries table prevents duplicates. */
const SINCE_MARGIN = 5 * 60_000;

// What a subscription is owed: entries that appeared after the subscription *request* (not after
// the confirmation). What is published between the request and the click is sent after the
// click, whether or not the feed was already followed; nothing leaves before the click.

interface Owed {
  subscription_id: number;
  subscriber_id: number;
  email: string;
  locale: Locale;
  cadence: Cadence;
  feed_id: number;
  entry_id: number;
}

function owedEntries(ctx: Ctx, cadences: Cadence[], subscriptionId?: number): Owed[] {
  const now = ctx.now();
  const placeholders = cadences.map(() => '?').join(', ');
  return stmt(ctx.db, `
    SELECT s.id AS subscription_id, u.id AS subscriber_id, u.email, u.locale, s.cadence, s.feed_id, e.id AS entry_id
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

/**
 * What "one email per item" subscriptions are owed, looking only at what can have changed since
 * the last complete pass (`since`): entries first seen after it, subscriptions confirmed,
 * created or switched to this cadence after it, and failed sends due for a retry. Rechecking
 * every recent entry of every subscription each minute would grow with subscribers × entries.
 * The deliveries table still decides: nothing is sent twice, whatever this returns.
 */
function owedImmediate(ctx: Ctx, since: number): Owed[] {
  if (since <= 0) return owedEntries(ctx, ['immediate']);
  const { db } = ctx;
  const now = ctx.now();
  const from = Math.max(since - SINCE_MARGIN, now - HORIZON);
  const columns = 's.id AS subscription_id, u.id AS subscriber_id, u.email, u.locale, s.cadence, s.feed_id, e.id AS entry_id, e.first_seen_at AS seen';
  // New entries, driving the join (CROSS JOIN keeps SQLite from starting with subscriptions).
  const fresh = stmt(db, `
    SELECT ${columns}
    FROM entries e CROSS JOIN subscriptions s
    JOIN subscribers u ON u.id = s.subscriber_id AND u.status = 'active'
    LEFT JOIN deliveries d ON d.subscription_id = s.id AND d.entry_id = e.id
    WHERE e.first_seen_at > ? AND e.baseline = 0
      AND s.feed_id = e.feed_id AND s.status = 'active' AND s.cadence = 'immediate' AND e.first_seen_at >= s.created_at
      AND d.status IS NULL`).all(from) as unknown as (Owed & { seen: number })[];
  // Failed sends due for another attempt.
  const retries = stmt(db, `
    SELECT ${columns}
    FROM deliveries d INDEXED BY deliveries_failed
    JOIN subscriptions s ON s.id = d.subscription_id AND s.status = 'active' AND s.cadence = 'immediate'
    JOIN subscribers u ON u.id = s.subscriber_id AND u.status = 'active'
    JOIN entries e ON e.id = d.entry_id AND e.first_seen_at >= ?
    WHERE d.status = 'failed' AND d.attempts < ? AND d.updated_at <= ?`).all(now - HORIZON, MAX_ATTEMPTS, now - RETRY_DELAY) as unknown as (Owed & { seen: number })[];
  // Subscriptions that just started (or switched to this cadence, or moved feed): all they are owed.
  const changed = stmt(db, `
    SELECT id FROM subscriptions WHERE status = 'active' AND cadence = 'immediate'
      AND (confirmed_at > ? OR created_at > ? OR last_digest_at > ?)`).all(from, from, from) as { id: number }[];
  const all = new Map<string, Owed & { seen?: number }>();
  for (const r of [...fresh, ...retries]) all.set(`${r.subscription_id}:${r.entry_id}`, r);
  for (const { id } of changed) {
    for (const r of owedEntries(ctx, ['immediate'], id)) all.set(`${r.subscription_id}:${r.entry_id}`, r);
  }
  const seenOf = (r: Owed & { seen?: number }) => r.seen ?? (stmt(db, 'SELECT first_seen_at FROM entries WHERE id = ?').get(r.entry_id) as { first_seen_at: number }).first_seen_at;
  return [...all.values()]
    .map((r) => ({ ...r, seen: seenOf(r) }))
    .sort((a, b) => a.subscription_id - b.subscription_id || a.seen - b.seen || a.entry_id - b.entry_id);
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
  const started = ctx.now();
  const since = Number(getState(ctx.db, 'immediate.complete') ?? 0);
  for (const rows of groupBySubscription(owedImmediate(ctx, since)).values()) {
    // A feed that publishes many entries at once must not flood the inbox: one grouped email.
    const batches = rows.length > ctx.config.burstLimit ? [rows] : rows.map((r) => [r]);
    for (const batch of batches) {
      if (!canSendBulk(ctx)) return { ...report, deferred: true };
      const ok = await deliver(ctx, batch, batch.length > 1 ? 'burst' : null);
      report.mails += ok ? 1 : 0;
      report.entries += ok ? batch.length : 0;
      report.failures += ok ? 0 : 1;
    }
  }
  // Only a complete pass moves the mark: what a deferred pass left is looked at again.
  setState(ctx.db, 'immediate.complete', String(started));
  return report;
}

/**
 * Sends the daily and weekly digests that are due. A subscriber's digests due at the same
 * time (same cadence, hour and day) go out as one email, with a section per feed.
 */
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
  // First, per schedule (cadence, hour, day: a few hundred at most), the oldest digest sent.
  // Only schedules with something due are then read subscription by subscription: on most
  // minutes, nothing is.
  const schedules = stmt(ctx.db, `
    SELECT cadence, COALESCE(digest_hour, ?) AS hour, CASE WHEN cadence = 'weekly' THEN COALESCE(digest_weekday, ?) ELSE 0 END AS weekday,
      MIN(COALESCE(last_digest_at, confirmed_at)) AS oldest
    FROM subscriptions WHERE status = 'active' AND cadence IN ('daily', 'weekly') GROUP BY 1, 2, 3`)
    .all(digestHour, digestWeekday) as { cadence: Cadence; hour: number; weekday: number; oldest: number }[];
  const dueSchedules = schedules.filter((g) => g.oldest < slotFor(g.cadence, g.hour, g.weekday || digestWeekday));
  const candidates = dueSchedules.flatMap((g) => stmt(ctx.db, `
    SELECT id, subscriber_id, cadence, COALESCE(last_digest_at, confirmed_at) AS since, digest_hour, digest_weekday FROM subscriptions
    WHERE status = 'active' AND cadence = ? AND COALESCE(digest_hour, ?) = ?
      AND (cadence = 'daily' OR COALESCE(digest_weekday, ?) = ?)
      AND COALESCE(last_digest_at, confirmed_at) < ?`)
    .all(g.cadence, digestHour, g.hour, digestWeekday, g.weekday, slotFor(g.cadence, g.hour, g.weekday || digestWeekday)) as {
    id: number; subscriber_id: number; cadence: Cadence; since: number; digest_hour: number | null; digest_weekday: number | null;
  }[]).sort((a, b) => a.subscriber_id - b.subscriber_id || a.id - b.id);
  const groups = new Map<string, { cadence: Cadence; ids: number[] }>();
  for (const s of candidates) {
    const slot = slotFor(s.cadence, s.digest_hour ?? digestHour, s.digest_weekday ?? digestWeekday);
    if (s.since >= slot) continue;
    const key = `${s.subscriber_id}:${s.cadence}:${slot}`;
    const group = groups.get(key) ?? { cadence: s.cadence, ids: [] };
    group.ids.push(s.id);
    groups.set(key, group);
  }
  const done = stmt(ctx.db, 'UPDATE subscriptions SET last_digest_at = ? WHERE id = ?');
  for (const { cadence, ids } of groups.values()) {
    const rows = ids.flatMap((id) => owedEntries(ctx, [cadence], id));
    let ok = true;
    if (rows.length) {
      if (!canSendBulk(ctx)) return { ...report, deferred: true };
      ok = await deliver(ctx, rows, cadence as DigestKind);
      report.mails += ok ? 1 : 0;
      report.entries += ok ? rows.length : 0;
      report.failures += ok ? 0 : 1;
    }
    if (ok) for (const id of ids) done.run(now, id);
  }
  return report;
}

/** Sends one email for `rows` (one subscriber; one or several subscriptions for a digest). */
async function deliver(ctx: Ctx, rows: Owed[], digest: DigestKind | null): Promise<boolean> {
  const { db, config } = ctx;
  const now = ctx.now();
  const { email, locale, subscriber_id: subscriberId } = rows[0];
  const feedOf = new Map<number, FeedRow>();
  for (const r of rows) {
    if (!feedOf.has(r.feed_id)) feedOf.set(r.feed_id, stmt(db, 'SELECT * FROM feeds WHERE id = ?').get(r.feed_id) as unknown as FeedRow);
  }
  const entryOf = (r: Owed) => stmt(db, 'SELECT * FROM entries WHERE id = ?').get(r.entry_id) as unknown as EntryRow;

  transaction(db, () => {
    const mark = stmt(db, `INSERT INTO deliveries (subscription_id, entry_id, status, attempts, updated_at) VALUES (?, ?, 'sending', 0, ?)
      ON CONFLICT (subscription_id, entry_id) DO UPDATE SET status = 'sending', updated_at = excluded.updated_at`);
    for (const r of rows) mark.run(r.subscription_id, r.entry_id, now);
  });

  const subscriptionIds = [...new Set(rows.map((r) => r.subscription_id))];
  let mail;
  if (digest === null) {
    mail = renderEntryMail(config, locale, feedOf.get(rows[0].feed_id) as FeedRow, entryOf(rows[0]), email, rows[0].subscription_id);
  } else if (subscriptionIds.length === 1) {
    mail = renderDigestMail(config, locale, feedOf.get(rows[0].feed_id) as FeedRow, rows.map(entryOf), email, rows[0].subscription_id, digest);
  } else {
    const sections = subscriptionIds.map((id) => {
      const own = rows.filter((r) => r.subscription_id === id);
      return { subscriptionId: id, feed: feedOf.get(own[0].feed_id) as FeedRow, entries: own.map(entryOf) };
    });
    mail = renderMergedDigestMail(config, locale, sections, email, subscriberId, digest as Exclude<DigestKind, 'burst'>);
  }
  try {
    await sendCounted(ctx, mail);
  } catch (e) {
    const permanent = e instanceof MailError && e.permanent;
    transaction(db, () => {
      const fail = stmt(db, `UPDATE deliveries SET status = 'failed', attempts = attempts + 1, updated_at = ? WHERE subscription_id = ? AND entry_id = ?`);
      for (const r of rows) fail.run(ctx.now(), r.subscription_id, r.entry_id);
      if (permanent) {
        db.prepare("UPDATE subscribers SET status = 'suspended', suspended_at = ?, suspended_reason = 'rejected' WHERE email = ?").run(ctx.now(), email);
      }
    });
    count(ctx, 'mail.failed');
    ctx.log(`subscription(s) ${subscriptionIds.join(', ')}: send failed: ${(e as Error).message}`);
    return false;
  }
  const sent = stmt(db, `UPDATE deliveries SET status = 'sent', attempts = attempts + 1, updated_at = ? WHERE subscription_id = ? AND entry_id = ?`);
  transaction(db, () => { for (const r of rows) sent.run(ctx.now(), r.subscription_id, r.entry_id); });
  count(ctx, 'mail.updates');
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

const formats = new Map<string, Intl.DateTimeFormat>();
function format(key: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  let f = formats.get(key);
  if (!f) {
    f = make();
    formats.set(key, f);
  }
  return f;
}

function localParts(ms: number, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const f = format(`parts|${timeZone}`, () => new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }));
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
  const name = format(`offset|${timeZone}`, () => new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })).formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const v = +m[2] * 60 + +(m[3] ?? 0);
  return m[1] === '-' ? -v : v;
}
