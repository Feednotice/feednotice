// Configuration from environment variables (in Docker, from the .env file via compose).

import { readFileSync } from 'node:fs';
import type { Locale } from './i18n/index.ts';
import { isLocale } from './i18n/index.ts';

export interface Config {
  port: number;
  /** Public URL of the service, no trailing slash. */
  baseUrl: string;
  /** Signs links (confirmation, unsubscribe, account). Never change it once in production. */
  secret: string;
  dbPath: string;
  /** The service's public name. Not "FeedNotice": see TRADEMARKS.md. */
  serviceName: string;
  operatorName: string;
  /** Data processors, as announced to subscribers (host, email sending). */
  processors: string;
  contactEmail: string;
  /** Legal notice (French LCEN, art. 6-III): who publishes the site and who hosts it. Empty = not shown. */
  legal: {
    company: string;
    /** Share capital, in euros. */
    capitalEur: number;
    address: string;
    registration: string;
    siret: string;
    vat: string;
    director: string;
    hostName: string;
    hostAddress: string;
    hostPhone: string;
  };
  /** Where the source code is published (AGPL: users of the service are offered the source). */
  sourceUrl: string;
  /** Folder with the operator's logo, favicons and colours (docs/branding.md); empty = neutral. */
  brandDir: string;
  defaultLocale: Locale;
  /** From address of subscription emails. */
  mailFrom: string;
  /** Replies to notifications go to a human, not to the sending server. */
  replyTo: string;
  /** Envelope sender (Return-Path) where bounces come back; empty = mailFrom. */
  bounceAddress: string;
  /** "outbox": emails written to a folder (development); "smtp": the MTA container or a provider. */
  mailTransport: 'outbox' | 'smtp';
  smtp: { host: string; port: number; user: string; pass: string };
  outboxDir: string;
  /** DKIM signing by the application; empty key file = no signature. */
  dkim: { domain: string; selector: string; keyFile: string };
  /** Sending caps (0 = none): useful while warming up a new IP. */
  mailMaxPerHour: number;
  mailMaxPerDay: number;
  /** Confirmation emails per hour, all visitors together: a ceiling on abuse (0 = none). */
  confirmMaxPerHour: number;
  userAgent: string;
  pollIntervalMinutes: number;
  minPollIntervalMinutes: number;
  maxPollIntervalMinutes: number;
  pendingTtlDays: number;
  suspendedTtlDays: number;
  digestHour: number;
  /** Weekly digest day: 1 = Monday … 7 = Sunday. */
  digestWeekday: number;
  timeZone: string;
  /** Above this, new entries from one read go out in a single email. */
  burstLimit: number;
  /** Shared secret for /hooks/* (bounces from the MTA container, provider webhooks). */
  webhookSecret: string;
  /** Operator's address for the daily report and alerts (empty = none). */
  opsEmail: string;
  /** Hour (service time zone) of the daily report. */
  opsReportHour: number;
  /** Nightly local copies of the database: hour, and how many are kept (0 = none). */
  backupHour: number;
  backupKeep: number;
  /** Where the backup container reports (empty = no off-site backup set up). */
  backupStatusDir: string;
  trustProxy: boolean;
  /** Local tests only: allows reading feeds on private addresses. */
  allowPrivateFeeds: boolean;
  runScheduler: boolean;
}

