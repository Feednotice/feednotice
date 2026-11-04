import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import zlib from 'node:zlib';
import { decodeBody, fetchFeed, isPublicAddress } from '../src/feed/fetch.ts';
import { looksLikeHtml } from '../src/feed/discover.ts';
import { htmlToText } from '../src/feed/text.ts';
import { normalizeId } from '../src/ingest.ts';

const UA = 'FeedNotice-test/0 (+https://service.test/robot)';
let base = '';
let seenUserAgent = '';
const server = http.createServer((req, res) => {
  seenUserAgent = req.headers['user-agent'] ?? '';
  const url = req.url ?? '/';
  if (url === '/etag') {
    if (req.headers['if-none-match'] === '"v1"') { res.writeHead(304); return res.end(); }
    res.writeHead(200, { ETag: '"v1"', 'Content-Type': 'application/atom+xml', 'Cache-Control': 'max-age=1800' });
    return res.end('<feed/>');
  }
  if (url === '/lastmod') {
    if (req.headers['if-modified-since'] === 'Wed, 01 Jan 2025 00:00:00 GMT') { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT' });
    return res.end('<rss/>');
  }
  if (url === '/gzip') {
    res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'application/rss+xml; charset=utf-8' });
    return res.end(zlib.gzipSync(Buffer.from('<rss>é</rss>')));
  }
  if (url === '/latin1') {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    return res.end(Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><rss>\xe9t\xe9</rss>', 'latin1'));
  }
  if (url === '/redirect') { res.writeHead(301, { Location: '/etag' }); return res.end(); }
  if (url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
  if (url === '/big') { res.writeHead(200); return res.end(Buffer.alloc(2048, 'a')); }
  if (url === '/busy') { res.writeHead(503, { 'Retry-After': '120' }); return res.end(); }
  if (url === '/gone') { res.writeHead(410); return res.end(); }
  if (url === '/slow') { setTimeout(() => res.end('<rss/>'), 500); return; }
  if (url === '/bad-location') { res.writeHead(302, { Location: 'http://[' }); return res.end(); }
  if (url === '/drip') {
    // One byte every 50 ms: never silent long enough for an idle timeout.
    res.writeHead(200);
    const t = setInterval(() => res.write('<'), 50);
    res.on('close', () => clearInterval(t));
    return;
  }
  if (url === '/gzip-cut') {
    res.writeHead(200, { 'Content-Encoding': 'gzip' });
    res.write(zlib.gzipSync(Buffer.alloc(100_000, 'a')).subarray(0, 200));
    setTimeout(() => res.destroy(), 50);
    return;
  }
  res.writeHead(404);
  res.end();
});

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const opts = { userAgent: UA, allowPrivate: true };

describe('fetching feeds', () => {
  it('sends its User-Agent and honors ETag / If-None-Match', async () => {
    const first = await fetchFeed(`${base}/etag`, opts);
    assert.equal(first.kind, 'ok');
    assert.equal(seenUserAgent, UA);
    if (first.kind !== 'ok') return;
    assert.equal(first.etag, '"v1"');
    assert.equal(first.maxAgeSeconds, 1800);
    const second = await fetchFeed(`${base}/etag`, { ...opts, etag: first.etag });
    assert.equal(second.kind, 'not-modified');
  });

  it('honors Last-Modified / If-Modified-Since', async () => {
    const first = await fetchFeed(`${base}/lastmod`, opts);
    assert.ok(first.kind === 'ok' && first.lastModified);
    const second = await fetchFeed(`${base}/lastmod`, { ...opts, lastModified: first.kind === 'ok' ? first.lastModified : null });
    assert.equal(second.kind, 'not-modified');
  });

  it('decompresses and decodes the character set', async () => {
    const gz = await fetchFeed(`${base}/gzip`, opts);
    assert.ok(gz.kind === 'ok' && gz.body === '<rss>é</rss>');
    const l1 = await fetchFeed(`${base}/latin1`, opts);
    assert.ok(l1.kind === 'ok' && l1.body.endsWith('<rss>été</rss>'));
  });

  it('follows redirects, without looping', async () => {
    const r = await fetchFeed(`${base}/redirect`, opts);
    assert.ok(r.kind === 'ok' && r.finalUrl === `${base}/etag`);
    const loop = await fetchFeed(`${base}/loop`, opts);
    assert.ok(loop.kind === 'error' && loop.code === 'too-many-redirects');
  });

  it('bounds size and duration', async () => {
    const big = await fetchFeed(`${base}/big`, { ...opts, maxBytes: 1024 });
    assert.ok(big.kind === 'error' && big.code === 'too-large');
    const slow = await fetchFeed(`${base}/slow`, { ...opts, timeoutMs: 100 });
    assert.ok(slow.kind === 'error' && slow.code === 'timeout');
  });

  it('survives hostile servers: bad redirect, dripping body, cut compressed body', async () => {
    const bad = await fetchFeed(`${base}/bad-location`, { userAgent: UA, allowPrivate: true });
    assert.equal(bad.kind === 'error' && bad.code, 'invalid-url');
    const started = Date.now();
    const drip = await fetchFeed(`${base}/drip`, { userAgent: UA, allowPrivate: true, timeoutMs: 200 });
    assert.equal(drip.kind === 'error' && drip.code, 'timeout');
    assert.ok(Date.now() - started < 2000);
    const cut = await fetchFeed(`${base}/gzip-cut`, { userAgent: UA, allowPrivate: true, timeoutMs: 2000 });
    assert.equal(cut.kind, 'error');
  });

  it('reports Retry-After and permanent errors', async () => {
    const busy = await fetchFeed(`${base}/busy`, opts);
    assert.ok(busy.kind === 'error' && busy.retryAfterSeconds === 120 && !busy.permanent);
    const gone = await fetchFeed(`${base}/gone`, opts);
    assert.ok(gone.kind === 'error' && gone.permanent);
  });

  it('refuses private and local addresses (SSRF)', async () => {
    for (const url of [`${base}/etag`, 'http://localhost:1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/']) {
      const r = await fetchFeed(url, { userAgent: UA, timeoutMs: 2000 });
      assert.ok(r.kind === 'error' && r.code === 'private-address', `${url} : ${JSON.stringify(r)}`);
    }
  });

  it('refuses other schemes and credentials in the URL', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://x.example/', 'https://user:pass@x.example/', 'pas une url']) {
      const r = await fetchFeed(url, { userAgent: UA });
      assert.ok(r.kind === 'error' && r.permanent, url);
    }
  });
});

