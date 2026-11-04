// WebSub (W3C Recommendation): when a feed announces a hub (<link rel="hub">), FeedNotice
// subscribes to it, so new entries are read within a minute of publication instead of at the
// next periodic read.
//
// A notification is never trusted as content: it only moves the feed's next read to now,
// through the usual path (fetch, parse, deduplicate). Notifications must be signed with the
// per-feed secret given to the hub; at most one read per minute per feed follows from them.
// Periodic reading continues, less often (every 6 hours), as a safety net. Only https hubs
// are used: the per-feed secret must not travel in clear.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.ts';
import type { Ctx } from './context.ts';
import { postForm } from './feed/fetch.ts';
import type { FeedRow } from './model.ts';
import { DAY, HOUR } from './ratelimit.ts';
import { fingerprint, signToken, verifyToken } from './tokens.ts';

/** Lease asked from the hub; renewed a day before it ends. */
export const LEASE_SECONDS = 10 * 24 * 3600;
/** A pushed feed is still read periodically, but rarely. */
export const WEBSUB_POLL_MINUTES = 6 * 60;
const MIN_PUSH_INTERVAL = 60_000;
const RETRY_AFTER_FAILURE = 6 * HOUR;

export function callbackUrl(config: Config, feedId: number): string {
  return `${config.baseUrl}/websub/${signToken(config.secret, 'websub', feedId)}`;
}

export function hubSecret(config: Config, feedId: number): string {
  return fingerprint(config.secret, `websub:${feedId}`);
}

/** The topic is the feed's own declared address (rel="self"), as hubs know it. */
export function topicOf(feed: Pick<FeedRow, 'url' | 'self_url'>): string {
  return feed.self_url ?? feed.url;
}

export function websubActive(feed: Pick<FeedRow, 'hub_url' | 'websub_expires_at'>, now: number): boolean {
  return Boolean(feed.hub_url) && (feed.websub_expires_at ?? 0) > now;
}

/** Subscribes (or renews) with the hub of feeds whose lease is missing or about to end. */
export async function renewWebSub(ctx: Ctx, limit = 20): Promise<number> {
  const { db, config } = ctx;
  const now = ctx.now();
  const due = db.prepare(`
    SELECT f.* FROM feeds f
    WHERE f.status = 'active' AND f.hub_url IS NOT NULL
      AND (f.websub_expires_at IS NULL OR f.websub_expires_at < ?)
      AND (f.websub_requested_at IS NULL OR f.websub_requested_at < ?)
      AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = f.id AND s.status = 'active')
      AND (f.hub_url LIKE 'https://%' OR ?)
    LIMIT ?`).all(now + DAY, now - RETRY_AFTER_FAILURE, config.allowPrivateFeeds ? 1 : 0, limit) as unknown as FeedRow[];
  let accepted = 0;
  for (const feed of due) {
    db.prepare('UPDATE feeds SET websub_requested_at = ? WHERE id = ?').run(now, feed.id);
    const res = await postForm(feed.hub_url as string, {
      'hub.mode': 'subscribe',
      'hub.topic': topicOf(feed),
      'hub.callback': callbackUrl(config, feed.id),
      'hub.lease_seconds': String(LEASE_SECONDS),
      'hub.secret': hubSecret(config, feed.id),
    }, { userAgent: config.userAgent, allowPrivate: config.allowPrivateFeeds });
    // 202: the hub will verify our intent by calling the callback (see verifyIntent).
    if (res.status >= 200 && res.status < 300) accepted++;
    else ctx.log(`feed ${feed.id}: WebSub hub refused the subscription (${res.status || ('message' in res ? res.message : '')})`);
  }
  return accepted;
}

export function feedForCallback(ctx: Ctx, token: string): FeedRow | null {
  const id = verifyToken(ctx.config.secret, 'websub', token, ctx.now());
  if (!id) return null;
  return (ctx.db.prepare('SELECT * FROM feeds WHERE id = ?').get(id) as unknown as FeedRow | undefined) ?? null;
}

/** Hub's verification of intent (GET). Returns the body to send with 200, or null for 404. */
export function verifyIntent(ctx: Ctx, feed: FeedRow, query: URLSearchParams): string | null {
  const mode = query.get('hub.mode');
  const topic = query.get('hub.topic');
  const now = ctx.now();
  if (mode === 'denied') {
    ctx.db.prepare('UPDATE feeds SET websub_expires_at = NULL WHERE id = ?').run(feed.id);
    return '';
  }
  // We only ever ask to subscribe, and only to this feed's topic.
  if (mode !== 'subscribe' || topic !== topicOf(feed) || !query.get('hub.challenge') || !feed.hub_url) return null;
  const lease = Number(query.get('hub.lease_seconds') ?? LEASE_SECONDS);
  const seconds = Number.isFinite(lease) && lease > 0 ? Math.min(lease, 90 * 24 * 3600) : LEASE_SECONDS;
  ctx.db.prepare('UPDATE feeds SET websub_expires_at = ? WHERE id = ?').run(now + seconds * 1000, feed.id);
  return query.get('hub.challenge');
}

/** Largest notification body read; the content itself is never used, only its signature. */
const MAX_NOTIFICATION = 5 * 1024 * 1024;

/**
 * Content distribution (POST). Returns true if the signature is valid and a read was
 * scheduled. The caller answers 2xx either way, as the specification asks. The body is
 * hashed as it arrives, never held in memory; without a well-formed signature it is not read.
 */
export async function notify(ctx: Ctx, feed: FeedRow, body: AsyncIterable<Buffer | string>, signature: string | undefined): Promise<boolean> {
  const m = /^(sha1|sha256|sha384|sha512)=([0-9a-f]+)$/i.exec(signature ?? '');
  if (!m) return false;
  const hmac = createHmac(m[1].toLowerCase(), hubSecret(ctx.config, feed.id));
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > MAX_NOTIFICATION) return false;
    hmac.update(chunk);
  }
  const expected = hmac.digest();
  const given = Buffer.from(m[2], 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const now = ctx.now();
  const soonest = Math.max(now, (feed.last_fetched_at ?? 0) + MIN_PUSH_INTERVAL);
  ctx.db.prepare('UPDATE feeds SET next_fetch_at = MIN(next_fetch_at, ?) WHERE id = ?').run(soonest, feed.id);
  return true;
}
