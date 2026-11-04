// The publisher's button: copyable code with no script and nothing loaded, previewed under a strict CSP.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createServer } from '../src/web/server.ts';
import { buttonCode, buttonStyle } from '../src/web/views.ts';
import { makeCtx } from './helpers.ts';

const ctx = makeCtx();
const app = createServer(ctx);
let site = '';
before(async () => {
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
after(() => app.close());

describe('publisher button', () => {
  it('is a plain link with an inline style and an inline icon, in the readers\' language', () => {
    const code = buttonCode(ctx.config, 'https://blog.example/feed.xml', { readers: 'fr', color: '#1e5f74' });
    assert.equal(code.link, 'https://service.test/s?feed=https%3A%2F%2Fblog.example%2Ffeed.xml&lang=fr');
    assert.match(code.buttonHtml, /^<a href="https:\/\/service\.test\/s\?feed=https%3A%2F%2Fblog\.example%2Ffeed\.xml&amp;lang=fr" style="[^"]*background:#1e5f74;color:#ffffff[^"]*"><svg [^>]*aria-hidden="true">.*<\/svg>Recevoir les nouveautés par courriel<\/a>$/);
    assert.doesNotMatch(code.buttonHtml, /<script|<img|src=/);
    assert.match(buttonStyle('#ffd166'), /color:#111111/, 'dark text on a light colour');
  });

  it('shows the code and a preview whose one inline style is allowed by hash', async () => {
    const r = await fetch(`${site}/publishers?feed=${encodeURIComponent('https://blog.example/feed.xml')}&readers=en&color=%23AA3300&lang=en`);
    const html = await r.text();
    assert.match(html, /<textarea id="code-button" readonly rows="4">&lt;a href=/);
    assert.match(html, /<option value="en" selected>English<\/option>/);
    const hash = createHash('sha256').update(buttonStyle('#aa3300')).digest('base64');
    assert.match(r.headers.get('content-security-policy') ?? '', new RegExp(`style-src 'self' 'unsafe-hashes' 'sha256-${hash.replace(/[+/]/g, '\\$&')}'`));
    const bad = await fetch(`${site}/publishers?feed=x.example&color=red;background:url(x)`);
    assert.match(await bad.text(), /background:#3d5570/, 'only a #rrggbb colour is taken');
  });
});
