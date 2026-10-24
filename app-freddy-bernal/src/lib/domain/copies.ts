import { tweetLength } from './tweets';

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
  bossLines: string; // storyboard "Lo que dice el jefe", one per line
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

export const LIMITS = { long: 2200, medium: 500, short: 280 } as const;

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`));
}

// Facts without the "(fuente)" part, for the public text.
function facts(text: string): string[] {
  return sentences(text).map((s) => s.replace(/\s*\([^)]*\)\s*(?=[.!?]?$)/, '').trim());
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function hashtagFor(title: string) {
  const words = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3)
    .slice(0, 3);
  return words.length ? `#${words.map((w) => cap(w.toLowerCase())).join('')}` : '';
}

function fit(parts: string[], max: number, measure: (s: string) => number, joiner = '\n\n'): string {
  // Drop the longest middle parts until it fits; never cut a sentence in half.
  const out = [...parts];
  while (out.length > 2 && measure(out.join(joiner)) > max) {
    let idx = 1;
    for (let i = 1; i < out.length - 1; i++) if (out[i].length > out[idx].length) idx = i;
    out.splice(idx, 1);
  }
  return out.join(joiner);
}

function noDot(s: string) {
  return s.trim().replace(/[.!…]+$/, '');
}

function closingLines(c: Closing): { long: string; medium: string; short: string } {
  const t = noDot(c.text ?? '');
  if (c.kind === 'question') return QUESTION;
  if (c.kind === 'none' || !t) return { long: '', medium: '', short: '' };
  if (c.kind === 'destination') return { long: `👉 ${t}`, medium: `👉 ${t}`, short: `👉 ${t}` };
  return { long: `💛 ${t}.`, medium: `${t}.`, short: t };
}

// A sentence the boss said, for a textual quote. Skips the greeting and anything with
// figures (figures only go out from "Datos y cifras", with their source).
function quoteFrom(text: string, greeting: string): string {
  const g = noDot(greeting).toLowerCase();
  for (const s of sentences(text)) {
    const q = noDot(s);
    if (q.toLowerCase() === g || /\d/.test(q) || q.split(/\s+/).length < 3) continue;
    return q;
  }
  return '';
}

export function buildCopies(input: CopyInput, formula: Formula, brand: CopyBrand, opts: CopyOptions = defaultOptions(brand)): CopySet {
  const missing: string[] = [];
  const f = facts(input.keyFacts);
  const work = input.workDescription || input.summary;
  const achieve = input.achievements;
  if (!work) missing.push('De qué es la obra o el acto');
  if (!achieve) missing.push('Qué se está logrando');
  if (!f.length) missing.push('Datos y cifras (con fuente)');

  const where = [input.place, input.municipality].filter(Boolean).join(', ');
  const hook = f[0] ? `${f[0]}` : cap(input.title) + (where ? ` en ${where}.` : '.');
  const boss = opts.voice === 'boss';
  const who = input.ledBy || input.inCharge;
  const credit = who ? `A cargo: ${who}.` : '';
  const end = closingLines(opts.closing);
  const tags = [hashtagFor(input.title), ...brand.hashtags].filter(Boolean).slice(0, 3).join(' ');
  const join = (t: string) => (t ? cap(sentences(t).join(' ')) : '');
  const first = (t: string) => (t ? cap(sentences(t)[0]) : '');
  const needDestination = () => {
    if (opts.closing.kind !== 'destination' || !noDot(opts.closing.text ?? '')) missing.push(DESTINATION_MISSING);
  };
  let credited = false;

  const steps: Record<string, string> = {};
  switch (formula.code) {
    case 'PAS':
      steps.problem = first(input.summary) || `${cap(input.title)}.`;
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
      const q = quoteFrom(input.speech, brand.greeting) || quoteFrom(input.bossLines, brand.greeting);
      if (!q) missing.push('Una frase textual del jefe, sin cifras (storyboard)');
      steps.quote = q ? (boss || !brand.name ? `«${q}».` : `«${q}», ${brand.name}.`) : '';
      steps.context = `${cap(input.title)}.`;
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
      steps.feature = join(work) || `${cap(input.title)}.`;
      steps.advantage = join(achieve);
      steps.benefit = f.length ? f.join(' ') : '';
  }
  // Custom formulas: use the steps in their order with whatever data matches.
  const body = formula.steps.map((s) => steps[s.key] ?? '').filter(Boolean);
  if (!body.length) body.push(`${cap(input.title)}.`);

  // Formulas that open with their own first step (the problem, the complaint, the quote,
  // the protagonist); the rest open with the strongest fact.
  const lead = ['PAS', 'DAR', 'CITA', 'HIST'].includes(formula.code) ? body[0] : hook;
  const rest = body.filter((b) => b !== lead);
  const pin = where ? [`📍 ${where}`] : [];
  // First line: the boss's greeting in his voice; the fact itself in the institutional one.
  const head = boss ? [`${brand.greeting} 👋`, ...pin, ...body] : [lead, ...pin, ...rest];
  const longParts = [...head, ...(credit && !credited ? [credit] : []), ...(end.long ? [end.long] : [])];
  const long = fit(longParts, LIMITS.long, (s) => [...s].length);

  const mediumParts = [lead, ...rest.slice(0, 2), ...(end.medium ? [end.medium] : [])];
  const medium = fit(mediumParts, LIMITS.medium, (s) => [...s].length, '\n\n');

  // X: the lead, one more line, closing and hashtags.
  const tail = [end.short, tags].filter(Boolean).join(' ');
  const shortCandidates = [
    [first(lead), rest[0] ? first(rest[0]) : first(work), tail],
    [first(lead), tail],
    [cap(input.title) + '.', tail],
  ];
  let short = '';
  for (const c of shortCandidates) {
    const s = c.filter(Boolean).join(' ');
    if (tweetLength(s) <= LIMITS.short) {
      short = s;
      break;
    }
  }
  if (!short) short = shortCandidates[2].filter(Boolean).join(' ').slice(0, 270);

  return { long, medium, short, missing };
}

export function copyLength(group: 'long' | 'medium' | 'short', text: string) {
  return group === 'short' ? tweetLength(text) : [...text].length;
}
