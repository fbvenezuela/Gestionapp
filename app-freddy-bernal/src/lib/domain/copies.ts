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
  achievements: string;
  keyFacts: string;
  speech: string;
  category: string | null;
};

export type CopyBrand = { greeting: string; closings: string[]; hashtags: string[] };
export type Formula = { code: string; name: string; steps: { key: string; label: string; hint: string }[] };
export type CopySet = { long: string; medium: string; short: string; missing: string[] };

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

export function buildCopies(input: CopyInput, formula: Formula, brand: CopyBrand): CopySet {
  const missing: string[] = [];
  const f = facts(input.keyFacts);
  const work = input.workDescription || input.summary;
  const achieve = input.achievements;
  if (!work) missing.push('De qué es la obra o el acto');
  if (!achieve) missing.push('Qué se está logrando');
  if (!f.length) missing.push('Datos y cifras (con fuente)');

  const where = [input.place, input.municipality].filter(Boolean).join(', ');
  const hook = f[0] ? `${f[0]}` : cap(input.title) + (where ? ` en ${where}.` : '.');
  const opener = `${brand.greeting} 👋`;
  const closing = brand.closings[0] ?? '';
  const closing2 = brand.closings[1] ?? closing;
  const tags = [hashtagFor(input.title), ...brand.hashtags].filter(Boolean).slice(0, 3).join(' ');

  const steps: Record<string, string> = {};
  switch (formula.code) {
    case 'PAS':
      steps.problem = input.summary ? cap(sentences(input.summary)[0]) : `${cap(input.title)}.`;
      steps.agitation = f.slice(0, 2).join(' ') || '';
      steps.solution = [work && cap(sentences(work).join(' ')), achieve && cap(sentences(achieve).join(' '))].filter(Boolean).join(' ');
      break;
    case 'AIDA':
      steps.attention = hook;
      steps.interest = work ? cap(sentences(work).join(' ')) : '';
      steps.desire = achieve ? cap(sentences(achieve).join(' ')) : '';
      steps.action = '¿Qué opinas? Cuéntanos en los comentarios 👇';
      break;
    default: // FAB and any custom formula
      steps.feature = work ? cap(sentences(work).join(' ')) : `${cap(input.title)}.`;
      steps.advantage = achieve ? cap(sentences(achieve).join(' ')) : '';
      steps.benefit = f.length ? f.join(' ') : '';
  }
  // Custom formulas: use the steps in their order with whatever data matches.
  const body = formula.steps.map((s) => steps[s.key] ?? '').filter(Boolean);
  if (!body.length) body.push(`${cap(input.title)}.`);

  const longParts = [opener, ...(where ? [`📍 ${where}`] : []), ...body, ...(input.ledBy ? [`A cargo: ${input.ledBy}.`] : []), `💛 ${closing2}.`];
  const long = fit(longParts, LIMITS.long, (s) => [...s].length);

  const mediumParts = [hook, ...body.slice(0, 2), `${closing}. ¿Qué opinas? Cuéntanos 👇`];
  const medium = fit(mediumParts, LIMITS.medium, (s) => [...s].length, '\n\n');

  // X: the strongest fact, one line of what was done, closing and hashtags.
  const shortCandidates = [
    [hook, work ? cap(sentences(work)[0]) : '', `${closing} 👇 ${tags}`],
    [hook, `${closing} 👇 ${tags}`],
    [cap(input.title) + '.', `${closing} 👇 ${tags}`],
  ];
  let short = '';
  for (const c of shortCandidates) {
    const s = c.filter(Boolean).join(' ');
    if (tweetLength(s) <= LIMITS.short) {
      short = s;
      break;
    }
  }
  if (!short) short = shortCandidates[2].join(' ').slice(0, 270);

  return { long, medium, short, missing };
}

export function copyLength(group: 'long' | 'medium' | 'short', text: string) {
  return group === 'short' ? tweetLength(text) : [...text].length;
}
