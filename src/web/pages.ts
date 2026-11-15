// The operator's own pages (docs/pages.md): pricing, use cases, help, news… written as HTML
// fragments in PAGES_DIR, one file per page and language, read at start-up:
//
//   pricing.en.html, pricing.fr.html      → /pricing
//   compare/follow-it.en.html             → /compare/follow-it
//   news/2026-11-20-launch.en.html        → /news/2026-11-20-launch, listed at /news and in /news.xml
//   assets/screenshot.png                 → /assets/screenshot.png
//
// Each file starts with comment lines giving its metadata, then the HTML of the page's body:
//
//   <!-- title: Pricing -->
//   <!-- description: One line for search engines and link previews. -->
//   <!-- nav: footer -->            (listed in the footer of every page)
//   <!-- date: 2026-11-20 -->       (news only)
//
// The HTML is the operator's own and is inserted as it is; the pages' content security policy
// still forbids scripts, inline styles and anything loaded from another site.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { isLocale, type Locale } from '../i18n/index.ts';

export interface SitePage {
  /** URL path, e.g. "/pricing". */
  path: string;
  locale: Locale;
  title: string;
  description: string;
  nav: boolean;
  /** News items only: publication date (ms). */
  date: number | null;
  html: string;
}

export interface Pages {
  /** By path, then language. */
  byPath: Map<string, Map<Locale, SitePage>>;
  assets: Map<string, { type: string; body: Buffer }>;
}

export const NO_PAGES: Pages = { byPath: new Map(), assets: new Map() };

const ASSET_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
};
const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
/** Paths the application serves itself: a page cannot take them. */
const RESERVED = /^\/(s|c|u|m|p|account|publishers|privacy|terms|legal|robot|health|websub|hooks|brand|style\.css|favicon\.(ico|svg)|apple-touch-icon\.png|sitemap\.xml|robots\.txt|news\.xml)(\/|$)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function parsePage(source: string, path: string, locale: Locale): SitePage {
  const meta: Record<string, string> = {};
  let rest = source.replace(/^﻿/, '');
  for (;;) {
    const m = /^\s*<!--\s*([a-z]+)\s*:\s*([\s\S]*?)\s*-->/i.exec(rest);
    if (!m) break;
    meta[m[1].toLowerCase()] = m[2];
    rest = rest.slice(m[0].length);
  }
  const date = meta.date ? Date.parse(`${meta.date}T00:00:00Z`) : NaN;
  return {
    path, locale,
    title: meta.title ?? path,
    description: meta.description ?? '',
    nav: (meta.nav ?? '').split(/[\s,]+/).includes('footer'),
    date: Number.isFinite(date) ? date : null,
    html: rest.trim(),
  };
}

/** Reads PAGES_DIR; files that do not follow the naming rules are skipped, with a warning. */
export function loadPages(dir: string, warn: (message: string) => void = () => {}): Pages {
  if (!dir) return NO_PAGES;
  let files: string[];
  try {
    files = walk(dir);
  } catch {
    return NO_PAGES;
  }
  const pages: Pages = { byPath: new Map(), assets: new Map() };
  for (const file of files) {
    const rel = relative(dir, file).split(sep).join('/');
    if (rel.startsWith('assets/')) {
      const type = ASSET_TYPES[extname(rel).toLowerCase()];
      if (type && rel.split('/').every((s) => /^[\w.-]+$/.test(s) && !s.startsWith('.'))) pages.assets.set(`/${rel}`, { type, body: readFileSync(file) });
      continue;
    }
    const m = /^(.+)\.([a-z]{2})\.html$/.exec(rel);
    if (!m || !isLocale(m[2]) || !m[1].split('/').every((s) => SEGMENT.test(s))) {
      if (!/(^|\/)(README|\.)/.test(rel)) warn(`pages: ${rel} skipped (name: <path>.<language>.html, lower case, digits and hyphens)`);
      continue;
    }
    const path = `/${m[1].replace(/(^|\/)index$/, '')}`.replace(/\/$/, '') || '/';
    if (path === '/' || RESERVED.test(path)) {
      warn(`pages: ${rel} skipped (${path} is the application's own)`);
      continue;
    }
    const page = parsePage(readFileSync(file, 'utf8'), path, m[2]);
    const variants = pages.byPath.get(path) ?? new Map<Locale, SitePage>();
    variants.set(m[2], page);
    pages.byPath.set(path, variants);
  }
  return pages;
}

/** The page in the best language available: asked for, then the service default, then English, then any. */
export function pageIn(variants: Map<Locale, SitePage>, wanted: Locale, fallback: Locale): SitePage {
  return variants.get(wanted) ?? variants.get(fallback) ?? variants.get('en') ?? (variants.values().next().value as SitePage);
}

/** News items (pages under /news/ with a date), newest first, in the given language. */
export function newsItems(pages: Pages, locale: Locale, fallback: Locale): SitePage[] {
  return [...pages.byPath.entries()]
    .filter(([path]) => path.startsWith('/news/'))
    .map(([, variants]) => pageIn(variants, locale, fallback))
    .filter((p) => p.date !== null)
    .sort((a, b) => (b.date as number) - (a.date as number));
}

/** Footer links: pages marked `nav: footer`, in the given language. */
export function navPages(pages: Pages, locale: Locale, fallback: Locale): SitePage[] {
  return [...pages.byPath.values()].map((v) => pageIn(v, locale, fallback)).filter((p) => p.nav).sort((a, b) => a.path.localeCompare(b.path));
}
