// HTML pages. No JavaScript: everything works with links and forms.
// Every text comes from the message catalogs (src/i18n).

import type { Config } from '../config.ts';
import type { ParsedEntry, ParsedFeed } from '../feed/parse.ts';
import { truncate } from '../feed/text.ts';
import { formatDate, LOCALES, messages, type Locale, type Messages } from '../i18n/index.ts';
import type { Cadence } from '../model.ts';
import { CADENCES } from '../model.ts';
import type { DiscoveredFeed } from '../feed/discover.ts';
import type { Section } from '../i18n/en.ts';
import {
  COUNT_FLOOR, NAME_MAX, TERMS_DATE, verificationDnsName, verificationFileUrl, verificationRecord, WELCOME_MAX,
  type DomainRow, type FeedStats, type PublisherRow,
} from '../publishers.ts';
import type { SubscriptionListItem } from '../subscriptions.ts';
import type { Brand } from './brand.ts';

/** What every page needs: configuration, language, and the address to switch language on. */
export interface Page {
  config: Config;
  brand: Brand;
  locale: Locale;
  m: Messages;
  /** Path (with query) the language links point to; '/' for pages reached by POST. */
  here: string;
}

export function page(config: Config, brand: Brand, locale: Locale, here = '/'): Page {
  return { config, brand, locale, m: messages(locale), here };
}

export function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Adds (or replaces) lang= on a local URL. */
function withLang(url: string, locale: Locale): string {
  // Always a path on this site: leading slashes collapsed, so "//host" cannot point elsewhere.
  const u = new URL(url.replace(/^[/\\]+/, '/'), 'http://x');
  u.searchParams.set('lang', locale);
  return `${u.pathname}${u.search}`;
}

function langInput(p: Page): string {
  return `<input type="hidden" name="lang" value="${p.locale}">`;
}

/** Head links to the operator's icons, only those provided. */
function brandLinks(brand: Brand): string {
  const has = (path: string) => brand.files.has(path);
  return [
    has('/favicon.ico') ? '<link rel="icon" href="/favicon.ico" sizes="any">' : '',
    has('/favicon.svg') ? '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' : '',
    has('/apple-touch-icon.png') ? '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' : '',
  ].filter(Boolean).map((l) => `${l}\n`).join('');
}

/** The operator's mark before the service name, with its dark variant if provided. */
function brandMark(brand: Brand): string {
  if (!brand.files.has('/brand/mark.svg')) return '';
  const img = '<img class="mark" src="/brand/mark.svg" alt="">';
  if (!brand.files.has('/brand/mark-dark.svg')) return img;
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="/brand/mark-dark.svg">${img}</picture>`;
}

export function layout(p: Page, title: string, body: string): string {
  const { config, m, locale } = p;
  const switcher = LOCALES.filter((l) => l !== locale)
    .map((l) => `<a href="${esc(withLang(p.here, l))}" hreflang="${l}" lang="${l}">${esc(messages(l).langName)}</a>`).join(' · ');
  const link = (path: string, label: string) => `<a href="${esc(withLang(path, locale))}">${esc(label)}</a>`;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} — ${esc(config.serviceName)}</title>
<link rel="stylesheet" href="/style.css">
${brandLinks(p.brand)}</head>
<body>
<header><a class="brand" href="${esc(withLang('/', locale))}">${brandMark(p.brand)}${esc(config.serviceName)}</a><nav aria-label="${esc(m.languageSwitch)}">${switcher}</nav></header>
<main>
${body}
</main>
<footer>
${link('/privacy', m.nav.privacy)} · ${link('/account', m.nav.account)} · ${link('/publishers', m.nav.publishers)} · ${link('/robot', m.nav.robot)}<br>
${link('/terms', m.nav.terms)} · ${link('/legal', m.nav.legal)} · <a href="${esc(config.sourceUrl)}">${esc(m.nav.source)}</a>
</footer>
</body>
</html>`;
}

