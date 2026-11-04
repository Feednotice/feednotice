// A feed that stops answering does not fail silently: once it is declared dead (feeds.ts),
// each subscriber is told once, with what happens next. The feed is still tried once a day;
// if it comes back, subscriptions resume by themselves. After DEAD_GRACE_DAYS they end
// (purge.ts), and an address left without subscription is erased.

import type { Ctx } from './context.ts';
import { DEAD_GRACE_DAYS } from './feeds.ts';
import type { Locale } from './i18n/index.ts';
import { canSendBulk, sendCounted } from './mail/quota.ts';
import { renderDeadFeedMail } from './mail/render.ts';
import type { FeedRow } from './model.ts';
import { DAY } from './ratelimit.ts';

export async function sendDeadFeedNotices(ctx: Ctx, limit = 200): Promise<{ sent: number; deferred: boolean }> {
  const { db, config } = ctx;
  const rows = db.prepare(`
    SELECT s.id AS subscription_id, u.email, u.locale, s.feed_id
    FROM subscriptions s
    JOIN feeds f ON f.id = s.feed_id AND f.status = 'dead'
    JOIN subscribers u ON u.id = s.subscriber_id AND u.status = 'active'
    WHERE s.status = 'active' AND (s.dead_notice_at IS NULL OR s.dead_notice_at < f.dead_at)
    ORDER BY s.id LIMIT ?`).all(limit) as { subscription_id: number; email: string; locale: Locale; feed_id: number }[];
  let sent = 0;
  for (const r of rows) {
    if (!canSendBulk(ctx)) return { sent, deferred: true };
    const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(r.feed_id) as unknown as FeedRow;
    const endsAt = (feed.dead_at ?? ctx.now()) + DEAD_GRACE_DAYS * DAY;
    // Marked first: at most one notice per death, even if sending fails.
    db.prepare('UPDATE subscriptions SET dead_notice_at = ? WHERE id = ?').run(ctx.now(), r.subscription_id);
    try {
      await sendCounted(ctx, renderDeadFeedMail(config, r.locale, feed, r.email, r.subscription_id, endsAt));
      sent++;
    } catch (e) {
      ctx.log(`subscription ${r.subscription_id}: dead-feed notice failed: ${(e as Error).message}`);
    }
  }
  return { sent, deferred: false };
}
