import type { Mark } from '../data/ficha-labels';
import type { FormValues, Marks } from './ficha-fields';

// What the phone keeps of a ficha being written (useDraft): ONLY what this person changed, each change with the
// value the field had when they started, plus the version (rev) they started from. Never the contacts (they are
// not kept in the phone at all). Pure, so the rules can be tested:
//   * Opening a form and leaving keeps nothing (no change, no draft).
//   * Coming back: the server's current values, with this person's changes on top. A field nobody else touched
//     takes the change quietly; a field someone else changed in between is a conflict (edit form: the change
//     stays and the save is sent with the old rev, so «Ojo: alguien la cambió…» fires; new form: the fresh value,
//     like a ?municipio= preset, wins and the old change is dropped).
//   * A draft that ends up changing nothing is thrown away.

export type FieldEdit = { from: string; to: string };
export type MarkEdit = { from: Mark | null; to: Mark | null };
export type FichaDraft = {
  base: number | null;
  values: Record<string, FieldEdit>;
  marks: Record<string, MarkEdit>;
  wantsAgenda: { from: boolean | null; to: boolean } | null;
};
export type DraftBase = { values: FormValues; marks: Marks; wantsAgenda: boolean | null; rev: number | null };

export const EMPTY_DRAFT: FichaDraft = { base: null, values: {}, marks: {}, wantsAgenda: null };

const MARK_VALUES = new Set<string>(['not_applicable', 'to_confirm']);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const markOrNull = (x: unknown): Mark | null => (typeof x === 'string' && MARK_VALUES.has(x) ? (x as Mark) : null);

// A saved draft as it comes back from the phone: anything that is not this shape (an older format, a broken
// value) is dropped.
export function normalizeDraft(raw: unknown): FichaDraft {
  if (!isObj(raw)) return { ...EMPTY_DRAFT };
  const values: Record<string, FieldEdit> = {};
  if (isObj(raw.values)) {
    for (const [k, e] of Object.entries(raw.values)) {
      if (isObj(e) && typeof e.from === 'string' && typeof e.to === 'string') values[k] = { from: e.from, to: e.to };
    }
  }
  const marks: Record<string, MarkEdit> = {};
  if (isObj(raw.marks)) {
    for (const [k, e] of Object.entries(raw.marks)) {
      if (isObj(e) && 'from' in e && 'to' in e) marks[k] = { from: markOrNull(e.from), to: markOrNull(e.to) };
    }
  }
  const w = raw.wantsAgenda;
  const wantsAgenda =
    isObj(w) && typeof w.to === 'boolean' && (typeof w.from === 'boolean' || w.from === null) ? { from: w.from as boolean | null, to: w.to } : null;
  return { base: typeof raw.base === 'number' && Number.isInteger(raw.base) ? raw.base : null, values, marks, wantsAgenda };
}

// Record a change of one field. Going back to where it started removes it.
export function editValue(d: FichaDraft, base: DraftBase, key: string, to: string): FichaDraft {
  const from = d.values[key]?.from ?? base.values[key] ?? '';
  const values = { ...d.values };
  if (to === from) delete values[key];
  else values[key] = { from, to };
  return { ...d, base: d.base ?? base.rev, values };
}

export function editMark(d: FichaDraft, base: DraftBase, key: string, to: Mark | undefined): FichaDraft {
  const from = key in d.marks ? d.marks[key].from : (base.marks[key] ?? null);
  const marks = { ...d.marks };
  if ((to ?? null) === from) delete marks[key];
  else marks[key] = { from, to: to ?? null };
  return { ...d, base: d.base ?? base.rev, marks };
}

export function editWantsAgenda(d: FichaDraft, base: DraftBase, to: boolean): FichaDraft {
  const from = d.wantsAgenda ? d.wantsAgenda.from : base.wantsAgenda;
  return { ...d, base: d.base ?? base.rev, wantsAgenda: from === to ? null : { from, to } };
}

// The form as shown: the server's values with this person's changes on top.
export function draftValues(d: FichaDraft, base: DraftBase): { values: FormValues; marks: Marks; wantsAgenda: boolean | null } {
  const values = { ...base.values };
  for (const [k, e] of Object.entries(d.values)) values[k] = e.to;
  const marks: Marks = { ...base.marks };
  for (const [k, e] of Object.entries(d.marks)) {
    if (e.to) marks[k] = e.to;
    else delete marks[k];
  }
  return { values, marks, wantsAgenda: d.wantsAgenda ? d.wantsAgenda.to : base.wantsAgenda };
}

// Fields this person changed that someone else also changed since they started (labels come from the caller).
export function draftConflicts(d: FichaDraft, base: DraftBase): string[] {
  const out = Object.entries(d.values)
    .filter(([k, e]) => e.from !== (base.values[k] ?? ''))
    .map(([k]) => k);
  for (const [k, e] of Object.entries(d.marks)) if (e.from !== (base.marks[k] ?? null) && !out.includes(k)) out.push(k);
  if (d.wantsAgenda && d.wantsAgenda.from !== base.wantsAgenda) out.push('wants_agenda');
  return out;
}

// A draft found in the phone, against what the server says now. Changes that are already there are dropped;
// on a new form, so are changes to a field whose starting value is different now (a preset in the link wins).
// null = nothing left to bring back.
export function restoreDraft(saved: unknown, base: DraftBase, isNew: boolean): FichaDraft | null {
  const d = normalizeDraft(saved);
  const values: Record<string, FieldEdit> = {};
  for (const [k, e] of Object.entries(d.values)) {
    const now = base.values[k] ?? '';
    if (e.to === now || (isNew && e.from !== now)) continue;
    values[k] = e;
  }
  const marks: Record<string, MarkEdit> = {};
  for (const [k, e] of Object.entries(d.marks)) {
    const now = base.marks[k] ?? null;
    if (e.to === now || (isNew && e.from !== now)) continue;
    marks[k] = e;
  }
  let wantsAgenda = d.wantsAgenda;
  if (wantsAgenda && (wantsAgenda.to === base.wantsAgenda || (isNew && wantsAgenda.from !== base.wantsAgenda))) wantsAgenda = null;
  if (!Object.keys(values).length && !Object.keys(marks).length && !wantsAgenda) return null;
  return { base: d.base, values, marks, wantsAgenda };
}

// The rev to send with the save: the one this person started from when someone else changed what they changed
// (so the server says «Ojo»); otherwise the current one (nothing of anyone else's is overwritten).
export function revToSend(d: FichaDraft, base: DraftBase): number | undefined {
  const rev = draftConflicts(d, base).length && d.base !== null ? d.base : base.rev;
  return rev ?? undefined;
}