export const STYLE = `
:root { color-scheme: light dark; --bg: #fdfcf8; --text: #1d1d1b; --muted: #5b5b57; --accent: #3d5570; --border: #d9d6cc; }
@media (prefers-color-scheme: dark) { :root { --bg: #17191a; --text: #ecebe6; --muted: #a9a8a2; --accent: #9db4cc; --border: #3a3d3f; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 18px/1.55 Georgia, 'Times New Roman', serif; }
header, main, footer { max-width: 40rem; margin: 0 auto; padding: 1rem; }
header { border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
header nav { font-size: .9rem; }
.brand { font-weight: bold; color: var(--text); text-decoration: none; letter-spacing: .02em; display: inline-flex; align-items: center; gap: .5rem; }
.brand picture { display: contents; }
.mark { width: 1.75rem; height: 1.75rem; flex: none; }
footer { border-top: 1px solid var(--border); margin-top: 3rem; font-size: .9rem; color: var(--muted); }
a { color: var(--accent); }
h1 { font-size: 1.6rem; line-height: 1.25; }
.muted { color: var(--muted); font-size: .95rem; }
.entries { list-style: none; padding: 0; }
.entries li { border-left: 3px solid var(--border); padding: .2rem 0 .2rem .8rem; margin-bottom: 1rem; }
.entries .title { font-weight: bold; }
form { margin: 1.5rem 0; }
label { display: block; margin: .8rem 0 .3rem; font-weight: bold; }
input[type=email], input[type=url], input[type=text] { width: 100%; font: inherit; padding: .5rem; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: inherit; }
fieldset { border: 1px solid var(--border); border-radius: 4px; margin: 1rem 0; }
fieldset label { display: inline; font-weight: normal; }
button { font: inherit; padding: .5rem 1.2rem; border: 0; border-radius: 4px; background: var(--accent); color: var(--bg); cursor: pointer; margin-top: 1rem; }
button.quiet { background: transparent; color: var(--accent); border: 1px solid var(--accent); padding: .2rem .7rem; margin: 0; }
.error { border-left: 4px solid #b3261e; padding: .5rem 1rem; background: rgba(179,38,30,.08); }
pre { white-space: pre-wrap; word-break: break-all; background: rgba(127,127,127,.12); padding: .8rem; border-radius: 4px; font-size: .85rem; }
table { border-collapse: collapse; width: 100%; }
td, th { text-align: left; padding: .5rem .3rem; border-bottom: 1px solid var(--border); vertical-align: top; }
td form { margin: 0; display: inline; }
select { font: inherit; }
textarea { width: 100%; min-height: 6rem; font: inherit; padding: .5rem; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: inherit; }
.publisher { border-left: 3px solid var(--accent); padding: .3rem 0 .3rem .8rem; }
.notice { border-left: 4px solid var(--accent); padding: .5rem 1rem; }
.check { margin-top: .8rem; }
.lead { font-size: 1.1rem; }
.steps { padding-left: 1.4rem; }
.steps li, .promises li { margin-bottom: .5rem; }
.cta { display: inline-block; padding: .5rem 1.2rem; border: 1px solid var(--accent); border-radius: 4px; text-decoration: none; }
.faq dt { font-weight: bold; margin-top: 1rem; }
.faq dd { margin: .2rem 0 0; }
.check label { display: inline; font-weight: normal; }
code.proof { word-break: break-all; }
`;

export function homePage(p: Page): string {
  const { m, config } = p;
  const h = m.home;
  return layout(p, m.homeTitle, `
<h1>${esc(m.homeHeading)}</h1>
<p class="lead">${esc(m.homeIntro(config.serviceName))}</p>
${feedUrlForm(p, '')}
<h2>${esc(h.stepsHeading)}</h2>
<ol class="steps">${h.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
<h2>${esc(h.promisesHeading)}</h2>
<ul class="promises">${h.promises.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<h2>${esc(h.publishersHeading)}</h2>
<p>${esc(h.publishersText(config.serviceName))}</p>
<p><a class="cta" href="${esc(withLang('/publishers', p.locale))}">${esc(h.publishersCta)}</a></p>
<h2>${esc(h.faqHeading)}</h2>
<dl class="faq">${h.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl>`);
}

