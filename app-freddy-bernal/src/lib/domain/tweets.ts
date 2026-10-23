import twitter from 'twitter-text';
import { DateTime } from 'luxon';

// ---------------------------------------------------------------------------
// Splitting a weekly document into tweets
// ---------------------------------------------------------------------------
const SEPARATOR_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,}|•{3,}|~{3,})\s*$/;
// "1.", "1)", "1 -", "#1", "Tweet 1:", "Tuit 1 -", "(1)"
const NUMBERED = /^\s*(?:\(?(?:tweet|tuit|post)\s*)?#?\(?\d{1,3}\s*[.)\-:–—]\s*|^\s*\(\d{1,3}\)\s*/i;

function cleanChunk(s: string) {
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .trim()
    .replace(/^["“”«]+|["“”»]+$/g, '')
    .trim();
}

export function splitTweets(input: string): string[] {
  const text = input.replace(/\r\n?/g, '\n').replace(/ /g, ' ').trim();
  if (!text) return [];
  const lines = text.split('\n');

  let chunks: string[];
  if (lines.some((l) => SEPARATOR_LINE.test(l))) {
    chunks = [];
    let cur: string[] = [];
    for (const l of lines) {
      if (SEPARATOR_LINE.test(l)) {
        chunks.push(cur.join('\n'));
        cur = [];
      } else cur.push(l);
    }
    chunks.push(cur.join('\n'));
    chunks = chunks.map((c) => c.replace(NUMBERED, ''));
  } else if (lines.filter((l) => NUMBERED.test(l)).length >= 2) {
    chunks = [];
    let cur: string[] | null = null;
    for (const l of lines) {
      if (NUMBERED.test(l)) {
        if (cur) chunks.push(cur.join('\n'));
        cur = [l.replace(NUMBERED, '')];
      } else if (cur) cur.push(l);
      // Text before the first number (a title) is dropped.
    }
    if (cur) chunks.push(cur.join('\n'));
  } else {
    chunks = text.split(/\n\s*\n+/);
  }
  return chunks.map(cleanChunk).filter((c) => c.length > 0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export const X_MAX = 280;

export function tweetLength(body: string): number {
  return twitter.parseTweet(body).weightedLength;
}

export function tweetUrls(body: string): string[] {
  return twitter.extractUrls(body);
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type TweetCheck = { length: number; tooLong: boolean; duplicateOf: number | null; urls: string[] };

export function checkTweets(bodies: string[]): TweetCheck[] {
  const seen = new Map<string, number>();
  return bodies.map((b, i) => {
    const length = tweetLength(b);
    const key = norm(b);
    const dup = seen.has(key) ? seen.get(key)! : null;
    if (!seen.has(key)) seen.set(key, i);
    return { length, tooLong: length > X_MAX, duplicateOf: dup, urls: tweetUrls(b) };
  });
}

// ---------------------------------------------------------------------------
// Category suggestion (no AI): match words of the tweet with category names and
// a small keyword list. Returns the best category id or null.
// ---------------------------------------------------------------------------
const KEYWORDS: Record<string, string[]> = {
  Vialidad: ['via', 'vias', 'carretera', 'asfalto', 'bacheo', 'hueco', 'puente', 'troncal', 'autopista'],
  Infraestructura: ['puente', 'obra', 'construccion', 'rehabilitacion', 'pilotes'],
  'Agua potable': ['agua', 'acueducto', 'tuberia', 'hidrologica'],
  Electricidad: ['luz', 'electricidad', 'electrico', 'transformador', 'alumbrado', 'postes'],
  Vivienda: ['vivienda', 'viviendas', 'casas', 'urbanismo', 'llaves'],
  Salud: ['salud', 'hospital', 'medico', 'medicos', 'vacuna', 'vacunacion', 'jornada', 'protesis', 'ambulatorio'],
  Educación: ['escuela', 'escuelas', 'educacion', 'docentes', 'estudiantes', 'liceo'],
  Deporte: ['deporte', 'cancha', 'deportivo', 'atletas', 'futbol', 'beisbol'],
  Seguridad: ['seguridad', 'policia', 'patrullaje', 'delito'],
  'Café y cacao': ['cafe', 'cacao', 'caficultores'],
  Agricultura: ['agricola', 'productores', 'cosecha', 'siembra', 'campo'],
  'Comercio y emprendimiento': ['emprendedores', 'emprendimiento', 'comercio', 'feria', 'creditos'],
  Turismo: ['turismo', 'turistas', 'visitar', 'paramo'],
  'Gestión de gobierno': ['gestion', 'gobierno', 'compromiso', 'trabajando'],
};

export function suggestCategory(body: string, categories: { id: string; name: string }[]): string | null {
  const words = new Set(norm(body).split(' '));
  let best: { id: string; score: number } | null = null;
  for (const c of categories) {
    const nameWords = norm(c.name).split(' ').filter((w) => w.length > 3);
    let score = nameWords.filter((w) => words.has(w)).length * 2;
    for (const k of KEYWORDS[c.name] ?? []) if (words.has(k)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Distributing tweets over the week
// ---------------------------------------------------------------------------
export type Slot = { from: string; to: string }; // "HH:mm" in the app timezone

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Small deterministic PRNG so tests (and re-runs) give the same schedule.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Returns one ISO timestamp per tweet. Rules: start at `start` (never in the past),
 * `perDay.min`–`perDay.max` tweets per day alternating, each in a different slot,
 * never two in the same hour, minutes varied (not :00 and not repeated in a day),
 * and skipping times already taken by `taken`.
 */
export function distribute(
  count: number,
  opts: { start: DateTime; slots: Slot[]; perDay: { min: number; max: number }; taken?: string[]; seed?: number; tz: string },
): string[] {
  const rand = rng(opts.seed ?? count * 7919);
  const slots = [...opts.slots].sort((a, b) => minutesOf(a.from) - minutesOf(b.from));
  const takenHours = new Set((opts.taken ?? []).map((t) => DateTime.fromISO(t).setZone(opts.tz).toFormat('yyyy-MM-dd HH')));
  const out: string[] = [];
  let day = opts.start.setZone(opts.tz).startOf('day');
  const now = opts.start.setZone(opts.tz);
  let dayIndex = 0;
  let guard = 0;

  while (out.length < count && guard++ < 400) {
    const target = Math.min(slots.length, dayIndex % 2 === 0 ? opts.perDay.max : opts.perDay.min);
    // Spread `target` picks evenly across the available slots.
    const picks: Slot[] = [];
    for (let k = 0; k < target; k++) picks.push(slots[Math.floor((k * slots.length) / target)]);
    const usedHours = new Set<number>();
    const usedMinutes = new Set<number>();
    for (const slot of picks) {
      if (out.length >= count) break;
      const a = minutesOf(slot.from);
      const b = Math.max(a + 1, minutesOf(slot.to));
      let placed: DateTime | null = null;
      for (let attempt = 0; attempt < 30 && !placed; attempt++) {
        const m = a + Math.floor(rand() * (b - a));
        const hour = Math.floor(m / 60);
        const minute = m % 60;
        if (minute === 0 || usedHours.has(hour) || usedMinutes.has(minute)) continue;
        const t = day.set({ hour, minute, second: 0, millisecond: 0 });
        if (t <= now.plus({ minutes: 10 })) continue;
        if (takenHours.has(t.toFormat('yyyy-MM-dd HH'))) continue;
        placed = t;
      }
      if (placed) {
        usedHours.add(placed.hour);
        usedMinutes.add(placed.minute);
        out.push(placed.toUTC().toISO()!);
      }
    }
    day = day.plus({ days: 1 });
    dayIndex++;
  }
  return out.sort();
}

// How many days of scheduled tweets remain (counting today if something is still due).
export function daysOfStock(scheduled: string[], now: DateTime, tz: string): number {
  const future = scheduled.map((s) => DateTime.fromISO(s).setZone(tz)).filter((d) => d > now);
  if (future.length === 0) return 0;
  const last = future.reduce((a, b) => (b > a ? b : a));
  return Math.max(0, Math.floor(last.startOf('day').diff(now.setZone(tz).startOf('day'), 'days').days) + 1);
}
