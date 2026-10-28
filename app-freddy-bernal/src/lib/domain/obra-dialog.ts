import { DateTime } from 'luxon';
import { cap, endDot, placeOf, prose, sentences, unknownNumbers } from './copies';
import { OBRA_FIELDS, isoDay } from './ficha-fields';
import { phonesIn } from './phones';
import { WORK_STATE, type WorkState } from '../data/ficha-labels';

// «Generame un diálogo FAB con esto» (§4.1), with the AI off: «Lo que voy a decir» for the boss's visit, built
// from the obra ficha with the FAB formula (Característica → Ventaja → Beneficio), in his voice (first person
// plural, plain words, no emojis: it is read aloud). Rule 7, «nunca inventa cifras»: every number comes from the
// ficha as typed; no sums, no «faltan N días», no percentages worked out. A field marked «Por confirmar» is never
// said; «No aplica» is skipped quietly. It reads only the MAIN part of the ficha (DIALOG_KEYS): never a contact,
// a phone, a reporter's name or what the boss must know in private. Editable before saving.

export const DIALOG_KEYS = [
  'name', 'municipality', 'parish', 'sector', 'problem', 'problem_since', 'why_decided', 'works', 'communities',
  'people_count', 'families_count', 'benefits', 'executor', 'investment', 'currency', 'funding_source', 'work_state',
  'progress_pct', 'due_on',
] as const;
type DialogKey = (typeof DIALOG_KEYS)[number];

export type ObraDialogInput = {
  name: string; municipality: string; parish: string; sector: string;
  problem: string; problem_since: string; why_decided: string; works: string; communities: string;
  people_count: number | null; families_count: number | null; benefits: string;
  executor: string; investment: string; currency: string; funding_source: string;
  work_state: string | null; progress_pct: number | null; due_on: string | Date | null;
  marks: Record<string, string>;
};
export type DialogBrand = { greeting: string; closings: string[] };
export type ObraDialog = { text: string; feature: string; advantage: string; benefit: string; missing: string[] };