export function feedUrlForm(p: Page, value: string, error?: string): string {
  return `<form action="/s" method="get">
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
${langInput(p)}
<label for="feed">${esc(p.m.feedUrlLabel)}</label>
<input id="feed" name="feed" type="url" inputmode="url" required placeholder="https://example.org/feed.xml" value="${esc(value)}">
<button type="submit">${esc(p.m.feedUrlButton)}</button>
</form>`;
}

export function latestEntries(feed: ParsedFeed, n: number): ParsedEntry[] {
  const entries = [...feed.entries];
  if (entries.every((e) => e.published)) entries.sort((a, b) => (b.published as Date).getTime() - (a.published as Date).getTime());
  return entries.slice(0, n);
}

export interface PublisherBranding {
  name: string;
  welcome_text: string;
  domain: string;
}

export function subscribePage(
  p: Page, feedUrl: string, feed: ParsedFeed,
  opts: { email?: string; cadence?: string; error?: string; publisher?: PublisherBranding | null } = {},
): string {
  const { m, config, locale } = p;
  const entries = latestEntries(feed, 3);
  const cadence = (CADENCES as string[]).includes(opts.cadence ?? '') ? (opts.cadence as Cadence) : 'immediate';
  const pub = opts.publisher;
  return layout(p, m.subscribeTitle(feed.title), `
<h1>${esc(feed.title)}</h1>
${pub ? `<div class="publisher"><p><strong>${esc(m.publishedBy(pub.name || pub.domain))}</strong> <span class="muted">(${esc(m.verifiedDomain(pub.domain))})</span></p>
${pub.welcome_text ? pub.welcome_text.split(/\n{2,}/).map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('\n') : ''}</div>` : ''}
${feed.description ? `<p>${esc(truncate(feed.description, 400))}</p>` : ''}
<p class="muted">${esc(m.label(m.feedLabel))} <a href="${esc(feedUrl)}">${esc(feedUrl)}</a>${feed.siteUrl ? ` · ${esc(m.label(m.siteLabel))} <a href="${esc(feed.siteUrl)}">${esc(hostOf(feed.siteUrl))}</a>` : ''}</p>

<h2>${esc(m.latestHeading)}</h2>
${entries.length === 0 ? `<p>${esc(m.noEntries)}</p>` : `<ul class="entries">
${entries.map((e) => `<li><span class="title">${e.link ? `<a href="${esc(e.link)}">${esc(e.title || m.untitled)}</a>` : esc(e.title || m.untitled)}</span>
${e.published ? `<br><span class="muted">${esc(formatDate(locale, config.timeZone, e.published))}</span>` : ''}
${e.summary ? `<br>${esc(truncate(e.summary, 240))}` : ''}</li>`).join('\n')}
</ul>`}

<h2>${esc(m.receiveHeading)}</h2>
<form action="/s" method="post">
${opts.error ? `<p class="error" role="alert">${esc(opts.error)}</p>` : ''}
<input type="hidden" name="feed" value="${esc(feedUrl)}">
${langInput(p)}
<label for="email">${esc(m.emailLabel)}</label>
<input id="email" name="email" type="email" autocomplete="email" required value="${esc(opts.email)}">
<fieldset>
<legend>${esc(m.cadenceLegend)}</legend>
${CADENCES.map((c) => `<div><input type="radio" id="c-${c}" name="cadence" value="${c}"${c === cadence ? ' checked' : ''}> <label for="c-${c}">${esc(capitalize(m.cadence[c]))}</label></div>`).join('\n')}
</fieldset>
<button type="submit">${esc(m.subscribeButton)}</button>
</form>
<p class="muted">${esc(m.subscribeNotice(config.pendingTtlDays))} <a href="${esc(withLang('/privacy', locale))}">${esc(m.privacyLink)}</a>.
${esc(m.subscribeTerms)} <a href="${esc(withLang('/terms', locale))}">${esc(m.termsLink)}</a>.</p>`);
}

