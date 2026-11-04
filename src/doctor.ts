// `cli.ts doctor`: checks a deployment against its settings, the way mailbox providers will
// see it: DNS (A, PTR, MX, SPF, DKIM, DMARC), outbound port 25, the public HTTPS address,
// a blocklist, and the settings themselves. Read-only: it changes nothing and sends no email.

import { createPrivateKey, createPublicKey } from 'node:crypto';
import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import type { Config } from './config.ts';

export type Status = 'ok' | 'warn' | 'fail';
export interface Check {
  status: Status;
  name: string;
  detail: string;
}

/** Network lookups, replaceable in tests. Each resolves to [] / null when nothing is found. */
export interface DoctorDeps {
  resolve4(host: string): Promise<string[]>;
  resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>;
  resolveTxt(host: string): Promise<string[]>;
  reverse(ip: string): Promise<string[]>;
  /** Can a TCP connection be opened? */
  connect(host: string, port: number): Promise<boolean>;
  /** Body of a GET, or null on any error (certificate included). */
  fetchText(url: string): Promise<string | null>;
  readFile(path: string): string | null;
}

const quiet = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const defaultDoctorDeps: DoctorDeps = {
  resolve4: (h) => quiet(dns.promises.resolve4(h), []),
  resolveMx: (h) => quiet(dns.promises.resolveMx(h), []),
  resolveTxt: (h) => quiet(dns.promises.resolveTxt(h).then((r) => r.map((c) => c.join(''))), []),
  reverse: (ip) => quiet(dns.promises.reverse(ip), []),
  connect: (host, port) => new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 5000 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  }),
  fetchText: async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  },
  readFile: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
};

const domainOf = (address: string) => address.split('@')[1]?.toLowerCase() ?? '';
const sameName = (a: string, b: string) => a.replace(/\.$/, '').toLowerCase() === b.replace(/\.$/, '').toLowerCase();

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  if (!net.isIPv4(ip) || !net.isIPv4(base)) return false;
  const list = new net.BlockList();
  list.addSubnet(base, bits === undefined ? 32 : Number(bits), 'ipv4');
  return list.check(ip, 'ipv4');
}

/**
 * Does this SPF record authorize `ip`? Handles ip4, a, mx and include (one level deep):
 * enough for the records this service needs. 'unknown' when a mechanism cannot be followed.
 */
async function spfAllows(deps: DoctorDeps, domain: string, record: string, ip: string, depth = 0): Promise<boolean | 'unknown'> {
  let unknown = false;
  for (const term of record.split(/\s+/).slice(1)) {
    const m = /^[+~?-]?(ip4|a|mx|include|redirect)(?:[:=]([^/\s]+))?(\/\d+)?$/i.exec(term);
    if (!m) continue;
    const [, mech, arg, mask] = m;
    const target = arg ?? domain;
    const kind = mech.toLowerCase();
    if (kind === 'ip4' && arg && ipInCidr(ip, `${arg}${mask ?? ''}`)) return true;
    if (kind === 'a' && (await deps.resolve4(target)).some((a) => ipInCidr(ip, `${a}${mask ?? ''}`))) return true;
    if (kind === 'mx') {
      for (const mx of await deps.resolveMx(target)) if ((await deps.resolve4(mx.exchange)).includes(ip)) return true;
    }
    if (kind === 'include' || kind === 'redirect') {
      if (depth >= 2) { unknown = true; continue; }
      const sub = (await deps.resolveTxt(target)).find((t) => /^v=spf1\b/i.test(t));
      const r = sub ? await spfAllows(deps, target, sub, ip, depth + 1) : 'unknown';
      if (r === true) return true;
      if (r === 'unknown') unknown = true;
    }
  }
  return unknown ? 'unknown' : false;
}

