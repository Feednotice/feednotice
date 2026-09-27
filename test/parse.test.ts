import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDate } from '../src/feed/dates.ts';
import { FeedParseError, parseFeed } from '../src/feed/parse.ts';
import { htmlToText } from '../src/feed/text.ts';
import { fixture } from './helpers.ts';

describe('Civic Atom feed (reference case)', () => {
  const feed = parseFeed(fixture('civic-99001.xml'), 'https://civic.example/commune/99001-flux.xml');

  it('reads the title, site and entries', () => {
    assert.equal(feed.format, 'atom');
    assert.equal(feed.title, 'Civic — Saint-Exemple');
    assert.equal(feed.siteUrl, 'https://civic.example/commune/99001');
    assert.equal(feed.selfUrl, 'https://civic.example/commune/99001-flux.xml');
    assert.equal(feed.entries.length, 15);
  });

  it('keeps identifiers, ISO dates and summaries', () => {
    const e = feed.entries[0];
    assert.equal(e.id, 'tag:civic.example,2026:99001/0-2026-09-07-250301165-1y6plk');
    assert.equal(e.title, 'Marché notifié — MOE Liaison Mazerier La Serre');
    assert.equal(e.summary, "SM des eaux de l'Allier (SMEA) · 107 k€ · Procédure adaptée");
    assert.equal(e.published?.toISOString(), '2026-09-07T00:00:00.000Z');
    // Civic entries have no link of their own: the email will point to the commune's page.
    assert.equal(e.link, null);
  });

  it('reports the duplicate identifier the feed contains', () => {
    assert.deepEqual(feed.warnings, ['Duplicate identifier in feed: tag:civic.example,2026:99001/0-2026-07-29-250300050-7a48b6']);
  });
});

describe('RSS 2.0', () => {
  const feed = parseFeed(fixture('rss2-blog.xml'), 'https://blog.example/feed.xml');

  it('reads the channel and the WebSub hub', () => {
    assert.equal(feed.format, 'rss');
    assert.equal(feed.title, "Le blog d'essai");
    assert.equal(feed.siteUrl, 'https://blog.example/');
    assert.equal(feed.hubUrl, 'https://pubsubhubbub.appspot.com/');
    assert.equal(feed.entries.length, 5);
  });

  it('reduces HTML (CDATA or escaped) to text, without scripts or images', () => {
    const [a, b] = feed.entries;
    assert.equal(a.title, 'Premier billet');
    assert.equal(a.summary, 'Bonjour tout le monde & les autres.\n\nSecond paragraphe.');
    assert.equal(b.summary, 'Échappé & décodé');
  });

  it('accepts entries without identifier and resolves relative links', () => {
    const [, b, c] = feed.entries;
    assert.equal(b.id, null);
    assert.equal(b.link, 'https://blog.example/2025/sans-guid');
    assert.equal(c.id, null);
    assert.equal(c.link, null);
  });

  it('drops unreadable dates instead of failing', () => {
    const [a, b, c, d, e] = feed.entries;
    assert.equal(a.published?.toISOString(), '2025-06-10T02:00:00.000Z');
    assert.equal(b.published, null);
    assert.equal(c.published?.toISOString(), '2025-06-08T10:00:00.000Z');
    assert.equal(d.published, null);
    assert.equal(e.published?.toISOString(), '2025-06-01T00:00:00.000Z');
  });

  it('reads content:encoded when there is no description, and refuses javascript: links', () => {
    const [, , , d, e] = feed.entries;
    assert.equal(d.summary, '• un\n• deux');
    assert.equal(e.link, null);
  });
});

describe('RSS 1.0 (RDF)', () => {
  it('reads entries and their rdf:about', () => {
    const feed = parseFeed(fixture('rss1-rdf.xml'), 'https://ancien.example/rss');
    assert.equal(feed.format, 'rdf');
    assert.equal(feed.title, 'Un vieux flux RSS 1.0');
    assert.deepEqual(feed.entries.map((e) => e.id), ['https://ancien.example/a', 'https://ancien.example/b']);
    assert.equal(feed.entries[0].published?.toISOString(), '2024-02-29T10:00:00.000Z');
  });
});