export function chooseFeedPage(p: Page, candidates: DiscoveredFeed[]): string {
  const { m, locale } = p;
  return layout(p, m.chooseTitle, `
<h1>${esc(m.chooseHeading)}</h1>
<p>${esc(m.chooseText)}</p>
<ul class="entries">
${candidates.map((c) => `<li><span class="title"><a href="${esc(withLang(`/s?feed=${encodeURIComponent(c.url)}`, locale))}">${esc(c.title || m.chooseUntitled)}</a></span><br><span class="muted">${esc(c.url)}</span></li>`).join('\n')}
</ul>`);
}

export function feedErrorPage(p: Page, feedUrl: string, message: string): string {
  const { m, config } = p;
  return layout(p, m.feedErrorTitle, `
<h1>${esc(m.feedErrorHeading)}</h1>
<p class="error" role="alert">${esc(message)}</p>
<p>${esc(m.feedErrorHelp(config.serviceName))}</p>
${feedUrlForm(p, feedUrl)}`);
}

export function checkMailboxPage(p: Page): string {
  const { m } = p;
  return layout(p, m.checkMailboxTitle, `
<h1>${esc(m.checkMailboxHeading)}</h1>
<p>${esc(m.checkMailboxText)}</p>
<p class="muted">${esc(m.checkMailboxNote)}</p>`);
}

export function confirmPage(p: Page, action: string, feedTitle: string, cadence: Cadence): string {
  const { m } = p;
  return layout(p, m.confirmTitle, `
<h1>${esc(m.confirmHeading)}</h1>
<p>${esc(m.confirmText(feedTitle, m.cadence[cadence]))}</p>
<form action="${esc(action)}" method="post">${langInput(p)}<button type="submit">${esc(m.confirmButton)}</button></form>
<p class="muted">${esc(m.confirmNote)}</p>`);
}

export function confirmedPage(p: Page, feedTitle: string, unsubscribeUrl: string): string {
  const { m } = p;
  return layout(p, m.confirmedTitle, `
<h1>${esc(m.confirmedHeading)}</h1>
<p>${esc(m.confirmedText(feedTitle))}</p>
<p class="muted">${esc(m.confirmedManage)} <a href="${esc(withLang('/account', p.locale))}">${esc(m.nav.account)}</a>
· <a href="${esc(unsubscribeUrl)}">${esc(m.confirmedUnsubscribe)}</a>.</p>`);
}

export function unsubscribePage(p: Page, action: string, feedTitle: string): string {
  const { m } = p;
  return layout(p, m.unsubscribeTitle, `
<h1>${esc(m.unsubscribeHeading)}</h1>
<p>${esc(m.unsubscribeText(feedTitle))}</p>
<form action="${esc(action)}" method="post">${langInput(p)}<button type="submit">${esc(m.unsubscribeButton)}</button></form>`);
}

export function stopDigestPage(p: Page, action: string, kind: 'daily' | 'weekly', feeds: string[]): string {
  const { m } = p;
  return layout(p, m.stopDigestTitle(kind), `
<h1>${esc(m.stopDigestTitle(kind))}</h1>
<p>${esc(m.stopDigestText(kind, feeds.length))}</p>
<ul>${feeds.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<form action="${esc(action)}" method="post">${langInput(p)}<button type="submit">${esc(m.stopDigestButton)}</button></form>
<p class="muted">${esc(m.stopDigestOther)} <a href="${esc(withLang('/account', p.locale))}">${esc(m.nav.account)}</a>.</p>`);
}

export function stoppedDigestPage(p: Page): string {
  const { m } = p;
  return layout(p, m.unsubscribedTitle, `
<h1>${esc(m.unsubscribedHeading)}</h1>
<p>${esc(m.stoppedDigestText)}</p>
<p class="muted">${esc(m.unsubscribedNote)}</p>`);
}

export function unsubscribedPage(p: Page): string {
  const { m } = p;
  return layout(p, m.unsubscribedTitle, `
<h1>${esc(m.unsubscribedHeading)}</h1>
<p>${esc(m.unsubscribedText)}</p>
<p class="muted">${esc(m.unsubscribedNote)}</p>`);
}

