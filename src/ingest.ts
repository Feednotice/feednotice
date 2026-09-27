// Deduplication: decide, for each entry of a feed read, whether it is new.
//
// Rules, in order:
// 1. Primary key: the feed's identifier (atom:id, guid, rdf:about), normalized; failing that,
//    link + title; failing that, title + summary. The date is never part of the key: an entry
//    republished with a changed date is still the same entry.
// 2. A key seen before, even long ago, even if the entry had left the feed, is a known entry.
// 3. Feeds that rewrite their identifiers: an entry with an unknown key that has the same link
//    and title (or the same title and summary) as an entry present in the previous read but
//    absent from this one is the same entry; its new key is attached to the old entry.
// 4. First read of a feed: everything it contains is the backlog and is never sent.

import { createHash } from 'node:crypto';
import { transaction, type Db } from './db.ts';
import type { ParsedEntry } from './feed/parse.ts';

export interface IngestResult {
  /** New entries to send, oldest first. */
  newEntryIds: number[];
  /** Entries recognized despite a changed identifier. */
  rekeyed: number;
  duplicatesInDocument: number;
}

export function sha(s: string): string {
  return createHash('sha256').update(s).digest('base64url').slice(0, 32);
}

/** http vs https and a trailing slash never distinguish two entries. */
export function normalizeId(id: string): string {
  return id.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function entryKeys(e: ParsedEntry): { key: string; linkTitle: string; content: string } {
  const title = e.title.trim().toLowerCase();
  const linkTitle = sha(`${e.link ?? ''}\n${title}`);
  const content = sha(`${title}\n${e.summary.trim().toLowerCase()}`);
  let key: string;
  if (e.id) key = `id:${normalizeId(e.id)}`;
  else if (e.link) key = `lt:${linkTitle}`;
  else key = `c:${content}`;
  return { key, linkTitle, content };
}

export function ingestEntries(db: Db, feedId: number, entries: ParsedEntry[], now: number, opts: { baseline: boolean }): IngestResult {
  return transaction(db, () => {
    const findKey = db.prepare('SELECT entry_id FROM entry_keys WHERE feed_id = ? AND key = ?');
    const insertKey = db.prepare('INSERT OR IGNORE INTO entry_keys (feed_id, key, entry_id) VALUES (?, ?, ?)');
    const insertEntry = db.prepare(`
      INSERT INTO entries (feed_id, guid, link, title, summary, published_at, link_title_hash, content_hash, first_seen_at, in_feed, baseline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);

    // Keys of this document; internal duplicates dropped (first one wins).
    const seenKeys = new Set<string>();
    const doc: { entry: ParsedEntry; key: string; linkTitle: string; content: string; entryId: number | null }[] = [];
    let duplicatesInDocument = 0;
    for (const entry of entries) {
      const k = entryKeys(entry);
      if (seenKeys.has(k.key)) {
        duplicatesInDocument++;
        continue;
      }
      seenKeys.add(k.key);
      const row = findKey.get(feedId, k.key) as { entry_id: number } | undefined;
      doc.push({ entry, ...k, entryId: row?.entry_id ?? null });
    }

    // Re-keying candidates: present in the previous read, absent from this one.
    const matched = new Set(doc.filter((d) => d.entryId !== null).map((d) => d.entryId as number));
    const vanished = (db.prepare('SELECT id, link, link_title_hash, content_hash FROM entries WHERE feed_id = ? AND in_feed = 1').all(feedId) as {
      id: number; link: string | null; link_title_hash: string; content_hash: string;
    }[]).filter((r) => !matched.has(r.id));
    const byLinkTitle = new Map<string, number>();
    const byContent = new Map<string, number>();
    for (const v of vanished) {
      if (v.link && !byLinkTitle.has(v.link_title_hash)) byLinkTitle.set(v.link_title_hash, v.id);
      if (!byContent.has(v.content_hash)) byContent.set(v.content_hash, v.id);
    }
    const taken = new Set<number>();
    let rekeyed = 0;
    for (const d of doc) {
      if (d.entryId !== null) continue;
      const candidate = (d.entry.link ? byLinkTitle.get(d.linkTitle) : undefined) ?? byContent.get(d.content);
      if (candidate === undefined || taken.has(candidate)) continue;
      taken.add(candidate);
      d.entryId = candidate;
      insertKey.run(feedId, d.key, candidate);
      rekeyed++;
    }

    // New entries, inserted in presumed chronological order (feeds usually list the newest first).
    const newEntryIds: number[] = [];
    for (const d of [...doc].reverse()) {
      if (d.entryId !== null) continue;
      const e = d.entry;
      const res = insertEntry.run(
        feedId, e.id, e.link, e.title, e.summary, e.published?.getTime() ?? null,
        d.linkTitle, d.content, now, opts.baseline ? 1 : 0,
      );
      d.entryId = Number(res.lastInsertRowid);
      insertKey.run(feedId, d.key, d.entryId);
      if (!opts.baseline) newEntryIds.push(d.entryId);
    }

    db.prepare('UPDATE entries SET in_feed = 0 WHERE feed_id = ? AND in_feed = 1').run(feedId);
    const markPresent = db.prepare('UPDATE entries SET in_feed = 1 WHERE id = ?');
    for (const d of doc) markPresent.run(d.entryId);

    return { newEntryIds, rekeyed, duplicatesInDocument };
  });
}
