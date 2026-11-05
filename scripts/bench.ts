// Load test: a database the size of a busy service, then the operations that run every minute,
// every night, or on each request, timed. Emails are rendered but not sent.
//
//   npm run bench                      100,000 subscribers, 5,000 feeds
//   npm run bench -- 20000 1000        smaller

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import type { Ctx } from '../src/context.ts';
import { openDb, transaction } from '../src/db.ts';
import { sendDigests, sendImmediate } from '../src/delivery.ts';
import { sendDeadFeedNotices } from '../src/deadfeeds.ts';
import type { ParsedEntry } from '../src/feed/parse.ts';
import { ingestEntries } from '../src/ingest.ts';
import type { Mailer } from '../src/mail/mailer.ts';
import { snapshot, statsText } from '../src/ops.ts';
import { publisherStats } from '../src/publishers.ts';
import { purge } from '../src/purge.ts';
import { listSubscriptions } from '../src/subscriptions.ts';

const SUBSCRIBERS = Number(process.argv[2] ?? 100_000);
const FEEDS = Number(process.argv[3] ?? 5_000);
const SUBS_PER_READER = 3;
const ENTRIES_PER_FEED = 40;
const HOUR = 3_600_000;

const dir = mkdtempSync(join(tmpdir(), 'fn-bench-'));
const dbPath = join(dir, 'bench.sqlite');
let sent = 0;
const mailer: Mailer = { send: async () => { sent++; } };
const clock = { t: Date.UTC(2026, 10, 2, 4, 0) }; // Monday 2 November 2026, 5:00 in Paris
const ctx: Ctx = {
  config: { ...loadConfig({ BASE_URL: 'https://bench.example', SECRET: 'x'.repeat(40), SERVICE_NAME: 'Bench' }), dbPath },
  db: openDb(dbPath),
  mailer,
  now: () => clock.t,
  log: () => {},
};
const { db } = ctx;

function time<T>(label: string, fn: () => T): T {
  const t = performance.now();
  const r = fn();
  console.log(`${label.padEnd(58)} ${(performance.now() - t).toFixed(0).padStart(7)} ms`);
  return r;
}
async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const r = await fn();
  console.log(`${label.padEnd(58)} ${(performance.now() - t).toFixed(0).padStart(7)} ms`);
  return r;
}

function entry(feed: number, i: number): ParsedEntry {
  return {
    id: `tag:f${feed}.example,2026:${i}`, link: `https://f${feed}.example/posts/${i}`, title: `Post ${i} of feed ${feed}`,
    summary: `A summary of post ${i}, a few sentences long, as most feeds have. `.repeat(4), published: new Date(clock.t - i * HOUR),
  };
}

console.log(`${SUBSCRIBERS.toLocaleString('en')} subscribers, ${FEEDS.toLocaleString('en')} feeds, ${SUBS_PER_READER} subscriptions each\n`);

// --- Building the database ---------------------------------------------------------------
time('create feeds and their backlog (first read)', () => {
  const insert = db.prepare('INSERT INTO feeds (url, title, site_url, created_at, last_success_at, next_fetch_at) VALUES (?, ?, ?, ?, ?, ?)');
  transaction(db, () => {
    for (let f = 1; f <= FEEDS; f++) insert.run(`https://f${f}.example/feed.xml`, `Feed ${f}`, `https://f${f}.example/`, 0, clock.t, clock.t + HOUR);
  });
  for (let f = 1; f <= FEEDS; f++) ingestEntries(db, f, Array.from({ length: ENTRIES_PER_FEED }, (_, i) => entry(f, i + 1)), 0, { baseline: true });
});
time('create subscribers and subscriptions', () => {
  const sub = db.prepare('INSERT INTO subscribers (email, locale, created_at) VALUES (?, ?, 0)');
  const subn = db.prepare("INSERT OR IGNORE INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at) VALUES (?, ?, ?, 'active', 0, 0)");
  transaction(db, () => {
    for (let s = 1; s <= SUBSCRIBERS; s++) {
      sub.run(`reader${s}@example.org`, s % 4 === 0 ? 'fr' : 'en');
      // Popular feeds get more readers (a rough power law).
      for (let k = 0; k < SUBS_PER_READER; k++) {
        const feed = 1 + Math.floor(FEEDS * Math.random() ** 3);
        const r = Math.random();
        subn.run(s, feed, r < 0.6 ? 'immediate' : r < 0.9 ? 'daily' : 'weekly');
      }
    }
  });
});
console.log(`  database: ${(statSync(dbPath).size / 1e6).toFixed(0)} MB, ${(db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get() as { n: number }).n.toLocaleString('en')} subscriptions\n`);

