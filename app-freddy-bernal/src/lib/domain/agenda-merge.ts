// The shared agenda (cambios del 27/10/2026, §3): the boss and despacho edit the same events. Each save sends the
// version it started from (rev) and the values it started from (base); the server writes ONLY what this person
// changed, so a field the other person changed in between is kept (no lost update). When both changed the same
// field, the last save wins (the client's words) and the other person gets a notice that names the fields, never
// their values. Pure, so the rules can be tested.
//
// Why a rev and not updated_at: the drivers return Date with milliseconds while Postgres keeps microseconds, so an
// updated_at sent back never matches.

export type Value = string | number | boolean | null;
export type Row = Record<string, unknown>;

// Timestamps compare as instants (a Date from the driver, an ISO string from the form); text as typed; nothing else.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export function norm(v: unknown): Value {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && ISO.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : t;
  }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  return JSON.stringify(v);
}

export const same = (a: unknown, b: unknown) => norm(a) === norm(b);

export type Merge = { write: Row; overlap: string[] };

// `write`: the fields this person changed (mine differs from base). `overlap`: of those, the ones someone else also
// changed to something else since this person started (current differs from both). Without a base, everything this
// person sends is written (an old form) and nothing can be called an overlap.
export function mergePatch(current: Row, base: Row | null | undefined, mine: Row): Merge {
  const write: Row = {};
  const overlap: string[] = [];
  for (const k of Object.keys(mine)) {
    if (!base) {
      if (!same(mine[k], current[k])) write[k] = mine[k];
      continue;
    }
    if (same(mine[k], base[k])) continue;
    write[k] = mine[k];
    if (!same(current[k], base[k]) && !same(current[k], mine[k])) overlap.push(k);
  }
  return { write, overlap };
}

// Who to tell that their value was overwritten: the last person who saved the row, when the row moved since this
// person opened it, both changed the same field, and it was someone else.
export function overwrittenUser(r: { rowRev: number; sentRev: number | null | undefined; overlap: string[]; lastBy: string | null; me: string }): string | null {
  if (r.sentRev === null || r.sentRev === undefined) return null;
  if (r.rowRev === r.sentRev || !r.overlap.length || !r.lastBy || r.lastBy === r.me) return null;
  return r.lastBy;
}

// Spanish names of the fields, for the notices and the banner (never their values).
export const FIELD_LABEL: Record<string, string> = {
  title: 'Título',
  place_name: 'A dónde se va',
  municipality: 'Municipio',
  summary: 'De qué se trata',
  category_id: 'Categoría',
  urgency: 'Prioridad para el equipo',
  kind: 'Tipo',
  starts_at: 'Fecha y hora',
  ends_at: 'Duración',
  exact_address: 'Dirección exacta',
  directions: 'Cómo se llega',
  site_contacts: 'Contactos del sitio',
  work_description: 'De qué es la obra o el acto',
  led_by: 'Quién la dirige',
  in_charge: 'Encargado',
  achievements: 'Qué se está logrando',
  key_facts: 'Datos y cifras',
  protocol: 'Protocolo',
  notes: 'Notas',
  speech: 'Lo que va a decir',
  blocks: 'Los bloques del storyboard',
  cancelled_at: 'Cancelado',
  cancel_reason: 'Motivo de la cancelación',
  boss_decision: 'Decisión del jefe',
  priority: 'Importancia',
  work_status: 'En qué va',
  deleted_at: 'Borrado',
};

export function fieldLabels(keys: string[]): string[] {
  return [...new Set(keys.map((k) => FIELD_LABEL[k] ?? k))];
}

export function labelList(keys: string[]): string {
  const l = fieldLabels(keys);
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}`;
}

// ---------------------------------------------------------------------------
// The phone side: what an editor keeps in the phone (useDraft) while someone types, and what it finds when it opens
// again. Only the fields this person changed are kept, with the values the form started from and its rev.
// ---------------------------------------------------------------------------
export type EditDraft = { baseRev: number | null; base: Record<string, Value>; values: Record<string, Value> };

export const emptyDraft = (): EditDraft => ({ baseRev: null, base: {}, values: {} });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isValue = (x: unknown): x is Value => x === null || ['string', 'number', 'boolean'].includes(typeof x);

export function normalizeEditDraft(raw: unknown): EditDraft {
  if (!isObj(raw)) return emptyDraft();
  const pick = (o: unknown) => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => isValue(v))) as Record<string, Value> : {});
  return { baseRev: typeof raw.baseRev === 'number' && Number.isInteger(raw.baseRev) ? raw.baseRev : null, base: pick(raw.base), values: pick(raw.values) };
}

// Record one field change. Back to where it started: dropped.
export function editField(d: EditDraft, current: Record<string, Value>, currentRev: number | null, key: string, to: Value): EditDraft {
  const from = key in d.base ? d.base[key] : (current[key] ?? null);
  const base = { ...d.base };
  const values = { ...d.values };
  if (same(to, from)) {
    delete base[key];
    delete values[key];
  } else {
    base[key] = from;
    values[key] = to;
  }
  return { baseRev: d.baseRev ?? currentRev, base, values };
}

// The form as shown: the server's values with this person's changes on top.
export function shownValues(d: EditDraft, current: Record<string, Value>): Record<string, Value> {
  return { ...current, ...d.values };
}

// Fields this person changed that someone else changed too (to something else) since they started.
export function draftConflicts(d: EditDraft, current: Record<string, Value>): string[] {
  return Object.keys(d.values).filter((k) => !same(current[k], d.base[k]) && !same(current[k], d.values[k]));
}

// A draft found in the phone, against the server's values now: changes already there are dropped; nothing left = null.
export function restoreEditDraft(saved: unknown, current: Record<string, Value>): EditDraft | null {
  const d = normalizeEditDraft(saved);
  const base: Record<string, Value> = {};
  const values: Record<string, Value> = {};
  for (const [k, v] of Object.entries(d.values)) {
    if (!(k in current) || same(v, current[k])) continue;
    values[k] = v;
    base[k] = k in d.base ? d.base[k] : (current[k] ?? null);
  }
  return Object.keys(values).length ? { baseRev: d.baseRev, base, values } : null;
}

// «Usar lo de él»: take the other person's value for that field (it stops being this person's change).
export function takeTheirs(d: EditDraft, key: string): EditDraft {
  const base = { ...d.base };
  const values = { ...d.values };
  delete base[key];
  delete values[key];
  return { ...d, base, values };
}

// What a save sends: the rev and base this person started from (so the server can tell who wins and whom to tell)
// and every value of the form.
export function savePayload(d: EditDraft, current: Record<string, Value>, currentRev: number | null): { rev: number | undefined; base: Record<string, Value> } {
  return { rev: (d.baseRev ?? currentRev) ?? undefined, base: { ...current, ...d.base } };
}
