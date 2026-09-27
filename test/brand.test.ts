// Branding: neutral by default; the operator's own files from BRAND_DIR when given.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createServer } from '../src/web/server.ts';
import { makeCtx } from './helpers.ts';

async function start(brandDir: string): Promise<{ server: http.Server; site: string }> {
  const ctx = makeCtx();
  ctx.config.brandDir = brandDir;
  const server = createServer(ctx);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, site: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('branding', () => {
  let neutral: { server: http.Server; site: string };
  let branded: { server: http.Server; site: string };
  before(async () => {
    neutral = await start('');
    branded = await start(new URL('./fixtures/brand', import.meta.url).pathname);
  });
  after(() => {
    neutral.server.close();
    branded.server.close();
  });

  it('is neutral by default: the name as text, no icon', async () => {
    const home = await (await fetch(`${neutral.site}/`)).text();
    assert.match(home, /<a class="brand" href="\/\?lang=en">Example Feeds<\/a>/);
    assert.doesNotMatch(home, /rel="icon"|class="mark"/);
    assert.equal((await fetch(`${neutral.site}/favicon.ico`)).status, 404);
  });

  it("shows the operator's mark and serves only the files provided", async () => {
    const home = await (await fetch(`${branded.site}/`)).text();
    assert.match(home, /<a class="brand"[^>]*><img class="mark" src="\/brand\/mark.svg" alt="">Example Feeds<\/a>/);
    assert.doesNotMatch(home, /<picture>|rel="icon"/);
    const mark = await fetch(`${branded.site}/brand/mark.svg`);
    assert.equal(mark.status, 200);
    assert.equal(mark.headers.get('content-type'), 'image/svg+xml');
    assert.equal((await fetch(`${branded.site}/brand/mark-dark.svg`)).status, 404);
    assert.equal((await fetch(`${branded.site}/favicon.ico`)).status, 404);
  });

  it("adds the operator's CSS after the site's own", async () => {
    const css = await (await fetch(`${branded.site}/style.css`)).text();
    assert.ok(css.trimEnd().endsWith(':root { --accent: #7a3d57; }'));
  });
});