// --- Every minute -------------------------------------------------------------------------
clock.t += 10 * 60_000;
await timeAsync('round with nothing new: immediate sending', () => sendImmediate(ctx));
await timeAsync('round with nothing new: digests (no slot due)', () => sendDigests(ctx));
await timeAsync('round with nothing new: dead-feed notices', () => sendDeadFeedNotices(ctx));

// A busy hour: 10% of the feeds publish one entry.
time('new entries: 10% of the feeds publish one (ingest)', () => {
  for (let f = 1; f <= FEEDS; f += 10) ingestEntries(db, f, Array.from({ length: ENTRIES_PER_FEED + 1 }, (_, i) => entry(f, i)), clock.t, { baseline: false });
});
sent = 0;
const imm = await timeAsync('immediate sending of those entries', () => sendImmediate(ctx));
console.log(`  ${imm.mails.toLocaleString('en')} emails rendered and handed over (${sent.toLocaleString('en')} sends)`);

// --- Digest time: 7:00 in Paris, every daily digest is due ------------------------------
clock.t = Date.UTC(2026, 10, 2, 6, 1);
sent = 0;
const dig = await timeAsync('7:00 digests (daily and weekly, merged per reader)', () => sendDigests(ctx));
console.log(`  ${dig.mails.toLocaleString('en')} digests, ${dig.entries.toLocaleString('en')} entries`);
await timeAsync('next minute: digests again (nothing due)', () => sendDigests(ctx));

// --- Steady state: two weeks of daily entries on every feed, all delivered ----------------
time('steady state: 14 days of entries, all delivered (setup)', () => {
  transaction(db, () => {
    for (let day = 13; day >= 1; day--) {
      db.prepare(`INSERT INTO entries (feed_id, guid, title, summary, link_title_hash, content_hash, first_seen_at, in_feed, baseline)
        SELECT id, 'd' || ? || '-' || id, 'Daily', 'Daily', 'lt' || ? || id, 'c' || ? || id, ?, 0, 0 FROM feeds`).run(day, day, day, clock.t - day * 24 * HOUR);
    }
    db.prepare(`INSERT OR IGNORE INTO deliveries (subscription_id, entry_id, status, attempts, updated_at)
      SELECT s.id, e.id, 'sent', 1, e.first_seen_at FROM subscriptions s JOIN entries e ON e.feed_id = s.feed_id AND e.baseline = 0`).run();
    db.prepare("UPDATE subscriptions SET last_digest_at = ? WHERE cadence <> 'immediate'").run(clock.t - 60_000);
  });
});
console.log(`  ${(db.prepare('SELECT COUNT(*) AS n FROM deliveries').get() as { n: number }).n.toLocaleString('en')} delivery records`);
clock.t += 60_000;
await timeAsync('steady state: round with nothing new, immediate', () => sendImmediate(ctx));
await timeAsync('steady state: round with nothing new, digests', () => sendDigests(ctx));

// --- Requests and nightly work ------------------------------------------------------------
time('account page: one subscriber\'s subscriptions', () => listSubscriptions(ctx, 4242));
time('publisher dashboard: counts for a domain', () => {
  db.prepare("INSERT INTO publishers (email, created_at) VALUES ('p@f1.example', 0)").run();
  db.prepare("INSERT INTO publisher_domains (publisher_id, domain, token, verified_at, method, created_at) VALUES (1, 'f1.example', 't', 0, 'file', 0)").run();
  return publisherStats(ctx, 1);
});
time('operator: snapshot for the daily report', () => snapshot(ctx));
time('operator: stats for 14 days', () => statsText(ctx, 14));
time('purge (hourly)', () => purge(ctx));
time('local backup (VACUUM INTO)', () => db.exec(`VACUUM INTO '${join(dir, 'copy.sqlite')}'`));
console.log(`  database with the history: ${(statSync(join(dir, 'copy.sqlite')).size / 1e6).toFixed(0)} MB`);

console.log(`\npeak memory (RSS): ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`);
db.close();
rmSync(dir, { recursive: true, force: true });
