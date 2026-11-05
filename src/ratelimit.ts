// Fixed-window rate limiting. Keys are fingerprints: no IP or email address in cleartext.

import { stmt, type Db } from './db.ts';

export function allow(db: Db, key: string, limit: number, windowMs: number, now: number): boolean {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  stmt(db, `
    INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1`).run(key, windowStart);
  const row = stmt(db, 'SELECT count FROM rate_limits WHERE key = ? AND window_start = ?').get(key, windowStart) as { count: number };
  return row.count <= limit;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** Current count of the window, without incrementing it. */
export function peek(db: Db, key: string, windowMs: number, now: number): number {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const row = stmt(db, 'SELECT count FROM rate_limits WHERE key = ? AND window_start = ?').get(key, windowStart) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function bump(db: Db, key: string, windowMs: number, now: number): void {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  stmt(db, `
    INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1`).run(key, windowStart);
}
