// Lenient feed date parsing: ISO 8601 / RFC 3339 (Atom), RFC 822 (RSS), and the malformed
// variants seen in the wild, including French month names. An unreadable date yields null:
// dates are only displayed, never used for deduplication.

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, fév: 1, fev: 1, mar: 2, apr: 3, avr: 3, may: 4, mai: 4, jun: 5, jui: 5,
  jul: 6, juil: 6, aug: 7, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, dec: 11, déc: 11,
};

const ZONES: Record<string, number> = {
  UT: 0, UTC: 0, GMT: 0, Z: 0, CET: 60, CEST: 120, EST: -300, EDT: -240,
  CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
};

const MIN_YEAR = 1990;

export function parseDate(input: string | undefined | null): Date | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  const d = parseIso(s) ?? parseRfc822(s);
  if (!d || Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  // An absurd date (year 0, 1970 from a zero timestamp, year 3000) is treated as missing.
  if (year < MIN_YEAR || d.getTime() > Date.now() + 366 * 86400_000) return null;
  return d;
}

function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}:?\d{2}|[+-]\d{2})?)?$/i.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', se = '0', tz] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (!validParts(+y, +mo, +d, +h, +mi, +se)) return null;
  return new Date(utc - offsetMinutes(tz) * 60_000);
}

function parseRfc822(s: string): Date | null {
  // "Tue, 10 Jun 2003 04:00:00 GMT", "10 Jun 2003 04:00 +0200", "Tue, 10 June 2003", "10 juin 2003"…
  const cleaned = s.replace(/^[a-zéû]+\.?,?\s*/i, (w) => (/\d/.test(w) ? w : ''));
  const m = /^(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([a-z]{1,5}|[+-]\d{2}:?\d{2})?$/i.exec(cleaned);
  if (!m) return null;
  const [, d, monName, yRaw, h = '0', mi = '0', se = '0', tz] = m;
  const mon = MONTHS[monName.toLowerCase().slice(0, 4)] ?? MONTHS[monName.toLowerCase().slice(0, 3)];
  if (mon === undefined) return null;
  let y = +yRaw;
  if (yRaw.length === 2) y += y < 50 ? 2000 : 1900;
  if (!validParts(y, mon + 1, +d, +h, +mi, +se)) return null;
  return new Date(Date.UTC(y, mon, +d, +h, +mi, +se) - offsetMinutes(tz) * 60_000);
}

function validParts(y: number, mo: number, d: number, h: number, mi: number, se: number): boolean {
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 24 && mi <= 59 && se <= 60 && y > 0;
}

function offsetMinutes(tz: string | undefined): number {
  if (!tz) return 0;
  const upper = tz.toUpperCase();
  if (upper in ZONES) return ZONES[upper];
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(tz);
  if (!m) return 0;
  const v = +m[2] * 60 + +(m[3] ?? 0);
  return m[1] === '-' ? -v : v;
}
