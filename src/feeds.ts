// Reading feeds: preview at subscription time, then periodic polling.
// One request per feed, whatever the number of subscribers.

import type { Ctx } from './context.ts';
import { discoverFeeds, looksLikeHtml, type DiscoveredFeed } from './feed/discover.ts';
import { fetchFeed, type FetchResult } from './feed/fetch.ts';
import { FeedParseError, parseFeed, type ParsedFeed } from './feed/parse.ts';
import type { FeedErrorCode } from './i18n/en.ts';
import { ingestEntries, sha } from './ingest.ts';
import type { FeedRow } from './model.ts';
import { count } from './stats.ts';
import { WEBSUB_POLL_MINUTES, websubActive } from './websub.ts';

const MINUTE = 60_000;

/** Normalizes the typed address: scheme added if missing, fragment dropped. */
export function normalizeFeedUrl(input: string): string | null {
  let s = input.trim();
  if (!s || s.length > 2000) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export interface LoadedFeed {
  ok: true;
  /** The feed's address: the one given, or the one found on the web page that was given. */
  url: string;
  feed: ParsedFeed;
  /** As fetched; `body` is emptied once cached (see loadFeedCached). */
  fetched: Extract<FetchResult, { kind: 'ok' }>;
  bodyHash: string;
}

export type LoadResult =
  | LoadedFeed
  /** `candidates` is set with code "several-feeds": the page announces more than one feed. */
  | { ok: false; code: FeedErrorCode; message: string; candidates?: DiscoveredFeed[] };

/**
 * Fetches and parses a feed; rejects anything that is not Atom or RSS. Given a web page
 * instead, follows the feed it announces (<link rel="alternate">), or lists them if several.
 */
export async function loadFeed(ctx: Ctx, url: string): Promise<LoadResult> {
  const res = await fetchOnce(ctx, url);
  if (res.kind !== 'ok') return res.result;
  if (looksLikeHtml(res.body, res.contentType)) {
    const candidates = discoverFeeds(res.body, res.finalUrl);
    if (candidates.length === 0) return { ok: false, code: 'no-feed-found', message: 'The page announces no feed.' };
    if (candidates.length > 1) return { ok: false, code: 'several-feeds', message: 'The page announces several feeds.', candidates };
    const found = await fetchOnce(ctx, candidates[0].url);
    if (found.kind !== 'ok') return found.result;
    return parsed(candidates[0].url, found);
  }
  return parsed(url, res);
}

async function fetchOnce(ctx: Ctx, url: string): Promise<Extract<FetchResult, { kind: 'ok' }> | { kind: 'failed'; result: LoadResult }> {
  const res = await fetchFeed(url, { userAgent: ctx.config.userAgent, allowPrivate: ctx.config.allowPrivateFeeds });
  if (res.kind === 'not-modified') return { kind: 'failed', result: { ok: false, code: 'unexpected', message: 'Unexpected 304 response.' } };
  if (res.kind === 'error') return { kind: 'failed', result: { ok: false, code: res.code, message: res.message } };
  return res;
}

function parsed(url: string, fetched: Extract<FetchResult, { kind: 'ok' }>): LoadResult {
  try {
    return { ok: true, url, feed: parseFeed(fetched.body, fetched.finalUrl), fetched, bodyHash: sha(fetched.body) };
  } catch (e) {
    if (e instanceof FeedParseError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}

// Small preview cache: the subscribe page and the form submission read the feed only once.
// Bodies are not kept (a feed can weigh 5 MB), and the cache stays small.
const previewCache = new Map<string, { at: number; result: LoadedFeed }>();
const PREVIEW_CACHE_SIZE = 50;

export async function loadFeedCached(ctx: Ctx, url: string): Promise<LoadResult> {
  const hit = previewCache.get(url);
  if (hit && ctx.now() - hit.at < 5 * MINUTE) return hit.result;
  const result = await loadFeed(ctx, url);
  if (!result.ok) return result;
  const lean: LoadedFeed = { ...result, fetched: { ...result.fetched, body: '' } };
  previewCache.delete(url);
  if (previewCache.size >= PREVIEW_CACHE_SIZE) previewCache.delete(previewCache.keys().next().value as string);
  previewCache.set(url, { at: ctx.now(), result: lean });
  return lean;
}

/** Registers a feed (or finds it). On creation, its current content becomes the backlog: none of it is sent. */
export function upsertFeed(ctx: Ctx, loaded: LoadedFeed): FeedRow {
  const { db } = ctx;
  const url = loaded.url;
  const existing = db.prepare('SELECT * FROM feeds WHERE url = ?').get(url) as unknown as FeedRow | undefined;
  const now = ctx.now();
  if (existing?.status === 'dead') {
    // It was just read successfully: back to life, read again at the next round.
    db.prepare(`UPDATE feeds SET ${ALIVE}, error_count = 0, last_error = NULL, next_fetch_at = ? WHERE id = ?`).run(now, existing.id);
    return db.prepare('SELECT * FROM feeds WHERE id = ?').get(existing.id) as unknown as FeedRow;
  }
  if (existing) return existing;
  const { feed, fetched } = loaded;
  const res = db.prepare(`
    INSERT INTO feeds (url, title, site_url, hub_url, self_url, etag, last_modified, body_hash, created_at, last_fetched_at, last_success_at, next_fetch_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    url, feed.title, feed.siteUrl, feed.hubUrl, feed.selfUrl, fetched.etag, fetched.lastModified, loaded.bodyHash,
    now, now, now, now + nextInterval(ctx, fetched.maxAgeSeconds),
  );
  const id = Number(res.lastInsertRowid);
  ingestEntries(db, id, feed.entries, now, { baseline: true });
  return db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as unknown as FeedRow;
}

function nextInterval(ctx: Ctx, maxAgeSeconds: number | null, pushed = false): number {
  const { pollIntervalMinutes, minPollIntervalMinutes, maxPollIntervalMinutes } = ctx.config;
  const wanted = maxAgeSeconds !== null ? Math.max(pollIntervalMinutes, maxAgeSeconds / 60) : pollIntervalMinutes;
  // With WebSub, the hub tells us when to read; periodic reading is only a safety net.
  const minutes = pushed ? WEBSUB_POLL_MINUTES : Math.min(maxPollIntervalMinutes, Math.max(minPollIntervalMinutes, wanted));
  // A little jitter so that feeds of the same site are not read at the same instant.
  return Math.round(minutes * MINUTE * (0.9 + Math.random() * 0.2));
}

function backoff(errorCount: number, retryAfterSeconds: number | null | undefined): number {
  const exp = Math.min(24 * 60, 15 * 2 ** Math.min(errorCount, 7)) * MINUTE;
  const retry = retryAfterSeconds ? Math.min(retryAfterSeconds * 1000, 24 * 60 * MINUTE) : 0;
  return Math.max(exp, retry);
}

/** After this many consecutive failures (about three weeks, with the backoff), the feed is declared dead. */
const DEAD_AFTER_ERRORS = 25;
/** A dead feed is still tried once a day; after this long, its subscriptions end (see purge.ts). */
export const DEAD_GRACE_DAYS = 30;
const DAY = 24 * 60 * MINUTE;

/** Any successful read brings a dead feed back: subscriptions simply resume. */
const ALIVE = "status = 'active', dead_at = NULL";

export interface PollOutcome {
  feedId: number;
  status: 'new' | 'unchanged' | 'not-modified' | 'error';
  newEntries: number;
  message?: string;
}

export async function pollFeed(ctx: Ctx, feed: FeedRow): Promise<PollOutcome> {
  const { db } = ctx;
  const res = await fetchFeed(feed.url, {
    userAgent: ctx.config.userAgent,
    etag: feed.etag,
    lastModified: feed.last_modified,
    allowPrivate: ctx.config.allowPrivateFeeds,
  });
  const now = ctx.now();

  if (res.kind === 'error') return recordError(ctx, feed, now, res.message, res.retryAfterSeconds);
  if (res.kind === 'not-modified') {
    db.prepare(`UPDATE feeds SET last_fetched_at = ?, last_success_at = ?, error_count = 0, last_error = NULL, next_fetch_at = ?, ${ALIVE} WHERE id = ?`)
      .run(now, now, now + nextInterval(ctx, res.maxAgeSeconds, websubActive(feed, now)), feed.id);
    return { feedId: feed.id, status: 'not-modified', newEntries: 0 };
  }

  // Many servers ignore conditional requests: the body hash avoids re-parsing an unchanged feed.
  const bodyHash = sha(res.body);
  const next = now + nextInterval(ctx, res.maxAgeSeconds, websubActive(feed, now));
  if (bodyHash === feed.body_hash) {
    db.prepare(`UPDATE feeds SET etag = ?, last_modified = ?, last_fetched_at = ?, last_success_at = ?, error_count = 0, last_error = NULL, next_fetch_at = ?, ${ALIVE} WHERE id = ?`)
      .run(res.etag, res.lastModified, now, now, next, feed.id);
    return { feedId: feed.id, status: 'unchanged', newEntries: 0 };
  }

  let parsed: ParsedFeed;
  try {
    parsed = parseFeed(res.body, res.finalUrl);
  } catch (e) {
    if (e instanceof FeedParseError) return recordError(ctx, feed, now, e.message, null);
    throw e;
  }
  const result = ingestEntries(db, feed.id, parsed.entries, now, { baseline: false });
  // A new hub (or none) ends the current WebSub lease: the next renewal goes to the new hub.
  // In an UPDATE, hub_url on the right-hand side is still the old value.
  db.prepare(`UPDATE feeds SET title = ?, site_url = ?,
      websub_expires_at = CASE WHEN hub_url IS ? THEN websub_expires_at ELSE NULL END,
      websub_requested_at = CASE WHEN hub_url IS ? THEN websub_requested_at ELSE NULL END,
      hub_url = ?, self_url = ?, etag = ?, last_modified = ?, body_hash = ?,
      last_fetched_at = ?, last_success_at = ?, error_count = 0, last_error = NULL, next_fetch_at = ?, ${ALIVE} WHERE id = ?`)
    .run(parsed.title, parsed.siteUrl, parsed.hubUrl, parsed.hubUrl, parsed.hubUrl, parsed.selfUrl, res.etag, res.lastModified, bodyHash, now, now, next, feed.id);
  if (feed.status === 'dead') ctx.log(`feed ${feed.id}: answers again, subscriptions resume`);
  for (const w of parsed.warnings) ctx.log(`feed ${feed.id}: ${w}`);
  if (result.rekeyed) ctx.log(`feed ${feed.id}: ${result.rekeyed} entry(ies) recognized despite a changed identifier`);
  return { feedId: feed.id, status: result.newEntryIds.length ? 'new' : 'unchanged', newEntries: result.newEntryIds.length };
}

function recordError(ctx: Ctx, feed: FeedRow, now: number, message: string, retryAfter: number | null | undefined): PollOutcome {
  const errors = feed.error_count + 1;
  const dies = feed.status === 'active' && errors >= DEAD_AFTER_ERRORS;
  const dead = dies || feed.status === 'dead';
  // Dead: tried once a day, so a feed that comes back is noticed.
  const next = dead ? now + DAY : now + backoff(errors, retryAfter);
  ctx.db.prepare(`UPDATE feeds SET last_fetched_at = ?, error_count = ?, last_error = ?, next_fetch_at = ?, status = ?,
      dead_at = CASE WHEN ? THEN ? ELSE dead_at END WHERE id = ?`)
    .run(now, errors, message, next, dead ? 'dead' : 'active', dies ? 1 : 0, now, feed.id);
  ctx.log(`feed ${feed.id}: failure #${errors}: ${message}${dies ? ' (declared dead: subscribers will be told)' : ''}`);
  if (dies) count(ctx, 'feed.died');
  return { feedId: feed.id, status: 'error', newEntries: 0, message };
}

/** Polls due feeds that have at least one confirmed subscription (dead ones too, during their grace period). */
export async function pollDueFeeds(ctx: Ctx, limit = 100, concurrency = 4): Promise<PollOutcome[]> {
  const now = ctx.now();
  const due = ctx.db.prepare(`
    SELECT f.* FROM feeds f
    WHERE (f.status = 'active' OR f.dead_at > ?) AND f.next_fetch_at <= ?
      AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = f.id AND s.status = 'active')
    ORDER BY f.next_fetch_at LIMIT ?`).all(now - DEAD_GRACE_DAYS * DAY, now, limit) as unknown as FeedRow[];
  const outcomes: PollOutcome[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, due.length) }, async () => {
    while (i < due.length) {
      const feed = due[i++];
      try {
        outcomes.push(await pollFeed(ctx, feed));
      } catch (e) {
        ctx.log(`feed ${feed.id}: unexpected error: ${(e as Error).stack}`);
      }
    }
  });
  await Promise.all(workers);
  return outcomes;
}
