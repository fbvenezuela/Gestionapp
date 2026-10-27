import { DateTime } from 'luxon';
import { TZ } from '../time';
import {
  CURRENCIES,
  CURRENCY,
  FIGURES_KIND,
  FIGURES_KINDS,
  MARKS,
  PRIORITIES,
  PRIORITY,
  REPORTER_ATTENDS,
  REPORTER_ATTENDS_VALUES,
  REPORT_STATUS,
  REPORT_STATUSES,
  REPORT_TYPE,
  REPORT_TYPES,
  WORK_STATE,
  WORK_STATES,
  type Mark,
} from '../data/ficha-labels';

// The fields of the two fichas (cambios del 27/10/2026, §4.1 obra and §4.2 community report), in the order and
// the plain words the spec gives. One list per ficha drives the form, the read view, the history labels, the
// validation (src/lib/actions/schemas.ts) and the «Faltan N datos» count. `key` is the database column (main or
// private table); a field answered «No aplica» / «Por confirmar» is stored empty and its key goes into `marks`.

export type FieldType =
  | 'title' // the obra's name or the report's activity: becomes an event title later, so never a date (rule 4)
  | 'short'
  | 'long'
  | 'int'
  | 'pct'
  | 'date'
  | 'datetime'
  | 'choice'
  | 'phone'
  | 'url'
  | 'municipality'
  | 'parish';

export type FieldDef = {
  key: string;
  label: string;
  group: string;
  type: FieldType;
  max?: number;
  options?: readonly string[];
  optionLabel?: Record<string, string>;
  hint?: string;
  // Lives in obra_ficha_private / community_report_private: third-party names and phones, the boss's briefing.
  // Readable only by the ficha's roles with 2FA; never in the history's values, never in the FAB dialog.
  private?: boolean;
  // Cannot be empty (and so cannot be marked).
  required?: boolean;
  // Which marks it admits; all of them unless said otherwise.
  marks?: readonly Mark[];
  // What an unanswered choice stores: null, or '' where the column is NOT NULL (currency).
  emptyAs?: '' | null;
};

export type GroupDef = { key: string; title: string };
export type FichaKind = 'obra' | 'report';

const labels = (m: Record<string, { label: string } | string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'string' ? v : v.label]));

// ---------------------------------------------------------------------------
// §4.1 Ficha de obra (the IVT fills it; NO date: the visit's date is the boss's or despacho's)
// ---------------------------------------------------------------------------
export const OBRA_GROUPS: GroupDef[] = [
  { key: 'general', title: 'Datos generales' },
  { key: 'about', title: 'Sobre la obra' },
  { key: 'community', title: 'Reporte de la comunidad' },
  { key: 'progress', title: 'Avance y entrega' },
  { key: 'follow', title: 'Comunidad y seguimiento' },
];

