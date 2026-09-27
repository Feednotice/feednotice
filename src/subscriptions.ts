// The subscriber's journey: request, double opt-in, unsubscribe, account.
// The email address is the only personal data; it disappears with the last subscription.

import type { Ctx } from './context.ts';
import { transaction } from './db.ts';
import { loadFeedCached, normalizeFeedUrl, upsertFeed } from './feeds.ts';
import type { FeedErrorCode } from './i18n/en.ts';
import type { Locale } from './i18n/index.ts';
import { sendCounted } from './mail/quota.ts';
import { renderAlreadySubscribedMail, renderConfirmationMail, renderManageLinkMail } from './mail/render.ts';
import type { Cadence, FeedRow, SubscriberRow, SubscriptionRow } from './model.ts';
import { CADENCES } from './model.ts';
import { allow, DAY, HOUR } from './ratelimit.ts';
import { fingerprint, signToken } from './tokens.ts';

/** Anti-abuse: far above normal use. */
export const MAX_SUBSCRIPTIONS_PER_ADDRESS = 100;

export function normalizeEmail(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (s.length > 254) return null;
  return /^[^\s@<>()",;:\\[\]]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/.test(s) ? s : null;
}

export function isCadence(v: unknown): v is Cadence {
  return typeof v === 'string' && (CADENCES as string[]).includes(v);
}

export type SubscribeOutcome =
  | { kind: 'sent' }
  | { kind: 'invalid-email' }
  | { kind: 'invalid-feed-url' }
  | { kind: 'invalid-cadence' }
  | { kind: 'feed-error'; code: FeedErrorCode }
  | { kind: 'rate-limited' };

/**
 * Subscription request. The answer is the same whether the address is new, already
 * subscribed or blocked: the page must not reveal who follows what.
 */
export async function requestSubscription(
  ctx: Ctx,
  input: { email: string; feedUrl: string; cadence: string; ip: string; locale: Locale },
): Promise<SubscribeOutcome> {
  const { config, db } = ctx;
  const email = normalizeEmail(input.email);
  if (!email) return { kind: 'invalid-email' };
  const feedUrl = normalizeFeedUrl(input.feedUrl);
  if (!feedUrl) return { kind: 'invalid-feed-url' };
  if (!isCadence(input.cadence)) return { kind: 'invalid-cadence' };

  const now = ctx.now();
  if (!allow(db, `sub-ip:${fingerprint(config.secret, input.ip)}`, 20, HOUR, now)) return { kind: 'rate-limited' };

  const loaded = await loadFeedCached(ctx, feedUrl);
  if (!loaded.ok) return { kind: 'feed-error', code: loaded.code };

  const emailHash = fingerprint(config.secret, email);
  // At most three confirmation emails per day and address: the service cannot be used to harass someone.
  if (!allow(db, `sub-mail:${emailHash}`, 3, DAY, now)) return { kind: 'sent' };
  if (db.prepare('SELECT 1 FROM suppressions WHERE email_hash = ?').get(emailHash)) return { kind: 'sent' };

  const feed = upsertFeed(ctx, loaded);
  const created = transaction(db, () => {
    // The latest language chosen wins: it is the one the person is reading right now.
    db.prepare('INSERT INTO subscribers (email, locale, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO UPDATE SET locale = excluded.locale')
      .run(email, input.locale, now);
    const subscriber = db.prepare('SELECT * FROM subscribers WHERE email = ?').get(email) as unknown as SubscriberRow;
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE subscriber_id = ? AND feed_id <> ?').get(subscriber.id, feed.id) as { n: number };
    if (n >= MAX_SUBSCRIPTIONS_PER_ADDRESS) return null;
    db.prepare(`INSERT INTO subscriptions (subscriber_id, feed_id, cadence, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (subscriber_id, feed_id) DO UPDATE SET cadence = CASE WHEN status = 'pending' THEN excluded.cadence ELSE cadence END`)
      .run(subscriber.id, feed.id, input.cadence, now);
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE subscriber_id = ? AND feed_id = ?').get(subscriber.id, feed.id) as unknown as SubscriptionRow;
    return { subscription, subscriber };
  });
  // Same answer as a success: the page must not reveal anything about the address.
  if (!created) return { kind: 'sent' };
  const { subscription, subscriber } = created;
  if (subscriber.status === 'suspended') return { kind: 'sent' };

  if (subscription.status === 'active') {
    await sendCounted(ctx, renderAlreadySubscribedMail(config, subscriber.locale, feed, email));
  } else {
    const token = signToken(config.secret, 'confirm', subscription.id, now + config.pendingTtlDays * DAY);
    await sendCounted(ctx, renderConfirmationMail(config, subscriber.locale, feed, email, `${config.baseUrl}/c/${token}`, subscription.cadence));
  }
  return { kind: 'sent' };
}

export function getSubscription(ctx: Ctx, id: number): (SubscriptionRow & { feed: FeedRow; locale: Locale }) | null {
  const sub = ctx.db.prepare('SELECT s.*, u.locale FROM subscriptions s JOIN subscribers u ON u.id = s.subscriber_id WHERE s.id = ?').get(id) as
    unknown as (SubscriptionRow & { locale: Locale }) | undefined;
  if (!sub) return null;
  const feed = ctx.db.prepare('SELECT * FROM feeds WHERE id = ?').get(sub.feed_id) as unknown as FeedRow;
  return { ...sub, feed };
}

/** Confirms. Entries that appeared since the request will be sent (see delivery.ts). */
export function confirmSubscription(ctx: Ctx, id: number): void {
  ctx.db.prepare("UPDATE subscriptions SET status = 'active', confirmed_at = ? WHERE id = ? AND status = 'pending'").run(ctx.now(), id);
}

/** Deletes the subscription; if it was the last one, the address is erased. */
export function unsubscribe(ctx: Ctx, id: number): boolean {
  const { db } = ctx;
  return transaction(db, () => {
    const sub = db.prepare('SELECT subscriber_id FROM subscriptions WHERE id = ?').get(id) as { subscriber_id: number } | undefined;
    if (!sub) return false;
    db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
    db.prepare('DELETE FROM subscribers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriber_id = ?)').run(sub.subscriber_id, sub.subscriber_id);
    return true;
  });
}

export function deleteSubscriber(ctx: Ctx, subscriberId: number): void {
  ctx.db.prepare('DELETE FROM subscribers WHERE id = ?').run(subscriberId);
}

export function setCadence(ctx: Ctx, subscriberId: number, subscriptionId: number, cadence: Cadence): void {
  // Digests start from now: nothing already sent is sent again.
  ctx.db.prepare('UPDATE subscriptions SET cadence = ?, last_digest_at = ? WHERE id = ? AND subscriber_id = ?')
    .run(cadence, ctx.now(), subscriptionId, subscriberId);
}

/** Digest hour (0–23) and, for weekly digests, day (1 = Monday … 7). Out-of-range values are ignored. */
export function setDigestSchedule(ctx: Ctx, subscriberId: number, subscriptionId: number, hour: number, weekday: number | null): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
  if (weekday !== null && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) return;
  ctx.db.prepare('UPDATE subscriptions SET digest_hour = ?, digest_weekday = COALESCE(?, digest_weekday) WHERE id = ? AND subscriber_id = ?')
    .run(hour, weekday, subscriptionId, subscriberId);
}

