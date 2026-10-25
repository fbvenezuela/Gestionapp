import 'server-only';
import { db, type Session } from '../auth/session';
import { safeTitle } from './redact';
import { plain } from './text';

// Event titles (and piece titles and event place names) never go to an AI provider: people type
// times, days and places into them in more ways than any rule can catch. On the model path each one
// the person can see (read once per turn, AS THE PERSON, so the row rules decide) becomes a
// placeholder like «[[E1]]» in every tool result, earlier answer, script and ficha; the model is
// told to keep the placeholders as written, and after it answers they become the real titles again
// in the text the person sees. Category, municipality and status still go as they are.

export type TitleSet = { events: string[]; pieces: string[]; places: string[] };
export const NO_TITLES: TitleSet = { events: [], pieces: [], places: [] };

type Kind = 'E' | 'P' | 'L';
const KIND_ORDER: Kind[] = ['E', 'P', 'L'];
// The most recent ones: every tool reads from these (the lookups take the latest 300).
const CAP = 3000;
// Shorter names (an empty place, «Acto») are ordinary words, left to the redaction rules.
const MIN_LENGTH: Record<Kind, number> = { E: 4, P: 4, L: 6 };

/** The event titles, piece titles and event place names this person can see (RLS). */
export async function loadTitles(s: Session): Promise<TitleSet> {
  return db(s, async (sql) => {
    const events = await sql.query<{ title: string; place_name: string }>(
      `select title, place_name from public.events where deleted_at is null order by created_at desc limit ${CAP}`,
    );
    const pieces = await sql.query<{ title: string }>(`select title from public.pieces where deleted_at is null order by updated_at desc limit ${CAP}`);
    return { events: events.map((r) => r.title), pieces: pieces.map((r) => r.title), places: events.map((r) => r.place_name) };
  });
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
const ORDINARY = new Set('nuevo nueva nuevos nuevas viejo vieja alto alta altos bajo baja bajos grande gran santa santo mayor central norte oeste verde blanco blanca negro negra real sector barrio pueblo plaza calle avenida zona parte casa'.split(' '));
// The little words between a title's words («Feria de emprendedores en la plaza…»).
const LINKS = new Set('de del la el los las lo en y o a al por con para un una sin sobre'.split(' '));
const contentWords = (t: string) => plain(t).split(' ').filter((w) => w && !LINKS.has(w));
// Two words of a title one after the other (the little words between them skipped), both of 4+
// letters: «toma aerea» for «Toma aérea Tariba», «jornada salud», «zona alta».
function pairsOf(t: string): string[] {
  const ws = contentWords(t);
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
// Read once per list (a turn checks its question and its whole thread against the same titles).
const indexCache = new WeakMap<string[], { whole: string[]; names: Set<string>; pairs: Set<string>; words: Set<string>; runs: string[] }>();
function indexOf(titles: string[]) {
  let ix = indexCache.get(titles);
  if (!ix) {
    ix = { whole: titles.map((t) => plain(t)).filter((t) => t.length >= 6), names: new Set<string>(), pairs: new Set<string>(), words: new Set<string>(), runs: [] };
    const runs = new Set<string>();
    for (const t of titles) {
      for (const w of String(t ?? '').split(/[^\p{L}\p{N}]+/u).slice(1)) if (/^\p{Lu}\p{L}{3,}$/u.test(w) && !ORDINARY.has(plain(w))) ix.names.add(plain(w));
      for (const p of pairsOf(String(t ?? ''))) ix.pairs.add(p);
      for (const w of contentWords(String(t ?? ''))) if (!/\d/.test(w)) ix.words.add(w);
      for (const r of runsOf(String(t ?? ''))) if (plain(r).length >= 6) runs.add(plain(r));
    }
    ix.runs = [...runs];
    indexCache.set(titles, ix);
  }
  return ix;
}

/**
 * The text names one of these titles: whole (6+ letters); with `byName`, by a name inside one
 * («Tariba») or a run of its capitalised words («Alto Verde»); with `words`, also by two of its words in
 * a row («toma aérea»).
 */
export function namesTitle(text: string, titles: string[], o: { byName?: boolean; words?: boolean } = {}): boolean {
  if (!titles.length) return false;
  const ix = indexOf(titles);
  const p = ` ${plain(text)} `;
  if (ix.whole.some((t) => p.includes(` ${t} `))) return true;
  if (o.byName && (p.split(' ').some((w) => w.length >= 4 && ix.names.has(w)) || ix.runs.some((r) => p.includes(` ${r} `)))) return true;
  return !!o.words && pairsOf(text).some((x) => ix.pairs.has(x));
}

const EMPTY = { names: new Set<string>(), pairs: new Set<string>(), words: new Set<string>(), runs: [] as string[] };
/** The names, word pairs, words (without the little ones) and capitalised runs of these titles, folded like plain(). */
export function titleIndex(titles: string[]): { names: Set<string>; pairs: Set<string>; words: Set<string>; runs: string[] } {
  return titles.length ? indexOf(titles) : EMPTY;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

// A placeholder is written «[[E1]]» (event), «[[P1]]» (piece) or «[[L1]]» (place). As a model may give
// it back: one or two brackets, spaces, lower case, with or without «».
const LOOSE_TOKEN = /(«\s*)?\[{1,2}\s*([EPLepl])\s*(\d{1,4})\s*\]{1,2}(\s*»)?/g;
/** Any placeholder, also an altered one, for checks that must ignore them. */
export const ANY_TOKEN = /\[{1,2}\s*[EPLepl]\s*\d{1,4}\s*\]{1,2}/g;
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
  return dropCutToken(
    String(text ?? '')
      .replace(LOOSE_TOKEN, (_m, _open, k: string) => FALLBACK[k.toUpperCase() as Kind])
      .replace(STRAY, 'eso'),
  )
    .replace(OPEN_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind])
    .replace(/[ \t]{2,}/g, ' ');
}

export class Placeholders {
  private readonly re: RegExp | null;
  private readonly kindOf = new Map<string, Kind>();
  private readonly original = new Map<string, string>();
  private readonly tokenOf = new Map<string, string>();
  private readonly byToken = new Map<string, { kind: Kind; text: string }>();
  private readonly count: Record<Kind, number> = { E: 0, P: 0, L: 0 };
  /** The titles it was made with (for the checks that look for an event named by its title). */
  readonly titles: TitleSet;

  constructor(set: TitleSet = NO_TITLES) {
    this.titles = set;
    const lists: Record<Kind, string[]> = { E: set.events, P: set.pieces, L: set.places };
    const add = (kind: Kind, text: string) => {
      const key = norm(text);
      // An event's title wins over a piece or a place with the same name.
      if (text.length < MIN_LENGTH[kind] || this.kindOf.has(key)) return;
      this.kindOf.set(key, kind);
      this.original.set(key, text);
    };
    for (const kind of KIND_ORDER) for (const raw of lists[kind] ?? []) add(kind, String(raw ?? '').trim());
    // A place by the run of capitalised words in its name («Alto Verde» of «Casa comunal Alto Verde»).
    for (const raw of set.places ?? []) for (const r of runsOf(String(raw ?? ''))) add('L', r);
    const keys = [...this.kindOf.keys()].sort((a, b) => b.length - a.length);
    this.re = keys.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
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
    return this.re ? s.replace(this.re, (m) => this.tokenFor(m)) : s;
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
    return dropCutToken(
      String(text ?? '')
        .replace(LOOSE_TOKEN, (_m, _open, k: string, n: string) => {
          const kind = k.toUpperCase() as Kind;
          const hit = this.byToken.get(`${kind}${Number(n)}`);
          const shown = !hit || kind === 'L' ? '' : o.scrub ? safeTitle(hit.text) : hit.text;
          return shown ? `«${shown}»` : FALLBACK[kind];
        })
        .replace(STRAY, 'eso'),
    )
      .replace(OPEN_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind])
      .replace(/[ \t]{2,}/g, ' ');
  }

  /**
   * A tool call's arguments with the real names, so a lookup by a placeholder finds the right row. A
   * placeholder it does not know (altered or invented) becomes the same words as in restore().
   */
  restoreArgs(raw: unknown): unknown {
    const put = (s: string) =>
      dropCutToken(
        s
          .replace(LOOSE_TOKEN, (_m, _open, k: string, n: string) => this.byToken.get(`${k.toUpperCase()}${Number(n)}`)?.text ?? FALLBACK[k.toUpperCase() as Kind])
          .replace(STRAY, 'eso'),
      ).replace(OPEN_TOKEN, (_m, k: string) => FALLBACK[k.toUpperCase() as Kind]);
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
