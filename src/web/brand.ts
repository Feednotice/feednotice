// The operator's own look (docs/branding.md): logo, favicons and colours read from BRAND_DIR
// at start-up. Without it, pages are neutral: the service's name as text, no icon.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Brand {
  /** Files served as they are, by URL path. */
  files: Map<string, { type: string; body: Buffer }>;
  /** Appended to the site's stylesheet: typically CSS variables (--accent…). */
  css: string;
}

export const NO_BRAND: Brand = { files: new Map(), css: '' };

/** Every file is optional; the page links only to those present. */
export const BRAND_FILES = [
  { name: 'mark.svg', path: '/brand/mark.svg', type: 'image/svg+xml' },
  { name: 'mark-dark.svg', path: '/brand/mark-dark.svg', type: 'image/svg+xml' },
  { name: 'favicon.svg', path: '/favicon.svg', type: 'image/svg+xml' },
  { name: 'favicon.ico', path: '/favicon.ico', type: 'image/x-icon' },
  { name: 'apple-touch-icon.png', path: '/apple-touch-icon.png', type: 'image/png' },
] as const;

export function loadBrand(dir: string): Brand {
  if (!dir) return NO_BRAND;
  const files: Brand['files'] = new Map();
  for (const f of BRAND_FILES) {
    const body = readOptional(join(dir, f.name));
    if (body) files.set(f.path, { type: f.type, body });
  }
  return { files, css: readOptional(join(dir, 'brand.css'))?.toString('utf8') ?? '' };
}

function readOptional(file: string): Buffer | null {
  try {
    return readFileSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
