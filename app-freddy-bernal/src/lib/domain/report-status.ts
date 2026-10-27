import { isoDay } from './ficha-fields';
import type { ReportStatus } from '../data/ficha-labels';

// «Todo filtrado por municipio y que quede un registro» (§4.2): the counters per municipality and what is overdue.
//   abiertas      = programado + pendiente
//   en ejecución  = en ejecución
//   finalizadas   = finalizado
//   vencidas      = its follow-up date («fecha prevista de atención») is before today (Táchira) and it is neither
//                   finished nor suspended. Counted apart: a report can be «en ejecución» AND «vencido».
// Suspended reports count in no bucket but «vencidas» never takes them either.

export const OPEN_STATUSES = ['planned', 'pending'] as const satisfies readonly ReportStatus[];
export const CLOSED_STATUSES = ['finished', 'suspended'] as const satisfies readonly ReportStatus[];

export type Counters = { open: number; inProgress: number; finished: number; overdue: number };
export type MunicipalityCounters = Counters & { municipality: string };

export function isClosed(status: string): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status);
}

// `todayIso` is today's date in Táchira ('2026-10-27'), from today().toISODate().
export function isOverdue(due: unknown, status: string, todayIso: string): boolean {
  const d = isoDay(due);
  return !!d && d < todayIso && !isClosed(status);
}

export function bucketOf(status: string): keyof Omit<Counters, 'overdue'> | null {
  if ((OPEN_STATUSES as readonly string[]).includes(status)) return 'open';
  if (status === 'in_progress') return 'inProgress';
  if (status === 'finished') return 'finished';
  return null;
}

export function emptyCounters(): Counters {
  return { open: 0, inProgress: 0, finished: 0, overdue: 0 };
}

export function countersFor(reports: readonly { status: string; follow_up_due: unknown }[], todayIso: string): Counters {
  const c = emptyCounters();
  for (const r of reports) {
    const b = bucketOf(r.status);
    if (b) c[b]++;
    if (isOverdue(r.follow_up_due, r.status, todayIso)) c.overdue++;
  }
  return c;
}

// One card per configured municipality, in the configured order, zeros included; a municipality the reports use
// but the list no longer has (renamed in Ajustes) still shows, at the end, so nothing gets lost.
export function mergeCounters(municipalities: readonly string[], rows: readonly MunicipalityCounters[]): MunicipalityCounters[] {
  const by = new Map(rows.map((r) => [r.municipality, r]));
  const out: MunicipalityCounters[] = municipalities.map((m) => ({ municipality: m, ...emptyCounters(), ...pick(by.get(m)) }));
  for (const r of rows) if (!municipalities.includes(r.municipality)) out.push({ municipality: r.municipality, ...emptyCounters(), ...pick(r) });
  return out;
}

const pick = (r?: Counters): Partial<Counters> =>
  r ? { open: Number(r.open) || 0, inProgress: Number(r.inProgress) || 0, finished: Number(r.finished) || 0, overdue: Number(r.overdue) || 0 } : {};

export function totals(rows: readonly Counters[]): Counters {
  return rows.reduce((t, r) => ({ open: t.open + r.open, inProgress: t.inProgress + r.inProgress, finished: t.finished + r.finished, overdue: t.overdue + r.overdue }), emptyCounters());
}

// How many days it is late (0 when it is not).
export function daysLate(due: unknown, todayIso: string): number {
  const d = isoDay(due);
  if (!d || d >= todayIso) return 0;
  return Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
}

// Overdue first (the most late on top), then by the date of the activity or the report, newest first.
export function sortReports<T extends { status: string; follow_up_due: unknown; when: unknown }>(rows: readonly T[], todayIso: string): T[] {
  const time = (v: unknown) => (v ? new Date(v as string | Date).getTime() || 0 : 0);
  return [...rows].sort((a, b) => {
    const la = isOverdue(a.follow_up_due, a.status, todayIso) ? daysLate(a.follow_up_due, todayIso) : -1;
    const lb = isOverdue(b.follow_up_due, b.status, todayIso) ? daysLate(b.follow_up_due, todayIso) : -1;
    return lb - la || time(b.when) - time(a.when);
  });
}
