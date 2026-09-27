// Sending emails. In production the application hands each message to the MTA container
// (Postfix, send-only) over SMTP on the internal network; Postfix queues, retries and
// throttles per destination. The application signs DKIM itself.
// In development: a local outbox where each message is written as an .eml file.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type { Config } from '../config.ts';
import { fingerprint } from '../tokens.ts';

export interface OutgoingMail {
  to: string;
  fromName: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

/** Added to every message: bounce address, reply address, and a mark to authenticate bounces. */
export interface EnvelopeOptions {
  /** Envelope sender (Return-Path); defaults to the From address. */
  bounceAddress?: string;
  replyTo?: string;
  /** Per-recipient mark copied back in bounces: a forged bounce cannot suspend an address. */
  recipientTag?: (email: string) => string;
}

export const RECIPIENT_TAG_HEADER = 'X-FeedNotice-Ref';

export function recipientTagger(secret: string): (email: string) => string {
  return (email) => fingerprint(secret, `rcpt:${email.toLowerCase()}`);
}

export class MailError extends Error {
  /** Address refused outright (5xx): no point retrying. */
  readonly permanent: boolean;
  constructor(message: string, permanent: boolean) {
    super(message);
    this.permanent = permanent;
  }
}

/** Keeps messages in memory, and writes them to disk when a folder is given. */
export class OutboxMailer implements Mailer {
  readonly messages: (OutgoingMail & { from: string; raw: string })[] = [];
  private readonly from: string;
  private readonly dir: string | null;
  private readonly transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  private counter = 0;
  private readonly envelope: EnvelopeOptions;
  /** For tests: makes the next sends fail. */
  failNext = 0;

  constructor(from: string, dir: string | null, envelope: EnvelopeOptions = {}) {
    this.from = from;
    this.dir = dir;
    this.envelope = envelope;
    if (dir) mkdirSync(dir, { recursive: true });
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new MailError('Simulated failure.', false);
    }
    const info = await this.transport.sendMail(toNodemailer(mail, this.from, this.envelope));
    const raw = (info.message as Buffer).toString('utf8');
    this.messages.push({ ...mail, from: this.from, raw });
    if (this.dir) {
      const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${++this.counter}.eml`;
      writeFileSync(join(this.dir, name), raw);
    }
  }
}

export class SmtpMailer implements Mailer {
  private readonly from: string;
  private readonly transport: Transporter;
  private readonly envelope: EnvelopeOptions;

  constructor(from: string, transport: Transporter, envelope: EnvelopeOptions = {}) {
    this.from = from;
    this.transport = transport;
    this.envelope = envelope;
  }

  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transport.sendMail(toNodemailer(mail, this.from, this.envelope));
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode ?? 0;
      throw new MailError((e as Error).message, code >= 550 && code < 560);
    }
  }
}

function toNodemailer(mail: OutgoingMail, from: string, envelope: EnvelopeOptions): SendMailOptions {
  const headers = { ...mail.headers };
  if (envelope.recipientTag) headers[RECIPIENT_TAG_HEADER] = envelope.recipientTag(mail.to);
  return {
    from: { name: mail.fromName, address: from },
    to: mail.to,
    replyTo: envelope.replyTo || undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    headers,
    envelope: { from: envelope.bounceAddress || from, to: mail.to },
    // No pixel, no link rewriting: nothing to disable, the service adds none.
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function createMailer(config: Config): Mailer {
  const envelope: EnvelopeOptions = {
    bounceAddress: config.bounceAddress,
    replyTo: config.replyTo,
    recipientTag: recipientTagger(config.secret),
  };
  if (config.mailTransport !== 'smtp') return new OutboxMailer(config.mailFrom, config.outboxDir, envelope);

  const { host, port, user, pass } = config.smtp;
  if (!host) throw new Error('SMTP_HOST is required with MAIL_TRANSPORT=smtp.');
  const dkim = config.dkim.keyFile
    ? { domainName: config.dkim.domain, keySelector: config.dkim.selector, privateKey: readFileSync(config.dkim.keyFile, 'utf8') }
    : undefined;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // The MTA container is reached over the private Docker network, without TLS.
    ignoreTLS: port === 25 || port === 2525,
    auth: user ? { user, pass } : undefined,
    pool: true,
    maxConnections: 2,
    dkim,
  });
  return new SmtpMailer(config.mailFrom, transport, envelope);
}