export function messagePage(p: Page, title: string, message: string): string {
  return layout(p, title, `<h1>${esc(title)}</h1><p>${esc(message)}</p>`);
}

export function accountRequestPage(p: Page, error?: string): string {
  const { m } = p;
  return layout(p, m.accountTitle, `
<h1>${esc(m.accountTitle)}</h1>
<p>${esc(m.accountRequestText)}</p>
<form action="/account" method="post">
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
${langInput(p)}
<label for="email">${esc(m.emailLabel)}</label>
<input id="email" name="email" type="email" autocomplete="email" required>
<button type="submit">${esc(m.accountRequestButton)}</button>
</form>`);
}

export function accountLinkSentPage(p: Page): string {
  return layout(p, p.m.accountSentTitle, `
<h1>${esc(p.m.checkMailboxHeading)}</h1>
<p>${esc(p.m.accountSentText)}</p>`);
}

export function accountPage(p: Page, action: string, email: string, subs: SubscriptionListItem[]): string {
  const { m } = p;
  const hidden = (name: string, value: string | number) => `<input type="hidden" name="${name}" value="${esc(String(value))}">`;
  return layout(p, m.accountTitle, `
<h1>${esc(m.accountTitle)}</h1>
<p class="muted">${esc(m.accountAddress(email))}</p>
${subs.length === 0 ? `<p>${esc(m.accountNone)}</p>` : `<table>
<thead><tr><th>${esc(m.accountColFeed)}</th><th>${esc(m.accountColCadence)}</th><th>${esc(m.accountColWhen)}</th><th></th></tr></thead>
<tbody>
${subs.map((s) => `<tr>
<td><a href="${esc(s.site_url ?? s.feed_url)}">${esc(s.feed_title)}</a>${s.status === 'pending' ? `<br><span class="muted">${esc(m.accountPending)}</span>` : ''}</td>
<td><form action="${esc(action)}" method="post">
${hidden('action', 'cadence')}${hidden('subscription', s.id)}${langInput(p)}
<select name="cadence" aria-label="${esc(m.accountCadenceAria(s.feed_title))}">${CADENCES.map((c) => `<option value="${c}"${c === s.cadence ? ' selected' : ''}>${esc(m.cadence[c])}</option>`).join('')}</select>
<button class="quiet" type="submit">${esc(m.accountChange)}</button></form></td>
<td>${s.cadence === 'immediate' ? `<span class="muted">${esc(m.accountAsPublished)}</span>` : scheduleForm(p, action, s)}</td>
<td><form action="${esc(action)}" method="post">
${hidden('action', 'stop')}${hidden('subscription', s.id)}${langInput(p)}
<button class="quiet" type="submit">${esc(m.accountStop)}</button></form></td>
</tr>`).join('\n')}
</tbody></table>`}
<h2>${esc(m.accountDeleteHeading)}</h2>
<form action="${esc(action)}" method="post">
${hidden('action', 'delete-all')}${langInput(p)}
<p>${esc(m.accountDeleteText)}</p>
<button type="submit">${esc(m.accountDeleteButton)}</button>
</form>`);
}

/** Digest hour (and day, for weekly digests), chosen by the subscriber. */
function scheduleForm(p: Page, action: string, s: SubscriptionListItem): string {
  const { m, config } = p;
  const hour = s.digest_hour ?? config.digestHour;
  const weekday = s.digest_weekday ?? config.digestWeekday;
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === hour ? ' selected' : ''}>${esc(m.atHour(h))}</option>`).join('');
  const days = m.weekdays.map((d, i) => `<option value="${i + 1}"${i + 1 === weekday ? ' selected' : ''}>${esc(m.onWeekday(d))}</option>`).join('');
  return `<form action="${esc(action)}" method="post">
