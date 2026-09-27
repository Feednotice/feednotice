// English messages: the reference catalog. Plain text only; views and email templates escape it.

import type { FetchErrorCode } from '../feed/fetch.ts';
import type { FeedParseErrorCode } from '../feed/parse.ts';

export type FeedErrorCode = FetchErrorCode | FeedParseErrorCode | 'unexpected' | 'no-feed-found' | 'several-feeds';

export interface LegalParams {
  service: string;
  company: string;
  /** Share capital, already formatted for the language. */
  capital: string;
  address: string;
  registration: string;
  siret: string;
  vat: string;
  director: string;
  contact: string;
  hostName: string;
  hostAddress: string;
  hostPhone: string;
  sourceUrl: string;
}

export interface Section {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

const feedErrors: Record<FeedErrorCode, string> = {
  'invalid-url': 'this address is not valid.',
  'bad-scheme': 'only http and https addresses are accepted.',
  credentials: 'addresses containing a user name or password are not accepted.',
  'private-address': 'this address points to a private network.',
  'too-many-redirects': 'the server redirects too many times.',
  'no-location': 'the server sent an incomplete redirect.',
  'http-status': 'the server answered with an error.',
  'too-large': 'the feed is too large (more than 5 MB).',
  interrupted: 'the transfer was interrupted.',
  timeout: 'the server took too long to answer.',
  connect: 'the server could not be reached.',
  entities: 'the document declares XML entities, which are refused for safety.',
  malformed: 'the document is not well-formed XML.',
  'not-a-feed': 'this document is neither an Atom nor an RSS feed.',
  unexpected: 'the server gave an unexpected answer.',
  'no-feed-found': 'this page does not announce any Atom or RSS feed.',
  'several-feeds': 'this page announces several feeds.',
};

export const en = {
  langName: 'English',
  /** "Label: value" (French puts a space before the colon). */
  label: (label: string) => `${label}:`,

  // Layout
  nav: { privacy: 'Your data', account: 'My subscriptions', publishers: 'Publishers', robot: 'The robot', legal: 'Legal notice', source: 'Source code' },
  languageSwitch: 'Language',

  // Cadences and weekdays
  cadence: {
    immediate: 'one email per new item',
    daily: 'a daily digest',
    weekly: 'a weekly digest',
  },
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  onWeekday: (day: string) => `on ${day}`,
  atHour: (h: number) => `${String(h).padStart(2, '0')}:00`,

  // Home
  homeTitle: 'Get a feed by email',
  homeHeading: "A website's updates, in your inbox",
  homeIntro: (service: string) =>
    `Many websites publish an Atom or RSS feed: the list of their latest posts. ${service} emails them to you, as often as you like. No account, no password, no ads, no tracking.`,
  feedUrlLabel: 'Feed or website address',
  feedUrlButton: 'Show this feed',
  homePublishersPrefix: 'You publish a website? Put a "Get updates by email" link next to your feed:',
  homePublishersLink: "here's how",

  // Subscribe page
  subscribeTitle: (feed: string) => `Subscribe to ${feed}`,
  feedLabel: 'Feed',
  siteLabel: 'Website',
  latestHeading: 'Latest items',
  noEntries: 'This feed has no items yet.',
  untitled: 'Untitled',
  receiveHeading: 'Get the next ones by email',
  emailLabel: 'Your email address',
  cadenceLegend: 'How often',
  subscribeButton: 'Get updates',
  subscribeNotice: (days: number) =>
    `We will send you an email with a confirmation link. Until you click it, nothing else will be sent to you, and your address will be erased after ${days} days. Your address is only used for these emails:`,
  privacyLink: 'what we do with it',

  // Errors
  feedErrorTitle: 'Feed not readable',
  feedErrorHeading: 'This feed cannot be read',
  feedError: (code: FeedErrorCode) => `This feed cannot be read: ${feedErrors[code] ?? feedErrors.unexpected}`,
  chooseTitle: 'Choose a feed',
  chooseHeading: 'This page offers several feeds',
  chooseText: 'Which one would you like to receive by email?',
  chooseUntitled: 'Feed without a title',
  feedErrorHelp: (service: string) =>
    `${service} accepts Atom and RSS feeds. Check the address: it often ends with .xml, /feed, /rss or /atom.`,
  invalidFeedUrl: 'The feed address is not valid.',
  invalidEmail: "This email address doesn't look valid.",
  chooseCadence: 'Choose how often.',
  tooManyTitle: 'Too many requests',
  tooManyText: 'Please try again in an hour.',
  errorTitle: 'Error',
  errorText: 'Something went wrong. Please try again in a moment.',
  notFoundTitle: 'Page not found',
  notFoundText: 'This page does not exist.',
  expiredTitle: 'Link expired',
  confirmExpiredText: 'This link is no longer valid. Start the subscription again from the website that brought you here.',
  invalidUnsubscribeTitle: 'Invalid link',
  invalidUnsubscribeText: 'This unsubscribe link is not valid.',
  manageExpiredText: 'This link is no longer valid. Ask for a new one from "My subscriptions".',

  // After subscribing
  checkMailboxTitle: 'Check your inbox',
  checkMailboxHeading: 'Check your inbox',
  checkMailboxText: 'If the address is valid, a confirmation email is on its way. Open the link it contains to confirm the subscription. Remember to look in your spam folder.',
  checkMailboxNote: 'Nothing will be sent to you until you confirm.',

  // Confirmation
  confirmTitle: 'Confirm',
  confirmHeading: 'Confirm your subscription',
  confirmText: (feed: string, cadence: string) => `You will receive the updates of "${feed}": ${cadence}.`,
  confirmButton: 'Confirm',
  confirmNote: 'This button prevents software that opens the links in your emails (an antivirus, for example) from confirming on your behalf.',
  confirmedTitle: 'Subscription confirmed',
  confirmedHeading: 'Done',
  confirmedText: (feed: string) => `You will receive the next updates of "${feed}". Every email contains a one-click unsubscribe link.`,
  confirmedManage: 'To change how often or stop:',
  confirmedUnsubscribe: 'unsubscribe',

  // Unsubscribe
  unsubscribeTitle: 'Unsubscribe',
  unsubscribeHeading: 'Unsubscribe',
  unsubscribeText: (feed: string) => `Stop receiving the updates of "${feed}"?`,
  unsubscribeButton: 'Unsubscribe me',
  unsubscribedTitle: 'Unsubscribed',
  unsubscribedHeading: 'You are unsubscribed',
  unsubscribedText: 'You will receive nothing more for this feed. If it was your last subscription, your address has been erased.',
  unsubscribedNote: 'A mistake? Just subscribe again from the original website.',

  // Account
  accountTitle: 'My subscriptions',
  accountRequestText: 'No password: enter your address and you will receive a link, valid for 24 hours, that opens your subscriptions.',
  accountRequestButton: 'Send me the link',
  accountSentTitle: 'Link sent',
  accountSentText: 'If this address is subscribed to at least one feed, a link to your subscriptions has just been sent to it.',
  accountAddress: (email: string) => `Address: ${email}`,
  accountNone: 'No subscriptions.',
  accountColFeed: 'Feed',
  accountColCadence: 'How often',
  accountColWhen: 'When',
  accountPending: 'awaiting confirmation',
  accountAsPublished: 'as soon as published',
  accountChange: 'Change',
  accountStop: 'Stop',
  accountCadenceAria: (feed: string) => `How often for ${feed}`,
  accountHourAria: (feed: string) => `Digest time for ${feed}`,
  accountDayAria: (feed: string) => `Digest day for ${feed}`,
  accountDeleteHeading: 'Stop everything',
  accountDeleteText: 'Deletes all your subscriptions and erases your address. Immediate and final.',
  accountDeleteButton: 'Stop everything and erase my address',
  accountErasedTitle: 'Address erased',
  accountErasedText: 'All your subscriptions are stopped and your address is erased.',

  // Publishers
  publishersTitle: 'Publishers',
  publishersHeading: 'Offer your updates by email',
  publishersIntro: (service: string) =>
    `Not all your readers use a feed reader, but they all have an inbox. Add a link to ${service} next to your feed: no script, no account, nothing to install. No address goes through your website.`,
  publishersFeedLabel: 'Your feed address',
  publishersButton: 'Prepare the link',
  publishersLinkHeading: 'A link',
  publishersButtonHeading: 'Or a button',
  publishersLinkText: 'Get updates by email',
  publishersTry: 'Try it:',
  publishersTipsHeading: 'What your feed gains from containing',
  publishersTips: (service: string, minutes: number): string[] => [
    'a stable identifier per item (<id> in Atom, <guid> in RSS): it prevents duplicate emails;',
    'a link per item, to the page about it;',
    'a plain-text summary: it is what will be read in the email;',
    `ETag or Last-Modified headers honored: ${service} reads your feed about every ${minutes} minutes, once whatever the number of subscribers.`,
  ],


  // Publisher space
  cadenceShort: { immediate: 'Per item', daily: 'Daily', weekly: 'Weekly' },
  planNames: { free: 'Free', pro: 'Pro', business: 'Business' },
  publisherSignInHeading: 'Publisher space',
  publisherSignInText: 'Verify your domain to show your name and a welcome text on the subscribe page of your feeds, and see how many people follow them. No password: we email you a link.',
  publisherSignInButton: 'Email me a sign-in link',
  publisherSentText: 'A sign-in link, valid for 24 hours, has just been sent to this address.',
  publisherTitle: 'Publisher space',
  publisherSignedIn: (email: string, plan: string) => `Signed in as ${email} · ${plan} plan`,
  publisherProfileHeading: 'Your profile',
  publisherNameLabel: 'Name shown to readers',
  publisherWelcomeLabel: 'Welcome text',
  publisherProfileHint: 'Shown on the subscribe page of your feeds once one of your domains is verified.',
  publisherSave: 'Save',
  publisherDomainsHeading: 'Your domains',
  publisherDomainLabel: 'Domain (for example blog.example.org)',
  publisherAddDomain: 'Add',
  publisherNoDomain: 'No domain yet.',
  publisherVerified: (method: string, date: string) => `Verified by ${method === 'dns' ? 'DNS' : 'file'} on ${date}`,
  publisherNotVerified: 'Not verified yet',
  publisherCheck: 'Check now',
  publisherRemove: 'Remove',
  publisherProofIntro: (domain: string) => `Prove that you control ${domain} in one of two ways, then click "Check now":`,
  publisherProofFile: 'publish a file at this address, containing this line:',
  publisherProofDns: 'or add a DNS TXT record named',
  publisherProofDnsValue: 'with the value:',
  publisherResult: {
    verified: 'The domain is verified.',
    failed: 'The proof was not found yet. DNS changes can take a while to appear.',
    invalid: "This doesn't look like a domain name.",
    limit: 'You have reached the maximum number of domains.',
    saved: 'Saved.',
  } as Record<string, string>,
  publisherFeedsHeading: 'Your feeds',
  publisherNoFeeds: 'No feed from your verified domains is followed yet.',
  publisherColFeed: 'Feed',
  publisherColTotal: 'Total',
  publisherFewer: (n: number) => `fewer than ${n}`,
  publisherCountsNote: (n: number) => `Only confirmed subscriptions are counted. Numbers below ${n} are not shown, so nobody can work out who subscribed.`,
  publisherDeleteHeading: 'Delete the publisher space',
  publisherDeleteText: 'Erases your address, profile and domains. Your readers keep their subscriptions.',
  publisherDeleteButton: 'Delete my publisher space',
  publisherDeletedTitle: 'Publisher space deleted',
  publisherDeletedText: 'Your address, profile and domains are erased. Your readers keep their subscriptions.',
  publisherExpiredText: 'This link is no longer valid. Ask for a new one from the Publishers page.',
  publishedBy: (name: string) => `Published by ${name}`,
  verifiedDomain: (domain: string) => `verified domain ${domain}`,

  // Robot
  robotTitle: 'The robot',
  robotHeading: 'The robot that reads your feeds',
  robotIntro: (service: string) =>
    `${service} reads Atom and RSS feeds to email their updates to the people who asked for them. It identifies itself with the header:`,
  robotPoints: (min: number, max: number): string[] => [
    `Each feed is read once per round, whatever the number of subscribers, every ${min} to ${max} minutes.`,
    'It sends If-None-Match and If-Modified-Since, honors Cache-Control: max-age and Retry-After, and backs off when the server answers badly.',
    'It only reads feeds someone is subscribed to, and forgets the ones nobody follows any more.',
    'If your feed announces a WebSub hub (<link rel="hub">), it subscribes to it and reads your feed within a minute of a notification, and only every 6 hours otherwise.',
  ],
  robotContact: 'Questions, or to ask it to stop:',

  // Privacy
  legalTitle: 'Legal notice',
  legalSections: (p: LegalParams): Section[] => [
    {
      heading: 'Publisher',
      items: [
        p.company ? `${p.company}, simplified joint-stock company (SAS)${p.capital ? ` with a share capital of ${p.capital}` : ''}` : '',
        p.address ? `Registered office: ${p.address}` : '',
        p.registration ? `Registration: ${p.registration}` : '',
        p.siret ? `SIRET: ${p.siret}` : '',
        p.vat ? `EU VAT number: ${p.vat}` : '',
        `Contact: ${p.contact}`,
        p.director ? `Publication director: ${p.director}` : '',
      ].filter(Boolean),
    },
    {
      heading: 'Host',
      items: [p.hostName, p.hostAddress, p.hostPhone ? `Phone: ${p.hostPhone}` : ''].filter(Boolean),
    },
    {
      heading: 'Personal data',
      paragraphs: ['What the service collects, why, for how long, and your rights: see "Your data".'],
    },
    {
      heading: 'Source code',
      paragraphs: [`${p.service} is free software under the GNU Affero General Public License, version 3 or later. Its source code is available at ${p.sourceUrl}.`],
    },
    {
      heading: 'Applicable law',
      paragraphs: ['This legal notice is governed by French law. In case of dispute, and after an attempt at amicable resolution, the French courts have sole jurisdiction.'],
    },
  ],

  privacyTitle: 'Your data',
  privacySections: (p: { operator: string; contact: string; processors: string; pendingDays: number; suspendedDays: number }): Section[] => [
    { heading: 'Who is responsible', paragraphs: [`${p.operator}, who can be reached at ${p.contact}.`] },
    {
      heading: 'What is collected',
      paragraphs: [
        'Your email address, and nothing else: no name, no password, no cookie, no tracking of opens or clicks.',
        'We also keep the list of feeds you follow, how often you want them, your language, and the dates you subscribed and confirmed.',
      ],
    },
    {
      heading: 'Why',
      paragraphs: [
        'Only to send you the updates of the feeds you asked for, and the emails the service needs (confirmation, link to your subscriptions).',
        'Legal basis: your consent, given by the double confirmation, which you can withdraw at any time by unsubscribing.',
      ],
    },
    {
      heading: 'Who sees it',
      paragraphs: [
        `No one but the operator and its processors (${p.processors}), who act only on its behalf.`,
        'Feed publishers only see how many subscribers they have, never their addresses. No address is sold, rented or shared. No ads in the emails.',
      ],
    },
    {
      heading: 'How long',
      items: [
        `Without confirmation, the address is erased after ${p.pendingDays} days.`,
        'When you unsubscribe from your last feed, it is erased immediately.',
        `If emails can no longer be delivered (the address does not exist), sending stops and the address is erased after ${p.suspendedDays} days.`,
        'If you report an email as spam, the address is erased; only an encrypted fingerprint is kept so we never write to you again.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        `You can see your subscriptions, change how often you get them, stop them and erase your address at any time from "My subscriptions", or by writing to ${p.contact} for any other right (access, rectification, objection).`,
        'You can also lodge a complaint with your data protection authority (in France, the CNIL: cnil.fr).',
      ],
    },
    {
      heading: 'Technical logs',
      paragraphs: ['To limit abuse, the number of requests per IP address and per email address is counted as fingerprints, erased after two days.'],
    },
  ],

  // Emails
  mail: {
    via: (feed: string, service: string) => `${feed} via ${service}`,
    read: 'Read',
    readOn: (host: string) => `Read on ${host}`,
    footerWhy: (feed: string, url: string) => `You receive this email because this address is subscribed to the updates of "${feed}" (${url}).`,
    footerWhyShort: (feed: string) => `You receive this email because this address is subscribed to the updates of "${feed}".`,
    footerUnsubscribe: 'Unsubscribe in one click',
    footerManage: 'Manage your subscriptions',
    footerNoTracking: (service: string) => `${service} tracks neither the opening of its emails nor the clicks on their links.`,
    digestHeading: { daily: "Today's updates", weekly: "This week's updates", burst: (n: number) => `${n} updates at once` },
    count: (n: number) => (n === 1 ? '1 update' : `${n} updates`),
    confirmSubject: (feed: string) => `Confirm your subscription to "${feed}"`,
    confirmBody: (p: { feed: string; url: string; cadence: string; link: string; days: number; service: string; baseUrl: string; contact: string }) => `Hello,

Someone (you, probably) asked to receive by email the updates of:

  ${p.feed}
  ${p.url}

How often: ${p.cadence}.

To confirm, open this link and click "Confirm":

  ${p.link}

If you did not ask for anything, do nothing: no other email will be sent to you,
and your address will be erased in ${p.days} days.

--
${p.service} — ${p.baseUrl}
Contact: ${p.contact}`,
    alreadySubject: (feed: string) => `You are already subscribed to "${feed}"`,
    alreadyBody: (p: { feed: string; manage: string; service: string; baseUrl: string }) => `Hello,

A new subscription request to the updates of "${p.feed}" was made
for this address, which is already subscribed. Nothing has changed.

To change how often or unsubscribe: ${p.manage}

--
${p.service} — ${p.baseUrl}`,
    publisherSubject: (service: string) => `Your publisher space — ${service}`,
    publisherBody: (p: { link: string; service: string; baseUrl: string }) => `Hello,

Here is the link to your publisher space on ${p.service}. It is valid for 24 hours:

  ${p.link}

If you did not ask for anything, ignore this email: nothing has been created.

-- 
${p.service} — ${p.baseUrl}`,
    manageSubject: (service: string) => `Your access link — ${service}`,
    manageBody: (p: { link: string; service: string; baseUrl: string }) => `Hello,

Here is the link to your subscriptions. It is valid for 24 hours:

  ${p.link}

There you can see your subscriptions, change how often you get them, or stop everything.
If you did not ask for anything, ignore this email.

--
${p.service} — ${p.baseUrl}`,
  },
};

export type Messages = typeof en;
