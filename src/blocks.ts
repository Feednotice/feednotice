// The operator's blocks: a feed or a whole domain that the service must not carry (unlawful
// content, abuse), and addresses that must never be written to. Managed from the command line
// (`cli.ts block …`). Blocking a feed ends its subscriptions at once; each subscriber is told.

import type { Ctx } from './context.ts';
import { stmt, transaction } from './db.ts';
import { normalizeFeedUrl } from './feeds.ts';
import type { Locale } from './i18n/index.ts';
import { sendCounted } from './mail/quota.ts';
import { renderFeedRemovedMail } from './mail/render.ts';
import type { FeedRow } from './model.ts';
import { normalizeDomain } from './publishers.ts';
import { normalizeEmail } from './subscriptions.ts';
import { count } from './stats.ts';
import { fingerprint } from './tokens.ts';

export type BlockKind = 'feed' | 'domain';

export interface Block {
  pattern: string;
  kind: BlockKind;
  reason: string;
  created_at: number;
}

/** Is this address (a feed, or the page it was found on) blocked? */
export function isBlocked(ctx: Ctx, ...urls: string[]): boolean {
  const blocks = stmt(ctx.db, 'SELECT pattern, kind FROM blocked_feeds').all() as unknown as Pick<Block, 'pattern' | 'kind'>[];
  if (blocks.length === 0) return false;
  return urls.some((raw) => {
    const url = normalizeFeedUrl(raw);
    if (!url) return false;
    const host = new URL(url).hostname.toLowerCase();
    return blocks.some((b) => (b.kind === 'feed' ? b.pattern === url : host === b.pattern || host.endsWith(`.${b.pattern}`)));
  });
}

/**
 * Blocks a feed (exact address) or a domain (and its subdomains), then ends the subscriptions
 * of every feed it covers: each active subscriber is told, the feed is forgotten, and an
 * address left with no subscription is erased. Returns how many feeds were removed.
 */
export async function block(ctx: Ctx, kind: BlockKind, input: string, reason: string): Promise<{ pattern: string; feeds: number; notified: number } | null> {
  const pattern = kind === 'feed' ? normalizeFeedUrl(input) : normalizeDomain(input);
  if (!pattern) return null;
  const { db, config } = ctx;
  db.prepare(`INSERT INTO blocked_feeds (pattern, kind, reason, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (pattern) DO UPDATE SET reason = excluded.reason`).run(pattern, kind, reason, ctx.now());
  const feeds = (db.prepare('SELECT * FROM feeds').all() as unknown as FeedRow[]).filter((f) => isBlocked(ctx, f.url));
  let notified = 0;
  for (const feed of feeds) {
    const subs = db.prepare(`SELECT u.email, u.locale FROM subscriptions s JOIN subscribers u ON u.id = s.subscriber_id
      WHERE s.feed_id = ? AND s.status = 'active' AND u.status = 'active'`).all(feed.id) as { email: string; locale: Locale }[];
    for (const s of subs) {
      try {
        await sendCounted(ctx, renderFeedRemovedMail(config, s.locale, feed, s.email));
        notified++;
      } catch (e) {
        ctx.log(`feed ${feed.id}: removal notice failed: ${(e as Error).message}`);
      }
    }
    transaction(db, () => {
      const res = db.prepare('DELETE FROM subscriptions WHERE feed_id = ?').run(feed.id);
      db.prepare('DELETE FROM feeds WHERE id = ?').run(feed.id);
      db.prepare('DELETE FROM subscribers WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.subscriber_id = subscribers.id)').run();
      count(ctx, 'sub.stopped', Number(res.changes));
    });
    ctx.log(`feed ${feed.id} (${feed.url}) blocked and removed: ${subs.length} subscriber(s) told`);
  }
  return { pattern, feeds: feeds.length, notified };
}

/** Never writes to this address again: erased now, only its fingerprint kept (like a complaint). */
export function blockAddress(ctx: Ctx, input: string): boolean {
  const email = normalizeEmail(input);
  if (!email) return false;
  transaction(ctx.db, () => {
    ctx.db.prepare("INSERT INTO suppressions (email_hash, reason, created_at) VALUES (?, 'blocked', ?) ON CONFLICT (email_hash) DO UPDATE SET reason = 'blocked'")
      .run(fingerprint(ctx.config.secret, email), ctx.now());
    ctx.db.prepare('DELETE FROM subscribers WHERE email = ?').run(email);
  });
  return true;
}

export function unblock(ctx: Ctx, kind: BlockKind | 'address', input: string): boolean {
  if (kind === 'address') {
    const email = normalizeEmail(input);
    return email ? Number(ctx.db.prepare('DELETE FROM suppressions WHERE email_hash = ?').run(fingerprint(ctx.config.secret, email)).changes) > 0 : false;
  }
  const pattern = kind === 'feed' ? normalizeFeedUrl(input) : normalizeDomain(input);
  return pattern ? Number(ctx.db.prepare('DELETE FROM blocked_feeds WHERE pattern = ? AND kind = ?').run(pattern, kind).changes) > 0 : false;
}

export function listBlocks(ctx: Ctx): { feeds: Block[]; addresses: number } {
  return {
    feeds: ctx.db.prepare('SELECT * FROM blocked_feeds ORDER BY kind, pattern').all() as unknown as Block[],
    addresses: (ctx.db.prepare("SELECT COUNT(*) AS n FROM suppressions WHERE reason = 'blocked'").get() as { n: number }).n,
  };
}