<input type="hidden" name="action" value="schedule"><input type="hidden" name="subscription" value="${s.id}">${langInput(p)}
${s.cadence === 'weekly' ? `<select name="day" aria-label="${esc(m.accountDayAria(s.feed_title))}">${days}</select>` : ''}
<select name="hour" aria-label="${esc(m.accountHourAria(s.feed_title))}">${hours}</select>
<button class="quiet" type="submit">${esc(m.accountChange)}</button></form>`;
}

/** The publisher's button: their colour, their readers' language. */
export interface ButtonOptions {
  readers: Locale | null;
  color: string;
}
export const DEFAULT_BUTTON_COLOR = '#3d5570';

const ENVELOPE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';

/** Inline style of the button: self-contained, so it works on any page. Text colour follows the background's lightness. */
export function buttonStyle(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const light = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.18;
  return `display:inline-flex;align-items:center;gap:.5em;padding:.6em 1.1em;border-radius:6px;background:${color};color:${light ? '#111111' : '#ffffff'};font:600 15px/1.2 system-ui,sans-serif;text-decoration:none`;
}

export function buttonCode(config: Config, feedUrl: string, opts: ButtonOptions): { link: string; linkHtml: string; buttonHtml: string } {
  const link = `${config.baseUrl}/s?feed=${encodeURIComponent(feedUrl)}${opts.readers ? `&lang=${opts.readers}` : ''}`;
  const label = messages(opts.readers ?? 'en').publishersLinkText;
  return {
    link,
    linkHtml: `<a href="${esc(link)}">${esc(label)}</a>`,
    buttonHtml: `<a href="${esc(link)}" style="${buttonStyle(opts.color)}">${ENVELOPE}${esc(label)}</a>`,
  };
}

export function publishersPage(p: Page, feedUrl: string | null, error?: string, button: ButtonOptions = { readers: null, color: DEFAULT_BUTTON_COLOR }): string {
  const { m, config } = p;
  const code = feedUrl ? buttonCode(config, feedUrl, { ...button, readers: button.readers ?? null }) : null;
  const readersOption = (value: string, label: string) => `<option value="${value}"${(button.readers ?? '') === value ? ' selected' : ''}>${esc(label)}</option>`;
  return layout(p, m.publishersTitle, `
<h1>${esc(m.publishersHeading)}</h1>
<p>${esc(m.publishersIntro(config.serviceName))}</p>
<form action="/publishers" method="get">
${langInput(p)}
<label for="feed">${esc(m.publishersFeedLabel)}</label>
<input id="feed" name="feed" type="url" required value="${esc(feedUrl)}">
<label for="readers">${esc(m.publishersReadersLabel)}</label>
<select id="readers" name="readers">${readersOption('', m.publishersReadersAuto)}${LOCALES.map((l) => readersOption(l, messages(l).langName)).join('')}</select>
<label for="color">${esc(m.publishersColorLabel)}</label>
<input id="color" name="color" type="color" value="${esc(button.color)}">
<button type="submit">${esc(m.publishersButton)}</button>
</form>
${code ? `<h2 id="button">${esc(m.publishersButtonHeading)}</h2>
<p>${esc(m.publishersPreview)} ${code.buttonHtml}</p>
<label for="code-button">${esc(m.publishersButtonCode)}</label>
<textarea id="code-button" readonly rows="4">${esc(code.buttonHtml)}</textarea>
<h2>${esc(m.publishersLinkHeading)}</h2>
<textarea id="code-link" readonly rows="2" aria-label="${esc(m.publishersLinkHeading)}">${esc(code.linkHtml)}</textarea>
<p class="muted">${esc(m.publishersCopy)}</p>
<p>${esc(m.publishersTry)} <a href="${esc(code.link)}">${esc(m.publishersLinkText)}</a></p>` : ''}
<h2>${esc(m.publishersTipsHeading)}</h2>
<ul>
${m.publishersTips(config.serviceName, config.pollIntervalMinutes).map((t) => `<li>${esc(t)}</li>`).join('\n')}
</ul>
<h2 id="space">${esc(m.publisherSignInHeading)}</h2>
<p>${esc(m.publisherSignInText)}</p>
<form action="/publishers" method="post">
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
${langInput(p)}
<label for="pub-email">${esc(m.emailLabel)}</label>
<input id="pub-email" name="email" type="email" autocomplete="email" required>
<div class="check"><input id="pub-terms" name="terms" type="checkbox" value="1" required> <label for="pub-terms">${esc(m.publisherTermsLabel)}</label> (<a href="${esc(withLang('/terms', p.locale))}">${esc(m.nav.terms)}</a>)</div>
<button type="submit">${esc(m.publisherSignInButton)}</button>
</form>`);
}

export function publisherSentPage(p: Page): string {
  return layout(p, p.m.publisherTitle, `<h1>${esc(p.m.checkMailboxHeading)}</h1>\n<p>${esc(p.m.publisherSentText)}</p>`);
}

export function publisherPage(
  p: Page, action: string, publisher: PublisherRow, domains: DomainRow[], stats: FeedStats[], result: string | null,
): string {
  const { m, config, locale } = p;
  const hidden = (name: string, value: string | number) => `<input type="hidden" name="${name}" value="${esc(String(value))}">`;
  const count = (n: number) => (n < COUNT_FLOOR ? m.publisherFewer(COUNT_FLOOR) : String(n));
  // Per cadence only when no column holds a small number: otherwise it could be worked out
  // from the total and the other columns.
  const breakdown = (s: FeedStats): string[] => {
    const cells = [s.immediate, s.daily, s.weekly];
    return cells.every((n) => n === 0 || n >= COUNT_FLOOR) ? cells.map(String) : cells.map(() => '—');
  };
  const notice = result && Object.hasOwn(m.publisherResult, result) ? `<p class="notice" role="status">${esc(m.publisherResult[result])}</p>` : '';
  return layout(p, m.publisherTitle, `
