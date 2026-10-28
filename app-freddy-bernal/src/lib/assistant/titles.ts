import 'server-only';
import type { Session } from '../auth/session';
import { db } from './db';
import { safeTitle } from './redact';
import { plain } from './text';

// Event titles (and piece titles and event place names) never go to an AI provider: people type
// times, days and places into them in more ways than any rule can catch. On the model path each one
// the person can see (read once per turn, AS THE PERSON, so the row rules decide) becomes a
// placeholder like «[[E1]]» in every tool result, earlier answer, script and ficha; the model is
// told to keep the placeholders as written, and after it answers they become the real titles again
// in the text the person sees. Category, municipality and status still go as they are.

// people: the team's first names (folded), so «a Kevin» is someone and «a Táriba» a place.
export type TitleSet = { events: string[]; pieces: string[]; places: string[]; people?: string[] };
export const NO_TITLES: TitleSet = { events: [], pieces: [], places: [] };

type Kind = 'E' | 'P' | 'L';
const KIND_ORDER: Kind[] = ['E', 'P', 'L'];
// The most recent ones: every tool reads from these (the lookups take the latest 300).
const CAP = 3000;
// Shorter names (an empty place, «Acto») are ordinary words, left to the redaction rules.
const MIN_LENGTH: Record<Kind, number> = { E: 4, P: 4, L: 6 };

/** The event titles, piece titles and event place names this person can see (RLS), and the team's names. */
export async function loadTitles(s: Session): Promise<TitleSet> {
  return db(s, async (sql) => {
    const events = await sql.query<{ title: string; place_name: string }>(
      `select title, place_name from public.events where deleted_at is null order by created_at desc limit ${CAP}`,
    );
    const pieces = await sql.query<{ title: string }>(`select title from public.pieces where deleted_at is null order by updated_at desc limit ${CAP}`);
    const people = await sql.query<{ full_name: string }>(`select full_name from public.profiles where deleted_at is null limit ${CAP}`);
    return { events: events.map((r) => r.title), pieces: pieces.map((r) => r.title), places: events.map((r) => r.place_name), people: peopleWords(people.map((r) => r.full_name)) };
  });
}

/**
 * The team's first names, folded like plain() («Kevin Sánchez» → kevin): people say «a Kevin». Not their
 * surnames: many are also places of the state («Juan Rubio», «María Cárdenas»), and «a Rubio» is a place.
 */
export function peopleWords(names: string[]): string[] {
  return [...new Set(names.map((n) => plain(n).split(' ')[0] ?? '').filter((w) => w.length >= 3))];
}

/** The titles a tool returned in this turn (any `titulo`), for the demo brain's answers. */
export function titlesIn(calls: { result?: unknown }[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'titulo' && typeof x === 'string') out.push(x);
        else walk(x);
      }
    }
  };
  calls.forEach((c) => walk(c.result));
  return out;
}

// The names inside a title that point to its event: capitalised words of 4+ letters after the first
// one («Tariba» in «Toma aérea Tariba», «Pirineos» in «Feria de Pirineos»). The first word is the
// event's kind in most titles («Toma», «Feria»), and those are judged as event words. The ordinary
// words that place names carry («Pueblo Nuevo», «Zona Alta») say nothing alone.
export const ORDINARY = new Set('nuevo nueva nuevos nuevas viejo vieja alto alta altos bajo baja bajos grande gran santa santo mayor central norte oeste verde blanco blanca negro negra real sector barrio pueblo plaza calle avenida zona parte casa'.split(' '));
// The little words between a title's words («Feria de emprendedores en la plaza…»).
const LINKS = new Set('de del la el los las lo en y o a al por con para un una sin sobre'.split(' '));
const contentWordsOfPlain = (p: string) => p.split(' ').filter((w) => w && !LINKS.has(w));
// Two words of a title one after the other (the little words between them skipped), both of 4+
// letters: «toma aerea» for «Toma aérea Tariba», «jornada salud», «zona alta».
function pairsIn(ws: string[]): string[] {
  const out: string[] = [];
  for (let k = 1; k < ws.length; k++) {
    const [a, b] = [ws[k - 1], ws[k]];
    if (a.length >= 4 && b.length >= 4) out.push(`${a} ${b}`);
  }
  return out;
}
// A run of capitalised words in a name, the little words inside it included: one name together even
// when each word alone is ordinary («Alto Verde» in «Casa comunal Alto Verde», «Pueblo Nuevo», «San
// José de Bolívar»). As written, without the little words at its ends; two words at least (one alone is
// a name above, or an ordinary word).
export function runsOf(t: string): string[] {
  const ws = String(t ?? '').split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    while (run.length && LINKS.has(plain(run[0]))) run.shift();
    while (run.length && LINKS.has(plain(run.at(-1)!))) run.pop();
    if (run.filter((w) => !LINKS.has(plain(w))).length >= 2) out.push(run.join(' '));
    run = [];
  };
  for (const w of ws) {
    if (/^\p{Lu}/u.test(w)) run.push(w);
    else if (run.length && LINKS.has(plain(w))) run.push(w);
    else flush();
  }
  flush();
  return out;
}