export async function runDoctor(config: Config, env: NodeJS.ProcessEnv, deps: DoctorDeps = defaultDoctorDeps): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (status: Status, name: string, detail: string) => checks.push({ status, name, detail });

  // --- Settings ---
  const site = new URL(config.baseUrl);
  add(config.secret.length >= 32 ? 'ok' : 'fail', 'SECRET', config.secret.length >= 32 ? 'set' : 'missing or shorter than 32 characters');
  add(env.SERVICE_NAME ? 'ok' : 'fail', 'SERVICE_NAME', env.SERVICE_NAME ? `"${config.serviceName}"` : 'not set: give your service its own name');
  add(site.protocol === 'https:' ? 'ok' : 'fail', 'BASE_URL', site.protocol === 'https:' ? config.baseUrl : `${config.baseUrl} is not https`);
  add(config.webhookSecret ? 'ok' : 'fail', 'WEBHOOK_SECRET', config.webhookSecret ? 'set' : 'missing: bounces cannot reach the app');
  add(config.opsEmail ? 'ok' : 'warn', 'OPS_EMAIL', config.opsEmail ? `report and alerts to ${config.opsEmail}` : 'not set: no daily report, no alert by email');
  const mailDomain = domainOf(config.mailFrom);
  const bounceDomain = domainOf(config.bounceAddress || config.mailFrom);
  add(bounceDomain === mailDomain ? 'ok' : 'warn', 'Sending domain',
    bounceDomain === mailDomain ? `${mailDomain} (sender and bounces aligned)` : `MAIL_FROM is on ${mailDomain} but bounces on ${bounceDomain}: SPF will not align for DMARC`);

  // --- Website ---
  const siteIps = await deps.resolve4(site.hostname);
  add(siteIps.length ? 'ok' : 'fail', `A ${site.hostname}`, siteIps.length ? siteIps.join(', ') : 'no IPv4 address');
  const health = await deps.fetchText(`${config.baseUrl}/health`);
  add(health?.trim() === 'ok' ? 'ok' : 'fail', 'HTTPS', health?.trim() === 'ok' ? `${config.baseUrl}/health answers, certificate valid` : `${config.baseUrl}/health does not answer "ok" over valid HTTPS`);

  // --- Sending server ---
  const mta = env.MTA_HOSTNAME ?? '';
  let mtaIps: string[] = [];
  if (!mta) {
    add('fail', 'MTA_HOSTNAME', 'not set');
  } else {
    mtaIps = await deps.resolve4(mta);
    add(mtaIps.length ? 'ok' : 'fail', `A ${mta}`, mtaIps.length ? mtaIps.join(', ') : 'no IPv4 address');
    for (const ip of mtaIps) {
      const names = await deps.reverse(ip);
      const match = names.some((n) => sameName(n, mta));
      add(match ? 'ok' : 'fail', `PTR ${ip}`, match ? mta : `${names.join(', ') || 'none'}: set the reverse DNS of ${ip} to ${mta} at your provider`);
    }
  }
  if (bounceDomain) {
    const mx = await deps.resolveMx(bounceDomain);
    const ok = mx.some((r) => sameName(r.exchange, mta));
    add(ok ? 'ok' : 'fail', `MX ${bounceDomain}`, ok ? mta : `${mx.map((r) => r.exchange).join(', ') || 'none'}: bounces must come back to ${mta || 'this server'}`);
  }

  // --- SPF, DKIM, DMARC ---
  if (mailDomain) {
    const spf = (await deps.resolveTxt(bounceDomain)).filter((t) => /^v=spf1\b/i.test(t));
    if (spf.length !== 1) {
      add('fail', `SPF ${bounceDomain}`, spf.length ? 'several SPF records: there must be exactly one' : 'no SPF record');
    } else {
      const results = await Promise.all(mtaIps.map((ip) => spfAllows(deps, bounceDomain, spf[0], ip)));
      const status: Status = results.length && results.every((r) => r === true) ? 'ok' : results.some((r) => r === false) ? 'fail' : 'warn';
      add(status, `SPF ${bounceDomain}`, status === 'ok' ? `"${spf[0]}" authorizes ${mtaIps.join(', ')}` : status === 'fail' ? `"${spf[0]}" does not authorize ${mtaIps.join(', ')}` : `"${spf[0]}": could not confirm it authorizes the server`);
    }

    const name = `${config.dkim.selector}._domainkey.${config.dkim.domain}`;
    const published = (await deps.resolveTxt(name)).find((t) => /\bp=/.test(t));
    const pem = config.dkim.keyFile ? deps.readFile(config.dkim.keyFile) : null;
    if (!config.dkim.keyFile || !pem) {
      add('fail', 'DKIM key', config.dkim.keyFile ? `${config.dkim.keyFile} cannot be read` : 'DKIM_KEY_FILE not set: emails are not signed');
    } else if (!published) {
      add('fail', `DKIM ${name}`, 'no record: publish the one `cli.ts dkim-keygen` prints');
    } else {
      const expected = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' }).toString('base64');
      const p = /\bp=([A-Za-z0-9+/=\s]+)/.exec(published)?.[1].replace(/\s/g, '');
      add(p === expected ? 'ok' : 'fail', `DKIM ${name}`, p === expected ? 'matches the signing key' : 'published key differs from DKIM_KEY_FILE');
    }

    const dmarc = (await deps.resolveTxt(`_dmarc.${mailDomain}`)).find((t) => /^v=DMARC1\b/i.test(t))
      ?? (await deps.resolveTxt(`_dmarc.${mailDomain.split('.').slice(-2).join('.')}`)).find((t) => /^v=DMARC1\b/i.test(t));
    const policy = dmarc ? /\bp=(\w+)/i.exec(dmarc)?.[1]?.toLowerCase() : undefined;
    add(dmarc ? 'ok' : 'fail', `DMARC ${mailDomain}`, dmarc ? `p=${policy ?? '?'}${policy === 'none' ? ' (fine to start; move to quarantine once reports are clean)' : ''}` : 'no record: Gmail and Yahoo require one');
  }

  // --- Network and reputation ---
  const port25 = await deps.connect('gmail-smtp-in.l.google.com', 25);
  add(port25 ? 'ok' : 'fail', 'Outbound port 25', port25 ? 'open (reached Gmail)' : 'blocked: ask your provider to open it');
  for (const ip of mtaIps) {
    const listed = await deps.resolve4(`${ip.split('.').reverse().join('.')}.zen.spamhaus.org`);
    if (listed.length === 0) add('ok', `Spamhaus ${ip}`, 'not listed');
    else if (listed.every((a) => a.startsWith('127.255.255.'))) add('warn', `Spamhaus ${ip}`, 'could not check (Spamhaus refuses public resolvers): use their lookup page');
    else add('fail', `Spamhaus ${ip}`, `listed (${listed.join(', ')}): ask for removal, or for another IP, before sending`);
  }
  return checks;
}

export function formatChecks(checks: Check[]): string {
  const mark: Record<Status, string> = { ok: ' OK ', warn: 'WARN', fail: 'FAIL' };
  const width = Math.max(...checks.map((c) => c.name.length));
  const lines = checks.map((c) => `[${mark[c.status]}] ${c.name.padEnd(width)}  ${c.detail}`);
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  return `${lines.join('\n')}\n\n${fails ? `${fails} problem(s) to fix` : 'No problem found'}${warns ? `, ${warns} warning(s)` : ''}.`;
}