// Only the keys the template may read, whatever else the row carries (a private field cast in never gets through).
export function dialogInput(row: Record<string, unknown>): ObraDialogInput {
  const s = (k: DialogKey) => (typeof row[k] === 'string' ? (row[k] as string) : '');
  const n = (k: DialogKey) => {
    const v = row[k];
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const due = row.due_on;
  return {
    name: s('name'), municipality: s('municipality'), parish: s('parish'), sector: s('sector'),
    problem: s('problem'), problem_since: s('problem_since'), why_decided: s('why_decided'), works: s('works'), communities: s('communities'),
    people_count: n('people_count'), families_count: n('families_count'), benefits: s('benefits'),
    executor: s('executor'), investment: s('investment'), currency: s('currency'), funding_source: s('funding_source'),
    work_state: typeof row.work_state === 'string' ? row.work_state : null, progress_pct: n('progress_pct'),
    due_on: due instanceof Date || typeof due === 'string' ? due : null,
    marks: row.marks && typeof row.marks === 'object' ? (row.marks as Record<string, string>) : {},
  };
}

const LABEL = Object.fromEntries(OBRA_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;
const NO_EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu;
const MAX_SENTENCES = 2;

// The currency as said aloud, unless the amount already says it («Bs. 1.500.000», «$ 20.000»).
const CURRENCY_SAID: Record<string, { word: string; named: RegExp }> = {
  VES: { word: 'bolívares', named: /\bbs\b|bs\.|bol[ií]var/i },
  USD: { word: 'dólares', named: /\$|\busd\b|d[oó]lar/i },
  EUR: { word: 'euros', named: /€|\beur\b|euro/i },
  COP: { word: 'pesos colombianos', named: /\bcop\b|peso/i },
};

const spokenDay = (v: unknown) => {
  const d = isoDay(v);
  return d ? DateTime.fromISO(d, { zone: 'utc' }).setLocale('es').toFormat("d 'de' LLLL 'de' yyyy") : '';
};

// 1200 → «1200», 12000 → «12.000», as people write it in Venezuela (the guard reads both as the same figure).
const fmtInt = (n: number) => Math.trunc(n).toLocaleString('es-VE');

const clean = (s: string) => prose(s.replace(NO_EMOJI, '')).trim();
// No final period (it goes inside a sentence of the template).
const bare = (s: string) => clean(s).replace(/[\s.;:,]+$/, '');
// Lowercase the first letter when the text starts a phrase mid-sentence («Rehabilitación de…» → «rehabilitación
// de…»), but not a name («La Quebrada se cayó…»: the second word is capitalized too) nor an acronym («IVT»).
function lc(s: string): string {
  const m = /^([¡¿«"“‘'\s]*)(\p{Lu})(\p{Ll}*)(\s+(\S))?/u.exec(s);
  if (!m) return s;
  if (!m[3] && m[2]) return s; // a single capital letter or an acronym
  if (m[5] && /\p{Lu}/u.test(m[5])) return s;
  return s.replace(/^([¡¿«"“‘'\s]*)(\p{Lu})/u, (_, a: string, b: string) => a + b.toLocaleLowerCase('es'));
}

export function buildObraDialog(input: ObraDialogInput, brand: DialogBrand): ObraDialog {
  const f = dialogInput(input as unknown as Record<string, unknown>);
  const missing: string[] = [];
  const note = (m: string) => {
    if (!missing.includes(m)) missing.push(m);
  };
  // A value the template may say: typed, and not marked. «Por confirmar» goes to `missing` (never said);
  // «No aplica» is skipped quietly; an empty field the template wants goes to `missing` when `wanted`.
  const take = (k: DialogKey, wanted = true): string => {
    const mark = f.marks[k];
    if (mark === 'to_confirm') {
      note(`Por confirmar: ${LABEL[k]} (no se dice)`);
      return '';
    }
    if (mark === 'not_applicable') return '';
    const v = f[k];
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (!s && wanted) note(`Falta: ${LABEL[k]}`);
    return s;
  };
  // A long answer: its first two sentences (about a minute read aloud).
  const two = (k: DialogKey): string => {
    const raw = take(k);
    if (!raw) return '';
    const all = sentences(clean(raw));
    if (all.length > MAX_SENTENCES) note(`Se dicen solo las dos primeras oraciones de «${LABEL[k]}»`);
    return all.slice(0, MAX_SENTENCES).join(' ');
  };

  // Opening: the greeting and where we are.
  const name = bare(take('name'));
  // «parroquia La Concordia», unless the name already says it («Parroquia centro»).
  const parish = bare(take('parish', false));
  const where = placeOf(
    [bare(take('sector', false)), parish && !/^parroquia\b/i.test(parish) ? `parroquia ${parish}` : parish].filter(Boolean).join(', '),
    take('municipality', false) ? `municipio ${bare(f.municipality)}` : '',
  );
  const greeting = bare(brand.greeting.replace(NO_EMOJI, '')) ? endDot(brand.greeting.replace(NO_EMOJI, '').trim()) : '';
  const opening = [greeting, where || name ? endDot(`Estamos${where ? ` en ${where}` : ''}${name ? `, en la obra ${lc(name)}` : ''}`.replace('Estamos, en', 'Estamos en')) : ''].filter(Boolean).join(' ');

  // Característica: what we are doing, who does it, how far it is, what it costs.
  const feature: string[] = [];
  const works = two('works');
  if (works) feature.push(`Lo que estamos haciendo: ${lc(works)}`);
  const executor = bare(take('executor'));
  if (executor) feature.push(`La obra la ejecuta ${executor}.`);
  // The percentage as typed; without it, the state («en ejecución»); without both, it is missing.
  const pct = take('progress_pct', false);
  if (pct) feature.push(`Ya vamos en ${pct} % de avance.`);
  else {
    const state = take('work_state', false);
    const label = state ? WORK_STATE[state as WorkState]?.label : '';
    if (label) feature.push(`La obra está ${label.toLocaleLowerCase('es')}.`);
    else if (!f.marks.progress_pct && !f.marks.work_state) note(`Falta: ${LABEL.progress_pct}`);
  }
  const investment = bare(take('investment'));
  if (investment) {
    const cur = take('currency', false);
    const said = CURRENCY_SAID[cur];
    const funding = bare(take('funding_source', false));
    feature.push(`La inversión es de ${investment}${said && !said.named.test(investment) ? ` ${said.word}` : ''}${funding ? `, con recursos de ${funding}` : ''}.`);
  }

  // Ventaja: what was wrong, since when, why it was decided, when it is delivered.
  const advantage: string[] = [];
  const problem = two('problem');
  if (problem) advantage.push(`Esta obra resuelve un problema: ${lc(problem)}`);
  const since = bare(take('problem_since'));
  if (since) advantage.push(`Esto venía pasando desde ${lc(since).replace(/^desde\s+/i, '')}.`);
  const why = two('why_decided');
  if (why) advantage.push(`Decidimos hacerla porque ${lc(why.replace(/^porque\s+/i, ''))}`);
  const due = take('due_on');
  if (due && spokenDay(f.due_on)) advantage.push(`La entrega está prevista para el ${spokenDay(f.due_on)}.`);

  // Beneficio: who gains and what.
  const benefit: string[] = [];
  const communities = bare(take('communities'));
  if (communities) benefit.push(`Beneficia a ${lc(communities).replace(/^a\s+/i, '')}.`);
  const people = take('people_count', false);
  const families = take('families_count', false);
  const peopleN = people ? Number(people) : null;
  const familiesN = families ? Number(families) : null;
  const pp = peopleN !== null ? `${fmtInt(peopleN)} ${peopleN === 1 ? 'persona' : 'personas'}` : '';
  const ff = familiesN !== null ? `${fmtInt(familiesN)} ${familiesN === 1 ? 'familia' : 'familias'}` : '';
  if (pp || ff) benefit.push(`Son ${[pp, ff].filter(Boolean).join(' y ')}.`);
  else if (!f.marks.people_count && !f.marks.families_count) note('Falta: Cuántas personas o familias');
  const benefits = two('benefits');
  if (benefits) benefit.push(cap(benefits));

  const part = (xs: string[]) => xs.join(' ').trim();
  const out = { feature: part(feature), advantage: part(advantage), benefit: part(benefit) };
  if (!out.feature && !out.advantage && !out.benefit) return { text: '', ...out, missing };
  const closing = (brand.closings[0] ?? '').replace(NO_EMOJI, '').trim();
  const text = [opening, out.feature, out.advantage, out.benefit, closing ? endDot(closing) : ''].filter(Boolean).join('\n\n');
  return { text, ...out, missing };
}

// What the dialog may quote figures from: the ficha's main fields as typed, the delivery date as it is said, and
// the brand's own greeting and closings. The same guard checks a text edited by hand (a warning, never a block)
// and, once the AI is on, what the AI writes (as pieces.ts does with the copies).
export function obraDialogSources(input: ObraDialogInput, brand: DialogBrand): string[] {
  const f = dialogInput(input as unknown as Record<string, unknown>);
  return [
    f.name, f.municipality, f.parish, f.sector, f.problem, f.problem_since, f.why_decided, f.works, f.communities,
    f.benefits, f.executor, f.investment, f.funding_source,
    f.people_count === null ? '' : String(f.people_count),
    f.families_count === null ? '' : String(f.families_count),
    f.progress_pct === null ? '' : String(f.progress_pct),
    isoDay(f.due_on), spokenDay(f.due_on),
    brand.greeting, ...brand.closings,
  ];
}

// Figures in a dialog (edited by hand, or by the AI later) that are not in the ficha.
export function dialogUnknownNumbers(text: string, input: ObraDialogInput, brand: DialogBrand): string[] {
  return unknownNumbers([text], obraDialogSources(input, brand));
}

// ---------------------------------------------------------------------------
// Contacts never go into «Lo que voy a decir»: Redes and Grabación read it (and Redes builds the storyboard with
// it). The template never reads the private part; a text edited by hand is checked before it is saved: no value of
// the ficha's contacts (names, phones) and nothing that looks like a phone number, whatever its source: the database
// refuses the same in fab_dialog (obra_fichas_main_no_phone, 20261028002100_privacy_hardening.sql), so a figure of
// the ficha written as a phone would be («1200 300»: write «1.200 personas y 300 familias»). An amount with dots
// («1.500.000») or a date is never a phone.
// ---------------------------------------------------------------------------
const CONTACT_KEYS = ['reporter_name', 'liaison_name', 'representative', 'engineer_phone', 'liaison_phone'] as const;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Phone-like figures in a text: the app's one detector (phones.ts), the rule the database checks.
export function dialogPhones(text: string): string[] {
  return phonesIn(text);
}

// Why a hand-edited «Lo que voy a decir» cannot be saved, or null. `priv` = the ficha's private row as this person
// reads it (null without 2FA: then only the phone-like check runs).
export function dialogContactProblem(text: string, input: ObraDialogInput, brand: DialogBrand, priv: Record<string, unknown> | null): string | null {
  const main = obraDialogSources(input, brand).join('\n');
  for (const k of CONTACT_KEYS) {
    const v = typeof priv?.[k] === 'string' ? (priv[k] as string).trim() : '';
    if (v.length < 3) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v)}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text) && !re.test(main)) {
      return `No se guardó: «Lo que voy a decir» lo leen Redes y Grabación, y tiene un dato de los contactos de la ficha («${LABEL[k] ?? k}»). Quítalo y guarda otra vez.`;
    }
  }
  const phones = dialogPhones(text);
  if (phones.length) {
    return `No se guardó: «Lo que voy a decir» lo leen Redes y Grabación, y tiene algo que parece un teléfono (${phones.join(', ')}). Quítalo y guarda otra vez; si es una cifra, escríbela con puntos: 1.500.000.`;
  }
  return null;
}
