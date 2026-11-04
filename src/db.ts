// SQLite schema. The only personal data: subscribers.email.
// Timestamps are milliseconds since the Unix epoch (UTC).

import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

// Version 1 is the initial schema; each later version is a migration below. A database is
// brought up to date at start, one migration at a time, each in its own transaction.
const SCHEMA = `
CREATE TABLE feeds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL DEFAULT '',
  site_url        TEXT,
  hub_url         TEXT,
  etag            TEXT,
  last_modified   TEXT,
  body_hash       TEXT,
  created_at      INTEGER NOT NULL,
  last_fetched_at INTEGER,
  last_success_at INTEGER,
  next_fetch_at   INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dead'))
);

-- An entry seen at least once in a feed. Never forgotten while the feed is followed:
-- this memory is what prevents resending a republished entry.
CREATE TABLE entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id         INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid            TEXT,
  link            TEXT,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  published_at    INTEGER,
  link_title_hash TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  first_seen_at   INTEGER NOT NULL,
  in_feed         INTEGER NOT NULL DEFAULT 1,
  -- seen on the feed's first read: part of the backlog, never sent
  baseline        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX entries_feed_seen ON entries(feed_id, first_seen_at);
CREATE INDEX entries_feed_in ON entries(feed_id, in_feed);

-- Deduplication keys: an entry may collect several (when the feed rewrites its identifiers).
CREATE TABLE entry_keys (
  feed_id  INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  PRIMARY KEY (feed_id, key)
) WITHOUT ROWID;

CREATE TABLE subscribers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE,
  created_at       INTEGER NOT NULL,
  -- language of the pages and emails, chosen at subscription time
  locale           TEXT NOT NULL DEFAULT 'en',
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  suspended_at     INTEGER,
  suspended_reason TEXT
);

CREATE TABLE subscriptions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  feed_id        INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  cadence        TEXT NOT NULL CHECK (cadence IN ('immediate', 'daily', 'weekly')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at     INTEGER NOT NULL,
  confirmed_at   INTEGER,
  last_digest_at INTEGER,
  -- subscriber's own settings; NULL = service defaults
  digest_hour    INTEGER CHECK (digest_hour BETWEEN 0 AND 23),
  digest_weekday INTEGER CHECK (digest_weekday BETWEEN 1 AND 7),
  UNIQUE (subscriber_id, feed_id)
);
CREATE INDEX subscriptions_feed ON subscriptions(feed_id, status, cadence);

-- What was sent (or is being sent): the "never twice" guarantee.
CREATE TABLE deliveries (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  entry_id        INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (subscription_id, entry_id)
) WITHOUT ROWID;

-- Addresses that complained: only an HMAC fingerprint is kept, so they are never written to again.
CREATE TABLE suppressions (
  email_hash TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Locks: one read-and-send cycle at a time, even with several processes.
CREATE TABLE locks (
  name        TEXT PRIMARY KEY,
  holder      TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
) WITHOUT ROWID;

-- Rate-limit counters (keys are fingerprints of IP or email addresses, never cleartext).
CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
`;

const MIGRATIONS: string[] = [
  // 2: WebSub subscriptions, and publisher accounts with verified domains.
  `
  ALTER TABLE feeds ADD COLUMN self_url TEXT;
  ALTER TABLE feeds ADD COLUMN websub_expires_at INTEGER;
  ALTER TABLE feeds ADD COLUMN websub_requested_at INTEGER;

  CREATE TABLE publishers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- personal data: the publisher's contact address (see docs/privacy.md)
    email        TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL DEFAULT '',
    welcome_text TEXT NOT NULL DEFAULT '',
    plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
    locale       TEXT NOT NULL DEFAULT 'en',
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE publisher_domains (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    domain       TEXT NOT NULL,
    token        TEXT NOT NULL,
    verified_at  INTEGER,
    method       TEXT CHECK (method IN ('file', 'dns')),
    checked_at   INTEGER,
    failures     INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    UNIQUE (publisher_id, domain)
  );
  CREATE INDEX publisher_domains_verified ON publisher_domains(domain, verified_at);
  `,
  // 3: dead feeds (subscribers told once), operator counters, publisher terms acceptance.
  `
  ALTER TABLE feeds ADD COLUMN dead_at INTEGER;
  ALTER TABLE subscriptions ADD COLUMN dead_notice_at INTEGER;
  ALTER TABLE publishers ADD COLUMN terms_version INTEGER;
  ALTER TABLE publishers ADD COLUMN terms_accepted_at INTEGER;
  UPDATE feeds SET dead_at = COALESCE(last_fetched_at, created_at) WHERE status = 'dead';

  -- Daily counters for the operator (sent, bounces, complaints…): numbers only, no address.
  CREATE TABLE stats_daily (
    day TEXT NOT NULL,
    key TEXT NOT NULL,
    n   INTEGER NOT NULL,
    PRIMARY KEY (day, key)
  ) WITHOUT ROWID;

  -- Small internal state (last report sent, last alert…).
  CREATE TABLE state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;
  `,
];

export const SCHEMA_VERSION = 1 + MIGRATIONS.length;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  let { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version > SCHEMA_VERSION) {
    throw new Error(`Database schema ${version} is newer than this code (${SCHEMA_VERSION}): update the application.`);
  }
  if (version === 0) {
    transaction(db, () => {
      db.exec(SCHEMA);
      db.exec('PRAGMA user_version = 1');
    });
    version = 1;
  }
  for (; version < SCHEMA_VERSION; version++) {
    const next = version + 1;
    transaction(db, () => {
      db.exec(MIGRATIONS[next - 2]);
      db.exec(`PRAGMA user_version = ${next}`);
    });
  }
  return db;
}

/** Takes lock `name` for `ttlMs`; false if another holder still has it. */
export function acquireLock(db: Db, name: string, holder: string, now: number, ttlMs: number): boolean {
  const res = db.prepare(`
    INSERT INTO locks (name, holder, expires_at) VALUES (?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
    WHERE locks.expires_at < ? OR locks.holder = excluded.holder`).run(name, holder, now + ttlMs, now);
  return Number(res.changes) === 1;
}

export function releaseLock(db: Db, name: string, holder: string): void {
  db.prepare('DELETE FROM locks WHERE name = ? AND holder = ?').run(name, holder);
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
