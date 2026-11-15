// The readers' paid plan: keyword filters and pauses. What they hold back is never sent, not
// even later; without the plan, everything is sent as before.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { sendDigests, sendImmediate, slotStart } from '../src/delivery.ts';
import type { ParsedEntry } from '../src/feed/parse.ts';
import { ingestEntries } from '../src/ingest.ts';
import { flushSends } from '../src/mail/quota.ts';
import type { Cadence } from '../src/model.ts';
import { signToken } from '../src/tokens.ts';
import { createServer } from '../src/web/server.ts';
import { cleanWords, MAX_FILTERED, passesFilters, setFilters, setPause, setReaderPlan } from '../src/watch.ts';
import { DAY, HOUR, makeCtx, MINUTE, type TestCtx } from './helpers.ts';

describe('filters', () => {
  it('match whole words and phrases, whatever the case and accents', () => {
    assert.ok(passesFilters('vote', '', 'Vote tonight at the town hall'));
    assert.ok(!passesFilters('vote', '', 'A devoted volunteer'), 'not inside another word');
    assert.ok(passesFilters('élection', '', 'ELECTION results'));
    assert.ok(passesFilters('election', '', 'Résultats de l’élection municipale'));
    assert.ok(passesFilters('city council, budget', '', 'The City   Council meets'));
    assert.ok(!passesFilters('city council', '', 'The city and its council'));
    assert.ok(passesFilters('', '', 'anything'), 'no filter: everything');
    assert.ok(!passesFilters('', 'sport', 'Sport: the results'));
    assert.ok(!passesFilters('budget', 'sport', 'Sport budget'), 'excluding wins');
    assert.ok(passesFilters('c++', '', 'Learning C++ today'), 'special characters are taken literally');
    assert.ok(passesFilters('(test', '', 'a (test case'));
  });

  it('keep what readers type, within limits', () => {
    assert.equal(cleanWords(' vote ,  city   council ,, budget '), 'vote, city council, budget');
    assert.equal(cleanWords(Array.from({ length: 30 }, (_, i) => `w${i}`).join(',')).split(', ').length, 20);
  });
});

function entry(id: string, title: string): ParsedEntry {
  return { id, link: `https://x.example/${id}`, title, summary: `Summary of ${id}`, published: null };
}

/** A feed, one reader subscribed with the given cadence, and a way to publish. */
function setup(cadence: Cadence = 'immediate'): { ctx: TestCtx; publish: (id: string, title: string) => void } {
  const ctx = makeCtx();
  const { db } = ctx;
  db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://x.example/feed', 'Town', ?)").run(ctx.now());
  ingestEntries(db, 1, [entry('old', 'Old')], ctx.now(), { baseline: true });
  db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('reader@x.example', ?)").run(ctx.now());
  ctx.clock.t += MINUTE;
  db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at) VALUES (1, 1, ?, 'active', ?, ?)").run(cadence, ctx.now(), ctx.now());
  const known: ParsedEntry[] = [entry('old', 'Old')];
  const publish = (id: string, title: string) => {
    ctx.clock.t += 30 * MINUTE;
    known.unshift(entry(id, title));
    ingestEntries(db, 1, known, ctx.now(), { baseline: false });
  };
  return { ctx, publish };
}

const subjects = (ctx: TestCtx) => ctx.mailer.messages.map((m) => m.subject);