<h1>${esc(m.publisherTitle)}</h1>
<p class="muted">${esc(m.publisherSignedIn(publisher.email, m.planNames[publisher.plan]))}</p>
${notice}

<h2>${esc(m.publisherProfileHeading)}</h2>
<form action="${esc(action)}" method="post">
${hidden('action', 'profile')}${langInput(p)}
<label for="name">${esc(m.publisherNameLabel)}</label>
<input id="name" name="name" type="text" maxlength="${NAME_MAX}" value="${esc(publisher.name)}">
<label for="welcome">${esc(m.publisherWelcomeLabel)}</label>
<textarea id="welcome" name="welcome" maxlength="${WELCOME_MAX}">${esc(publisher.welcome_text)}</textarea>
<p class="muted">${esc(m.publisherProfileHint)}</p>
<button type="submit">${esc(m.publisherSave)}</button>
</form>

<h2>${esc(m.publisherDomainsHeading)}</h2>
${domains.length === 0 ? `<p>${esc(m.publisherNoDomain)}</p>` : domains.map((d) => `<div class="publisher">
<p><strong>${esc(d.domain)}</strong> — ${d.verified_at ? esc(m.publisherVerified(d.method ?? 'file', formatDate(locale, config.timeZone, d.verified_at))) : esc(m.publisherNotVerified)}</p>
${d.verified_at ? '' : `<p>${esc(m.publisherProofIntro(d.domain))}</p>
<ul>
<li>${esc(m.publisherProofFile)} <code class="proof">${esc(verificationFileUrl(d))}</code><br><code class="proof">${esc(verificationRecord(d))}</code></li>
<li>${esc(m.publisherProofDns)} <code class="proof">${esc(verificationDnsName(d))}</code> ${esc(m.publisherProofDnsValue)} <code class="proof">${esc(verificationRecord(d))}</code></li>
</ul>`}
<form action="${esc(action)}" method="post">${hidden('action', 'verify')}${hidden('domain', d.id)}${langInput(p)}<button class="quiet" type="submit">${esc(m.publisherCheck)}</button></form>
<form action="${esc(action)}" method="post">${hidden('action', 'remove')}${hidden('domain', d.id)}${langInput(p)}<button class="quiet" type="submit">${esc(m.publisherRemove)}</button></form>
</div>`).join('\n')}
<form action="${esc(action)}" method="post">
${hidden('action', 'add')}${langInput(p)}
<label for="domain">${esc(m.publisherDomainLabel)}</label>
<input id="domain" name="domain" type="text" required>
<button type="submit">${esc(m.publisherAddDomain)}</button>
</form>