export const OBRA_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Nombre de la obra', group: 'general', type: 'title', max: 140, required: true, hint: 'Sin fecha ni hora: esa la ponen el jefe o el despacho.' },
  { key: 'municipality', label: 'Municipio', group: 'general', type: 'municipality', required: true },
  { key: 'parish', label: 'Parroquia', group: 'general', type: 'parish', max: 100 },
  { key: 'sector', label: 'Sector', group: 'general', type: 'short', max: 200 },
  { key: 'engineer_name', label: 'Ingeniero responsable', group: 'general', type: 'short', max: 200 },
  { key: 'engineer_phone', label: 'Teléfono del ingeniero', group: 'general', type: 'phone', max: 40, private: true },

  { key: 'problem', label: 'Qué problema resuelve', group: 'about', type: 'long', max: 1000 },
  { key: 'problem_since', label: 'Desde cuándo existe el problema', group: 'about', type: 'short', max: 200 },
  { key: 'why_decided', label: 'Por qué se decidió hacerla', group: 'about', type: 'long', max: 1000 },
  { key: 'works', label: 'Qué trabajos se están haciendo (medidas y características)', group: 'about', type: 'long', max: 2000 },
  { key: 'communities', label: 'A qué comunidades beneficia', group: 'about', type: 'long', max: 500 },
  { key: 'people_count', label: 'Cuántas personas', group: 'about', type: 'int' },
  { key: 'families_count', label: 'Cuántas familias', group: 'about', type: 'int' },
  { key: 'benefits', label: 'Qué beneficios concretos tendrá para la gente', group: 'about', type: 'long', max: 1000 },

  { key: 'reporter_name', label: 'Quién hizo el reporte o la denuncia', group: 'community', type: 'short', max: 200, private: true },
  { key: 'reported_when', label: 'Cuándo lo reportó', group: 'community', type: 'short', max: 200, private: true },
  { key: 'reported_via', label: 'Por qué medio', group: 'community', type: 'short', max: 100, private: true },
  // «Por confirmar» is one of its answers already.
  { key: 'reporter_attends', label: '¿Estará en la visita?', group: 'community', type: 'choice', options: REPORTER_ATTENDS_VALUES, optionLabel: REPORTER_ATTENDS, private: true, marks: ['not_applicable'] },
  { key: 'representative', label: 'Si no asiste, quién la representa o cómo se le contacta', group: 'community', type: 'long', max: 300, private: true },
  { key: 'liaison_name', label: 'Nombre del enlace comunitario', group: 'community', type: 'short', max: 200, private: true },
  { key: 'liaison_phone', label: 'Teléfono del enlace comunitario', group: 'community', type: 'phone', max: 40, private: true },

  { key: 'executor', label: 'Organismo o empresa que ejecuta', group: 'progress', type: 'short', max: 300 },
  { key: 'investment', label: 'Inversión', group: 'progress', type: 'short', max: 200, hint: 'Como la tienes: «1.500.000».' },
  { key: 'currency', label: 'Moneda', group: 'progress', type: 'choice', options: CURRENCIES, optionLabel: CURRENCY, emptyAs: '' },
  { key: 'funding_source', label: 'Fuente de financiamiento', group: 'progress', type: 'short', max: 300 },
  { key: 'work_state', label: 'Estado actual', group: 'progress', type: 'choice', options: WORK_STATES, optionLabel: labels(WORK_STATE) },
  { key: 'progress_pct', label: 'Porcentaje de avance', group: 'progress', type: 'pct' },
  { key: 'started_on', label: 'Fecha de inicio', group: 'progress', type: 'date' },
  { key: 'due_on', label: 'Fecha estimada de entrega', group: 'progress', type: 'date', hint: 'El tiempo restante se calcula solo.' },
  { key: 'difficulties', label: 'Dificultades', group: 'progress', type: 'long', max: 1000 },
  { key: 'solutions', label: 'Cómo se resuelven', group: 'progress', type: 'long', max: 1000 },

  { key: 'other_aid', label: 'Otras ayudas a la comunidad', group: 'follow', type: 'long', max: 1000 },
  { key: 'pending_needs', label: 'Necesidades pendientes o problemas recurrentes', group: 'follow', type: 'long', max: 1000 },
  { key: 'boss_should_know', label: 'Qué debe saber o decidir el gobernador en la visita', group: 'follow', type: 'long', max: 1000, private: true },
  { key: 'next_action', label: 'Próxima acción o compromiso', group: 'follow', type: 'long', max: 500 },
  { key: 'follow_up_owner', label: 'Responsable del seguimiento', group: 'follow', type: 'short', max: 200 },
  { key: 'follow_up_due', label: 'Fecha de seguimiento', group: 'follow', type: 'date' },
];

// ---------------------------------------------------------------------------
// §4.2 Ficha de reporte comunitario (política fills it; one per activity or situation)
// ---------------------------------------------------------------------------
export const REPORT_GROUPS: GroupDef[] = [
  { key: 'reporter', title: 'Persona que reporta' },
  { key: 'location', title: 'Ubicación' },
  { key: 'activity', title: 'Actividad o asunto' },
  { key: 'dates', title: 'Fecha y hora' },
  { key: 'description', title: 'Descripción' },
  { key: 'responsible', title: 'Responsables' },
  { key: 'beneficiaries', title: 'Beneficiados o afectados' },
  { key: 'status', title: 'Estado y resultados' },
  { key: 'follow', title: 'Seguimiento' },
  { key: 'evidence', title: 'Evidencias y observaciones' },
];