describe('screening before sending', () => {
  it('sends only what the filters let through; the rest is never sent, not even later', async () => {
    const { ctx, publish } = setup();
    setReaderPlan(ctx, 1, 'watch', null);
    assert.equal(setFilters(ctx, 1, 1, 'budget, vote', 'sport'), 'saved');
    publish('a', 'Budget 2027 adopted');
    publish('b', 'Road works on Main Street');
    publish('c', 'Sport budget cut');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), ['Budget 2027 adopted']);
    const held = ctx.db.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE status = 'sent' AND attempts = 0").get() as { n: number };
    assert.equal(held.n, 2, 'held back, recorded as handled');
    // Filters removed: what was held stays unsent; new entries all go.
    setFilters(ctx, 1, 1, '', '');
    publish('d', 'Library hours');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), ['Budget 2027 adopted', 'Library hours']);
  });

  it('applies to digests too, and an empty digest is not sent', async () => {
    const { ctx, publish } = setup('daily');
    setReaderPlan(ctx, 1, 'watch', null);
    setFilters(ctx, 1, 1, 'vote', '');
    publish('a', 'Road works');
    publish('b', 'Vote on Sunday');
    ctx.clock.t = slotStart(ctx.now() + DAY, ctx.config.timeZone, ctx.config.digestHour, null) + MINUTE;
    await sendDigests(ctx);
    assert.equal(ctx.mailer.messages.length, 1);
    assert.match(ctx.mailer.messages[0].text, /Vote on Sunday/);
    assert.doesNotMatch(ctx.mailer.messages[0].text, /Road works/);
    publish('c', 'Road works again');
    ctx.clock.t = slotStart(ctx.now() + DAY, ctx.config.timeZone, ctx.config.digestHour, null) + MINUTE;
    await sendDigests(ctx);
    assert.equal(ctx.mailer.messages.length, 1, 'nothing passed the filter: no email');
  });

  it('a pause holds back what appears during it, then sending resumes', async () => {
    const { ctx, publish } = setup();
    setReaderPlan(ctx, 1, 'watch', null);
    setPause(ctx, 1, 1, 7);
    publish('a', 'During the pause');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), []);
    ctx.clock.t += 8 * DAY;
    publish('b', 'After the pause');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), ['After the pause']);
    setPause(ctx, 1, 1, null); // until resumed
    publish('c', 'Paused again');
    ctx.clock.t += 60 * DAY;
    publish('d', 'Still paused');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), ['After the pause']);
    setPause(ctx, 1, 1, 0);
    publish('e', 'Resumed');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), ['After the pause', 'Resumed']);
  });

  it('without the plan, or once it ends, filters and pauses no longer apply', async () => {
    const { ctx, publish } = setup();
    setReaderPlan(ctx, 1, 'watch', ctx.now() + DAY);
    setFilters(ctx, 1, 1, 'vote', '');
    setPause(ctx, 1, 1, 30);
    ctx.clock.t += 2 * DAY;
    publish('a', 'Road works');
    await sendImmediate(ctx);
    assert.deepEqual(subjects(ctx), ['Road works'], 'plan ended: everything is sent');
    const kept = ctx.db.prepare('SELECT include_words FROM subscriptions').get() as { include_words: string };
    assert.equal(kept.include_words, 'vote', 'settings kept for a renewal');
  });

  it(`filters on ${MAX_FILTERED} feeds at most`, () => {
    const ctx = makeCtx();
    const { db } = ctx;
    db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('reader@x.example', 0)").run();
    for (let i = 1; i <= MAX_FILTERED + 1; i++) {
      db.prepare('INSERT INTO feeds (url, title, created_at) VALUES (?, ?, 0)').run(`https://x.example/${i}`, `F${i}`);
      db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at) VALUES (1, ?, 'immediate', 'active', 0)").run(i);
    }
    for (let i = 1; i <= MAX_FILTERED; i++) assert.equal(setFilters(ctx, 1, i, 'x', ''), 'saved');
    assert.equal(setFilters(ctx, 1, MAX_FILTERED + 1, 'x', ''), 'limit');
    assert.equal(setFilters(ctx, 1, 1, 'y', ''), 'saved', 'changing an existing one is fine');
    assert.equal(setFilters(ctx, 1, MAX_FILTERED + 1, '', ''), 'saved', 'clearing is always fine');
  });
});

describe('account page', () => {
  const ctx = makeCtx();
  const app = createServer(ctx);
  let site = '';
  let manage = '';
  before(async () => {
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    site = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    const { db } = ctx;
    db.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://x.example/feed', 'Town news', 0)").run();
    db.prepare("INSERT INTO subscribers (email, created_at) VALUES ('reader@x.example', 0)").run();
    db.prepare("INSERT INTO subscriptions (subscriber_id, feed_id, cadence, status, created_at, confirmed_at) VALUES (1, 1, 'immediate', 'active', 0, 0)").run();
    manage = `/m/${signToken(ctx.config.secret, 'manage', 1, ctx.now() + HOUR)}`;
  });
  after(() => app.close());

  async function post(form: Record<string, string>): Promise<Response> {
    const r = await fetch(site + manage, { method: 'POST', body: new URLSearchParams(form).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    await flushSends();
    return r;
  }

  it('without the plan: one line about it, and the forms are refused', async () => {
    const html = await (await fetch(site + manage)).text();
    assert.match(html, /With the Watch plan: keyword filters/);
    assert.doesNotMatch(html, /name="include"/);
    await post({ action: 'filters', subscription: '1', include: 'vote', lang: 'en' });
    assert.equal((ctx.db.prepare('SELECT include_words FROM subscriptions').get() as { include_words: string }).include_words, '');
  });

  it('with the plan: filters and a pause, shown in the list', async () => {
    setReaderPlan(ctx, 1, 'watch', ctx.now() + 30 * DAY);
    let html = await (await fetch(site + manage)).text();
    assert.match(html, /Watch plan until/);
    assert.match(html, /<h2>Filters and pauses<\/h2>/);
    const r = await post({ action: 'filters', subscription: '1', include: ' vote,  budget ', exclude: '<b>sport</b>', lang: 'en' });
    assert.equal(r.headers.get('location'), `${manage}?lang=en&result=saved`);
    await post({ action: 'pause', subscription: '1', pause: '14', lang: 'en' });
    html = await (await fetch(`${site}${manage}?result=saved`)).text();
    assert.match(html, /Saved\./);
    assert.match(html, /value="vote, budget"/);
    assert.match(html, /value="&lt;b&gt;sport&lt;\/b&gt;"/, 'escaped');
    assert.match(html, /paused until 15 September 2026 · filtered/);
    await post({ action: 'pause', subscription: '1', pause: 'keep', lang: 'en' });
    assert.ok((ctx.db.prepare('SELECT paused_until FROM subscriptions').get() as { paused_until: number }).paused_until, 'keep changes nothing');
    await post({ action: 'pause', subscription: '1', pause: 'resume', lang: 'en' });
    assert.equal((ctx.db.prepare('SELECT paused_from FROM subscriptions').get() as { paused_from: number | null }).paused_from, null);
  });
});
