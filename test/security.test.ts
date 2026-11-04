// Regression tests for the security review's findings on the web layer.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createServer, limitKey } from '../src/web/server.ts';
import { fixture, makeCtx } from './helpers.ts';

const ctx = makeCtx({ webhookSecret: 'hook-secret' });
const app = createServer(ctx);
let site = '';
let origin = '';
// An "open redirect" on a verified publisher's domain, pointing to someone else's feed.
const remote = http.createServer((req, res) => {
  if (req.url?.startsWith('/out')) {
    res.writeHead(302, { Location: `http://localhost:${(remote.address() as AddressInfo).port}/feed.xml` });
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'application/atom+xml' });
  res.end(fixture('atom-xhtml.xml'));
});
before(async () => {
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => remote.listen(0, '127.0.0.1', r));
  site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  origin = `http://127.0.0.1:${(remote.address() as AddressInfo).port}`;
});
after(() => {
  app.close();
  remote.close();
});

describe('web hardening', () => {
  it('keeps language links on this site, whatever the requested path', async () => {
    const r = await new Promise<string>((resolve) => {
      http.get({ host: '127.0.0.1', port: Number(new URL(site).port), path: '//h//a//evil.example/x' }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      });
    });
    assert.doesNotMatch(r, /href="\/\/evil/);
    assert.match(r, /hreflang="fr"/);
  });

  it('counts an IPv6 visitor by /64 network', () => {
    assert.equal(limitKey('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
    assert.equal(limitKey('2001:db8:1:2:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
    assert.equal(limitKey('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(limitKey('::ffff:192.0.2.7'), '192.0.2.7');
    assert.equal(limitKey('192.0.2.7'), '192.0.2.7');
  });

  it('accepts and drops a bounce too large to be one, so the MTA does not retry it', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    const r = await fetch(`${site}/hooks/bounce`, { method: 'POST', body: big, headers: { Authorization: 'Bearer hook-secret' } });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'ok 0 (too large)');
    assert.equal((await fetch(`${site}/hooks/bounce`, { method: 'POST', body: 'x', headers: { Authorization: 'Bearer wrong' } })).status, 401);
  });

  it("does not lend a verified publisher's name to a feed reached through a redirect", async () => {
    const host = new URL(origin).hostname;
    ctx.db.prepare("INSERT INTO publishers (email, name, created_at) VALUES ('p@x.example', 'Trusted Bank', 0)").run();
    ctx.db.prepare("INSERT INTO publisher_domains (publisher_id, domain, token, verified_at, method, created_at) VALUES (1, ?, 't', 0, 'file', 0)").run(host);
    // 127.0.0.1 is the verified "domain"; the redirect leads to localhost, another host.
    const direct = await (await fetch(`${site}/s?feed=${encodeURIComponent(`${origin}/feed.xml`)}`)).text();
    assert.match(direct, /Published by Trusted Bank/);
    const redirected = await (await fetch(`${site}/s?feed=${encodeURIComponent(`${origin}/out`)}`)).text();
    assert.doesNotMatch(redirected, /Trusted Bank/);
  });
});
