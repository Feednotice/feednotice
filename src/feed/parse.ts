// Parses Atom 1.0, RSS 2.0 (and 0.9x) and RSS 1.0 (RDF) documents.
// Anything else is rejected.

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseDate } from './dates.ts';
import { decodeEntities, htmlToText, MAX_HTML, normalizeWhitespace, singleLine } from './text.ts';

export type FeedFormat = 'atom' | 'rss' | 'rdf';

export interface ParsedEntry {
  /** Identifier declared by the feed (atom:id, guid, rdf:about), if any. */
  id: string | null;
  /** Absolute link to the entry, http(s) only. */
  link: string | null;
  title: string;
  /** Plain-text summary. */
  summary: string;
  published: Date | null;
}

export interface ParsedFeed {
  format: FeedFormat;
  title: string;
  description: string;
  siteUrl: string | null;
  selfUrl: string | null;
  /** WebSub hub announced by the feed (rel="hub"). */
  hubUrl: string | null;
  entries: ParsedEntry[];
  warnings: string[];
}

/** Why a document was rejected; the web layer turns the code into a localized message. */
export type FeedParseErrorCode = 'entities' | 'malformed' | 'not-a-feed';

export class FeedParseError extends Error {
  readonly code: FeedParseErrorCode;
  constructor(code: FeedParseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const CONTENT_NODES = ['summary', 'content', 'description', 'content:encoded'];
const ARRAY_TAGS = new Set(['entry', 'item', 'link', 'atom:link', 'atom10:link', 'category']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  // Content is kept raw: otherwise the order of text mixed with markup (xhtml) would be lost.
  stopNodes: CONTENT_NODES.map((n) => `*.${n}`),
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

type Node = Record<string, unknown>;

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const text = xml.replace(/^\ufeff/, '');
  if (/<!ENTITY/i.test(text)) throw new FeedParseError('entities', 'The document declares XML entities; rejected to be safe.');
  const valid = XMLValidator.validate(text);
  if (valid !== true) throw new FeedParseError('malformed', `Malformed XML (line ${valid.err.line}): ${valid.err.msg}`);

  let doc: Node;
  try {
    doc = parser.parse(text) as Node;
  } catch (e) {
    throw new FeedParseError('malformed', `Unreadable XML: ${(e as Error).message}`);
  }

  const warnings: string[] = [];
  let feed: ParsedFeed;
  if (isNode(doc.feed)) feed = parseAtom(doc.feed, feedUrl, warnings);
  else if (isNode(doc.rss) && isNode(doc.rss.channel)) feed = parseRss(doc.rss.channel, feedUrl, warnings);
  else if (isNode(doc['rdf:RDF'])) feed = parseRdf(doc['rdf:RDF'], feedUrl, warnings);
  else throw new FeedParseError('not-a-feed', 'This document is neither an Atom nor an RSS feed.');

  if (!feed.title) feed.title = hostOf(feed.siteUrl ?? feedUrl);
  const seen = new Set<string>();
  for (const e of feed.entries) {
    if (e.id === null) continue;
    if (seen.has(e.id)) warnings.push(`Duplicate identifier in feed: ${e.id}`);
    seen.add(e.id);
  }
  return feed;
}

function parseAtom(f: Node, base: string, warnings: string[]): ParsedFeed {
  const links = asArray(f.link).filter(isNode);
  const siteUrl = pickLink(links, 'alternate', base);
  return {
    format: 'atom',
    title: textConstruct(f.title),
    description: textConstruct(f.subtitle),
    siteUrl,
    selfUrl: pickLink(links, 'self', base),
    hubUrl: pickLink(links, 'hub', base),
    warnings,
    entries: asArray(f.entry).filter(isNode).map((e) => {
      const elinks = asArray(e.link).filter(isNode);
      return {
        id: cleanId(textOf(e.id)),
        link: pickLink(elinks, 'alternate', base),
        title: textConstruct(e.title),
        summary: contentText(e.summary) || contentText(e.content),
        published: parseDate(textOf(e.published)) ?? parseDate(textOf(e.updated)),
      };
    }),
  };
}

function parseRss(c: Node, base: string, warnings: string[]): ParsedFeed {
  const atomLinks = [...asArray(c['atom:link']), ...asArray(c['atom10:link'])].filter(isNode);
  return {
    format: 'rss',
    title: singleLine(textOf(c.title).slice(0, MAX_SHORT_TEXT)),
    description: contentText(c.description),
    siteUrl: absoluteUrl(firstText(c.link), base),
    selfUrl: pickLink(atomLinks, 'self', base),
    hubUrl: pickLink(atomLinks, 'hub', base),
    warnings,
    entries: asArray(c.item).filter(isNode).map((i) => {
      const guid = i.guid;
      const guidText = cleanId(textOf(guid));
      const permalink = isNode(guid) && guid['@_isPermaLink'] === 'false' ? null : guidText;
      return {
        id: guidText,
        link: absoluteUrl(firstText(i.link), base) ?? absoluteUrl(permalink, base),
        title: htmlTitle(textOf(i.title)),
        summary: contentText(i.description) || contentText(i['content:encoded']),
        published: parseDate(textOf(i.pubDate)) ?? parseDate(textOf(i['dc:date'])),
      };
    }),
  };
}

function parseRdf(r: Node, base: string, warnings: string[]): ParsedFeed {
  const c = isNode(r.channel) ? r.channel : {};
  const items = asArray(r.item).filter(isNode);
  return {
    format: 'rdf',
    title: singleLine(textOf(c.title).slice(0, MAX_SHORT_TEXT)),
    description: contentText(c.description),
    siteUrl: absoluteUrl(firstText(c.link), base),
    selfUrl: null,
    hubUrl: null,
    warnings,
    entries: items.map((i) => ({
      id: cleanId(typeof i['@_rdf:about'] === 'string' ? i['@_rdf:about'] : null),
      link: absoluteUrl(firstText(i.link), base),
      title: htmlTitle(textOf(i.title)),
      summary: contentText(i.description) || contentText(i['content:encoded']),
      published: parseDate(textOf(i['dc:date'])),
    })),
  };
}

// --- Helpers ----------------------------------------------------------------

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (isNode(v) && typeof v['#text'] === 'string') return v['#text'];
  if (Array.isArray(v)) return textOf(v[0]);
  return '';
}

function firstText(v: unknown): string | null {
  for (const x of asArray(v)) {
    const t = textOf(x).trim();
    if (t) return t;
  }
  return null;
}

/** Longest identifier or title kept: beyond, a feed is either broken or hostile. */
const MAX_SHORT_TEXT = 2048;

function cleanId(s: string | null): string | null {
  const t = s?.slice(0, MAX_SHORT_TEXT).trim();
  return t ? t : null;
}

/** Atom text construct: type="text" (default), "html" or "xhtml". */
function textConstruct(v: unknown): string {
  const type = isNode(v) ? v['@_type'] : undefined;
  const t = textOf(v).slice(0, MAX_SHORT_TEXT);
  return type === 'html' || type === 'xhtml' ? singleLine(htmlToText(t)) : singleLine(t);
}

/** RSS titles often contain escaped HTML: strip it. */
function htmlTitle(raw: string): string {
  const s = raw.slice(0, MAX_SHORT_TEXT);
  return singleLine(/[<&]/.test(s) ? htmlToText(s) : s);
}

/**
 * Content of a node kept raw (stopNodes): CDATA sections unwrapped, XML entities decoded
 * outside CDATA, then HTML reduced to text unless type="text".
 */
function contentText(v: unknown): string {
  if (v === undefined || v === null) return '';
  const type = isNode(v) ? v['@_type'] : undefined;
  const raw = textOf(v).slice(0, MAX_HTML);
  if (!raw) return '';
  if (type === 'xhtml') return htmlToText(raw);
  const decoded = raw
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) => (part.startsWith('<![CDATA[') ? part.slice(9, -3) : decodeEntities(part)))
    .join('');
  if (type === 'text') return normalizeWhitespace(decoded);
  return htmlToText(decoded);
}

function pickLink(links: Node[], rel: string, base: string): string | null {
  for (const l of links) {
    const r = typeof l['@_rel'] === 'string' ? l['@_rel'] : 'alternate';
    if (r !== rel) continue;
    if (rel === 'alternate' && typeof l['@_type'] === 'string' && !/html/.test(l['@_type'])) continue;
    const href = absoluteUrl(typeof l['@_href'] === 'string' ? l['@_href'] : null, base);
    if (href) return href;
  }
  // Without an HTML-typed alternate link, any alternate link will do.
  if (rel === 'alternate') {
    for (const l of links) {
      if (l['@_rel'] !== undefined && l['@_rel'] !== 'alternate') continue;
      const href = absoluteUrl(typeof l['@_href'] === 'string' ? l['@_href'] : null, base);
      if (href) return href;
    }
  }
  return null;
}

/** Absolute http(s) URL, or null (javascript:, data:, mailto: and the like are dropped). */
export function absoluteUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}
