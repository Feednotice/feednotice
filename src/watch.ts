// The readers' paid plan ("watch"), set by the operator: keyword filters and pauses, per
// subscription. Without the plan, or once it ends, every entry is sent as before; the settings
// stay for a renewal. There is no price in this code.
//
// Filters look at an entry's title and summary, ignoring case and accents, and match whole
// words or phrases: "vote" matches "Vote tonight" but not "devoted". An entry is sent if it
// contains one of the words to include (when there are any) and none of the words to exclude.
// A pause holds back what appears between its start and its end: those entries are never sent,
// not even later.

import type { Ctx } from './context.ts';
import { stmt } from './db.ts';
import type { SubscriberRow, SubscriptionRow } from './model.ts';
import { normalizeEmail } from './subscriptions.ts';

export type ReaderPlan = SubscriberRow['plan'];
export const READER_PLANS: readonly ReaderPlan[] = ['free', 'watch'];
/** Subscriptions with filters, per reader. */
export const MAX_FILTERED = 50;
export const WORDS_MAX = 300;

export function readerHasWatch(s: Pick<SubscriberRow, 'plan' | 'plan_until'>, now: number): boolean {
  return s.plan === 'watch' && (s.plan_until === null || s.plan_until > now);
}

export function findReader(ctx: Ctx, email: string): SubscriberRow | null {
  const e = normalizeEmail(email);
  return e ? ((ctx.db.prepare('SELECT * FROM subscribers WHERE email = ?').get(e) as unknown as SubscriberRow | undefined) ?? null) : null;
}

export function setReaderPlan(ctx: Ctx, subscriberId: number, plan: ReaderPlan, until: number | null): void {
  ctx.db.prepare('UPDATE subscribers SET plan = ?, plan_until = ? WHERE id = ?').run(plan, plan === 'free' ? null : until, subscriberId);
}

/** Lower case, without accents: "Élection" and "election" are the same word. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** "vote, city council ,  budget" → ["vote", "city council", "budget"], folded, no duplicates. */
export function parseWords(input: string): string[] {
  return [...new Set(input.split(/[,\n;]/).map((w) => fold(w).replace(/\s+/g, ' ').trim()).filter((w) => w.length > 0 && w.length <= 60))].slice(0, 20);
}

/** The words as they are stored and shown back: comma-separated, as typed (trimmed). */
export function cleanWords(input: string): string {
  return input.split(/[,\n;]/).map((w) => w.replace(/\s+/g, ' ').trim()).filter((w) => w.length > 0 && w.length <= 60).slice(0, 20).join(', ').slice(0, WORDS_MAX);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map<string, RegExp | null>();

/** One regular expression per list of words, matching any of them as whole words. */
function pattern(words: string): RegExp | null {
  let re = patterns.get(words);
  if (re === undefined) {
    const list = parseWords(words);
    re = list.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map((w) => escapeRe(w).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'u') : null;
    if (patterns.size > 5000) patterns.clear();
    patterns.set(words, re);
  }
  return re;
}

export function passesFilters(include: string, exclude: string, text: string): boolean {
  const t = fold(text);
  const inc = pattern(include);
  const exc = pattern(exclude);
  return (!inc || inc.test(t)) && !(exc && exc.test(t));
}

export function isPaused(s: Pick<SubscriptionRow, 'paused_from' | 'paused_until'>, firstSeenAt: number): boolean {
  return s.paused_from !== null && firstSeenAt >= s.paused_from && (s.paused_until === null || firstSeenAt < s.paused_until);
}

export interface Screenable {
  subscription_id: number;
  subscriber_id: number;
  entry_id: number;
}

/**
 * Splits what is owed into what to send and what the reader's filters or pause hold back.
 * Only readers with the plan are screened; the others get everything.
 */
export function screen<T extends Screenable>(ctx: Ctx, rows: T[]): { send: T[]; held: T[] } {
  const now = ctx.now();
  const { db } = ctx;
  const watchers = new Map<number, boolean>();
  const subs = new Map<number, Pick<SubscriptionRow, 'include_words' | 'exclude_words' | 'paused_from' | 'paused_until'>>();
  const send: T[] = [];
  const held: T[] = [];
  for (const r of rows) {
    let watching = watchers.get(r.subscriber_id);
    if (watching === undefined) {
      const u = stmt(db, 'SELECT plan, plan_until FROM subscribers WHERE id = ?').get(r.subscriber_id) as Pick<SubscriberRow, 'plan' | 'plan_until'> | undefined;
      watching = u ? readerHasWatch(u, now) : false;
      watchers.set(r.subscriber_id, watching);
    }
    if (!watching) {
      send.push(r);
      continue;
    }
    let s = subs.get(r.subscription_id);
    if (!s) {
      s = stmt(db, 'SELECT include_words, exclude_words, paused_from, paused_until FROM subscriptions WHERE id = ?').get(r.subscription_id) as never;
      subs.set(r.subscription_id, s!);
    }
    if (!s!.include_words && !s!.exclude_words && s!.paused_from === null) {
      send.push(r);
      continue;
    }
    const e = stmt(db, 'SELECT title, summary, first_seen_at FROM entries WHERE id = ?').get(r.entry_id) as { title: string; summary: string; first_seen_at: number };
    const keep = !isPaused(s!, e.first_seen_at) && passesFilters(s!.include_words, s!.exclude_words, `${e.title}\n${e.summary}`);
    (keep ? send : held).push(r);
  }
  return { send, held };
}

/** Records held-back entries as handled, never sent: 'sent' with no attempt. */
export function markHeld(ctx: Ctx, rows: Screenable[]): void {
  if (rows.length === 0) return;
  const q = stmt(ctx.db, `INSERT INTO deliveries (subscription_id, entry_id, status, attempts, updated_at) VALUES (?, ?, 'sent', 0, ?)
    ON CONFLICT (subscription_id, entry_id) DO UPDATE SET status = 'sent', attempts = 0, updated_at = excluded.updated_at`);
  const now = ctx.now();
  for (const r of rows) q.run(r.subscription_id, r.entry_id, now);
}

export type FilterResult = 'saved' | 'limit';

/** Sets a subscription's filters; refused past MAX_FILTERED filtered subscriptions. */
export function setFilters(ctx: Ctx, subscriberId: number, subscriptionId: number, include: string, exclude: string): FilterResult {
  const inc = cleanWords(include);
  const exc = cleanWords(exclude);
  if (inc || exc) {
    const { n } = ctx.db.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE subscriber_id = ? AND id <> ?
      AND (include_words <> '' OR exclude_words <> '')`).get(subscriberId, subscriptionId) as { n: number };
    if (n >= MAX_FILTERED) return 'limit';
  }
  ctx.db.prepare('UPDATE subscriptions SET include_words = ?, exclude_words = ? WHERE id = ? AND subscriber_id = ?').run(inc, exc, subscriptionId, subscriberId);
  return 'saved';
}

/** Pauses from now for `days` (null: until resumed), or resumes (days = 0). */
export function setPause(ctx: Ctx, subscriberId: number, subscriptionId: number, days: number | null): void {
  const now = ctx.now();
  if (days === 0) {
    ctx.db.prepare('UPDATE subscriptions SET paused_from = NULL, paused_until = NULL WHERE id = ? AND subscriber_id = ?').run(subscriptionId, subscriberId);
  } else {
    ctx.db.prepare('UPDATE subscriptions SET paused_from = ?, paused_until = ? WHERE id = ? AND subscriber_id = ?')
      .run(now, days === null ? null : now + days * 86_400_000, subscriptionId, subscriberId);
  }
}
