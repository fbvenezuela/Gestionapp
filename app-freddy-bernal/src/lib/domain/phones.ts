import type { FieldDef, FichaKind } from './ficha-fields';

// Phone numbers in free text (cambios del 27/10/2026, §4.1): ONE detector for everything that keeps a third party's
// phone away from Redes and Grabación: the event's «Ficha de obra» tab, the brief of an event born from a ficha,
// «Antes de hablar» on the boss's iPad, the save guard of «Lo que voy a decir» and the save of a ficha's main part.
// Pure, so it can be tested.
//
// A candidate is a run of digits joined by phone separators: spaces, dashes, dots, slashes, underscores and
// parentheses (up to three between two digits: «0414 - 555»), with an optional + and ( in front. Venezuelan
// numbers are written every way: 0414-555-0199, 0414.555.0199, 0414-555.01.99, (0276) 555 0101, +58 414 555 0199.
// It is a phone when it has 7 digits or more, except:
//   * an amount with dots for thousands: «1.500.000», «1.500.000 - 2.000.000» (every piece is one);
//   * a date: «15/03/2024», «15.03.2024», «2024-03-15»;
//   * bare digits with no separator, shorter than 10: «1500000» is an amount, «04145550199» is a phone;
//   * an ID with its letter: «J-30123456-7», «V-12345678» (a company's RIF goes in «Organismo o empresa»).
// A comma ends a run: «1.500.000,50» is an amount, «0414,» ends where the phone does. A new line ends it too (two
// figures on two lines are two figures).

const SEP = '[ \\t\\u00a0\\u202f().\\/_-]';
const RUN = new RegExp(`(?<!\\p{L}-)(?<![\\p{N}])\\+?\\(?\\d(?:${SEP}{0,3}\\d)*`, 'gu');
const AMOUNT = /^\(?\d{1,3}(?:\.\d{3})+\)?$/;
const DATE = /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/;
const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Whether one run of digits and separators (as RUN finds it) is a phone number. */
export function isPhoneRun(run: string): boolean {
  const digits = digitsOf(run);
  if (digits.length < 7) return false;
  if (/^\+?\(?\d+$/.test(run)) return run.startsWith('+') || digits.length >= 10;
  const pieces = run.split(/[ \t\u00a0\u202f]+/).filter((p) => /\d/.test(p));
  return !pieces.every((p) => AMOUNT.test(p) || DATE.test(p));
}

/** Every phone number written in `text`, as written (trimmed), once each. */
export function phonesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').normalize('NFKC').match(RUN) ?? []) {
    const c = m.trim();
    if (isPhoneRun(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/** `text` without anything that looks like a phone number, tidied. */
export function withoutPhones(s: string): string {
  return (s ?? '')
    .normalize('NFKC')
    .replace(RUN, (m) => (isPhoneRun(m.trim()) ? '' : m))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+([,.;:])/g, '$1')
    .trim();
}

// ---------------------------------------------------------------------------
// The main part of a ficha never carries a phone: phones go in its contacts (the private part, 2FA). Redes and
// Grabación read an obra's main text as it is stored while its visit is live (visit_obra_ficha()), and an event born
// from a ficha takes its text; a report's main part is read without 2FA. A false alarm has a way out: an amount
// written with dots. The database checks the same rule (public.text_has_phone(), 20261028002100_privacy_hardening.sql)
// on the obra's text Redes reads and on a cancel reason: a change here goes into a new migration too, with the cases
// of tests/unit/fixtures/privacy-text-cases.ts.
// ---------------------------------------------------------------------------
const FREE_TEXT = new Set<FieldDef['type']>(['title', 'short', 'long', 'parish']);

/** The first free-text field of the main part that carries a phone, or null. */
export function mainTextPhone(defs: readonly FieldDef[], main: Record<string, unknown>): { key: string; label: string; phones: string[] } | null {
  for (const d of defs) {
    if (d.private || !FREE_TEXT.has(d.type)) continue;
    const v = main[d.key];
    if (typeof v !== 'string' || !v) continue;
    const phones = phonesIn(v);
    if (phones.length) return { key: d.key, label: d.label, phones };
  }
  return null;
}

/** Why a ficha is not saved: a phone in its main part (in Spanish, for the person). */
export function mainPhoneMessage(kind: FichaKind, hit: { label: string; phones: string[] }): string {
  const where = kind === 'obra' ? '«Teléfono del ingeniero» o «Teléfono del enlace comunitario»' : '«Teléfono» de la persona que reporta';
  const who = kind === 'obra' ? 'Redes y Grabación leen esta parte de la ficha cuando la visita tiene fecha' : 'esta parte del reporte se lee sin doble factor';
  return `No se guardó: «${hit.label}» tiene algo que parece un teléfono (${hit.phones.join(', ')}), y ${who}. Los teléfonos van en ${where}. Si es una cifra, escríbela con puntos: 1.500.000.`;
}
