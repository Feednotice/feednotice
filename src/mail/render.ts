// Email templates. Text first: everything must read without images or HTML.
// The HTML version only adds clickable links: no image, no pixel, no rewritten link.
// Each email is written in the subscriber's language.

import type { Config } from '../config.ts';
import { truncate } from '../feed/text.ts';
import { formatDate, messages, type Locale } from '../i18n/index.ts';
import type { Cadence, EntryRow, FeedRow } from '../model.ts';
import { signToken } from '../tokens.ts';
import type { OutgoingMail } from './mailer.ts';

export function entryLink(entry: Pick<EntryRow, 'link'>, feed: Pick<FeedRow, 'site_url' | 'url'>): string {
  return entry.link ?? feed.site_url ?? feed.url;
}

export function unsubscribeUrl(config: Config, subscriptionId: number): string {
  return `${config.baseUrl}/u/${signToken(config.secret, 'unsubscribe', subscriptionId)}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function htmlParagraphs(text: string): string {
  return text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

function htmlPage(locale: Locale, body: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: Georgia, serif; font-size: 17px; line-height: 1.5; color: #1a1a1a; max-width: 38em; margin: 0 auto; padding: 1em;">
${body}
</body></html>`;
}

/** Common footer of subscription emails. */
function footer(config: Config, locale: Locale, feed: FeedRow, subscriptionId: number): { text: string; html: string } {
  const msg = messages(locale);
  const m = msg.mail;
  const unsub = unsubscribeUrl(config, subscriptionId);
  const manage = `${config.baseUrl}/account?lang=${locale}`;
  const text = [
    '-- ',
    m.footerWhy(feed.title, feed.url),
    `${msg.label(m.footerUnsubscribe)} ${unsub}`,
    `${msg.label(m.footerManage)} ${manage}`,
    m.footerNoTracking(config.serviceName),
  ].join('\n');
  const html = `<hr style="border: 0; border-top: 1px solid #ccc; margin-top: 2em;">
<p style="font-size: 14px; color: #555;">${esc(m.footerWhyShort(feed.title))}<br>
<a href="${esc(unsub)}">${esc(m.footerUnsubscribe)}</a> · <a href="${esc(manage)}">${esc(m.footerManage)}</a><br>
${esc(m.footerNoTracking(config.serviceName))}</p>`;
  return { text, html };
}

/** List headers: one-click unsubscribe (RFC 2369, RFC 8058). */
function listHeaders(config: Config, feed: FeedRow, subscriptionId: number): Record<string, string> {
  const host = new URL(config.baseUrl).hostname;
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(config, subscriptionId)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    // No label: an accented label would get the whole header encoded, identifier included.
    'List-Id': `<feed-${feed.id}.${host}>`,
  };
}

function fromName(config: Config, locale: Locale, feed: FeedRow): string {
  return messages(locale).mail.via(truncate(feed.title, 50), config.serviceName);
}

export function renderEntryMail(config: Config, locale: Locale, feed: FeedRow, entry: EntryRow, to: string, subscriptionId: number): OutgoingMail {
  const msg = messages(locale);
  const m = msg.mail;
  const link = entryLink(entry, feed);
  const date = formatDate(locale, config.timeZone, entry.published_at);
  const summary = truncate(entry.summary, 3000);
  const f = footer(config, locale, feed, subscriptionId);
  const text = [entry.title, date, '', summary, '', `${msg.label(m.read)} ${link}`, '', f.text].filter((l, i) => l !== '' || i > 1).join('\n');
  const html = htmlPage(locale, `<h1 style="font-size: 22px;"><a href="${esc(link)}">${esc(entry.title)}</a></h1>
${date ? `<p style="color: #555;">${esc(date)}</p>` : ''}
${htmlParagraphs(summary)}
<p><a href="${esc(link)}">${esc(m.readOn(hostOf(link)))}</a></p>
${f.html}`);
  return {
    to,
    fromName: fromName(config, locale, feed),
    subject: truncate(entry.title || feed.title, 150),
    text,
    html,
    headers: listHeaders(config, feed, subscriptionId),
  };
}