export type TitleIndex = {
  names: ReadonlyMap<string, number[]>;
  pairs: ReadonlyMap<string, number[]>;
  words: ReadonlyMap<string, number[]>;
  /** The words (folded, without the little ones) of the title at this place in the list. */
  wordsOf: (k: number) => readonly string[];
};
const EMPTY: TitleIndex = { names: new Map(), pairs: new Map(), words: new Map(), wordsOf: () => [] };
const longestWord = (p: string) => p.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '');

// What one title says, read once per title: every turn loads the titles again (new lists, the same
// titles), and a check reads them all. Whole (folded, 6+ letters), its names, its word pairs, its words
// (without the little ones and numbers), its capitalised runs (folded, 6+ letters, and as written).
// Each folded name or title is looked for only where the text has its longest word (`at`). For the
// placeholders: the title trimmed, and it and its runs as the finder (below) looks for them.
type Found = { text: string; at: string };
type TitleInfo = { whole: Found | null; names: string[]; pairs: string[]; words: string[]; runs: Found[]; trimmed: string; name: Name; written: { text: string; name: Name }[] };
const INFO_CAP = 20_000;
const infoCache = new Map<string, TitleInfo>();
function infoOf(raw: unknown): TitleInfo {
  const t = String(raw ?? '');
  let info = infoCache.get(t);
  if (!info) {
    const p = plain(t);
    const ws = contentWordsOfPlain(p);
    const written = runsOf(t);
    const trimmed = t.trim();
    info = {
      whole: p.length >= 6 ? { text: p, at: longestWord(p) } : null,
      names: [...new Set(t.split(/[^\p{L}\p{N}]+/u).slice(1).filter((w) => /^\p{Lu}\p{L}{3,}$/u.test(w)).map((w) => plain(w)).filter((w) => !ORDINARY.has(w)))],
      pairs: pairsIn(ws),
      words: [...new Set(ws.filter((w) => !/\d/.test(w)))],
      runs: [...new Set(written.map((r) => plain(r)).filter((r) => r.length >= 6))].map((r) => ({ text: r, at: longestWord(r) })),
      trimmed,
      name: nameOf(trimmed),
      written: written.map((r) => ({ text: r, name: nameOf(r) })),
    };
    if (infoCache.size >= INFO_CAP) infoCache.clear();
    infoCache.set(t, info);
  }
  return info;
}
const push = <V>(m: Map<string, V[]>, k: string, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

// Read once per list (a turn checks its question and its whole thread against the same titles): each
// thing that names a title, to the titles (their places in the list) it names. Every turn reads the
// lists again, so the last few are also kept by what they say.
type Index = { info: TitleInfo[]; whole: Map<string, number[]>; names: Map<string, number[]>; pairs: Map<string, number[]>; words: Map<string, number[]>; runs: Map<string, [string, number][]>; view: TitleIndex };
const indexCache = new WeakMap<string[], Index>();
const RECENT_LISTS = 12;
// A short list (the titles a tool returned) is cheap to read again: it does not push a long one out.
const KEEP_FROM = 50;
const recentIndexes = new Map<string, Index>();
function buildIndex(titles: string[]): Index {
  const ix: Index = { info: [], whole: new Map(), names: new Map(), pairs: new Map(), words: new Map(), runs: new Map(), view: EMPTY };
  for (let k = 0; k < titles.length; k++) {
    const info = infoOf(titles[k]);
    ix.info.push(info);
    if (info.whole) push(ix.whole, info.whole.at, k);
    for (const n of info.names) push(ix.names, n, k);
    for (const p of info.pairs) push(ix.pairs, p, k);
    for (const w of info.words) push(ix.words, w, k);
    for (const r of info.runs) push(ix.runs, r.at, [r.text, k]);
  }
  ix.view = { names: ix.names, pairs: ix.pairs, words: ix.words, wordsOf: (k) => ix.info[k]?.words ?? [] };
  return ix;
}
function indexOf(titles: string[]): Index {
  let ix = indexCache.get(titles);
  if (ix) return ix;
  if (titles.length < KEEP_FROM) ix = buildIndex(titles);
  else {
    // A title never holds a NUL (the database refuses it).
    const key = titles.map((t) => String(t ?? '')).join('\u0000');
    ix = recentIndexes.get(key) ?? buildIndex(titles);
    recentIndexes.delete(key);
    recentIndexes.set(key, ix);
    if (recentIndexes.size > RECENT_LISTS) recentIndexes.delete(recentIndexes.keys().next().value!);
  }
  indexCache.set(titles, ix);
  return ix;
}

type NameOptions = { byName?: boolean; words?: boolean };
// The titles a folded text names (their places in the list); with `first`, only whether one does.
function namedIn(p: string, ix: Index, o: NameOptions, first: boolean): number[] {
  const out: number[] = [];
  const padded = ` ${p} `;
  const ws = [...new Set(p.split(' '))];
  const hit = (k: number) => out.push(k) > 0 && first;
  for (const w of ws) for (const k of ix.whole.get(w) ?? []) if (padded.includes(` ${ix.info[k].whole!.text} `) && hit(k)) return out;
  if (o.byName) {
    for (const w of ws) if (w.length >= 4) for (const k of ix.names.get(w) ?? []) if (hit(k)) return out;
    for (const w of ws) for (const [r, k] of ix.runs.get(w) ?? []) if (padded.includes(` ${r} `) && hit(k)) return out;
  }
  if (o.words) for (const x of pairsIn(contentWordsOfPlain(p))) for (const k of ix.pairs.get(x) ?? []) if (hit(k)) return out;
  return out;
}

/**
 * The text names one of these titles: whole (6+ letters); with `byName`, by a name inside one
 * («Tariba») or a run of its capitalised words («Alto Verde»); with `words`, also by two of its words in
 * a row («toma aérea»).
 */
export function namesTitle(text: string, titles: string[], o: NameOptions = {}): boolean {
  if (!Array.isArray(titles) || !titles.length) return false;
  return namedIn(plain(text), indexOf(titles), o, true).length > 0;
}

/** Which of these titles the text names, as namesTitle() reads it (their places in the list, maybe repeated). */
export function titlesNamed(text: string, titles: string[], o: NameOptions = {}): number[] {
  if (!Array.isArray(titles) || !titles.length) return [];
  return namedIn(plain(text), indexOf(titles), o, false);
}

/** The names, word pairs and words (without the little ones) of these titles, folded like plain(), each to the titles that have it. The same object for the same titles. */
export function titleIndex(titles: string[]): TitleIndex {
  return Array.isArray(titles) && titles.length ? indexOf(titles).view : EMPTY;
}

// Finding the known names in a text, as one pattern of them all would (whole, any case, any run of
// spaces between their words, not inside a longer word; the longest first where two start together),
// without one: thousands of names in one pattern took seconds to build. Each name is tried only where
// the text has its first word (or, for a name that starts with neither a letter nor a digit, after
// anything that is not one).
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const LEADING_WORD = /^[\p{L}\p{N}]+/u;
const ENDS_IN_LETTER_OR_DIGIT = /[\p{L}\p{N}]$/u;
const SPACE = /\s/;
// Folded the same way whatever case it was typed in («STRAẞE», «straße»).
const fold = (s: string) => s.toLowerCase().toUpperCase().toLowerCase();
function sameLetter(a: number, b: number): boolean {
  if (a < 128 && b < 128) return (a ^ b) === 32 && (a | 32) >= 97 && (a | 32) <= 122;
  const [x, y] = [String.fromCodePoint(a), String.fromCodePoint(b)];
  return x.toLowerCase() === y.toLowerCase() || x.toUpperCase() === y.toUpperCase();
}
const letterOrDigitAt = (s: string, at: number) => at < s.length && LETTER_OR_DIGIT.test(String.fromCodePoint(s.codePointAt(at)!));
const afterLetterOrDigit = (s: string, at: number) => at > 0 && ENDS_IN_LETTER_OR_DIGIT.test(s.slice(Math.max(0, at - 2), at));
// Where `name` (folded with norm(): one space between words) ends if it starts at `at`, or -1.
function endOf(s: string, at: number, name: string): number {
  let a = at;
  for (let b = 0; b < name.length; ) {
    if (name[b] === ' ') {
      const from = a;
      while (a < s.length && SPACE.test(s[a])) a++;
      if (a === from) return -1;
      b++;
      continue;
    }
    if (a >= s.length) return -1;
    const [nc, tc] = [name.codePointAt(b)!, s.codePointAt(a)!];
    if (nc !== tc && !sameLetter(nc, tc)) return -1;
    a += tc > 0xffff ? 2 : 1;
    b += nc > 0xffff ? 2 : 1;
  }
  return letterOrDigitAt(s, a) ? -1 : a;
}
// A name folded with norm(), and its first word as the finder looks it up ('' when it starts otherwise).
type Name = { name: string; lead: string };
function nameOf(text: string): Name {
  const name = norm(text);
  const w = LEADING_WORD.exec(name)?.[0];
  return { name, lead: w ? fold(w) : '' };
}
type Finder = (text: string, to: (found: string) => string) => string;
/** Replaces every one of these names (folded with norm()) found in a text, as described above. */
export function nameReplacer(names: string[]): Finder {
  return finderOf((Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && n).map(nameOf));
}
function finderOf(names: Name[]): Finder {
  const byWord = new Map<string, string[]>();
  const other: string[] = [];
  for (const n of names) {
    if (n.lead) push(byWord, n.lead, n.name);
    else other.push(n.name);
  }
  const longest = (a: string, b: string) => b.length - a.length;
  for (const list of byWord.values()) list.sort(longest);
  other.sort(longest);
  const first = (s: string, at: number, list: string[] | undefined) => {
    for (const n of list ?? []) {
      const end = endOf(s, at, n);
      if (end >= 0) return end;
    }
    return -1;
  };
  return (text, to) => {
    const s = String(text ?? '');
    const word = /[\p{L}\p{N}]+/gu;
    let out = '';
    let done = 0;
    let at = 0;
    const take = (from: number, end: number) => {
      out += s.slice(done, from) + to(s.slice(from, end));
      done = at = end;
    };
    scan: while (at < s.length) {
      word.lastIndex = at;
      const m = word.exec(s);
      const next = m ? m.index : s.length;
      if (other.length) {
        for (let j = at; j < next; j += s.codePointAt(j)! > 0xffff ? 2 : 1) {
          if (afterLetterOrDigit(s, j)) continue;
          const end = first(s, j, other);
          if (end >= 0) {
            take(j, end);
            continue scan;
          }
        }
      }
      if (!m) break;
      const end = first(s, m.index, byWord.get(fold(m[0])));
      if (end >= 0) take(m.index, end);
      else at = m.index + m[0].length;
    }
    return done ? out + s.slice(done) : s;
  };
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// A placeholder is written «[[E1]]» (event), «[[P1]]» (piece) or «[[L1]]» (place). As a model may give
// it back: one or two brackets, spaces, lower case, with or without «».
// A third bracket on either side («[[E1]]]», «[[[E1]]]») goes with it.
const LOOSE_TOKEN = /(«\s*)?\[{1,3}\s*([EPLepl])\s*(\d{1,4})\s*\]{1,3}(\s*»)?/g;
/** Any placeholder, also an altered one, for checks that must ignore them. */
export const ANY_TOKEN = /\[{1,3}\s*[EPLepl]\s*\d{1,4}\s*\]{1,3}/g;
// A placeholder written with full-width brackets, letters or digits («［［E1］］», «[[E１]]»): read as one.
const WIDE_TOKEN = /[\[［]{1,3}\s*[EPLeplＥＰＬｅｐｌ]\s*[0-9０-９]{1,4}\s*[\]］]{0,3}/g;
const narrow = (s: string) => s.replace(WIDE_TOKEN, (m) => m.replace(/[［］Ｅ-Ｌｅ-ｌＰｐ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
// What may be left after the replacements: a placeholder with no opening bracket («E1]]») and any
// full-width bracket.
const TAIL_TOKEN = /(?<![\p{L}\p{N}])([EPLepl])\s*\d{1,4}\s*\]{1,2}/gu;
const tidy = (s: string) => s.replace(TAIL_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind]).replace(/[［］]/g, '');
// What is left of something that looked like a placeholder: never shown.
const STRAY = /\[\[[^\]\n]{0,24}\]\]/g;
// A placeholder cut off at the end of the text («… [[E1»): never shown either. One left open in the
// middle («[[E1 en medio») is read as its kind.
// Found from the last «[», without a pattern that starts with a \s* run: that one took seconds on long
// blank text.
const CUT_TAIL = /^\[{1,2}\s*(?:[EPLepl]\s*\d{0,4}\s*)?\]?$/;
function dropCutToken(text: string): string {
  const at = text.lastIndexOf('[');
  if (at < 0) return text;
  const start = at > 0 && text[at - 1] === '[' ? at - 1 : at;
  if (!CUT_TAIL.test(text.slice(start).trimEnd())) return text;
  let end = start;
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  if (end > 0 && text[end - 1] === '«') {
    end--;
    while (end > 0 && /\s/.test(text[end - 1])) end--;
  }
  return text.slice(0, end);
}
const OPEN_TOKEN = /«?\[{1,2}\s*([EPLepl])\s*\d{1,4}(?![\d\]])»?/g;
const FALLBACK: Record<Kind, string> = { E: 'ese evento', P: 'esa pieza', L: 'ese lugar' };

/** Any placeholder left in a text (made, altered, invented or cut off) as plain words, never raw. */
export function stripTokens(text: string): string {
  return tidy(
    dropCutToken(
      narrow(String(text ?? ''))
        .replace(LOOSE_TOKEN, (_m, _open, k: string) => FALLBACK[k.toUpperCase() as Kind])
        .replace(STRAY, 'eso'),
    ).replace(OPEN_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind]),
  ).replace(/[ \t]{2,}/g, ' ');
}

// What a set of titles makes known (each name's kind, as written, and the finder), read once per lists:
// every turn makes new placeholders with the same titles.
type Known = { kindOf: Map<string, Kind>; original: Map<string, string>; find: Finder | null };
const NO_LIST = {};
const knownCache = new WeakMap<object, WeakMap<object, WeakMap<object, Known>>>();
function knownFor(set: TitleSet): Known {
  const ixs = [set.events, set.pieces, set.places].map((l) => (Array.isArray(l) && l.length ? indexOf(l) : null));
  const [e, p, l] = ixs.map((ix) => ix ?? NO_LIST);
  let byPieces = knownCache.get(e);
  if (!byPieces) knownCache.set(e, (byPieces = new WeakMap()));
  let byPlaces = byPieces.get(p);
  if (!byPlaces) byPieces.set(p, (byPlaces = new WeakMap()));
  let known = byPlaces.get(l);
  if (!known) {
    const k: Known = { kindOf: new Map(), original: new Map(), find: null };
    const names: Name[] = [];
    const add = (kind: Kind, text: string, n: Name) => {
      // An event's title wins over a piece or a place with the same name.
      if (text.length < MIN_LENGTH[kind] || k.kindOf.has(n.name)) return;
      k.kindOf.set(n.name, kind);
      k.original.set(n.name, text);
      names.push(n);
    };
    KIND_ORDER.forEach((kind, at) => {
      for (const info of ixs[at]?.info ?? []) add(kind, info.trimmed, info.name);
    });
    // A place by the run of capitalised words in its name («Alto Verde» of «Casa comunal Alto Verde»).
    for (const info of ixs[2]?.info ?? []) for (const r of info.written) add('L', r.text, r.name);
    k.find = names.length ? finderOf(names) : null;
    byPlaces.set(l, (known = k));
  }
  return known;
}

export class Placeholders {
  private readonly find: Finder | null;
  private readonly kindOf: Map<string, Kind>;
  private readonly original: Map<string, string>;
  private readonly tokenOf = new Map<string, string>();
  private readonly byToken = new Map<string, { kind: Kind; text: string }>();
  private readonly count: Record<Kind, number> = { E: 0, P: 0, L: 0 };
  /** The titles it was made with (for the checks that look for an event named by its title). */
  readonly titles: TitleSet;

  constructor(set: TitleSet = NO_TITLES) {
    this.titles = set;
    ({ kindOf: this.kindOf, original: this.original, find: this.find } = knownFor(set ?? NO_TITLES));
  }

  /** How many names it knows. */
  get size(): number {
    return this.kindOf.size;
  }

  private tokenFor(match: string): string {
    const key = norm(match);
    let token = this.tokenOf.get(key);
    if (!token) {
      const kind = this.kindOf.get(key) ?? 'E';
      token = `[[${kind}${++this.count[kind]}]]`;
      this.tokenOf.set(key, token);
      this.byToken.set(token.slice(2, -2), { kind, text: this.original.get(key) ?? match });
    }
    return token;
  }

  /** Every known name in the text becomes its placeholder (the same one all turn long). */
  mask(text: string): string {
    const s = String(text ?? '');
    return this.find ? this.find(s, (m) => this.tokenFor(m)) : s;
  }

  /** mask() on every string inside a value (a tool's result), keys kept. */
  maskDeep(value: unknown): unknown {
    if (typeof value === 'string') return this.mask(value);
    if (Array.isArray(value)) return value.map((v) => this.maskDeep(v));
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.maskDeep(v)]));
    return value;
  }

  /**
   * The model's text with the real names back, between «». With scrub (a question about when or
   * where an event is), a title goes without its date, time or place. A place always goes as «ese
   * lugar». A placeholder the model invented, broke or left half is never shown raw.
   */
  restore(text: string, o: { scrub?: boolean } = {}): string {
    return tidy(
      dropCutToken(
        narrow(String(text ?? ''))
          .replace(LOOSE_TOKEN, (_m, _open, k: string, n: string) => {
            const kind = k.toUpperCase() as Kind;
            const hit = this.byToken.get(`${kind}${Number(n)}`);
            const shown = !hit || kind === 'L' ? '' : o.scrub ? safeTitle(hit.text) : hit.text;
            return shown ? `«${shown}»` : FALLBACK[kind];
          })
          .replace(STRAY, 'eso'),
      ).replace(OPEN_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind]),
    ).replace(/[ \t]{2,}/g, ' ');
  }

  /**
   * A tool call's arguments with the real names, so a lookup by a placeholder finds the right row. A
   * placeholder it does not know (altered or invented) becomes the same words as in restore().
   */
  restoreArgs(raw: unknown): unknown {
    const put = (s: string) =>
      tidy(
        dropCutToken(
          narrow(s)
            .replace(LOOSE_TOKEN, (_m, _open, k: string, n: string) => this.byToken.get(`${k.toUpperCase()}${Number(n)}`)?.text ?? FALLBACK[k.toUpperCase() as Kind])
            .replace(STRAY, 'eso'),
        ).replace(OPEN_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind]),
      );
    const walk = (v: unknown): unknown =>
      typeof v === 'string' ? put(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
    if (typeof raw !== 'string') return walk(raw);
    try {
      return JSON.stringify(walk(JSON.parse(raw)));
    } catch {
      return raw; // the runner says it could not read them
    }
  }
}

/**
 * The known names in a text replaced by «[titulo]», the data hueco of the scripts; an event's place by
 * «el lugar». With `names`, also a name inside a title or a place («lo de Tariba» → «lo de [titulo]»).
 */
export function withTitleHoles(text: string, set: TitleSet, o: { names?: boolean } = {}): string {
  const out = new Placeholders(set).mask(text).replace(/«?\[\[[EP]\d+\]\]»?/g, '«[titulo]»').replace(/\[\[L\d+\]\]/g, 'el lugar');
  if (!o.names) return out;
  const events = titleIndex(set.events).names;
  const places = titleIndex(set.places).names;
  return out.replace(/[\p{L}\p{N}]+/gu, (w) => (events.has(plain(w)) ? '[titulo]' : places.has(plain(w)) ? 'el lugar' : w));
}
