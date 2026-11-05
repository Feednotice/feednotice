// Operator counters: how many emails went out, bounced, were reported as spam… per day.
// Numbers only: no address, no feed, nothing personal. Kept 400 days.

import type { Ctx } from './context.ts';
import { stmt, type Db } from './db.ts';

export type StatKey =
  | 'mail.sent' // every email handed to the MTA
  | 'mail.updates' // emails carrying feed entries (one per entry, digest or burst)
  | 'mail.failed' // refused at submission
  | 'mail.deferred' // rounds stopped by the sending cap
  | 'bounce.hard'
  | 'complaint'
  | 'sub.requested'
  | 'sub.confirmed'
  | 'sub.stopped'
  | 'feed.died';

/** The calendar day in the service's time zone, as YYYY-MM-DD. */
const dayFormats = new Map<string, Intl.DateTimeFormat>();

export function dayOf(ms: number, timeZone: string): string {
  let f = dayFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormats.set(timeZone, f);
  }
  return f.format(ms);
}

export function count(ctx: Ctx, key: StatKey, n = 1): void {
  if (n <= 0) return;
  stmt(ctx.db, `INSERT INTO stats_daily (day, key, n) VALUES (?, ?, ?)
    ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n`).run(dayOf(ctx.now(), ctx.config.timeZone), key, n);
}

/** Totals per key over the given days (inclusive). */
export function totals(db: Db, fromDay: string, toDay: string): Partial<Record<StatKey, number>> {
  const rows = db.prepare('SELECT key, SUM(n) AS n FROM stats_daily WHERE day BETWEEN ? AND ? GROUP BY key').all(fromDay, toDay) as { key: StatKey; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

export function getState(db: Db, key: string): string | null {
  return (db.prepare('SELECT value FROM state WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
}

export function setState(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function purgeStats(db: Db, now: number, timeZone: string): void {
  db.prepare('DELETE FROM stats_daily WHERE day < ?').run(dayOf(now - 400 * 86_400_000, timeZone));
}