export const REPORT_FIELDS: FieldDef[] = [
  { key: 'reporter_name', label: 'Nombre y apellido', group: 'reporter', type: 'short', max: 200, private: true },
  { key: 'reporter_role', label: 'Cargo o función', group: 'reporter', type: 'short', max: 200, private: true },
  { key: 'reporter_phone', label: 'Teléfono', group: 'reporter', type: 'phone', max: 40, private: true },

  { key: 'municipality', label: 'Municipio', group: 'location', type: 'municipality', required: true },
  { key: 'parish', label: 'Parroquia', group: 'location', type: 'parish', max: 100 },
  { key: 'community', label: 'Comunidad o sector', group: 'location', type: 'short', max: 200 },
  { key: 'address', label: 'Dirección', group: 'location', type: 'short', max: 500, private: true },
  { key: 'reference', label: 'Punto de referencia', group: 'location', type: 'short', max: 500, private: true },

  { key: 'title', label: 'Nombre de la actividad o asunto', group: 'activity', type: 'title', max: 140, required: true, hint: 'Sin fecha ni hora: esas van en «Fecha y hora».' },
  { key: 'type', label: 'Tipo', group: 'activity', type: 'choice', options: REPORT_TYPES, optionLabel: REPORT_TYPE, required: true },

  { key: 'activity_at', label: 'De la actividad o situación', group: 'dates', type: 'datetime', private: true, hint: 'Si va a la agenda, es solo una sugerencia: la fecha la pone el jefe.' },
  { key: 'reported_at', label: 'Del reporte', group: 'dates', type: 'datetime', required: true },

  { key: 'description', label: 'Qué se hizo, qué ocurre o qué se necesita', group: 'description', type: 'long', max: 2000 },
  { key: 'why_matters', label: 'Qué problema atiende y por qué importa', group: 'description', type: 'long', max: 1000 },

  { key: 'in_charge', label: 'Encargado', group: 'responsible', type: 'short', max: 200 },
  { key: 'institution', label: 'Institución u organización responsable', group: 'responsible', type: 'short', max: 300 },
  { key: 'collaborators', label: 'Organismos o colaboradores', group: 'responsible', type: 'long', max: 500 },

  { key: 'people_count', label: 'Cuántas personas', group: 'beneficiaries', type: 'int' },
  { key: 'families_count', label: 'Cuántas familias', group: 'beneficiaries', type: 'int' },
  { key: 'sectors', label: 'Sectores', group: 'beneficiaries', type: 'long', max: 500 },
  { key: 'figures_kind', label: '¿Las cifras son confirmadas o estimadas?', group: 'beneficiaries', type: 'choice', options: FIGURES_KINDS, optionLabel: FIGURES_KIND },

  { key: 'status', label: 'Estado', group: 'status', type: 'choice', options: REPORT_STATUSES, optionLabel: labels(REPORT_STATUS), required: true },
  { key: 'results', label: 'Logros, cantidades entregadas, trabajos o avances', group: 'status', type: 'long', max: 2000 },

  { key: 'pending_support', label: 'Pendientes o apoyo requerido', group: 'follow', type: 'long', max: 1000 },
  { key: 'priority', label: 'Prioridad', group: 'follow', type: 'choice', options: PRIORITIES, optionLabel: labels(PRIORITY) },
  { key: 'priority_reason', label: 'Motivo de la prioridad', group: 'follow', type: 'short', max: 300 },
  { key: 'follow_up_owner', label: 'Responsable', group: 'follow', type: 'short', max: 200 },
  { key: 'follow_up_due', label: 'Fecha prevista de atención o actualización', group: 'follow', type: 'date', hint: 'Si pasa esta fecha y no está finalizado ni suspendido, sale como vencido.' },

  { key: 'evidence_url', label: 'Enlace al material (fotos, videos o documentos)', group: 'evidence', type: 'url', max: 500 },
  { key: 'observations', label: 'Observaciones', group: 'evidence', type: 'long', max: 2000 },
];

export const FIELDS: Record<FichaKind, FieldDef[]> = { obra: OBRA_FIELDS, report: REPORT_FIELDS };
export const GROUPS: Record<FichaKind, GroupDef[]> = { obra: OBRA_GROUPS, report: REPORT_GROUPS };

