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
// Read once per list (a turn checks its question and its whole thread against the same titles).
const indexCache = new WeakMap<string[], { whole: string[]; names: Set<string> }>();
function indexOf(titles: string[]) {
  let ix = indexCache.get(titles);
  if (!ix) {
    ix = { whole: titles.map((t) => plain(t)).filter((t) => t.length >= 6), names: new Set<string>() };
    for (const t of titles) {
      for (const w of String(t ?? '').split(/[^\p{L}\p{N}]+/u).slice(1)) if (/^\p{Lu}\p{L}{3,}$/u.test(w) && !ORDINARY.has(plain(w))) ix.names.add(plain(w));
    }
    indexCache.set(titles, ix);
  }
  return ix;
}

/** The text names one of these titles: whole (6+ letters), or with `byName` by a name inside one. */
export function namesTitle(text: string, titles: string[], o: { byName?: boolean } = {}): boolean {
  if (!titles.length) return false;
  const ix = indexOf(titles);
  const p = ` ${plain(text)} `;
  if (ix.whole.some((t) => p.includes(` ${t} `))) return true;
  return !!o.byName && p.split(' ').some((w) => w.length >= 4 && ix.names.has(w));
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
const FALLBACK: Record<Kind, string> = { E: 'ese evento', P: 'esa pieza', L: 'ese lugar' };

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
    for (const kind of KIND_ORDER) {
      for (const raw of lists[kind] ?? []) {
        const text = String(raw ?? '').trim();
        const key = norm(text);
        // An event's title wins over a piece or a place with the same name.
        if (text.length < MIN_LENGTH[kind] || this.kindOf.has(key)) continue;
        this.kindOf.set(key, kind);
        this.original.set(key, text);
      }
    }
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
    return String(text ?? '')
      .replace(LOOSE_TOKEN, (_m, _open, k: string, n: string) => {
        const kind = k.toUpperCase() as Kind;
        const hit = this.byToken.get(`${kind}${Number(n)}`);
        const shown = !hit || kind === 'L' ? '' : o.scrub ? safeTitle(hit.text) : hit.text;
        return shown ? `«${shown}»` : FALLBACK[kind];
      })
      .replace(STRAY, 'eso')
      .replace(/[ \t]{2,}/g, ' ');
  }

  /** A tool call's arguments with the real names, so a lookup by a placeholder finds the right row. */
  restoreArgs(raw: unknown): unknown {
    const put = (s: string) => s.replace(LOOSE_TOKEN, (m, _open, k: string, n: string) => this.byToken.get(`${k.toUpperCase()}${Number(n)}`)?.text ?? m);
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

/** The known names in a text replaced by «[titulo]», the data hueco of the scripts. */
export function withTitleHoles(text: string, set: TitleSet): string {
  return new Placeholders(set).mask(text).replace(/«?\[\[[EP]\d+\]\]»?/g, '«[titulo]»').replace(/\[\[L\d+\]\]/g, 'el lugar');
}
