// Legal notice page (French LCEN): publisher, host, source code, in both languages.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_BRAND } from '../src/web/brand.ts';
import { legalPage, page, termsPage } from '../src/web/views.ts';
import { makeCtx } from './helpers.ts';

const legal = {
  company: 'Exemple',
  capitalEur: 1000,
  address: '1 rue de l’Exemple, 75000 Paris, France',
  registration: '000 000 000 R.C.S. Paris',
  siret: '000 000 000 00000',
  vat: 'FR00000000000',
  director: 'Camille Martin',
  hostName: 'Example Hosting GmbH',
  hostAddress: 'Beispielstraße 1, 10115 Berlin, Germany',
  hostPhone: '+49 30 000000',
};

describe('legal notice', () => {
  const { config } = makeCtx({ legal });

  it('names the publisher, the publication director and the host, in English', () => {
    const html = legalPage(page(config, NO_BRAND, 'en', '/legal'));
    assert.match(html, /<h1>Legal notice<\/h1>/);
    assert.match(html, /Exemple, simplified joint-stock company \(SAS\) with a share capital of €1,000/);
    assert.match(html, /Registration: 000 000 000 R.C.S. Paris/);
    assert.match(html, /Publication director: Camille Martin/);
    assert.match(html, /Example Hosting GmbH/);
    assert.match(html, /Phone: \+49 30 000000/);
    assert.match(html, /GNU Affero General Public License/);
    assert.match(html, /href="\/legal\?lang=en">Legal notice<\/a>/);
  });

  it('reads as French law expects, in French', () => {
    const html = legalPage(page(config, NO_BRAND, 'fr', '/legal'));
    assert.match(html, /<h1>Mentions légales<\/h1>/);
    assert.match(html, /Exemple, société par actions simplifiée au capital de 1\s000\s€/);
    assert.match(html, /Siège : 1 rue de l’Exemple/);
    assert.match(html, /TVA intracommunautaire : FR00000000000/);
    assert.match(html, /Directeur de la publication : Camille Martin/);
  });

  it('leaves out what is not configured instead of printing empty lines', () => {
    const html = legalPage(page(makeCtx().config, NO_BRAND, 'en', '/legal'));
    assert.doesNotMatch(html, /Registration:|<h2>Host<\/h2>/);
    assert.match(html, /Contact: contact@service\.test/);
  });
});

describe('terms of use', () => {
  const { config } = makeCtx({ operatorName: 'Exemple SAS', serviceName: 'Town Mail' });

  it('names the service and its operator, with a part for publishers, in both languages', () => {
    const en = termsPage(page(config, NO_BRAND, 'en', '/terms'));
    assert.match(en, /<h1>Terms of use<\/h1>/);
    assert.match(en, /Last updated: 4 November 2026\./);
    assert.match(en, /Town Mail emails the new entries of Atom and RSS feeds[^<]*run by Exemple SAS/);
    assert.match(en, /<h2>Publishers<\/h2>/);
    const fr = termsPage(page(config, NO_BRAND, 'fr', '/terms'));
    assert.match(fr, /<h1>Conditions d&#39;utilisation<\/h1>/);
    assert.match(fr, /exploité par Exemple SAS/);
  });
});