// The label of a column, for the history («Actualizó: Avance, Inversión»). Unknown keys keep their name.
export function fieldLabel(kind: FichaKind, key: string): string {
  if (key === 'fab_dialog' || key === 'fab_generated_by') return 'Lo que voy a decir';
  if (key === 'marks') return 'No aplica / Por confirmar';
  if (key === 'wants_agenda') return '¿Va a la agenda del jefe?';
  return FIELDS[kind].find((f) => f.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Values and marks
// ---------------------------------------------------------------------------
// The form keeps every value as text ('' = empty).
export type FormValues = Record<string, string>;
export type Marks = Record<string, Mark>;

export function marksOf(def: FieldDef): readonly Mark[] {
  return def.required ? [] : def.marks ?? MARKS;
}

export function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

// Answered = it has a value, or someone said «No aplica» / «Por confirmar» on purpose.
export function answered(def: FieldDef, value: unknown, mark: Mark | undefined): boolean {
  return (!!mark && marksOf(def).includes(mark)) || !isEmpty(value);
}

// Only marks the field admits, for fields of this list.
export function cleanMarks(defs: FieldDef[], marks: Record<string, unknown> | null | undefined): Marks {
  const out: Marks = {};
  for (const d of defs) {
    const m = marks?.[d.key];
    if (typeof m === 'string' && (marksOf(d) as readonly string[]).includes(m)) out[d.key] = m as Mark;
  }
  return out;
}

// A marked field is stored empty (a typed date or number cannot hold «Por confirmar»).
export function clearMarked(defs: FieldDef[], values: FormValues, marks: Marks): FormValues {
  const out = { ...values };
  for (const d of defs) if (marks[d.key]) out[d.key] = '';
  return out;
}

// Fields with no value and no mark, in form order.
export function missingFields(defs: FieldDef[], values: Record<string, unknown>, marks: Marks): FieldDef[] {
  return defs.filter((d) => !answered(d, values[d.key], marks[d.key]));
}

export function groupProgress(defs: FieldDef[], group: string, values: Record<string, unknown>, marks: Marks): { done: number; total: number } {
  const g = defs.filter((d) => d.group === group);
  return { done: g.filter((d) => answered(d, values[d.key], marks[d.key])).length, total: g.length };
}

// The message of «Guardar y avisar» with something unanswered.
export function missingMessage(missing: FieldDef[]): string {
  if (!missing.length) return '';
  const first = `Falta «${missing[0].label}»: escríbelo o marca «No aplica» o «Por confirmar».`;
  return missing.length === 1 ? first : `${first} Y ${missing.length - 1} ${missing.length === 2 ? 'dato más' : 'datos más'}.`;
}

// ---------------------------------------------------------------------------
// From the database to the form, and back to a date
// ---------------------------------------------------------------------------
const isoDay = (v: unknown): string => {
  if (!v) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

// A timestamp as the «datetime-local» control wants it, in Táchira time.
export function localDateTime(v: unknown): string {
  if (!v) return '';
  const d = v instanceof Date ? DateTime.fromJSDate(v) : DateTime.fromISO(String(v));
  return d.isValid ? d.setZone(TZ).toFormat("yyyy-LL-dd'T'HH:mm") : '';
}

// «2026-10-27T09:30» typed in Táchira → ISO UTC; null when empty or not valid.
export function fromLocalDateTime(s: string): string | null {
  if (!s) return null;
  const d = DateTime.fromISO(s, { zone: TZ });
  return d.isValid ? d.toUTC().toISO() : null;
}

export function toFormValues(defs: FieldDef[], ...rows: (Record<string, unknown> | null | undefined)[]): FormValues {
  const out: FormValues = {};
  for (const d of defs) {
    const row = rows.find((r) => r && d.key in r);
    const v = row?.[d.key];
    if (v === null || v === undefined) out[d.key] = '';
    else if (d.type === 'date') out[d.key] = isoDay(v);
    else if (d.type === 'datetime') out[d.key] = localDateTime(v);
    else out[d.key] = String(v);
  }
  return out;
}

// Days from `todayIso` to a date (negative when it passed). For «tiempo restante», on screen only.
export function daysUntil(day: unknown, todayIso: string): number | null {
  const d = isoDay(day);
  if (!d) return null;
  return Math.round(DateTime.fromISO(d, { zone: 'utc' }).diff(DateTime.fromISO(todayIso, { zone: 'utc' }), 'days').days);
}

export { isoDay };