describe('public addresses', () => {
  it('takes linear time on pathological content', () => {
    const t = Date.now();
    assert.equal(looksLikeHtml(`${'<!---->'.repeat(5000)}<rss/>`, 'application/xml'), false);
    assert.equal(looksLikeHtml('<!-- x --><!DOCTYPE html><html>', ''), true);
    htmlToText('<'.repeat(200_000));
    htmlToText('<p'.repeat(100_000));
    htmlToText('<!--'.repeat(100_000));
    htmlToText('<script>'.repeat(50_000));
    assert.equal(normalizeId(`${'/'.repeat(400_000)}a`).length, 400_001);
    assert.ok(Date.now() - t < 2000, `${Date.now() - t} ms`);
    assert.equal(htmlToText('<p>a</p><script>x</script >b<!-- c -->d'), 'a\n\nbd');
  });

  it('classifies addresses correctly', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0', '::7f00:1', '64:ff9b:1::a00:1', '2002:7f00:1::', '2001:0:4136::1']) {
      assert.equal(isPublicAddress(a), false, a);
    }
    for (const a of ['93.184.216.34', '2606:4700::1111', '::ffff:93.184.216.34']) assert.equal(isPublicAddress(a), true, a);
  });

  it('honors the byte order mark', () => {
    assert.equal(decodeBody(Buffer.from('\ufeff<rss/>', 'utf8'), 'text/xml; charset=iso-8859-1'), '<rss/>');
  });
});
