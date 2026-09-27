// Languages of the pages and emails. English is the default; each catalog must provide every
// message of the English one (TypeScript checks it).
//
// No cookie: the language comes from an explicit ?lang= parameter, else from Accept-Language.
// A subscriber's language is stored at subscription time and used for all their emails and
// for the pages reached from them.

import { en, type Messages } from './en.ts';
import { fr } from './fr.ts';

export type { Messages };

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

const CATALOGS: Record<Locale, Messages> = { en, fr };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function messages(locale: Locale): Messages {
  return CATALOGS[locale];
}

/** Explicit choice first, then the browser's preferences, then the service default. */
export function negotiate(explicit: string | null | undefined, acceptLanguage: string | undefined, fallback: Locale): Locale {
  if (isLocale(explicit)) return explicit;
  if (acceptLanguage) {
    const ranked = acceptLanguage.split(',')
      .map((part) => {
        const [tag, ...params] = part.trim().split(';');
        const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
        return { lang: tag.toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q) };
      })
      .filter((x) => x.lang && x.q > 0)
      .sort((a, b) => b.q - a.q);
    for (const { lang } of ranked) if (isLocale(lang)) return lang;
  }
  return fallback;
}

export function formatDate(locale: Locale, timeZone: string, ms: number | Date | null): string {
  if (ms === null) return '';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeZone }).format(ms instanceof Date ? ms : new Date(ms));
}
