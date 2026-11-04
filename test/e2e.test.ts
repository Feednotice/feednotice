// The whole journey, over HTTP, on a locally served feed:
// preview → request → confirmation email → confirmation → new entry → email → unsubscribe.

import assert from 'node:assert/strict';
import { flushSends } from '../src/mail/quota.ts';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { runCycle } from '../src/cycle.ts';
import { createServer } from '../src/web/server.ts';
import { recipientTagger } from '../src/mail/mailer.ts';
import { fixture, makeCtx, MINUTE } from './helpers.ts';

const ctx = makeCtx({ webhookSecret: 'hook-secret' });
let feedXml = fixture('civic-99001.xml');
let feedUrl = '';
let site = '';
const feedServer = http.createServer((req, res) => {
  if (req.url === '/flux.xml') {
    res.writeHead(200, { 'Content-Type': 'application/atom+xml; charset=utf-8' });
    return res.end(feedXml);
  }
  if (req.url === '/page.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fixture('not-a-feed.html'));
  }
  if (req.url === '/plain.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><html><head><title>No feed</title></head><body>Hello</body></html>');
  }
  if (req.url === '/two.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><html><head><link rel="alternate" type="application/atom+xml" title="Main" href="/flux.xml"><link rel="alternate" type="application/rss+xml" title="Other" href="/other.xml"></head></html>');
  }
  res.writeHead(404);
  res.end();
});
const app = createServer(ctx);

