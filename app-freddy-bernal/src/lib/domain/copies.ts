import { tweetLength, tweetUrls } from './tweets';

// Copy generation WITHOUT AI: fills the chosen formula with the event's own data.
// Rule 7: it never invents figures. Every number comes from the brief; a missing
// piece is listed in `missing` and shown to the person.

export type CopyInput = {
  title: string;
  place: string;
  municipality: string;
  summary: string;
  workDescription: string;
  ledBy: string;
  inCharge: string;
  achievements: string;
  keyFacts: string;
  speech: string;
  bossLines: string; // storyboard "Lo que dice el jefe", one block per line
  category: string | null;
};

export type CopyBrand = { greeting: string; closings: string[]; hashtags: string[]; name?: string };
export type Formula = { code: string; name: string; steps: { key: string; label: string; hint: string }[] };
export type CopySet = { long: string; medium: string; short: string; missing: string[] };

// Chosen per piece ("depende de lo que hagamos"): whose voice and how it ends.
export type Voice = 'boss' | 'institutional';
export type Closing = { kind: 'brand' | 'question' | 'destination' | 'none'; text?: string };
export type CopyOptions = { voice: Voice; closing: Closing };

export const VOICES: Record<Voice, { label: string; hint: string }> = {
  boss: { label: 'El jefe en primera persona', hint: 'Abre con su saludo. Habla él: «hoy entregamos», «estuve».' },
  institutional: { label: 'Institucional', hint: 'Sin «yo». Abre con el hecho y nombra quién lo hizo.' },
};
export const QUESTION = { long: '¿Qué opinas? Cuéntanos en los comentarios 👇', medium: '¿Qué opinas? Cuéntanos 👇', short: '¿Qué opinas? 👇' };

export function defaultOptions(brand: CopyBrand): CopyOptions {
  return { voice: 'boss', closing: { kind: 'brand', text: brand.closings[0] ?? '' } };
}

const DESTINATION_MISSING = 'Destino para el cierre (enlace, teléfono o dirección)';
const CLOSING_EMPTY = 'El cierre elegido está vacío: escribe el texto o elige «Sin cierre»';
const X_CUT = 'En X el inicio quedó cortado con «…»: revísalo o acorta el cierre';

