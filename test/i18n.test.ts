// Languages: negotiation, dates, and every catalog actually translated and rendering.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FeedRow } from '../src/model.ts';
import { formatDate, LOCALES, messages, negotiate } from '../src/i18n/index.ts';
import { renderConfirmationMail } from '../src/mail/render.ts';
import { NO_BRAND } from '../src/web/brand.ts';
import { homePage, page } from '../src/web/views.ts';
import { makeCtx } from './helpers.ts';

/** Every plain string of a catalog, by its path. */
function leaves(o: unknown, path = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof o === 'string') out.set(path, o);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) for (const [p, s] of leaves(v, `${path}.${k}`)) out.set(p, s);
  return out;
}

describe('languages', () => {
  it('follows the browser, region subtags included', () => {
    assert.equal(negotiate(null, 'de-DE,de;q=0.9,en;q=0.8', 'en'), 'de');
    assert.equal(negotiate(null, 'es-MX,es;q=0.9', 'en'), 'es');
    assert.equal(negotiate(null, 'it-IT,it;q=0.9', 'fr'), 'fr');
    assert.equal(negotiate('es', 'de-DE', 'en'), 'es');
  });

  it('writes dates the local way', () => {
    const d = Date.UTC(2026, 10, 15, 12);
    assert.equal(formatDate('de', 'Europe/Berlin', d), '15. November 2026');
    assert.equal(formatDate('es', 'Europe/Madrid', d), '15 de noviembre de 2026');
    assert.equal(formatDate('fr', 'Europe/Paris', d), '15 novembre 2026');
  });

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    it(`${locale}: translated, not copied from English`, () => {
      const en = leaves(messages('en'));
      const same = [...leaves(messages(locale))].filter(([p, s]) => s.length > 12 && en.get(p) === s).map(([p]) => p);
      assert.ok(same.length <= 3, `${locale} strings identical to English: ${same.join(', ')}`);
    });
  }

  for (const locale of LOCALES) {
    it(`${locale}: home page and confirmation email render`, () => {
      const { config } = makeCtx();
      const html = homePage(page(config, NO_BRAND, locale, '/'));
      assert.match(html, new RegExp(`<html lang="${locale}"`));
      assert.doesNotMatch(html, /undefined|\[object |NaN/);
      const feed = { id: 1, url: 'https://blog.example/feed.xml', title: 'Blog', site_url: 'https://blog.example/' } as unknown as FeedRow;
      for (const cadence of ['immediate', 'daily', 'weekly'] as const) {
        const mail = renderConfirmationMail(config, locale, feed, 'a@example.org', 'https://service.test/c/x', cadence);
        assert.doesNotMatch(mail.subject + mail.text + (mail.html ?? ''), /undefined|\[object |NaN/);
        assert.match(mail.text, /https:\/\/service\.test\/c\/x/);
      }
    });
  }
});
