// Deduplication: never resend an entry already seen, whatever the feed does.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Db } from '../src/db.ts';
import { parseFeed, type ParsedEntry } from '../src/feed/parse.ts';
import { ingestEntries } from '../src/ingest.ts';
import { fixture, makeCtx, MINUTE } from './helpers.ts';

function entry(p: Partial<ParsedEntry> & { title: string }): ParsedEntry {
  return { id: null, link: null, summary: '', published: null, ...p };
}

function setup(): { db: Db; feedId: number; ingest: (entries: ParsedEntry[]) => string[]; t: { now: number } } {
  const { db } = makeCtx();
  db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://x.example/feed', 'x', 0)").run();
  const t = { now: 1_000_000 };
  let first = true;
  const ingest = (entries: ParsedEntry[]): string[] => {
    t.now += 30 * MINUTE;
    const r = ingestEntries(db, 1, entries, t.now, { baseline: first });
    first = false;
    return r.newEntryIds.map((id) => (db.prepare('SELECT title FROM entries WHERE id = ?').get(id) as { title: string }).title);
  };
  return { db, feedId: 1, ingest, t };
}

describe('deduplication', () => {
  it('sends nothing of what the feed contains on its first read', () => {
    const { ingest } = setup();
    assert.deepEqual(ingest([entry({ id: 'a', title: 'A' }), entry({ id: 'b', title: 'B' })]), []);
  });

  it('spots a new entry, once', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', title: 'A' })]);
    assert.deepEqual(ingest([entry({ id: 'b', title: 'B' }), entry({ id: 'a', title: 'A' })]), ['B']);
    assert.deepEqual(ingest([entry({ id: 'b', title: 'B' }), entry({ id: 'a', title: 'A' })]), []);
  });

  it('returns new entries oldest first', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', title: 'A' })]);
    assert.deepEqual(ingest([entry({ id: 'c', title: 'C' }), entry({ id: 'b', title: 'B' }), entry({ id: 'a', title: 'A' })]), ['B', 'C']);
  });

  it('ignores an entry republished with a changed date (and a corrected title)', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', title: 'A', published: new Date('2025-01-01') })]);
    assert.deepEqual(ingest([entry({ id: 'a', title: 'A (corrigé)', published: new Date('2025-06-01') })]), []);
  });

  it('ignores an entry without identifier republished with a changed date', () => {
    const { ingest } = setup();
    ingest([entry({ link: 'https://x.example/1', title: 'Un', published: new Date('2025-01-01') })]);
    assert.deepEqual(ingest([entry({ link: 'https://x.example/1', title: 'Un', summary: 'résumé modifié', published: new Date('2025-02-01') })]), []);
  });

  it('tells apart two entries without identifier that share the same link', () => {
    const { ingest } = setup();
    ingest([entry({ link: 'https://x.example/', title: 'Un' })]);
    assert.deepEqual(ingest([entry({ link: 'https://x.example/', title: 'Deux' }), entry({ link: 'https://x.example/', title: 'Un' })]), ['Deux']);
  });

  it('recognizes an entry without identifier or link by its title and summary', () => {
    const { ingest } = setup();
    ingest([entry({ title: 'Seul', summary: 'texte' })]);
    assert.deepEqual(ingest([entry({ title: 'Seul', summary: 'texte', published: new Date() })]), []);
    assert.deepEqual(ingest([entry({ title: 'Autre', summary: 'texte' }), entry({ title: 'Seul', summary: 'texte' })]), ['Autre']);
  });

  it('does not resend an entry that left the feed and came back, even much later', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', title: 'A' })]);
    ingest([entry({ id: 'b', title: 'B' })]);
    for (let i = 0; i < 50; i++) ingest([entry({ id: `n${i}`, title: `N${i}` })]);
    assert.deepEqual(ingest([entry({ id: 'a', title: 'A' }), entry({ id: 'b', title: 'B' })]), []);
  });

  it('treats http and https, and a trailing slash, as the same identifier', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'http://x.example/billet/1', title: 'Un' })]);
    assert.deepEqual(ingest([entry({ id: 'https://x.example/billet/1/', title: 'Un' })]), []);
  });

  it('recognizes entries of a feed that rewrites all its identifiers (same link, same title)', () => {
    const { ingest } = setup();
    const old = [1, 2, 3, 4, 5].map((i) => entry({ id: `urn:ancien:${i}`, link: `https://x.example/${i}`, title: `T${i}` }));
    ingest(old);
    const rewritten = [1, 2, 3, 4, 5].map((i) => entry({ id: `tag:nouveau:${i}`, link: `https://x.example/${i}`, title: `T${i}`, published: new Date() }));
    assert.deepEqual(ingest(rewritten), []);
    // And the new key is kept: a real new entry still goes through.
    assert.deepEqual(ingest([entry({ id: 'tag:nouveau:6', link: 'https://x.example/6', title: 'T6' }), ...rewritten]), ['T6']);
  });

  it('recognizes an entry whose identifier and link change, but not its text', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', link: 'https://x.example/ancien-slug', title: 'Titre', summary: 'Le même texte' })]);
    assert.deepEqual(ingest([entry({ id: 'b', link: 'https://x.example/nouveau-slug', title: 'Titre', summary: 'Le même texte' })]), []);
  });

  it('does not mistake a new entry for a lookalike that disappeared long ago', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'etat-civil-1', title: "Publication de l'état civil", summary: 'Naissances, mariages, décès.' })]);
    ingest([entry({ id: 'autre', title: 'Autre chose' })]);
    // The original left the feed two reads earlier: the new one, identical in text, really is new.
    assert.deepEqual(
      ingest([entry({ id: 'etat-civil-2', title: "Publication de l'état civil", summary: 'Naissances, mariages, décès.' }), entry({ id: 'autre', title: 'Autre chose' })]),
      ["Publication de l'état civil"],
    );
  });

  it('does not attach two new entries to the same old one', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', title: 'Même', summary: 'x' })]);
    assert.deepEqual(ingest([entry({ id: 'b', title: 'Même', summary: 'x' }), entry({ id: 'c', title: 'Même', summary: 'x' })]), ['Même']);
  });

  it('keeps the first of two entries with the same identifier in a document', () => {
    const { db, ingest } = setup();
    ingest([]);
    assert.deepEqual(ingest([entry({ id: 'd', title: 'Premier' }), entry({ id: 'd', title: 'Second' })]), ['Premier']);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }).n, 1);
  });

  it('follows a feed emptied then filled again without resending anything', () => {
    const { ingest } = setup();
    ingest([entry({ id: 'a', title: 'A' }), entry({ id: 'b', title: 'B' })]);
    assert.deepEqual(ingest([]), []);
    assert.deepEqual(ingest([entry({ id: 'a', title: 'A' }), entry({ id: 'b', title: 'B' })]), []);
  });
});

