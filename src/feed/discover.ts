// Feed discovery: when someone gives the address of a web page instead of its feed, look for
// the feeds the page announces (<link rel="alternate" type="application/atom+xml" href="…">).

import { decodeEntities, singleLine } from './text.ts';
import { absoluteUrl } from './parse.ts';

export interface DiscoveredFeed {
  url: string;
  title: string;
}

const FEED_TYPES = /^application\/(atom|rss|rdf)\+xml$/i;

/** Is this body an HTML page rather than an XML document? */
export function looksLikeHtml(body: string, contentType: string): boolean {
  if (/\bx?html\b/i.test(contentType) && !/xml/i.test(contentType.replace(/xhtml/i, ''))) return true;
  return /^\s*(<!--[\s\S]*?-->\s*)*<!doctype html|^\s*<html[\s>]/i.test(body);
}

export function discoverFeeds(html: string, pageUrl: string): DiscoveredFeed[] {
  // Only the <head> matters, and a page can be huge.
  const head = html.slice(0, 256 * 1024).split(/<\/head\s*>/i)[0];
  const base = /<base\b[^>]*\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(head)?.[1];
  const baseUrl = (base ? absoluteUrl(unquote(base), pageUrl) : null) ?? pageUrl;

  const found: DiscoveredFeed[] = [];
  const seen = new Set<string>();
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('alternate') || !FEED_TYPES.test((attrs.type ?? '').trim())) continue;
    const url = absoluteUrl(attrs.href, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push({ url, title: singleLine(attrs.title ?? '') });
  }
  return found;
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-z][a-z0-9:-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi)) {
    out[m[1].toLowerCase()] = decodeEntities(unquote(m[2]));
  }
  return out;
}

function unquote(v: string): string {
  return /^["']/.test(v) ? v.slice(1, -1) : v;
}
