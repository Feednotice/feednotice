// The operator's pages, news feed, sitemap and robots.txt.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { parseFeed } from '../src/feed/parse.ts';
import { createServer } from '../src/web/server.ts';
import { makeCtx } from './helpers.ts';

const ctx = makeCtx({ pagesDir: new URL('./fixtures/pages', import.meta.url).pathname });
const app = createServer(ctx);
let site = '';
before(async () => {
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
after(() => app.close());

const get = async (path: string, lang?: string) => {
  const r = await fetch(site + path, { headers: lang ? { 'Accept-Language': lang } : {} });
  return { status: r.status, type: r.headers.get('content-type') ?? '', body: await r.text() };
};

describe('operator pages', () => {
  it('serves a page in the reader\'s language, with its description and alternates', async () => {
    const en = await get('/pricing');
    assert.equal(en.status, 200);
    assert.match(en.body, /<title>Pricing — Example Feeds<\/title>/);
    assert.match(en.body, /<meta name="description" content="Free for readers.">/);
    assert.match(en.body, /<link rel="alternate" hreflang="fr" href="https:\/\/service\.test\/pricing\?lang=fr">/);
    assert.match((await get('/pricing', 'fr')).body, /<h1>Tarifs<\/h1>/);
    assert.match((await get('/compare/other-service', 'fr')).body, /<h1>Compared with Other<\/h1>/, 'English when no French version');
  });

  it('lists footer pages and news on every page, and never lets a page take an application path', async () => {
    const home = await get('/');
    assert.match(home.body, /<a href="\/pricing\?lang=en">Pricing<\/a> · <a href="\/news\?lang=en">News<\/a><br>/);
    assert.match(home.body, /<link rel="alternate" type="application\/atom\+xml" title="News — Example Feeds" href="\/news.xml\?lang=en">/);
    assert.match((await get('/account')).body, /My subscriptions/, 'the application\'s own page');
    assert.ok(ctx.logs.some((l) => l.includes('account.en.html skipped')));
  });

  it('publishes the news as a page and as an Atom feed that the service itself can read', async () => {
    const news = await get('/news');
    assert.match(news.body, /We are open[\s\S]*Beta/, 'newest first');
    const xml = await get('/news.xml');
    assert.match(xml.type, /^application\/atom\+xml/);
    const feed = parseFeed(xml.body, `${site}/news.xml`);
    assert.equal(feed.title, 'News — Example Feeds');
    assert.deepEqual(feed.entries.map((e) => e.title), ['We are open', 'Beta']);
    assert.equal(feed.entries[0].link, 'https://service.test/news/2026-11-20-launch?lang=en');
    assert.match(feed.entries[0].summary, /The service opens/);
  });

  it('serves assets, a sitemap with every language, and robots.txt', async () => {
    const png = await fetch(`${site}/assets/shot.png`);
    assert.equal(png.headers.get('content-type'), 'image/png');
    const map = await get('/sitemap.xml');
    assert.match(map.body, /<loc>https:\/\/service\.test\/pricing\?lang=fr<\/loc>/);
    assert.match(map.body, /<loc>https:\/\/service\.test\/news\?lang=en<\/loc>/);
    const robots = await get('/robots.txt');
    assert.match(robots.body, /Disallow: \/u\/\n/);
    assert.match(robots.body, /Sitemap: https:\/\/service\.test\/sitemap\.xml/);
  });
});
