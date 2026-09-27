// Signed links: nothing to store, nothing to guess.
//   confirmation  c/<subscription>.<expiry>.<signature>
//   unsubscribe   u/<subscription>.<signature>      (no expiry: it must work years later)
//   account       m/<subscriber>.<expiry>.<signature>
//   WebSub        websub/<feed>.<signature>       (no expiry: the hub calls it for as long as the lease runs)
//   publisher     p/<email>.<expiry>.<signature>  (the account exists only once the link is opened)
// Identifiers are never reused (AUTOINCREMENT): an old link cannot touch someone else's
// subscription.

import { createHmac, timingSafeEqual } from 'node:crypto';

export type Purpose = 'confirm' | 'unsubscribe' | 'manage' | 'websub';

const WITHOUT_EXPIRY: Purpose[] = ['unsubscribe', 'websub'];

function mac(secret: string, purpose: Purpose, payload: string): string {
  return createHmac('sha256', secret).update(`${purpose}|${payload}`).digest('base64url').slice(0, 27);
}

export function signToken(secret: string, purpose: Purpose, id: number, expiresAt?: number): string {
  const payload = expiresAt === undefined ? String(id) : `${id}.${Math.floor(expiresAt / 1000).toString(36)}`;
  return `${payload}.${mac(secret, purpose, payload)}`;
}

/** Returns the signed identifier, or null if the signature is wrong or the link expired. */
export function verifyToken(secret: string, purpose: Purpose, token: string, now: number): number | null {
  const parts = token.split('.');
  const withExpiry = !WITHOUT_EXPIRY.includes(purpose);
  if (parts.length !== (withExpiry ? 3 : 2)) return null;
  const sig = parts.pop() as string;
  const payload = parts.join('.');
  const expected = mac(secret, purpose, payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (withExpiry) {
    const exp = Number.parseInt(parts[1], 36) * 1000;
    if (!Number.isFinite(exp) || exp < now) return null;
  }
  const id = Number(parts[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Fingerprint that cannot be reversed without the secret (rate limits, suppression list). */
export function fingerprint(secret: string, value: string): string {
  return createHmac('sha256', secret).update(`fp|${value}`).digest('base64url').slice(0, 32);
}

/** Link carrying an email address (publisher sign-in): nothing is stored before it is opened. */
export function signEmailToken(secret: string, email: string, expiresAt: number): string {
  const payload = `${Buffer.from(email).toString('base64url')}.${Math.floor(expiresAt / 1000).toString(36)}`;
  return `${payload}.${createHmac('sha256', secret).update(`publisher|${payload}`).digest('base64url').slice(0, 27)}`;
}

export function verifyEmailToken(secret: string, token: string, now: number): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [addr, exp, sig] = parts;
  const expected = createHmac('sha256', secret).update(`publisher|${addr}.${exp}`).digest('base64url').slice(0, 27);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number.parseInt(exp, 36) * 1000 < now) return null;
  return Buffer.from(addr, 'base64url').toString('utf8');
}
