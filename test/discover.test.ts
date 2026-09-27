import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discoverFeeds, looksLikeHtml } from '../src/feed/discover.ts';
import { fixture } from './helpers.ts';

describe('feed discovery', () => {
  it('finds the feed a page announces, as an absolute URL', () => {
    assert.deepEqual(discoverFeeds(fixture('not-a-feed.html'), 'https://site.example/blog/'), [{ url: 'https://site.example/flux.xml', title: '' }]);
  });

  it('lists every feed, with titles, without duplicates, honoring <base>', () => {
    const html = `<!doctype html><html><head>
      <base href="https://cdn.example/root/">
      <link rel="stylesheet" href="style.css">
      <link rel="alternate" type="application/rss+xml" title="Posts &amp; news" href="posts.xml">
      <link type='application/atom+xml' href='/comments.atom' rel='alternate' title='Comments'>
      <link rel="alternate" type="application/rss+xml" href="posts.xml">
      <link rel="alternate" hreflang="fr" href="/fr/">
      <link rel="alternate" type="application/json" href="/feed.json">
    </head><body><link rel="alternate" type="application/rss+xml" href="/in-body.xml"></body></html>`;
    assert.deepEqual(discoverFeeds(html, 'https://site.example/'), [
      { url: 'https://cdn.example/root/posts.xml', title: 'Posts & news' },
      { url: 'https://cdn.example/comments.atom', title: 'Comments' },
    ]);
  });

  it('ignores links that are not http(s)', () => {
    assert.deepEqual(discoverFeeds('<head><link rel="alternate" type="application/rss+xml" href="javascript:alert(1)"></head>', 'https://x.example/'), []);
  });

  it('tells HTML pages from feeds', () => {
    assert.equal(looksLikeHtml('<!DOCTYPE html><html>', 'text/html; charset=utf-8'), true);
    assert.equal(looksLikeHtml('<html lang="fr">', ''), true);
    assert.equal(looksLikeHtml('<?xml version="1.0"?><rss/>', 'application/rss+xml'), false);
    assert.equal(looksLikeHtml('<?xml version="1.0"?><feed/>', 'text/xml'), false);
    assert.equal(looksLikeHtml('<feed xmlns="http://www.w3.org/2005/Atom"/>', 'application/xhtml+xml'), false);
  });
});
