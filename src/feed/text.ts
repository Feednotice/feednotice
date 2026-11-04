// Turns feed content (often escaped HTML) into plain text that reads well in an email:
// no images, no markup.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•', euro: '€',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', shy: '',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
  auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö',
  ugrave: 'ù', ucirc: 'û', uuml: 'ü', oelig: 'œ', aelig: 'æ', yuml: 'ÿ',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Acirc: 'Â', Ccedil: 'Ç',
  Icirc: 'Î', Ocirc: 'Ô', Ucirc: 'Û', OElig: 'Œ', AElig: 'Æ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return m;
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return NAMED_ENTITIES[code] ?? m;
  });
}

/** Longest HTML fragment converted; beyond it the content is cut (emails show 3,000 characters at most). */
export const MAX_HTML = 256 * 1024;

/**
 * Removes every `open … close` section, scanning with indexOf: linear time, whatever the
 * input (a regular expression with a lazy `[\s\S]*?` is quadratic on unclosed sections).
 */
function removeSections(s: string, open: RegExp, close: (tag: string) => string): string {
  let out = '';
  let pos = 0;
  const lower = s.toLowerCase();
  open.lastIndex = 0;
  for (let m = open.exec(s); m; m = open.exec(s)) {
    if (m.index < pos) continue;
    const end = lower.indexOf(close(m[1]?.toLowerCase() ?? ''), m.index + m[0].length);
    out += s.slice(pos, m.index);
    if (end === -1) return out;
    pos = end + close(m[1]?.toLowerCase() ?? '').length;
    // A closing tag ends at its ">".
    if (s[pos - 1] !== '>') {
      const gt = s.indexOf('>', pos);
      pos = gt === -1 ? s.length : gt + 1;
    }
    open.lastIndex = pos;
  }
  return out + s.slice(pos);
}

/** Reduces an HTML fragment to text: paragraphs and lists are kept, everything else is dropped. */
export function htmlToText(html: string): string {
  // Tag patterns use [^<>]: a run of "<" without ">" stays linear.
  let s = removeSections(html.slice(0, MAX_HTML), /<!--()/g, () => '-->');
  s = removeSections(s, /<(script|style|head|iframe|object|svg)\b/gi, (tag) => `</${tag}`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^<>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table|section|article)\s*>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table|section|article)\b[^<>]*>/gi, '\n\n')
    .replace(/<\/?[a-z!?/][^<>]*>/gi, '');
  s = decodeEntities(s).replace(/\u00a0/g, ' ');
  return normalizeWhitespace(s);
}

export function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Single-line text (titles). */
export function singleLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + ' …';
}