/** This version of the software (package.json). */
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** The upstream source code: the right SOURCE_URL for an unmodified copy. */
export const UPSTREAM_SOURCE = 'https://github.com/Feednotice/feednotice';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = (env.BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
  const serviceName = env.SERVICE_NAME || 'Example Feeds';
  if (!env.SERVICE_NAME && env.NODE_ENV === 'production') throw new Error('SERVICE_NAME must be set: the name of your service (see TRADEMARKS.md).');
  const contactEmail = env.CONTACT_EMAIL ?? 'contact@example.org';
  const secret = env.SECRET ?? '';
  if (secret.length < 32 && env.NODE_ENV === 'production') throw new Error('SECRET must be at least 32 characters.');
  const mailFrom = env.MAIL_FROM ?? `updates@${new URL(baseUrl).hostname}`;
  const mailDomain = mailFrom.split('@')[1] ?? '';
  return {
    port: int(env.PORT, 8080),
    baseUrl,
    secret: secret || 'dev-secret-dev-secret-dev-secret-dev',
    dbPath: env.DB_PATH ?? 'data/feednotice.sqlite',
    serviceName,
    operatorName: env.OPERATOR_NAME ?? 'the operator of this service',
    processors: env.PROCESSORS ?? 'the hosting provider of the service, in the European Union',
    contactEmail,
    legal: {
      company: env.LEGAL_COMPANY ?? '',
      capitalEur: int(env.LEGAL_CAPITAL_EUR, 0),
      address: env.LEGAL_ADDRESS ?? '',
      registration: env.LEGAL_REGISTRATION ?? '',
      siret: env.LEGAL_SIRET ?? '',
      vat: env.LEGAL_VAT ?? '',
      director: env.LEGAL_DIRECTOR ?? '',
      hostName: env.HOST_NAME ?? '',
      hostAddress: env.HOST_ADDRESS ?? '',
      hostPhone: env.HOST_PHONE ?? '',
    },
    sourceUrl: env.SOURCE_URL || UPSTREAM_SOURCE,
    brandDir: env.BRAND_DIR ?? '',
    defaultLocale: isLocale(env.DEFAULT_LOCALE) ? env.DEFAULT_LOCALE : 'en',
    mailFrom,
    replyTo: env.REPLY_TO ?? contactEmail,
    bounceAddress: env.BOUNCE_ADDRESS ?? '',
    mailTransport: env.MAIL_TRANSPORT === 'smtp' ? 'smtp' : 'outbox',
    smtp: { host: env.SMTP_HOST ?? '', port: int(env.SMTP_PORT, 25), user: env.SMTP_USER ?? '', pass: env.SMTP_PASS ?? '' },
    outboxDir: env.OUTBOX_DIR ?? 'data/outbox',
    dkim: { domain: env.DKIM_DOMAIN ?? mailDomain, selector: env.DKIM_SELECTOR ?? 'fn1', keyFile: env.DKIM_KEY_FILE ?? '' },
    mailMaxPerHour: int(env.MAIL_MAX_PER_HOUR, 0),
    mailMaxPerDay: int(env.MAIL_MAX_PER_DAY, 0),
    confirmMaxPerHour: int(env.CONFIRM_MAX_PER_HOUR, 300),
    userAgent: env.USER_AGENT ?? `FeedNotice/${VERSION} (${serviceName}; +${baseUrl}/robot; ${contactEmail})`,
    pollIntervalMinutes: int(env.POLL_INTERVAL_MINUTES, 30),
    minPollIntervalMinutes: 15,
    maxPollIntervalMinutes: 60,
    pendingTtlDays: int(env.PENDING_TTL_DAYS, 7),
    suspendedTtlDays: int(env.SUSPENDED_TTL_DAYS, 90),
    digestHour: int(env.DIGEST_HOUR, 7),
    digestWeekday: int(env.DIGEST_WEEKDAY, 1),
    timeZone: env.TIME_ZONE ?? 'Europe/Paris',
    burstLimit: int(env.BURST_LIMIT, 5),
    webhookSecret: env.WEBHOOK_SECRET ?? '',
    opsEmail: env.OPS_EMAIL ?? '',
    opsReportHour: int(env.OPS_REPORT_HOUR, 8),
    backupHour: int(env.BACKUP_HOUR, 3),
    backupKeep: int(env.BACKUP_KEEP, 14),
    backupStatusDir: env.BACKUP_STATUS_DIR ?? '',
    trustProxy: env.TRUST_PROXY === '1',
    allowPrivateFeeds: env.ALLOW_PRIVATE_FEEDS === '1',
    runScheduler: env.RUN_SCHEDULER !== '0',
  };
}

function int(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
