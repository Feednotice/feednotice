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

/** Reduces an HTML fragment to text: paragraphs and lists are kept, everything else is dropped. */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<(script|style|head|iframe|object|svg)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table|section|article)\s*>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|ul|ol|blockquote|pre|tr|table|section|article)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
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