export type DigestKind = 'burst' | Exclude<Cadence, 'immediate'>;

export function renderDigestMail(config: Config, locale: Locale, feed: FeedRow, entries: EntryRow[], to: string, subscriptionId: number, kind: DigestKind): OutgoingMail {
  const m = messages(locale).mail;
  const n = entries.length;
  const heading = kind === 'burst' ? m.digestHeading.burst(n) : m.digestHeading[kind];
  const f = footer(config, locale, feed, subscriptionId);
  const blocks = entries.map((e) => ({
    e,
    date: formatDate(locale, config.timeZone, e.published_at),
    summary: truncate(e.summary, 400),
    link: entryLink(e, feed),
  }));
  const text = [
    `${heading} — ${feed.title}`,
    '',
    ...blocks.flatMap((b) => [`* ${b.e.title}`, ...(b.date ? [`  ${b.date}`] : []), ...(b.summary ? [indent(b.summary)] : []), `  ${b.link}`, '']),
    f.text,
  ].join('\n');
  const html = htmlPage(locale, `<h1 style="font-size: 22px;">${esc(heading)}</h1>
<p style="color: #555;">${esc(feed.title)}</p>
${blocks.map((b) => `<h2 style="font-size: 18px; margin-bottom: 0.2em;"><a href="${esc(b.link)}">${esc(b.e.title)}</a></h2>
${b.date ? `<p style="color: #555; margin-top: 0;">${esc(b.date)}</p>` : ''}
${b.summary ? htmlParagraphs(b.summary) : ''}`).join('\n')}
${f.html}`);
  return {
    to,
    fromName: fromName(config, locale, feed),
    subject: kind === 'burst' ? `${m.count(n)} — ${truncate(feed.title, 100)}` : `${heading} (${m.count(n)}) — ${truncate(feed.title, 80)}`,
    text,
    html,
    headers: listHeaders(config, feed, subscriptionId),
  };
}

export function renderConfirmationMail(config: Config, locale: Locale, feed: FeedRow, to: string, confirmUrl: string, cadence: Cadence): OutgoingMail {
  const msg = messages(locale);
  return {
    to,
    fromName: config.serviceName,
    subject: msg.mail.confirmSubject(truncate(feed.title, 80)),
    text: msg.mail.confirmBody({
      feed: feed.title, url: feed.url, cadence: msg.cadence[cadence], link: confirmUrl, days: config.pendingTtlDays,
      service: config.serviceName, baseUrl: config.baseUrl, contact: config.contactEmail,
    }),
    headers: { 'Auto-Submitted': 'auto-generated' },
  };
}

export function renderAlreadySubscribedMail(config: Config, locale: Locale, feed: FeedRow, to: string): OutgoingMail {
  const m = messages(locale).mail;
  return {
    to,
    fromName: config.serviceName,
    subject: m.alreadySubject(truncate(feed.title, 80)),
    text: m.alreadyBody({ feed: feed.title, manage: `${config.baseUrl}/account?lang=${locale}`, service: config.serviceName, baseUrl: config.baseUrl }),
    headers: { 'Auto-Submitted': 'auto-generated' },
  };
}

export function renderPublisherLinkMail(config: Config, locale: Locale, to: string, link: string): OutgoingMail {
  const m = messages(locale).mail;
  return {
    to,
    fromName: config.serviceName,
    subject: m.publisherSubject(config.serviceName),
    text: m.publisherBody({ link, service: config.serviceName, baseUrl: config.baseUrl }),
    headers: { 'Auto-Submitted': 'auto-generated' },
  };
}

export function renderManageLinkMail(config: Config, locale: Locale, to: string, manageUrl: string): OutgoingMail {
  const m = messages(locale).mail;
  return {
    to,
    fromName: config.serviceName,
    subject: m.manageSubject(config.serviceName),
    text: m.manageBody({ link: manageUrl, service: config.serviceName, baseUrl: config.baseUrl }),
    headers: { 'Auto-Submitted': 'auto-generated' },
  };
}

function indent(s: string): string {
  return s.split('\n').map((l) => `  ${l}`).join('\n');
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