export const LIMITS = { long: 2200, medium: 500, short: 280 } as const;

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------
// A period after one of these (or after an initial, "J.", or "C.A.") does not end the sentence.
const ABBR = new Set([
  'sr', 'sra', 'srta', 'sres', 'srs', 'dr', 'dra', 'drs', 'ing', 'lic', 'licdo', 'licda', 'lcdo', 'lcda', 'ldo', 'lda', 'prof', 'profa',
  'gral', 'cnel', 'tcnel', 'tte', 'sgto', 'cap', 'cmdte', 'comdte', 'cdte', 'almte', 'arq', 'abg', 'abog', 'mons', 'pbro', 'pdte', 'pdta',
  'pres', 'gdor', 'gdora', 'alc', 'alcde', 'alcda', 'dip', 'dir', 'dtor', 'dtora', 'coord', 'sec', 'secr', 'min', 'excmo', 'excma', 'mtro',
  'bach', 'hno', 'hnos', 'av', 'avda', 'sto', 'sta', 'aprox', 'bs', 'ref', 'gob', 'edo', 'mcpio', 'mpio', 'pqia', 'parr', 'urb', 'sect',
  'esq', 'ctra', 'cra', 'kra', 'prolong', 'edif', 'qta', 'res', 'pto', 'pza', 'psje', 'nro', 'num', 'art', 'pag', 'tlf', 'telf', 'tel',
  'km', 'kms', 'mts', 'dpto', 'depto', 'dto', 'cia', 'admon', 'inst', 'univ', 'asoc', 'fund', 'ofic', 'ud', 'uds', 'vd', 'vds', 'etc', 'vs',
  'ej', 'cel', 'info', 'ext', 'apto', 'ppal', 'pral', 'cod', 'tlfs',
]);
// Abbreviations a sentence can end on ("12 km.", "500 mil Bs.", "etc."): a line that ends on one goes
// on only when the next line opens in lowercase or with a figure. Any other ("Urb.", "Ing.") always goes on.
const ENDS_SENTENCE = new Set(['etc', 'km', 'kms', 'mts', 'bs', 'cia', 'hnos', 'ud', 'uds', 'vd', 'vds', 'ppal', 'pral']);
// Months and "No." are words too ("el mar", "dijo que no"): abbreviations only before a number.
const BEFORE_NUMBER = new Set(['no', 'ene', 'feb', 'mar', 'abr', 'jun', 'jul', 'ago', 'sep', 'sept', 'set', 'oct', 'nov', 'dic']);
// Two consonants a Spanish word can open with; any other pair ("Mpio", "Tcnel", "Lcdo") is an abbreviation.
const ONSETS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'ch', 'll', 'rr', 'ps', 'gn', 'tl', 'kr', 'kl']);
// Words no sentence ends on: a line or a quote that ends on one was cut.
const FUNCTION_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'lo', 'un', 'una', 'a', 'al', 'y', 'e', 'o', 'u', 'ni', 'en', 'que', 'por', 'para', 'con', 'sin',
  'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'se', 'muy', 'pero', 'sino', 'porque', 'como', 'entre', 'hacia', 'hasta', 'desde',
]);
// "1.", "2)", "a)", "-", "•" opening a line are list markers, not text. A dash glued to a figure ("-15%") stays.
const MARKER = /^\s*(?:\d{1,2}[.)]|[a-zA-Z]\)|[-•*–])\s+/;
const BREAK = /[ \t]*\n\s*|([.!?…]+)([»"”’')\]]*)[ \t]+/g;
const STARTS_SENTENCE = /^[«"“‘']?[\p{Lu}\d¿¡]/u;
const FINISHED = /[.!?…][»"”’')\]]*$/;

function plain(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Letters and digits only, with a space at each end: for "is it already said" checks.
function norm(s: string) {
  return ` ${plain(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

// The word at the end of `before`, scanned back from the end: a regex anchored at "$" over the whole text
// is quadratic in a long token (a 2,000-character link), and this runs at every candidate break.
function lastToken(before: string) {
  let i = before.length;
  const stop = Math.max(0, i - 40);
  while (i > stop && !/\s/.test(before[i - 1])) i--;
  return before.slice(i).replace(/^[^\p{L}\p{N}]+/u, '');
}

// Spelled like no Spanish word: no vowel ("Sr", "km"), ending in b/c/f/g/k/m/p/q/t/v/w/x or in two
// consonants ("Coord", "Edif"), or opening with two consonants no word opens with ("Mpio", "Tcnel").
function looksAbbreviated(w: string) {
  if (!/^\p{L}{1,6}$/u.test(w)) return false;
  const k = plain(w);
  return !/[aeiou]/.test(k) || /[bcfgkmpqtvwx]$/.test(k) || /[^aeiouy]{2}$/.test(k) || (/^[^aeiou]{2}/.test(k) && !ONSETS.has(k.slice(0, 2)));
}

function knownAbbreviation(w: string) {
  return /^\p{L}$/u.test(w) || /^(\p{L}{1,3}\.)+\p{L}{1,3}$/u.test(w) || ABBR.has(plain(w));
}

function abbreviation(before: string, after: string) {
  const w = lastToken(before);
  if (knownAbbreviation(w) || looksAbbreviated(w)) return true;
  if (BEFORE_NUMBER.has(plain(w)) && /^\d/.test(after)) return true;
  // "al cel. 0414…", "info. 0276…": a short lowercase word before a figure is not where a sentence ends.
  if (/^\p{Ll}{2,4}$/u.test(w) && /^\d/.test(after)) return true;
  // "Cmdte. Chávez", "Alcde. Pérez": a short capitalised word before another capital or a figure
  // is taken as a title we don't know. At worst two sentences stay together; none is cut.
  return /^\p{Lu}\p{L}{1,5}$/u.test(w) && /^[«"“‘']?[\p{Lu}\d]/u.test(after);
}

// Where sentences end: every new line, and ". ! ? …" followed by a capital, a digit, "¿" or "¡".
function breaks(text: string): { end: number; next: number }[] {
  const out: { end: number; next: number }[] = [];
  let start = 0;
  for (const m of text.matchAll(BREAK)) {
    const at = m.index;
    const next = at + m[0].length;
    if (m[1] === undefined) {
      out.push({ end: at, next });
      start = next;
      continue;
    }
    const after = text.slice(next);
    if (!STARTS_SENTENCE.test(after)) continue;
    // "2. Pintura": a list number, not a sentence.
    if (m[1] === '.' && (/^\s*\d{1,2}$/.test(text.slice(start, at)) || abbreviation(text.slice(0, at), after))) continue;
    out.push({ end: at + m[1].length + m[2].length, next });
    start = next;
  }
  return out;
}

export function endDot(s: string) {
  if (FINISHED.test(s)) return s;
  const t = s.replace(/[\s,;:]+$/, '');
  // Never a period after an emoji ("Seguimos trabajando 💪").
  return /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]$/u.test(t) ? t : `${t}.`;
}

// The sentences as written: no period added, no marker removed.
function pieces(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const b of breaks(text)) {
    out.push(text.slice(start, b.end).trim());
    start = b.next;
  }
  out.push(text.slice(start).trim());
  return out;
}

export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const piece of pieces(text)) {
    const s = piece.replace(MARKER, '').trim();
    if (/\p{L}/u.test(s)) out.push(s);
    // A piece with only figures ("0414-555-1234") was split off its sentence: it goes back on, never away.
    else if (/\d/.test(s) && out.length) out[out.length - 1] += ` ${s}`;
  }
  return out.map(endDot);
}

const lastWord = (s: string) => plain(s.slice(-40).match(/\p{L}+$/u)?.[0] ?? '');
const firstWord = (s: string) => plain(s.match(/^[^\p{L}]*(\p{L}+)/u)?.[1] ?? '');
// Opens in lowercase, after any "¡", "¿" or quote mark: the middle of a sentence.
const LOWER_START = /^[¡¿«"“‘'\s]*\p{Ll}/u;
// Ends on ",", ":", ";" or on "de", "la", "y"…: the sentence goes on in the next line.
const dangling = (s: string) => /[,:;—–]$/.test(s) || FUNCTION_WORDS.has(lastWord(s));

// Logical lines: list markers out, blank lines as hard ends, and a line joined to the next one
// when `joins` says the sentence runs on.
function lines(text: string, joins: (prev: string, next: string) => boolean): string[] {
  const out: string[] = [];
  let open = false;
  for (const raw of text.split('\n')) {
    const marked = MARKER.test(raw);
    const line = raw.replace(MARKER, '').trim();
    if (!line) {
      open = false;
      continue;
    }
    if (open && !marked && joins(out[out.length - 1], line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
    open = true;
  }
  return out;
}

// A line that has not ended its sentence although it may end in ". ! ? …": the next one opens in
// lowercase ("etc.\ny los vecinos…", "¿Saben qué?\nesta cancha…"), or it ends on an abbreviation's period
// ("la Urb.\nLos Pinos", "aprox.\n1.200 personas", "al Ing.\nRamírez").
function runsOn(prev: string, next: string) {
  if (LOWER_START.test(next)) return true;
  if (!/\p{L}\.$/u.test(prev)) return false;
  const w = lastToken(prev.slice(0, -1));
  const figure = /^\d/.test(next);
  if (figure && (BEFORE_NUMBER.has(plain(w)) || /^\p{Ll}{2,4}$/u.test(w))) return true;
  if (!knownAbbreviation(w) && !looksAbbreviated(w)) return false;
  // "C.A." and "12 km." may end the sentence; "Urb.", "Ing." or an initial ("J.") never do.
  return figure || (!w.includes('.') && !ENDS_SENTENCE.has(plain(w)));
}

// Free text (summary, description, achievements): a line wrapped mid-sentence is the same sentence.
export const prose = (t: string) => lines(t, (prev, next) => runsOn(prev, next) || (!FINISHED.test(prev) && dangling(prev))).join('\n');

// The text without its last sentence; '' when it has only one. A quote is never shortened.
function dropLast(text: string): string {
  if (text.startsWith('«')) return '';
  const bs = breaks(text);
  for (let i = bs.length - 1; i >= 0; i--) {
    const head = text.slice(0, bs[i].end).trimEnd();
    if (head && text.slice(bs[i].next).trim()) return head;
  }
  return '';
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

// An area code in parentheses right before the rest of the number ("(0276) 356-1234") is part of the
// phone, not a source: it is kept apart while the sources go.
const AREA_CODE = /\((\+\d{1,3}|\d{3,4})\)(?=[\s.-]*\d{3})/g;

// Every "(…)" or "[…]" goes (the source, wherever it is), and so does an unclosed one, and everything
// before a closer that has no opener (the end of a source that began on another line).
function stripSources(s: string) {
  let t = s.replace(AREA_CODE, '\uE000$1\uE001');
  for (let prev = ''; prev !== t; ) {
    prev = t;
    // "Inversión: 500 mil Bs. (ficha)." leaves one period, not "Bs..", and "¿…? (ficha)." no "?.".
    t = t.replace(/\s*[([][^()[\]]*[)\]](\.(?!\.))?/g, (_, dot: string | undefined, at: number, all: string) =>
      dot && !/[.!?…]["”»’']*$/.test(all.slice(0, at).trimEnd()) ? dot : '',
    );
  }
  return t
    .replace(/(^|\s)(?:[a-zA-Z]|\d{1,2})\)(?=\s)/g, '$1') // "Etapas: a) techo, b) piso": list letters, not sources
    .replace(/^.*[)\]]/, '')
    .replace(/\s*[([].*$/, '')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/[,;:]+(?=[.,;:]|$)/g, '')
    .replace(/\uE000/g, '(')
    .replace(/\uE001/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const depth = (s: string) => count(s, '(') + count(s, '[') - count(s, ')') - count(s, ']');
// "Inversión total en la obra\nBs. 500.000": a label on one line and its figure on the next.
const FIGURE_START = /^(?:[-−+]?\d|[$€£]\s*\d|(?:bs[fds]?|ref|usd|us\$|eur|cop)\.?\s*\d)/i;
// "Fuente:" / "Fuentes:" as a label (at the start, or after ". ; , —"), not the noun ("3 fuentes: El Valle…").
const SOURCE_LABEL = /(^|[.!?…]|\s*[,;—–-])\s*fuentes?\s*:.*$/i;

// A source wrapped over several lines ("(Gobernación del\nTáchira, Dirección de\nObras, 2026)") becomes one
// line, so it goes whole. Only when it closes before a blank line or a list item: a "(" never closed eats nothing.
function closeSources(text: string): string {
  const raw = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let open = depth(raw[i]);
    let j = i + 1;
    while (open > 0 && j < raw.length && raw[j].trim() && !MARKER.test(raw[j])) open += depth(raw[j++]);
    if (open <= 0 && j > i + 1) {
      out.push(raw.slice(i, j).map((l) => l.trim()).join(' '));
      i = j - 1;
    } else out.push(raw[i]);
  }
  return out.join('\n');
}

// Facts for the public text, one per line, without their source.
function facts(text: string): string[] {
  const joins = (prev: string, next: string) =>
    runsOn(prev, next) ||
    (!FINISHED.test(prev) && !/[)\]]$/.test(prev) && (dangling(prev) || (!/\d/.test(prev) && FIGURE_START.test(next))));
  return lines(closeSources(text), joins)
    .map(stripSources)
    .flatMap((line) =>
      sentences(line).flatMap((s, i) => {
        // "Según …" is a source: after a fact on the same line, or with no figure, it goes. Leading a
        // fact ("Según el censo, 1.200 familias…") only its "Según X," goes.
        if (!/^seg[uú]n\b/i.test(s)) return [s];
        if (i > 0 || !/\d/.test(s)) return [];
        const rest = s.replace(/^seg[uú]n\b[^,]*,\s*/i, '');
        return [rest !== s ? cap(rest) : s];
      }),
    )
    .map((s) => s.replace(SOURCE_LABEL, (_, p: string) => (/[.!?…]/.test(p) ? p : '')).trim())
    .filter((s) => /\p{L}/u.test(s))
    .map(endDot);
}

// The first letter in uppercase, after any "¡", "¿" or quote mark ("¡entrega…!" → "¡Entrega…!").
export function cap(s: string) {
  return s.replace(/^([¡¿«"“‘'\s]*)(\p{Ll})/u, (_, a: string, b: string) => a + b.toUpperCase());
}

function hashtagFor(title: string) {
  // Letters only: a year or a figure never goes in a hashtag. The ñ stays ("#AñosDelLiceo", not "Anos").
  const words = title
    .normalize('NFD')
    .replace(/([nN])̃/g, (_, n: string) => (n === 'n' ? 'ñ' : 'Ñ'))
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-zñÑ ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3)
    .slice(0, 3);
  return words.length ? `#${words.map((w) => cap(w.toLowerCase())).join('')}` : '';
}

const chars = (s: string) => [...s].length;

// A word cut may end the text only where no figure, phone or link is left in half: not right before
// or within three words after a number ("15 millones de…", "llama al 0276…"), not on "de", "la"…,
// and not on an abbreviation or a link.
function cleanCut(words: string[], k: number) {
  const digit = (w: string) => /\d/.test(w);
  const end = words[k - 1];
  return (
    !digit(words[k]) &&
    !words.slice(Math.max(0, k - 3), k).some(digit) &&
    !FUNCTION_WORDS.has(plain(end).replace(/[^\p{L}]/gu, '')) &&
    !(/\.$/.test(end) && abbreviation(end.slice(0, -1), '')) &&
    !/\w[./@]\w/.test(end)
  );
}

// Whole words with "…", the longest that `ok` accepts and ends cleanly; '' when none does.
function cutWords(text: string, ok: (cut: string) => boolean, minWords = 1): string {
  const words = text.split(/\s+/).filter(Boolean);
  const at = (k: number) => `${words.slice(0, k).join(' ').replace(/[\s,;:.]+$/, '')}…`;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(at(mid))) lo = mid;
    else hi = mid - 1;
  }
  while (lo > 0 && !cleanCut(words, lo)) lo--;
  return lo >= minWords ? at(lo) : '';
}

// Fits the parts and the closing in `max`: drops the longest middle parts, then whole
// sentences from the end of the longest part, and only as a last resort cuts at a word
// with "…" (never a quote). The closing is never cut: if it can't fit alone it goes.
function fit(parts: string[], closing: string, max: number, closingTooLong: () => void): string {
  const out = parts.filter(Boolean);
  let tail = closing;
  const text = () => [...out, tail].filter(Boolean).join('\n\n');
  while (out.length > 1 && chars(text()) > max) {
    let idx = 1;
    for (let i = 1; i < out.length; i++) if (chars(out[i]) > chars(out[idx])) idx = i;
    out.splice(idx, 1);
  }
  while (chars(text()) > max) {
    let idx = -1;
    out.forEach((p, i) => {
      if (dropLast(p) && (idx < 0 || chars(p) > chars(out[idx]))) idx = i;
    });
    if (idx < 0) break;
    out[idx] = dropLast(out[idx]);
  }
  if (tail && chars(tail) > max) {
    tail = '';
    closingTooLong();
  }
  while (out.length && chars(text()) > max) {
    let idx = 0;
    out.forEach((p, i) => {
      if (chars(p) > chars(out[idx])) idx = i;
    });
    const room = chars(out[idx]) - (chars(text()) - max);
    const cut = out[idx].startsWith('«') ? '' : cutWords(out[idx], (c) => chars(c) <= room);
    if (cut) out[idx] = cut;
    else out.splice(idx, 1);
  }
  return text();
}

// A sentence already said, in an earlier part or earlier in the same one (GBA and PAS put several
// fields in one part), is not repeated, nor one already contained in an earlier sentence (the title
// inside "Título en Lugar."), nor the closing itself (`drop`). A quote goes whole or not at all.
// Paragraphs inside a part stay paragraphs.
function dedupe(parts: string[], drop: string[] = []): string[] {
  const said: string[] = [];
  const keys: string[] = [];
  const gone = drop.map(norm).filter((k) => k.trim());
  const known = (s: string) => {
    const k = norm(s);
    return !k.trim() || gone.includes(k) || keys.some((x) => x.includes(k));
  };
  const paragraph = (p: string) => {
    const ss = sentences(p);
    let changed = false;
    const kept: string[] = [];
    for (const s0 of ss) {
      // "Inversión: 500 mil Bs. Beneficiados: …" can't be split at "Bs.": a fact already said at
      // its start goes.
      let s = s0;
      for (let again = true; again; ) {
        again = false;
        for (const o of said)
          if (s.startsWith(`${o} `)) {
            s = s.slice(o.length + 1);
            again = true;
          }
      }
      said.push(s0);
      if (s !== s0) changed = true;
      if (known(s)) changed = true;
      else {
        kept.push(s);
        if (s !== s0) said.push(s);
        keys.push(norm(s));
      }
    }
    return changed ? kept.join(' ') : p;
  };
  return parts
    .map((p) => {
      if (p.startsWith('«')) {
        if (known(p)) return '';
        keys.push(norm(p));
        return p;
      }
      return p
        .split(/\n{2,}/)
        .map(paragraph)
        .filter(Boolean)
        .join('\n\n');
    })
    .filter(Boolean);
}

function closingLines(c: Closing): { long: string; medium: string; short: string } {
  if (c.kind === 'question') return QUESTION;
  // A final period goes, unless it is an abbreviation's ("4 p.m.", "Av. Ppal."); "!", "?" and "…" stay,
  // with their "¡" and "¿".
  const raw = (c.text ?? '').trim();
  const t = /[^.]\.$/.test(raw) && !abbreviation(raw.slice(0, -1), '') ? raw.slice(0, -1).trim() : raw;
  if (c.kind === 'none' || !/[\p{L}\p{N}]/u.test(t)) return { long: '', medium: '', short: '' };
  if (c.kind === 'destination') return { long: `👉 ${t}`, medium: `👉 ${t}`, short: `👉 ${t}` };
  return { long: `💛 ${endDot(t)}`, medium: endDot(t), short: t.replace(/[\s,;:]+$/, '') };
}

const QUOTE_MAX = 160;
// On plain() text: "saludos", "un saludo muy especial", "muy buenos días", "buen día", "hola", "bienvenidos".
const GREETING = /^[¡¿«"“\s]*(?:(?:muy|un|mis?|cordial(?:es)?|reciban)\s+)*(?:saludos?|buen[oa]?s?\s+(?:dias?|tardes|noches)|hola|bienvenid[oa]s?)\b/;

// "¡…!", "¿…?" and "“…”" open before they close, in order, and nothing stays open; straight quotes in pairs.
function balanced(q: string) {
  const stack: string[] = [];
  const pair: Record<string, string> = { '!': '¡', '?': '¿', '”': '“' };
  for (const ch of q) {
    if (ch === '¡' || ch === '¿' || ch === '“') stack.push(ch);
    else if (ch in pair && stack.pop() !== pair[ch]) return false;
  }
  return !stack.length && count(q, '"') % 2 === 0;
}

// A sentence the boss said, for a textual quote: whole, ending in its own ". ! ? …", balanced
// "¡…!" and "¿…?". Skips the greeting, anything with figures (figures only go out from "Datos y
// cifras", with their source), stage directions "(aplausos)" and fragments: cut at an abbreviation
// we don't know, inside a longer "¡…!" or ending on "de", "la"…
// `wrapped`: the speech, where a line that doesn't end its sentence goes on in the next one. The
// storyboard lines are separate blocks: each one is its own text, never merged with the next.
function quoteFrom(text: string, greeting: string, wrapped: boolean): { quote: string; tooLong: boolean } {
  const g = /\p{L}/u.test(greeting) ? norm(greeting) : '';
  let tooLong = false;
  // `head`: its first piece may be the end of the previous line's sentence. `tail`: its last piece may
  // be the start of a sentence that goes on in the next block.
  type Seg = { text: string; head: boolean; tail: boolean };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(MARKER, '').trim();
    if (!line) {
      if (cur) segs.push(cur);
      cur = null;
      continue;
    }
    if (!cur) {
      cur = { text: line, head: false, tail: false };
      continue;
    }
    const open: boolean = !FINISHED.test(cur.text);
    // "al Ing.\nRamírez", "etc.\ny los vecinos", "de\nEl Mirador": the same sentence.
    if (wrapped && (runsOn(cur.text, line) || (open && (dangling(cur.text) || /^\d/.test(line))))) {
      cur.text += ` ${line}`;
      continue;
    }
    // A line that didn't end its sentence and can't be joined for sure: the start of the next
    // one may be its continuation, so it is not quoted either. A storyboard block that opens in
    // lowercase ("del barrio El Mirador…") is the rest of the one before; after an open block that
    // opens with "de", "y", "para"… the one before was cut too.
    const lower = LOWER_START.test(line);
    const cut: boolean = wrapped ? open : dangling(cur.text) || lower;
    if (!wrapped && open && lower && FUNCTION_WORDS.has(firstWord(line))) cur.tail = true;
    segs.push(cur);
    cur = { text: line, head: cut, tail: false };
  }
  if (cur) segs.push(cur);

  for (const seg of segs) {
    const ss = pieces(seg.text);
    let excl = 0;
    let quest = 0;
    let curly = 0;
    let straight = false;
    let glued = seg.head;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      // Inside a longer "¡…!", "¿…?" or an inner quotation ("Mi mamá me decía: “Estudia. Nunca…”").
      const inside = excl > 0 || quest > 0 || curly > 0 || straight;
      excl = Math.max(0, excl + count(s, '¡') - count(s, '!'));
      quest = Math.max(0, quest + count(s, '¿') - count(s, '?'));
      curly = Math.max(0, curly + count(s, '“') - count(s, '”'));
      if (count(s, '"') % 2) straight = !straight;
      if (seg.tail && i === ss.length - 1) continue;
      // A period after a short word ("pro. Pérez") may be an abbreviation we don't know: that
      // piece and the next one are skipped.
      const shortWord = i < ss.length - 1 && /[^.]\.$/.test(s) && /(?:^|[^\p{L}])\p{L}{1,3}\.$/u.test(s);
      const fragment = glued || shortWord;
      glued = shortWord;
      if (fragment || inside || !s) continue;
      if (wrapped && !FINISHED.test(s)) continue;
      const q = (/[^.]\.$/.test(s) && !knownAbbreviation(lastToken(s.slice(0, -1))) ? s.slice(0, -1) : s).trim();
      if (/\p{N}/u.test(q) || /\s[.!?…]/.test(q) || q.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length < 3) continue;
      if (LOWER_START.test(q) || !balanced(q)) continue;
      if (/[()[\]«»]/.test(q)) continue;
      if ((g && norm(q).includes(g)) || GREETING.test(plain(q))) continue;
      if (dangling(q.replace(/[.!?…»"”’')\]]+$/, ''))) continue;
      if (chars(q) > QUOTE_MAX) {
        tooLong = true;
        continue;
      }
      return { quote: q, tooLong: false };
    }
  }
  return { quote: '', tooLong };
}

const LONG_LEAD: Record<'summary' | 'fact' | 'quote' | 'title' | 'text', string> = {
  summary: 'El resumen es una sola frase muy larga: pártelo en frases cortas',
  fact: 'El primer dato es una sola frase muy larga: pártelo en frases cortas',
  quote: 'La frase del jefe es muy larga para abrir el copy: elige una más corta',
  title: 'El título es muy largo: acórtalo',
  text: 'El primer párrafo es una sola frase muy larga: pártelo en frases cortas',
};

// A place for the text, without the final period of "Cárdenas." (but with the one of "C.A.").
function noDot(s: string) {
  const t = s.trim().replace(/[\s,;:]+$/, '');
  return /[^.]\.$/.test(t) && !knownAbbreviation(lastToken(t.slice(0, -1))) ? t.slice(0, -1) : t;
}

// Place and municipality, without the municipality when the place already names it after a comma or
// at its end ("Cancha El Mirador, Cárdenas", "… en Cárdenas", "…, municipio Cárdenas").
export function placeOf(place: string, municipality: string) {
  const p = noDot(place);
  const m = noDot(municipality);
  const words = (s: string) => plain(s).replace(/[^\p{L}\p{N},]+/gu, ' ').replace(/\s*,\s*/g, ',').trim();
  const LEAD = /^(?:(?:en|el|municipio|mcpio|mpio|mun)\s+)+/;
  const mk = words(m).replace(LEAD, '');
  const named =
    !!p && !!mk && (words(p).split(',').some((seg) => seg.replace(LEAD, '') === mk) || words(p).endsWith(` en ${mk}`) || words(p).endsWith(` municipio ${mk}`));
  return [p, named ? '' : m].filter(Boolean).join(', ');
}

export function buildCopies(input: CopyInput, formula: Formula, brand: CopyBrand, opts: CopyOptions = defaultOptions(brand)): CopySet {
  const missing: string[] = [];
  const note = (m: string) => {
    if (!missing.includes(m)) missing.push(m);
  };
  const f = facts(input.keyFacts);
  const work = input.workDescription || input.summary;
  const achieve = input.achievements;
  if (!work) missing.push('De qué es la obra o el acto');
  if (!achieve) missing.push('Qué se está logrando');
  if (!f.length) missing.push('Datos y cifras (con fuente)');

  const where = placeOf(input.place, input.municipality);
  const t0 = input.title.trim();
  const titled = t0 ? endDot(cap(t0)) : '';
  const t1 = t0.replace(/[\s,;:]+$/, '');
  const hook = f[0] ?? (t1 && where && !/[.!?…]$/.test(t1) ? endDot(`${cap(t1)} en ${where}`) : titled);
  const boss = opts.voice === 'boss';
  const who = input.ledBy.trim() || input.inCharge.trim();
  const credit = who ? endDot(`A cargo: ${who}`) : '';
  const end = closingLines(opts.closing);
  const tagList: string[] = [];
  for (const t of [hashtagFor(input.title), ...brand.hashtags]) if (t && !tagList.some((u) => plain(u) === plain(t))) tagList.push(t);
  const tags = tagList.slice(0, 3).join(' ');
  const join = (t: string) => (t ? cap(sentences(prose(t)).join(' ')) : '');
  // The first sentence, past a greeting ("¡Saludos, Táchira!", "Muy buenos días…"): the lead of PAS,
  // DAR or HIST says what happened, and the boss's greeting has its own line in his voice.
  const greeting = /\p{L}/u.test(brand.greeting) ? norm(brand.greeting) : '';
  const greets = (s: string) => GREETING.test(plain(s)) || (!!greeting && norm(s).startsWith(greeting));
  const first = (t: string) => (t ? cap(sentences(prose(t)).find((s) => !greets(s)) ?? '') : '');
  const needDestination = () => {
    if (opts.closing.kind !== 'destination' || !end.short) missing.push(DESTINATION_MISSING);
  };
  let credited = false;

  const steps: Record<string, string> = {};
  switch (formula.code) {
    case 'PAS':
      steps.problem = first(input.summary) || titled;
      steps.agitation = f.slice(0, 2).join(' ') || '';
      steps.solution = [join(work), join(achieve)].filter(Boolean).join(' ');
      break;
    case 'AIDA':
      steps.attention = hook;
      steps.interest = join(work);
      steps.desire = join(achieve);
      break; // the action is the closing chosen for the piece
    case 'GBA':
      steps.hook = hook;
      steps.blocks = [join(work), join(achieve), f.slice(1).join(' ')].filter(Boolean).slice(0, 3).join('\n\n');
      needDestination();
      break;
    case 'DATO':
      steps.fact = hook;
      steps.attribution = credit;
      credited = true;
      if (!who) missing.push('Quién lo hizo (quién la dirige)');
      needDestination();
      break;
    case 'DAR':
      steps.complaint = first(input.summary);
      if (!input.summary) missing.push('Qué reportó la gente (en el resumen del evento, sin nombres)');
      steps.action_taken = [join(input.workDescription), credit].filter(Boolean).join(' ');
      credited = true;
      steps.result = join(achieve) || f.join(' ');
      break;
    case 'CIFRA':
      steps.figure = f[0] ?? '';
      steps.meaning = join(achieve);
      break; // the punch line is written by a person
    case 'CITA': {
      const said = quoteFrom(input.speech, brand.greeting, true);
      const lines = said.quote ? said : quoteFrom(input.bossLines, brand.greeting, false);
      const q = lines.quote;
      if (!q)
        missing.push(
          said.tooLong || lines.tooLong
            ? 'Una frase textual del jefe más corta, sin cifras (las que dijo son muy largas para citarlas completas)'
            : 'Una frase textual del jefe, sin cifras (storyboard)',
        );
      steps.quote = q ? (boss || !brand.name ? `«${q}».` : `«${q}», ${brand.name}.`) : '';
      steps.context = titled;
      steps.backing = f[0] ?? join(achieve);
      break;
    }
    case 'HIST':
      steps.protagonist = first(input.summary);
      if (!input.summary) missing.push('Quién es el protagonista y qué le pasaba (en el resumen, con su permiso)');
      steps.change = join(achieve) || join(work);
      steps.proof = f[0] ?? '';
      break;
    default: // FAB and any custom formula
      steps.feature = join(work) || titled;
      steps.advantage = join(achieve);
      steps.benefit = f.length ? f.join(' ') : '';
  }
  // The closing chosen for the piece never disappears without a word.
  if (opts.closing.kind !== 'none' && !end.long) note(opts.closing.kind === 'destination' ? DESTINATION_MISSING : CLOSING_EMPTY);

  // Custom formulas: use the steps in their order with whatever data matches.
  const body = formula.steps.map((s) => steps[s.key] ?? '').filter(Boolean);
  if (!body.length && titled) body.push(titled);

  // Formulas that open with their own first step (the problem, the complaint, the quote,
  // the protagonist); the rest open with the strongest fact.
  const lead = ['PAS', 'DAR', 'CITA', 'HIST'].includes(formula.code) ? (body[0] ?? hook) : hook;
  const rest = body.filter((b) => b !== lead);
  const source =
    steps.quote && lead === steps.quote ? 'quote'
    : f[0] && lead === f[0] ? 'fact'
    : input.summary && lead === first(input.summary) ? 'summary'
    : lead === hook || lead === titled ? 'title'
    : 'text';

  // The first part leaves room for the rest: past 40% of the limit it keeps only its first
  // sentences, or gives way to the hook (or the title) and the person is told why.
  // With nothing to give way to, the whole lead stays when everything fits (`others`: the rest of
  // the copy); fit() cuts it only if the limit itself forces it.
  const opener = (max: number, others: string[]) => {
    const room = Math.floor(max * 0.4);
    let l = lead;
    while (chars(l) > room && dropLast(l)) l = dropLast(l);
    if (chars(l) <= room) return l;
    const alt = [hook, titled].find((h) => h && h !== lead && chars(h) <= room);
    if (!alt && !titled && chars([lead, ...others].filter(Boolean).join('\n\n')) <= max) return lead;
    note(LONG_LEAD[source]);
    if (alt) return alt;
    if (titled) {
      note(LONG_LEAD.title);
      return titled;
    }
    return lead.startsWith('«') ? '' : cutWords(lead, (c) => chars(c) <= room);
  };
  const tooLong = (group: string) => () =>
    note(opts.closing.kind === 'destination' ? `El destino del cierre no cabe en el copy ${group}: usa un enlace o un texto más corto` : `El cierre no cabe en el copy ${group}: acórtalo`);

  // First line: the boss's greeting in his voice; the fact itself in the institutional one.
  // The pin goes unless the line right after it already says the place.
  const openLong = opener(LIMITS.long, [boss ? `${brand.greeting} 👋` : '', where ? `📍 ${where}` : '', ...rest, credit, end.long]);
  const bodyLong = boss ? body.map((b) => (b === lead ? openLong : b)) : [openLong, ...rest];
  const pin = where && !norm(bodyLong[0] ?? '').includes(norm(where)) ? [`📍 ${where}`] : [];
  const head = boss ? [`${brand.greeting} 👋`, ...pin, ...bodyLong] : [openLong, ...pin, ...rest];
  // The closing is not said twice: a body sentence that is the closing itself goes.
  const closingSaid = opts.closing.kind === 'brand' || opts.closing.kind === 'destination' ? [opts.closing.text ?? ''] : [];
  const long = fit(dedupe([...head, ...(credit && !credited ? [credit] : [])], closingSaid), end.long, LIMITS.long, tooLong('largo'));

  const medium = fit(dedupe([opener(LIMITS.medium, [...rest.slice(0, 2), end.medium]), ...rest.slice(0, 2)], closingSaid), end.medium, LIMITS.medium, tooLong('mediano'));

  // X: the lead, one more line, closing and hashtags; then fewer pieces until it fits.
  const firstOf = (t: string) => (t.startsWith('«') ? t : first(t));
  const xLead = firstOf(lead);
  const more = rest[0] ? firstOf(rest[0]) : first(work);
  const xMore = more && !norm(xLead).includes(norm(more)) ? more : '';
  const x = (...p: string[]) => p.filter(Boolean).join(' ');
  // A candidate needs some text of its own: never the closing and the hashtags alone.
  const xc = (text: string, ...tail: string[]) => (text ? x(text, ...tail) : '');
  const fitsX = (s: string) => tweetLength(s) <= LIMITS.short;
  let short =
    [
      xc(x(xLead, xMore), end.short, tags),
      xc(xLead, end.short, tags),
      xc(titled, end.short, tags),
      xc(xLead, end.short),
      xc(titled, end.short),
    ].find((s) => s && fitsX(s)) ?? '';
  if (!short) {
    // Last resort: whole words off the lead (never off a quote, a figure, the closing or the destination).
    const destination = opts.closing.kind === 'destination';
    let closing = end.short;
    if (!fitsX(closing)) {
      closing = '';
      note(destination ? 'El destino del cierre no cabe en X (280 caracteres): usa un enlace o un texto más corto' : 'El cierre no cabe en X: acórtalo');
    }
    const text = xLead.startsWith('«') ? titled : xLead;
    // A stub of one to three words says nothing: better the destination alone.
    const cut = fitsX(x(text, closing)) ? text : cutWords(text, (c) => fitsX(x(c, closing)), 4);
    short = x(cut, closing);
    if (cut && cut !== text) note(X_CUT);
    if (destination && closing && !cut) note('El destino del cierre es muy largo para X: no cabe junto al título; usa un enlace o un texto más corto');
  }

  return { long, medium, short, missing };
}

export function copyLength(group: 'long' | 'medium' | 'short', text: string) {
  return group === 'short' ? tweetLength(text) : [...text].length;
}

// ---------------------------------------------------------------------------
// Checks for copies written by AI (or by hand)
// ---------------------------------------------------------------------------
// A figure, with its sign when the "-" is glued to it and not to a word or a figure ("-15%", not
// "0414-555" nor "COVID-19").
const NUMBER = /(?:(?<![\p{L}\p{N}.,])[-−])?\d[\d.,]*/gu;

// The value of a figure as written in Venezuela or abroad: "1.200" = "1,200" = "1200" (thousands),
// but "2,5" = "2.5" is not "25", and "-15" is not "15".
function numberKey(n: string) {
  const sign = /^[-−]/.test(n) ? '-' : '';
  const s = n.replace(/^[-−]/, '').replace(/[.,]+$/, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return sign + s.replace(/[.,]/g, '');
  const sep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (sep < 0) return sign + s;
  const int = s.slice(0, sep).replace(/[.,]/g, '');
  const dec = s.slice(sep + 1).replace(/0+$/, '');
  return sign + (dec ? `${int}.${dec}` : int);
}

// Numbers in `texts` that appear in none of `sources`. Hashtags, links, emails, unit exponents ("m2") and the
// `ignore` text (a piece's own closing, e.g. its destination) aside, in the texts and in the sources alike: a "2"
// in "600 m2" or in "obras2027@…" is not a figure the sources give. The guard of rule 7 for anything written from
// a ficha (copies, the obra's FAB dialog).
export function unknownNumbers(texts: string[], sources: string[], ignore = ''): string[] {
  const scrub = (t: string) => {
    // "¾" and "²" as plain digits ("3⁄4", "2"), and "1 200" as "1.200".
    let text = t
      .normalize('NFKC')
      .replace(/(?<![\d.,])(\d{1,3})((?:[ \u00a0\u202f\u2009]\d{3})+)(?![\d.,]?\d)/g, (_, a: string, b: string) => a + b.replace(/\s/g, '.'))
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ');
    // A link starts a word, with its protocol, "www." or a letter: "4.500.La obra" or a "link" glued to a
    // figure ("2,5atodos.com") never eats the figure.
    const urls = tweetUrls(text).filter((u) => /^(?:https?:\/\/|www\.|\p{L})/iu.test(u));
    for (const url of urls.sort((a, b) => b.length - a.length))
      text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}.,])${url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'gu'), ' ');
    return text
      .replace(/#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu, ' ') // a hashtag needs a letter: "#7" is a figure
      .replace(/(\d\s*(?:k?m|cm|mm|dm))[23](?!\d)/g, '$1');
  };
  const known = new Set((scrub(sources.join('\n')).match(NUMBER) ?? []).map(numberKey));
  const own = ignore.trim();
  const found = new Map<string, string>();
  for (const t of texts) {
    let text = t;
    for (const c of new Set([own, own.replace(/\.$/, '')])) if (c) text = text.split(c).join(' ');
    text = scrub(text);
    for (const n of text.match(NUMBER) ?? []) {
      const k = numberKey(n);
      if (k && !known.has(k) && !found.has(k)) found.set(k, n.replace(/[.,]+$/, ''));
    }
  }
  return [...found.values()];
}

// Numbers in the copies that appear in no text field of the brief (the piece's own `closing` aside).
export function inventedNumbers(set: { long: string; medium: string; short: string }, input: CopyInput, closing = ''): string[] {
  const brief = [
    input.title, input.place, input.municipality, input.summary, input.workDescription, input.ledBy, input.inCharge,
    input.achievements, input.keyFacts, input.speech, input.bossLines, input.category ?? '',
  ];
  return unknownNumbers([set.long, set.medium, set.short], brief, closing);
}

// Copies over their network's limit, e.g. ['medium 612/500'].
export function overLimits(set: { long: string; medium: string; short: string }): string[] {
  return (['long', 'medium', 'short'] as const).flatMap((g) => {
    const n = copyLength(g, set[g]);
    return n > LIMITS[g] ? [`${g} ${n}/${LIMITS[g]}`] : [];
  });
}
