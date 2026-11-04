// The setup checker, against a fake DNS: a correct deployment, then a broken one.

import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { runDoctor, type DoctorDeps } from '../src/doctor.ts';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const pub = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');

const env = {
  BASE_URL: 'https://example.org', SERVICE_NAME: 'Town Mail', SECRET: 'x'.repeat(40), WEBHOOK_SECRET: 'w',
  MAIL_FROM: 'updates@mail.example.org', BOUNCE_ADDRESS: 'feedback@mail.example.org', MTA_HOSTNAME: 's1.example.org',
  DKIM_SELECTOR: 'fn1', DKIM_KEY_FILE: '/keys/fn1.pem', OPS_EMAIL: 'ops@example.org',
};

function deps(over: Partial<Record<string, string[]>> = {}, extra: Partial<DoctorDeps> = {}): DoctorDeps {
  const a: Record<string, string[]> = { 'example.org': ['203.0.113.10'], 's1.example.org': ['198.51.100.7'], ...over };
  const txt: Record<string, string[]> = {
    'mail.example.org': ['v=spf1 a:s1.example.org -all'],
    'fn1._domainkey.mail.example.org': [`v=DKIM1; k=rsa; p=${pub}`],
    '_dmarc.mail.example.org': ['v=DMARC1; p=none; rua=mailto:ops@example.org'],
  };
  return {
    resolve4: async (h) => a[h] ?? [],
    resolveMx: async (h) => (h === 'mail.example.org' ? [{ exchange: 's1.example.org', priority: 10 }] : []),
    resolveTxt: async (h) => (over[`txt:${h}`] as string[] | undefined) ?? txt[h] ?? [],
    reverse: async (ip) => (ip === '198.51.100.7' ? (over['ptr'] ?? ['s1.example.org']) : []),
    connect: async () => true,
    fetchText: async (url) => (url === 'https://example.org/health' ? 'ok' : null),
    readFile: (path) => (path === '/keys/fn1.pem' ? pem : null),
    ...extra,
  };
}

describe('doctor', () => {
  it('passes a correct deployment', async () => {
    const checks = await runDoctor(loadConfig(env), env, deps());
    assert.deepEqual(checks.filter((c) => c.status !== 'ok'), []);
    assert.ok(checks.some((c) => c.name === 'SPF mail.example.org' && /authorizes 198\.51\.100\.7/.test(c.detail)));
    assert.ok(checks.some((c) => c.name === 'DKIM fn1._domainkey.mail.example.org' && c.detail === 'matches the signing key'));
  });

  it('names each problem of a broken one', async () => {
    const broken = deps(
      { ptr: ['static-7.provider.example'], 'txt:mail.example.org': ['v=spf1 ip4:192.0.2.0/24 -all'], 'txt:fn1._domainkey.mail.example.org': ['v=DKIM1; p=AAAA'], 'txt:_dmarc.mail.example.org': [], 'txt:_dmarc.example.org': [] },
      { connect: async () => false, fetchText: async () => null },
    );
    const bad = (await runDoctor(loadConfig({ ...env, OPS_EMAIL: '' }), { ...env, OPS_EMAIL: '' }, broken)).filter((c) => c.status !== 'ok');
    assert.deepEqual(bad.map((c) => `${c.status} ${c.name}`), [
      'warn OPS_EMAIL',
      'fail HTTPS',
      'fail PTR 198.51.100.7',
      'fail SPF mail.example.org',
      'fail DKIM fn1._domainkey.mail.example.org',
      'fail DMARC mail.example.org',
      'fail Outbound port 25',
    ]);
  });

  it('follows SPF includes and recognizes a blocklisting', async () => {
    const d = deps({ 'txt:mail.example.org': ['v=spf1 include:_spf.example.org ~all'], 'txt:_spf.example.org': ['v=spf1 ip4:198.51.100.0/24 -all'], '7.100.51.198.zen.spamhaus.org': ['127.0.0.2'] });
    const checks = await runDoctor(loadConfig(env), env, d);
    assert.equal(checks.find((c) => c.name === 'SPF mail.example.org')?.status, 'ok');
    assert.equal(checks.find((c) => c.name === 'Spamhaus 198.51.100.7')?.status, 'fail');
  });
});