export function setLocale(ctx: Ctx, subscriberId: number, locale: Locale): void {
  ctx.db.prepare('UPDATE subscribers SET locale = ? WHERE id = ?').run(locale, subscriberId);
}

export type SubscriptionListItem = SubscriptionRow & { feed_title: string; feed_url: string; site_url: string | null };

export function listSubscriptions(ctx: Ctx, subscriberId: number): SubscriptionListItem[] {
  return ctx.db.prepare(`
    SELECT s.*, f.title AS feed_title, f.url AS feed_url, f.site_url FROM subscriptions s JOIN feeds f ON f.id = s.feed_id
    WHERE s.subscriber_id = ? ORDER BY f.title`).all(subscriberId) as never;
}

export function getSubscriber(ctx: Ctx, id: number): SubscriberRow | null {
  return (ctx.db.prepare('SELECT * FROM subscribers WHERE id = ?').get(id) as unknown as SubscriberRow | undefined) ?? null;
}

/** Sends the magic link to the account page if the address is known. Same answer otherwise. */
export async function requestManageLink(ctx: Ctx, rawEmail: string, ip: string): Promise<'sent' | 'invalid' | 'rate-limited'> {
  const { config, db } = ctx;
  const email = normalizeEmail(rawEmail);
  if (!email) return 'invalid';
  const now = ctx.now();
  if (!allow(db, `manage-ip:${fingerprint(config.secret, ip)}`, 20, HOUR, now)) return 'rate-limited';
  if (!allow(db, `manage-mail:${fingerprint(config.secret, email)}`, 3, HOUR, now)) return 'sent';
  const subscriber = db.prepare("SELECT * FROM subscribers WHERE email = ? AND status = 'active'").get(email) as unknown as SubscriberRow | undefined;
  if (subscriber) {
    const token = signToken(config.secret, 'manage', subscriber.id, now + DAY);
    await sendCounted(ctx, renderManageLinkMail(config, subscriber.locale, email, `${config.baseUrl}/m/${token}`));
  }
  return 'sent';
}

export type MailEventType = 'hard_bounce' | 'soft_bounce' | 'complaint' | 'unsubscribe';

/**
 * Bounces and complaints, from the MTA container or a provider webhook.
 * Hard bounce: the address is suspended (no more sending), then erased after a delay.
 * Complaint or unsubscribe at the provider: everything is erased; only a fingerprint remains
 * so the address is never written to again.
 */
export function handleMailEvent(ctx: Ctx, rawEmail: string, type: MailEventType): void {
  const { config, db } = ctx;
  const email = normalizeEmail(rawEmail);
  if (!email) return;
  const now = ctx.now();
  if (type === 'soft_bounce') return;
  if (type === 'hard_bounce') {
    db.prepare("UPDATE subscribers SET status = 'suspended', suspended_at = ?, suspended_reason = 'bounce' WHERE email = ?").run(now, email);
    return;
  }
  transaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO suppressions (email_hash, reason, created_at) VALUES (?, ?, ?)')
      .run(fingerprint(config.secret, email), type, now);
    db.prepare('DELETE FROM subscribers WHERE email = ?').run(email);
  });
}