describe('deduplication on the Civic feed', () => {
  it('spots exactly the entries added between two versions of the feed', () => {
    const { db } = makeCtx();
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://civic.example/commune/99001-flux.xml', 'Civic', 0)").run();
    const xml = fixture('civic-99001.xml');
    const v1 = parseFeed(xml, 'https://civic.example/commune/99001-flux.xml');
    const r1 = ingestEntries(db, 1, v1.entries.slice(2), 1, { baseline: true });
    assert.equal(r1.newEntryIds.length, 0);
    assert.equal(r1.duplicatesInDocument, 1);
    // Next version: two entries on top, the others "republished" with new dates.
    const bumped = v1.entries.map((e) => ({ ...e, published: new Date('2026-09-20') }));
    const r2 = ingestEntries(db, 1, bumped, 2, { baseline: false });
    assert.deepEqual(
      r2.newEntryIds.map((id) => (db.prepare('SELECT title FROM entries WHERE id = ?').get(id) as { title: string }).title),
      ['Marché notifié — MOE VEINE NORD T2 NOYANT VILLEFRANCHE', 'Marché notifié — MOE Liaison Mazerier La Serre'],
    );
    assert.equal(ingestEntries(db, 1, v1.entries, 3, { baseline: false }).newEntryIds.length, 0);
  });
});
