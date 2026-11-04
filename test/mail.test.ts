// Email headers: signed as RFC 8058 requires, and safe from what feeds put in their titles.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import nodemailer from 'nodemailer';
import { DKIM_HEADERS } from '../src/mail/mailer.ts';
import { headerText } from '../src/mail/render.ts';

describe('mail headers', () => {
  it('DKIM signs both one-click unsubscribe headers', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const transport = nodemailer.createTransport({
      streamTransport: true, buffer: true,
      dkim: { domainName: 'mail.example.org', keySelector: 'fn1', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, headerFieldNames: DKIM_HEADERS },
    });
    const info = await transport.sendMail({
      from: 'a@mail.example.org', to: 'b@example.org', subject: 's', text: 't',
      headers: { 'List-Unsubscribe': '<https://x.example/u/1>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    const head = (info.message as Buffer).toString().split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
    const signed = /^DKIM-Signature:.*\bh=([^;]+)/im.exec(head)?.[1].toLowerCase().split(':') ?? [];
    for (const h of ['from', 'subject', 'list-unsubscribe', 'list-unsubscribe-post']) assert.ok(signed.includes(h), h);
  });

  it('strips what could fake a sender from feed titles', () => {
    assert.equal(headerText('=?utf-8?q?PayPal_Security_=3Csecurity=40paypal.com=3E?= Alerts'), 'Alerts');
    assert.equal(headerText('Bank‮ moc.evil‬ <x@y>'), 'Bank moc.evil x@y');
    assert.equal(headerText('Line\r\nBcc: x@y'), 'Line Bcc: x@y');
  });
});
