// Periodic erasure: whatever no longer needs to be kept is not.

import type { Ctx } from './context.ts';
import { transaction } from './db.ts';
import { DEAD_GRACE_DAYS } from './feeds.ts';
import { purgePublishers } from './publishers.ts';
import { DAY } from './ratelimit.ts';
import { purgeStats } from './stats.ts';

export interface PurgeReport {
  pendingSubscriptions: number;
  subscribers: number;
  feeds: number;
  publishers: number;
  /** Subscriptions ended because their feed stayed dead past the grace period. */
  deadFeedSubscriptions: number;
}

export function purge(ctx: Ctx): PurgeReport {
  const { db, config } = ctx;
  const now = ctx.now();
  return transaction(db, () => {
    // Requests never confirmed.
    const pending = db.prepare("DELETE FROM subscriptions WHERE status = 'pending' AND created_at < ?").run(now - config.pendingTtlDays * DAY);
    // Feeds dead for longer than the grace period: their subscriptions end (subscribers were told).
    const dead = db.prepare("DELETE FROM subscriptions WHERE feed_id IN (SELECT id FROM feeds WHERE status = 'dead' AND dead_at < ?)").run(now - DEAD_GRACE_DAYS * DAY);
    // Addresses suspended (bounce) long ago: erased.
    db.prepare("DELETE FROM subscribers WHERE status = 'suspended' AND suspended_at < ?").run(now - config.suspendedTtlDays * DAY);
    // Addresses without a subscription: erased.
    const subscribers = db.prepare('DELETE FROM subscribers WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.subscriber_id = subscribers.id)').run();
    // Feeds nobody follows any more: forgotten, with their entries.
    const feeds = db.prepare('DELETE FROM feeds WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = feeds.id)').run();
    // Delivery records no longer needed (beyond the sending horizon, see delivery.ts).
    db.prepare('DELETE FROM deliveries WHERE updated_at < ?').run(now - 30 * DAY);
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(now - 2 * DAY);
    purgeStats(db, now, config.timeZone);
    // Publisher accounts that never verified a domain.
    const publishers = purgePublishers(ctx);
    return {
      publishers,
      pendingSubscriptions: Number(pending.changes),
      subscribers: Number(subscribers.changes),
      feeds: Number(feeds.changes),
      deadFeedSubscriptions: Number(dead.changes),
    };
  });
}