describe('Atom with xhtml and html content', () => {
  const feed = parseFeed(fixture('atom-xhtml.xml'), 'https://code.example/projet/releases.atom');

  it('keeps text in order despite markup', () => {
    assert.equal(feed.title, 'Versions & notes');
    assert.equal(feed.entries[0].summary, 'Grande nouveauté : tout change.\n\nVoir la doc.');
    assert.equal(feed.entries[0].link, 'https://code.example/projet/releases/tag/v2.0.0');
  });

  it('prefers summary to content, published to updated, and ignores enclosure links', () => {
    const e = feed.entries[1];
    assert.equal(e.title, 'v1.9.1 correctif');
    assert.equal(e.summary, 'Corrige un bug.');
    assert.equal(e.published?.toISOString(), '2025-04-01T07:00:00.000Z');
    assert.equal(e.link, 'https://code.example/projet/releases/tag/v1.9.1');
  });
});

describe('rejection of what is not a feed', () => {
  it('rejects an HTML page', () => {
    assert.throws(() => parseFeed(fixture('not-a-feed.html'), 'https://x.example/'), FeedParseError);
    assert.throws(() => parseFeed('<html><body><p>bonjour</p></body></html>', 'https://x.example/'), /neither an Atom nor an RSS feed/);
  });

  it('rejects malformed XML', () => {
    assert.throws(() => parseFeed('<rss><channel><title>x</channel></rss>', 'https://x.example/'), /Malformed/);
  });

  it('rejects entity declarations (XML bomb)', () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><rss><channel><title>&lol2;</title></channel></rss>';
    assert.throws(() => parseFeed(bomb, 'https://x.example/'), /entities/);
  });

  it('rejects an empty document', () => {
    assert.throws(() => parseFeed('', 'https://x.example/'), FeedParseError);
  });
});

describe('dates', () => {
  it('reads ISO 8601 and RFC 822, with or without time zone', () => {
    assert.equal(parseDate('2025-06-10T04:00:00+02:00')?.toISOString(), '2025-06-10T02:00:00.000Z');
    assert.equal(parseDate('2025-06-10T04:00:00Z')?.toISOString(), '2025-06-10T04:00:00.000Z');
    assert.equal(parseDate('2025-06-10 04:00')?.toISOString(), '2025-06-10T04:00:00.000Z');
    assert.equal(parseDate('2025-06-10')?.toISOString(), '2025-06-10T00:00:00.000Z');
    assert.equal(parseDate('Tue, 10 Jun 2025 04:00:00 GMT')?.toISOString(), '2025-06-10T04:00:00.000Z');
    assert.equal(parseDate('10 Jun 25 04:00 EDT')?.toISOString(), '2025-06-10T08:00:00.000Z');
    assert.equal(parseDate('Tue, 10 June 2025')?.toISOString(), '2025-06-10T00:00:00.000Z');
    assert.equal(parseDate('mardi 10 juin 2025 04:00 +0200')?.toISOString(), '2025-06-10T02:00:00.000Z');
  });

  it('returns null for absurd or unreadable dates', () => {
    for (const s of ['', 'hier', '2025-13-01', '0000-00-00T00:00:00Z', '1970-01-01T00:00:00Z', '3025-01-01', 'Mon, 32 Foo 2025']) {
      assert.equal(parseDate(s), null, s);
    }
  });
});

describe('HTML to text', () => {
  it('decodes entities and keeps structure', () => {
    assert.equal(htmlToText('<p>A&nbsp;&eacute;t&#233; &#x2014; ok</p><ul><li>x</li></ul>'), 'A été — ok\n\n• x');
    assert.equal(htmlToText('<style>p{}</style><p>visible</p><!-- caché -->'), 'visible');
    assert.equal(htmlToText('&unknown; &lt;b&gt;'), '&unknown; <b>');
  });
});
