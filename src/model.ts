// Row types read from the database.

import type { Locale } from './i18n/index.ts';

export type Cadence = 'immediate' | 'daily' | 'weekly';
export const CADENCES: Cadence[] = ['immediate', 'daily', 'weekly'];

export interface FeedRow {
  id: number;
  url: string;
  title: string;
  site_url: string | null;
  hub_url: string | null;
  self_url: string | null;
  websub_expires_at: number | null;
  websub_requested_at: number | null;
  etag: string | null;
  last_modified: string | null;
  body_hash: string | null;
  created_at: number;
  last_fetched_at: number | null;
  last_success_at: number | null;
  next_fetch_at: number;
  error_count: number;
  last_error: string | null;
  status: 'active' | 'dead';
  dead_at: number | null;
}

export interface EntryRow {
  id: number;
  feed_id: number;
  guid: string | null;
  link: string | null;
  title: string;
  summary: string;
  published_at: number | null;
  first_seen_at: number;
}

export interface SubscriptionRow {
  id: number;
  subscriber_id: number;
  feed_id: number;
  cadence: Cadence;
  status: 'pending' | 'active';
  created_at: number;
  confirmed_at: number | null;
  last_digest_at: number | null;
  digest_hour: number | null;
  digest_weekday: number | null;
  dead_notice_at: number | null;
}

export interface SubscriberRow {
  id: number;
  email: string;
  locale: Locale;
  created_at: number;
  status: 'active' | 'suspended';
}
