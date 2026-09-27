import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type Config } from '../src/config.ts';
import type { Ctx } from '../src/context.ts';
import { openDb } from '../src/db.ts';
import { OutboxMailer } from '../src/mail/mailer.ts';

export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
}

export interface TestCtx extends Ctx {
  mailer: OutboxMailer;
  clock: { t: number };
  logs: string[];
}

export function makeCtx(overrides: Partial<Config> = {}): TestCtx {
  const config = {
    ...loadConfig({ BASE_URL: 'https://service.test', SECRET: 'un-secret-de-test-assez-long-pour-hmac', CONTACT_EMAIL: 'contact@service.test' }),
    allowPrivateFeeds: true,
    ...overrides,
  };
  const clock = { t: Date.UTC(2026, 8, 1, 10, 0, 0) };
  const logs: string[] = [];
  return {
    config,
    db: openDb(':memory:'),
    mailer: new OutboxMailer(config.mailFrom, null),
    now: () => clock.t,
    clock,
    logs,
    log: (m) => logs.push(m),
  };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