<h2>${esc(m.publisherFeedsHeading)}</h2>
${stats.length === 0 ? `<p>${esc(m.publisherNoFeeds)}</p>` : `<table>
<thead><tr><th>${esc(m.publisherColFeed)}</th>${CADENCES.map((c) => `<th>${esc(m.cadenceShort[c])}</th>`).join('')}<th>${esc(m.publisherColTotal)}</th></tr></thead>
<tbody>
${stats.map((s) => `<tr><td><a href="${esc(s.url)}">${esc(s.title || s.url)}</a><br><a class="muted" href="${esc(withLang(`/publishers?feed=${encodeURIComponent(s.url)}`, locale))}#button">${esc(m.publishersButtonCode)}</a></td>${breakdown(s).map((c) => `<td>${esc(c)}</td>`).join('')}<td><strong>${esc(count(s.total))}</strong></td></tr>`).join('\n')}
</tbody></table>`}
<p class="muted">${esc(m.publisherCountsNote(COUNT_FLOOR))}</p>

<h2>${esc(m.publisherDeleteHeading)}</h2>
<form action="${esc(action)}" method="post">
${hidden('action', 'delete')}${langInput(p)}
<p>${esc(m.publisherDeleteText)}</p>
<button type="submit">${esc(m.publisherDeleteButton)}</button>
</form>`);
}

export function robotPage(p: Page): string {
  const { m, config } = p;
  return layout(p, m.robotTitle, `
<h1>${esc(m.robotHeading)}</h1>
<p>${esc(m.robotIntro(config.serviceName))}</p>
<pre>User-Agent: ${esc(config.userAgent)}</pre>
<ul>
${m.robotPoints(config.minPollIntervalMinutes, config.maxPollIntervalMinutes).map((t) => `<li>${esc(t)}</li>`).join('\n')}
</ul>
<p>${esc(m.robotContact)} <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>.</p>`);
}

export function termsPage(p: Page): string {
  const { m, config, locale } = p;
  const sections = m.termsSections({ service: config.serviceName, operator: config.operatorName, contact: config.contactEmail });
  return layout(p, m.termsTitle, `<h1>${esc(m.termsTitle)}</h1>
<p class="muted">${esc(m.termsUpdated(formatDate(locale, config.timeZone, TERMS_DATE)))}</p>
${renderSections(sections)}`);
}

export function privacyPage(p: Page): string {
  const { m, config } = p;
  const sections = m.privacySections({
    operator: config.operatorName, contact: config.contactEmail, processors: config.processors,
    pendingDays: config.pendingTtlDays, suspendedDays: config.suspendedTtlDays,
  });
  return layout(p, m.privacyTitle, `<h1>${esc(m.privacyTitle)}</h1>\n${renderSections(sections)}`);
}

export function legalPage(p: Page): string {
  const { m, config, locale } = p;
  const l = config.legal;
  const capital = l.capitalEur
    ? new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(l.capitalEur)
    : '';
  const sections = m.legalSections({
    service: config.serviceName, company: l.company, capital, address: l.address, registration: l.registration,
    siret: l.siret, vat: l.vat, director: l.director, contact: config.contactEmail,
    hostName: l.hostName, hostAddress: l.hostAddress, hostPhone: l.hostPhone, sourceUrl: config.sourceUrl,
  }).filter((s) => (s.items ?? []).length > 0 || (s.paragraphs ?? []).length > 0);
  return layout(p, m.legalTitle, `<h1>${esc(m.legalTitle)}</h1>\n${renderSections(sections)}`);
}

function renderSections(sections: Section[]): string {
  return sections.map((s) => `<h2>${esc(s.heading)}</h2>
${(s.paragraphs ?? []).map((t) => `<p>${esc(t)}</p>`).join('\n')}
${s.items ? `<ul>${s.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`).join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
