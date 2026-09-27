// Fetches a feed politely and carefully:
// - conditional requests (ETag / If-Modified-Since) and an explicit User-Agent;
// - the service reads URLs supplied by anyone, so it refuses to reach private or local
//   addresses (SSRF) and bounds size, duration and redirects.

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import type { LookupFunction } from 'node:net';

export interface FetchOptions {
  userAgent: string;
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Local tests only. */
  allowPrivate?: boolean;
}

/** Why a fetch failed; the web layer turns the code into a localized message. */
export type FetchErrorCode =
  | 'invalid-url' | 'bad-scheme' | 'credentials' | 'private-address' | 'too-many-redirects'
  | 'no-location' | 'http-status' | 'too-large' | 'interrupted' | 'timeout' | 'connect';

export type FetchResult =
  | { kind: 'ok'; body: string; finalUrl: string; etag: string | null; lastModified: string | null; maxAgeSeconds: number | null; contentType: string }
  | { kind: 'not-modified'; maxAgeSeconds: number | null }
  | { kind: 'error'; code: FetchErrorCode; message: string; httpStatus?: number; retryAfterSeconds?: number | null; permanent?: boolean };

function fail(code: FetchErrorCode, message: string, extra: { httpStatus?: number; retryAfterSeconds?: number | null; permanent?: boolean } = {}): FetchResult {
  return { kind: 'error', code, message, ...extra };
}

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
] as const) blocked.addSubnet(addr, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1], 'ipv4');
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

/** DNS resolution that refuses any non-public address, at connection time (defeats DNS rebinding). */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || list.length === 0) {
      const e = Object.assign(new Error(`Non-public address refused for ${hostname}`), { code: 'EPRIVATE' });
      return callback(e, '', 0);
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export async function fetchFeed(url: string, opts: FetchOptions): Promise<FetchResult> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(current, opts, hop === 0);
    if (res.kind !== 'redirect') return res;
    current = res.location;
  }
  return fail('too-many-redirects', 'Too many redirects.');
}

type Once = FetchResult | { kind: 'redirect'; location: string };

function requestOnce(url: string, opts: FetchOptions, conditional: boolean): Promise<Once> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return resolve(fail('invalid-url', 'Invalid URL.', { permanent: true }));
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return resolve(fail('bad-scheme', 'Only http and https URLs are accepted.', { permanent: true }));
    }
    if (u.username || u.password) {
      return resolve(fail('credentials', 'URLs with credentials are not accepted.', { permanent: true }));
    }
    const hostIp = u.hostname.replace(/^\[|\]$/g, '');
    if (!opts.allowPrivate && net.isIP(hostIp) && !isPublicAddress(hostIp)) {
      return resolve(fail('private-address', 'Non-public address refused.', { permanent: true }));
    }

    const headers: Record<string, string> = {
      'User-Agent': opts.userAgent,
      Accept: 'application/atom+xml, application/rss+xml, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.1',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    if (conditional && opts.etag) headers['If-None-Match'] = opts.etag;
    if (conditional && opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET',
      headers,
      timeout: opts.timeoutMs ?? 15_000,
      lookup: opts.allowPrivate ? undefined : safeLookup,
    }, (res) => {
      const status = res.statusCode ?? 0;
      const maxAge = parseMaxAge(res.headers['cache-control']);
      if (status >= 300 && status < 400 && status !== 304) {
        res.resume();
        const loc = res.headers.location;
        if (!loc) return resolve(fail('no-location', `Redirect ${status} without a location.`, { httpStatus: status }));
        return resolve({ kind: 'redirect', location: new URL(loc, u).toString() });
      }
      if (status === 304) {
        res.resume();
        return resolve({ kind: 'not-modified', maxAgeSeconds: maxAge });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return resolve(fail('http-status', `HTTP ${status}.`, {
          httpStatus: status,
          retryAfterSeconds: parseRetryAfter(res.headers['retry-after']),
          permanent: status === 404 || status === 410,
        }));
      }

      const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
      const stream = decompress(res, res.headers['content-encoding']);
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          stream.destroy();
          resolve(fail('too-large', `Feed larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`));
          return;
        }
        chunks.push(c);
      });
      stream.on('error', (e) => resolve(fail('interrupted', `Transfer interrupted: ${e.message}`)));
      stream.on('end', () => {
        const buf = Buffer.concat(chunks);
        const contentType = String(res.headers['content-type'] ?? '');
        resolve({
          kind: 'ok',
          body: decodeBody(buf, contentType),
          finalUrl: u.toString(),
          etag: typeof res.headers.etag === 'string' ? res.headers.etag : null,
          lastModified: typeof res.headers['last-modified'] === 'string' ? res.headers['last-modified'] : null,
          maxAgeSeconds: maxAge,
          contentType,
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(fail('timeout', 'Response timed out.'));
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EPRIVATE') resolve(fail('private-address', 'Non-public address refused.', { permanent: true }));
      else resolve(fail('connect', `Connection failed: ${e.message}`));
    });
    req.end();
  });
}

function decompress(res: http.IncomingMessage, encoding: string | undefined): NodeJS.ReadableStream & { destroy(): void } {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip': case 'x-gzip': return res.pipe(zlib.createGunzip());
    case 'deflate': return res.pipe(zlib.createInflate());
    case 'br': return res.pipe(zlib.createBrotliDecompress());
    default: return res;
  }
}

/** Character set: HTTP header, else XML declaration, else UTF-8. */
export function decodeBody(buf: Buffer, contentType: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const head = buf.subarray(0, 200).toString('latin1');
  const fromDecl = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  // A byte order mark wins over everything else.
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf);
  for (const label of [fromHeader, fromDecl, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label.toLowerCase()).decode(buf);
    } catch {
      // unknown label: try the next one
    }
  }
  return buf.toString('utf8');
}

function parseMaxAge(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v.join(',') : v;
  const m = s ? /max-age=(\d+)/i.exec(s) : null;
  return m ? Number(m[1]) : null;
}

function parseRetryAfter(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  if (/^\d+$/.test(s.trim())) return Number(s.trim());
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((t - Date.now()) / 1000));
}

/**
 * Posts a form to a third-party URL (a WebSub hub) with the same protections as fetching a
 * feed: http(s) only, public addresses only, bounded duration. Redirects are not followed.
 */
export function postForm(url: string, fields: Record<string, string>, opts: FetchOptions): Promise<{ status: number } | { status: 0; message: string }> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return resolve({ status: 0, message: 'Invalid URL.' });
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return resolve({ status: 0, message: 'Only http and https URLs are accepted.' });
    const hostIp = u.hostname.replace(/^\[|\]$/g, '');
    if (!opts.allowPrivate && net.isIP(hostIp) && !isPublicAddress(hostIp)) return resolve({ status: 0, message: 'Non-public address refused.' });
    const body = new URLSearchParams(fields).toString();
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'POST',
      headers: { 'User-Agent': opts.userAgent, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(body)) },
      timeout: opts.timeoutMs ?? 15_000,
      lookup: opts.allowPrivate ? undefined : safeLookup,
    }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, message: 'Response timed out.' });
    });
    req.on('error', (e) => resolve({ status: 0, message: e.message }));
    req.end(body);
  });
}