before(async () => {
  await new Promise<void>((r) => feedServer.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  feedUrl = `http://127.0.0.1:${(feedServer.address() as AddressInfo).port}/flux.xml`;
  site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
after(() => {
  feedServer.close();
  app.close();
});

async function get(path: string): Promise<{ status: number; body: string; headers: Headers }> {
  const r = await fetch(site + path, { redirect: 'manual' });
  return { status: r.status, body: await r.text(), headers: r.headers };
}

async function post(path: string, form: Record<string, string> | string): Promise<{ status: number; body: string; headers: Headers }> {
  const body = typeof form === 'string' ? form : new URLSearchParams(form).toString();
  const r = await fetch(site + path, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  const text = await r.text();
  await flushSends();
  return { status: r.status, body: text, headers: r.headers };
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function linkIn(text: string, prefix: string): string {
  const m = new RegExp(`https://service\\.test(/${prefix}/[\\w.-]+)`).exec(text);
  assert.ok(m, `lien /${prefix}/ introuvable dans :\n${text}`);
  return m[1];
}

const NEW_ENTRY = `<entry>
<id>tag:civic.example,2026:99001/1-2026-09-25-deliberation-eau</id>
<title>Délibération — Tarifs de l’eau 2027</title>
<updated>2026-09-25T00:00:00Z</updated>
<link rel="alternate" href="https://civic.example/commune/99001#deliberations"/>
<content type="text">Le conseil fixe le prix du mètre cube à 2,10 €.</content>
</entry>`;

describe('end-to-end journey', () => {
  let confirmPath = '';

  it('shows the feed, its three latest items and the form, without script', async () => {
    const r = await get(`/s?feed=${encodeURIComponent(feedUrl)}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /<html lang="en">/);
    assert.match(r.body, /<h1>Civic — Saint-Exemple<\/h1>/);
    assert.equal((r.body.match(/<li><span class="title">/g) ?? []).length, 3);
    assert.match(r.body, /MOE Liaison Mazerier La Serre/);
    assert.match(r.body, /name="email"/);
    assert.doesNotMatch(r.body, /<script/i);
    assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  });

  it('still accepts the old "flux" parameter', async () => {
    const r = await get(`/s?flux=${encodeURIComponent(feedUrl)}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /Civic — Saint-Exemple/);
  });

  it('speaks French when asked, by parameter or by the browser', async () => {
    const byParam = await get(`/s?feed=${encodeURIComponent(feedUrl)}&lang=fr`);
    assert.match(byParam.body, /<html lang="fr">/);
    assert.match(byParam.body, /Recevoir les nouveautés/);
    const byHeader = await fetch(`${site}/`, { headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5' } });
    assert.match(await byHeader.text(), /Les nouveautés d&#39;un site, dans votre boîte aux lettres/);
  });

  it('rejects a page that announces no feed', async () => {
    const r = await get(`/s?feed=${encodeURIComponent(feedUrl.replace('flux.xml', 'plain.html'))}`);
    assert.equal(r.status, 422);
    assert.match(r.body, /does not announce any Atom or RSS feed/);
  });

  it('finds the feed from the address of a web page', async () => {
    const r = await get(`/s?feed=${encodeURIComponent(feedUrl.replace('flux.xml', 'page.html'))}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /Civic — Saint-Exemple/);
    // The form subscribes to the feed itself, not to the page.
    assert.match(r.body, new RegExp(`<input type="hidden" name="feed" value="${feedUrl.replace(/[.]/g, '\\.')}">`));
  });

  it('lets the reader choose when a page announces several feeds', async () => {
    const r = await get(`/s?feed=${encodeURIComponent(feedUrl.replace('flux.xml', 'two.html'))}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /This page offers several feeds/);
    assert.match(r.body, />Main<\/a>/);
    assert.match(r.body, />Other<\/a>/);
  });

  it('sends a confirmation email, and nothing else', async () => {
    const r = await post('/s', { feed: feedUrl, email: ' Habitante@Exemple.FR ', cadence: 'immediate', lang: 'en' });
    assert.equal(r.status, 200);
    assert.match(r.body, /Check your inbox/);
    assert.equal(ctx.mailer.messages.length, 1);
    const mail = ctx.mailer.messages[0];
    assert.equal(mail.to, 'habitante@exemple.fr');
    assert.match(mail.subject, /^Confirm your subscription/);
    assert.doesNotMatch(mail.raw, /List-Unsubscribe/);
    confirmPath = linkIn(mail.text, 'c');
    const sub = ctx.db.prepare('SELECT status FROM subscriptions').get() as { status: string };
    assert.equal(sub.status, 'pending');
  });

  it('sends nothing until the subscription is confirmed', async () => {
    feedXml = feedXml.replace('<entry>', `${NEW_ENTRY.replace('eau', 'eau-bis').replace('Tarifs', 'Brouillon')}\n<entry>`);
    ctx.clock.t += 31 * MINUTE;
    await runCycle(ctx);
    assert.equal(ctx.mailer.messages.length, 1);
  });

  it('does not confirm on a plain GET (antivirus software follows links)', async () => {
    const r = await get(confirmPath);
    assert.equal(r.status, 200);
    assert.match(r.body, /<form action="\/c\/[\w.-]+" method="post">/);
    assert.equal((ctx.db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'pending');
  });

  it('confirms on the button', async () => {
    const r = await post(confirmPath, {});
    assert.equal(r.status, 200);
    assert.match(r.body, /Done/);
    assert.equal((ctx.db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'active');
  });

  it('sends what appeared since the request, each entry once', async () => {
    feedXml = feedXml.replace('<entry>', `${NEW_ENTRY}\n<entry>`);
    ctx.clock.t += 61 * MINUTE;
    await runCycle(ctx);
    assert.deepEqual(ctx.mailer.messages.slice(1).map((m) => m.subject), ['Délibération — Brouillon de l’eau 2027', 'Délibération — Tarifs de l’eau 2027']);
    const mail = ctx.mailer.messages[2];
    assert.match(mail.text, /2,10 €/);
    assert.match(mail.text, /Read: https:\/\/civic\.example\/commune\/99001#deliberations/);
    // The feed is read again later, identical but with changed dates: nothing goes out again.
    feedXml = feedXml.replaceAll('2026-09-07T00:00:00Z', '2026-09-26T00:00:00Z');
    ctx.clock.t += 61 * MINUTE;
    await runCycle(ctx);
    assert.equal(ctx.mailer.messages.length, 3);
  });

  it('opens the account by magic link, where cadence and language can change', async () => {
    const r = await post('/account', { email: 'habitante@exemple.fr' });
    assert.equal(r.status, 200);
    const mail = ctx.mailer.messages.at(-1);
    assert.ok(mail);
    assert.match(mail.subject, /access link/);
    const manage = linkIn(mail.text, 'm');
    const page = await get(manage);
    assert.match(page.body, /Civic — Saint-Exemple/);
    const subId = /name="subscription" value="(\d+)"/.exec(page.body)?.[1] as string;
    const changed = await post(manage, { action: 'cadence', subscription: subId, cadence: 'weekly' });
    assert.equal(changed.status, 303);
    assert.equal((ctx.db.prepare('SELECT cadence FROM subscriptions').get() as { cadence: string }).cadence, 'weekly');
    // Switching the account page to French switches the emails too.
    const fr = await get(`${manage}?lang=fr`);
    assert.match(fr.body, /Mes abonnements/);
    assert.equal((ctx.db.prepare('SELECT locale FROM subscribers').get() as { locale: string }).locale, 'fr');
    // An unknown address gets the same answer, and no email.
    const before = ctx.mailer.messages.length;
    const unknown = await post('/account', { email: 'inconnue@exemple.fr' });
    assert.equal(unknown.body, r.body);
    assert.equal(ctx.mailer.messages.length, before);
  });

  it('unsubscribes in one click (RFC 8058) and erases the address', async () => {
    const lastEntryMail = ctx.mailer.messages[2];
    const header = /^List-Unsubscribe: <([^>]+)>$/m.exec(lastEntryMail.raw)?.[1] as string;
    const r = await post(pathOf(header), 'List-Unsubscribe=One-Click');
    assert.equal(r.status, 200);
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM subscribers').get() as { n: number }).n, 0);
    assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get() as { n: number }).n, 0);
    // The link stays harmless and error-free afterwards.
    assert.equal((await get(pathOf(header))).status, 200);
  });

  it('cannot be used to flood an address with confirmations', async () => {
    const before = ctx.mailer.messages.length;
    for (let i = 0; i < 5; i++) {
      const r = await post('/s', { feed: feedUrl, email: 'cible@exemple.fr', cadence: 'daily' });
      assert.equal(r.status, 200);
    }
    assert.equal(ctx.mailer.messages.length - before, 3);
  });

  it('stops at 100 subscriptions per address, answering as usual', async () => {
    const { db } = ctx;
    db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('collector@exemple.fr', 0)").run();
    const id = (db.prepare("SELECT id FROM subscribers WHERE email = 'collector@exemple.fr'").get() as { id: number }).id;
    for (let i = 0; i < 100; i++) {
      db.prepare('INSERT INTO feeds (url, title, created_at) VALUES (?, ?, 0)').run(`https://many.example/${i}`, `F${i}`);
      const feedId = (db.prepare('SELECT id FROM feeds WHERE url = ?').get(`https://many.example/${i}`) as { id: number }).id;
      db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (?, ?, 'weekly', 'active', 0)").run(id, feedId);
    }
    const before = ctx.mailer.messages.length;
    const r = await post('/s', { feed: feedUrl, email: 'collector@exemple.fr', cadence: 'daily' });
    assert.equal(r.status, 200);
    assert.match(r.body, /Check your inbox/);
    assert.equal(ctx.mailer.messages.length, before);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE subscriber_id = ?').get(id) as { n: number }).n, 100);
  });

  it('suspends an address when the MTA posts its bounce to /hooks/bounce', async () => {
    const tag = recipientTagger(ctx.config.secret)('cible@exemple.fr');
    const dsn = `Content-Type: multipart/report; report-type=delivery-status; boundary="b"\n\n--b\nContent-Type: message/delivery-status\n\nFinal-Recipient: rfc822; cible@exemple.fr\nAction: failed\nStatus: 5.1.1\n\n--b\nContent-Type: text/rfc822-headers\n\nX-FeedNotice-Ref: ${tag}\n\n--b--\n`;
    const denied = await fetch(`${site}/hooks/bounce`, { method: 'POST', body: dsn });
    assert.equal(denied.status, 401);
    const ok = await fetch(`${site}/hooks/bounce`, { method: 'POST', body: dsn, headers: { Authorization: 'Bearer hook-secret' } });
    assert.equal(await ok.text(), 'ok 1');
    assert.equal((ctx.db.prepare("SELECT status FROM subscribers WHERE email = 'cible@exemple.fr'").get() as { status: string }).status, 'suspended');
  });

  it('rejects forged links', async () => {
    assert.equal((await get('/c/1.zzzzzz.AAAAAAAAAAAAAAAAAAAAAAAAAAA')).status, 404);
    assert.equal((await post('/u/1.AAAAAAAAAAAAAAAAAAAAAAAAAAA', 'List-Unsubscribe=One-Click')).status, 404);
    assert.equal((await get('/m/1.zzzzzz.AAAAAAAAAAAAAAAAAAAAAAAAAAA')).status, 404);
  });
});
