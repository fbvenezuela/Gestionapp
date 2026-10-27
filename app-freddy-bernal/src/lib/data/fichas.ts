import type { Sql } from '../db/core';
import { brand } from '../client-config';
import type { DialogBrand } from '../domain/obra-dialog';
import type { FichaUpdateKind, ObraStage, Priority, ReportStatus, ReportType } from './ficha-labels';
import type { MunicipalityCounters } from '../domain/report-status';

// Reads of the fichas (obra and community report). Everything runs AS THE PERSON (RLS): Redes never gets a report
// or a contact, the IVT never a report, política never an obra, and the private part (contacts) comes back null
// without 2FA. The visit's date comes only from event_schedule, and only to whoever may see it.

export type ObraFicha = {
  id: string; code: string; stage: ObraStage; name: string; municipality: string; parish: string; sector: string; engineer_name: string;
  problem: string; problem_since: string; why_decided: string; works: string; communities: string;
  people_count: number | null; families_count: number | null; benefits: string;
  executor: string; investment: string; currency: string; funding_source: string; work_state: string | null; progress_pct: number | null;
  started_on: string | Date | null; due_on: string | Date | null; difficulties: string; solutions: string;
  other_aid: string; pending_needs: string; next_action: string; follow_up_owner: string; follow_up_due: string | Date | null;
  fab_dialog: string; fab_generated_by: string | null; marks: Record<string, string>; rev: number;
  created_by: string | null; created_by_name: string | null; created_at: string | Date; updated_at: string | Date; deleted_at: string | Date | null;
};
export type ObraPrivate = {
  id: string; engineer_phone: string; reporter_name: string; reported_when: string; reported_via: string; reporter_attends: string | null;
  representative: string; liaison_name: string; liaison_phone: string; boss_should_know: string; marks: Record<string, string>; rev: number;
};
export type Report = {
  id: string; code: string; wants_agenda: boolean; municipality: string; parish: string; community: string; title: string; type: ReportType;
  reported_at: string | Date; description: string; why_matters: string; in_charge: string; institution: string; collaborators: string;
  people_count: number | null; families_count: number | null; sectors: string; figures_kind: string | null; status: ReportStatus; results: string;
  pending_support: string; priority: Priority | null; priority_reason: string; follow_up_owner: string; follow_up_due: string | Date | null;
  evidence_url: string; observations: string; marks: Record<string, string>; rev: number;
  created_by: string | null; created_by_name: string | null; created_at: string | Date; updated_at: string | Date; deleted_at: string | Date | null;
};
export type ReportPrivate = {
  id: string; reporter_name: string; reporter_role: string; reporter_phone: string; address: string; reference: string;
  activity_at: string | Date | null; marks: Record<string, string>; rev: number;
};
export type FichaUpdate = {
  id: string; kind: FichaUpdateKind; from_value: string | null; to_value: string | null; fields: string[]; note: string | null;
  actor_id: string | null; actor_name: string | null; created_at: string | Date;
};
// The event born from a ficha, as far as this person may see it (the schedule is null without the right). The live
// one first (not cancelled, not rejected); otherwise the last one, to say it was cancelled.
export type LinkedEvent = {
  id: string; code: string; title: string; boss_decision: string; done_on: string | Date | null; starts_at: string | Date | null; ends_at: string | Date | null;
  cancelled_at: string | Date | null; live: boolean;
};

const NAME = `coalesce(nullif(p.full_name, ''), p.email)`;

async function history(sql: Sql, column: 'obra_ficha_id' | 'community_report_id', id: string): Promise<FichaUpdate[]> {
  // Rows of one save share their time: «creó» goes last (it came first).
  return sql.query<FichaUpdate>(
    `select u.id, u.kind, u.from_value, u.to_value, u.fields, u.note, u.actor_id, ${NAME} as actor_name, u.created_at
       from public.ficha_updates u left join public.profiles p on p.id = u.actor_id
      where u.${column} = $1
      order by u.created_at desc, case u.kind when 'created' then 1 else 0 end, u.kind
      limit 200`,
    [id],
  );
}

async function linkedEvent(sql: Sql, column: 'obra_ficha_id' | 'community_report_id', id: string): Promise<LinkedEvent | null> {
  return sql.one<LinkedEvent>(
    `select e.id, e.code, e.title, e.boss_decision, e.done_on, sc.starts_at, sc.ends_at, e.cancelled_at,
            (e.cancelled_at is null and e.boss_decision <> 'rejected') as live
       from public.events e left join public.event_schedule sc on sc.event_id = e.id
      where e.${column} = $1 and e.deleted_at is null
      order by (e.cancelled_at is null and e.boss_decision <> 'rejected') desc, e.created_at desc limit 1`,
    [id],
  );
}

export async function getObraFicha(sql: Sql, id: string) {
  const ficha = await sql.one<ObraFicha>(
    `select f.*, ${NAME} as created_by_name from public.obra_fichas f left join public.profiles p on p.id = f.created_by where f.id = $1`,
    [id],
  );
  if (!ficha) return null;
  const priv = await sql.one<ObraPrivate>(`select * from public.obra_ficha_private where id = $1`, [id]);
  return { ficha, priv, history: await history(sql, 'obra_ficha_id', id), event: await linkedEvent(sql, 'obra_ficha_id', id) };
}

export async function getReport(sql: Sql, id: string) {
  const report = await sql.one<Report>(
    `select r.*, ${NAME} as created_by_name from public.community_reports r left join public.profiles p on p.id = r.created_by where r.id = $1`,
    [id],
  );
  if (!report) return null;
  const priv = await sql.one<ReportPrivate>(`select * from public.community_report_private where id = $1`, [id]);
  // «Ya tiene fecha» without the date, for whoever cannot read the event (política): yes or no, from the database.
  const scheduled = !!(await sql.one<{ x: boolean }>(`select public.report_has_live_event($1) as x`, [id]))?.x;
  return { report, priv, history: await history(sql, 'community_report_id', id), event: await linkedEvent(sql, 'community_report_id', id), scheduled };
}

export type ObraListItem = {
  id: string; code: string; stage: ObraStage; name: string; municipality: string; parish: string; sector: string;
  progress_pct: number | null; work_state: string | null; updated_at: string | Date; created_by_name: string | null;
};

// Parishes are free text until the official list arrives: «Parroquia Demo Uno» and «parroquia  demo uno» are the
// same parish (the chips and the field group them the same way: domain/territory.ts parishKey).
const PARISH_KEY = (v: string) => `lower(regexp_replace(btrim(${v}), '\\s+', ' ', 'g'))`;

export async function listObraFichas(sql: Sql, f: { municipality?: string; stage?: string; parish?: string; archived?: boolean } = {}): Promise<ObraListItem[]> {
  return sql.query<ObraListItem>(
    `select f.id, f.code, f.stage, f.name, f.municipality, f.parish, f.sector, f.progress_pct, f.work_state, f.updated_at, ${NAME} as created_by_name
       from public.obra_fichas f left join public.profiles p on p.id = f.created_by
      where f.deleted_at is null
        and ($1::text is null or f.municipality = $1)
        and ($2::text is null or f.stage = $2)
        and ($3::text is null or ${PARISH_KEY('f.parish')} = ${PARISH_KEY('$3::text')})
        and ($4::boolean or $2::text is not null or f.stage <> 'archived')
      order by case f.stage when 'to_schedule' then 0 when 'draft' then 1 when 'scheduled' then 2 when 'done' then 3 else 4 end, f.updated_at desc
      limit 300`,
    [f.municipality || null, f.stage || null, f.parish || null, !!f.archived],
  );
}

export type ReportFilters = { municipality?: string; parish?: string; type?: string; status?: string; priority?: string; overdue?: boolean };
export type ReportListItem = {
  id: string; code: string; title: string; type: ReportType; status: ReportStatus; priority: Priority | null; municipality: string; parish: string;
  community: string; follow_up_due: string | Date | null; reported_at: string | Date; when: string | Date; wants_agenda: boolean; overdue: boolean;
};

// Overdue first (the most late on top), then by the date of the activity (when this person may see it) or of the
// report, newest first. A report with no follow-up date is not overdue (false, never NULL: NULL sorts first).
const OVERDUE = `coalesce(r.follow_up_due < $1::date and r.status not in ('finished', 'suspended'), false)`;
export async function listReports(sql: Sql, todayIso: string, f: ReportFilters = {}, limit = 200): Promise<ReportListItem[]> {
  return sql.query<ReportListItem>(
    `select r.id, r.code, r.title, r.type, r.status, r.priority, r.municipality, r.parish, r.community, r.follow_up_due, r.reported_at,
            coalesce(pr.activity_at, r.reported_at) as "when", r.wants_agenda,
            ${OVERDUE} as overdue
       from public.community_reports r left join public.community_report_private pr on pr.id = r.id
      where r.deleted_at is null
        and ($2::text is null or r.municipality = $2)
        and ($3::text is null or ${PARISH_KEY('r.parish')} = ${PARISH_KEY('$3::text')})
        and ($4::text is null or r.type = $4)
        and ($5::text is null or r.status = $5)
        and ($6::text is null or r.priority = $6)
        and (not $7::boolean or ${OVERDUE})
      order by ${OVERDUE} desc,
               case when ${OVERDUE} then r.follow_up_due end asc,
               coalesce(pr.activity_at, r.reported_at) desc
      limit $8`,
    [todayIso, f.municipality || null, f.parish || null, f.type || null, f.status || null, f.priority || null, !!f.overdue, limit],
  );
}

export function overdueReports(sql: Sql, todayIso: string, n = 5): Promise<ReportListItem[]> {
  return listReports(sql, todayIso, { overdue: true }, n);
}

// Counters per municipality (abiertas, en ejecución, finalizadas, vencidas), only for municipalities with reports;
// merge them with the configured list (domain/report-status.ts mergeCounters) so the zeros show too.
export async function municipalityCounters(sql: Sql, todayIso: string): Promise<MunicipalityCounters[]> {
  return sql.query<MunicipalityCounters>(
    `select municipality,
            count(*) filter (where status in ('planned', 'pending'))::int as "open",
            count(*) filter (where status = 'in_progress')::int as "inProgress",
            count(*) filter (where status = 'finished')::int as finished,
            count(*) filter (where follow_up_due < $1::date and status not in ('finished', 'suspended'))::int as overdue
       from public.community_reports where deleted_at is null group by municipality`,
    [todayIso],
  );
}

// Obra fichas per municipality (only for those who see obras: the IVT, the boss, despacho, administración).
export async function obraCounts(sql: Sql): Promise<{ municipality: string; total: number; to_schedule: number }[]> {
  return sql.query(
    `select municipality, count(*)::int as total, count(*) filter (where stage = 'to_schedule')::int as to_schedule
       from public.obra_fichas where deleted_at is null and stage <> 'archived' group by municipality`,
  );
}

export async function obraStageCounts(sql: Sql): Promise<Record<string, number>> {
  const rows = await sql.query<{ stage: string; n: number }>(
    `select stage, count(*)::int as n from public.obra_fichas where deleted_at is null group by stage`,
  );
  return Object.fromEntries(rows.map((r) => [r.stage, r.n]));
}

// Parishes already written, per municipality (the suggestions while there is no official list).
export async function parishesInUse(sql: Sql, municipality?: string): Promise<Record<string, string[]>> {
  const rows = await sql.query<{ municipality: string; parish: string }>(
    `select distinct municipality, parish from (
       select municipality, parish from public.community_reports where deleted_at is null and parish <> ''
       union all
       select municipality, parish from public.obra_fichas where deleted_at is null and parish <> ''
     ) x where ($1::text is null or municipality = $1) order by municipality, parish limit 1000`,
    [municipality ?? null],
  );
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.municipality] ??= []).push(r.parish);
  return out;
}

// Everything of one municipality in one line of time: reports, obras (if this person sees obras) and events (their
// date only when this person may see it; otherwise when they were created).
export type TimelineItem =
  | { kind: 'report'; id: string; code: string; title: string; status: ReportStatus; type: ReportType; priority: Priority | null; parish: string; overdue: boolean; follow_up_due: string | Date | null; at: string | Date }
  | { kind: 'obra'; id: string; code: string; title: string; stage: ObraStage; parish: string; at: string | Date }
  | { kind: 'event'; id: string; code: string; title: string; boss_decision: string; done_on: string | Date | null; starts_at: string | Date | null; at: string | Date };

export async function municipalityTimeline(sql: Sql, municipality: string, todayIso: string, f: Omit<ReportFilters, 'municipality'> = {}): Promise<TimelineItem[]> {
  const items: TimelineItem[] = (await listReports(sql, todayIso, { ...f, municipality }, 300)).map((r) => ({
    kind: 'report', id: r.id, code: r.code, title: r.title, status: r.status, type: r.type, priority: r.priority, parish: r.parish,
    overdue: r.overdue, follow_up_due: r.follow_up_due, at: r.when,
  }));
  const onlyReports = !!(f.type || f.status || f.priority || f.overdue);
  if (!onlyReports) {
    for (const o of await listObraFichas(sql, { municipality, parish: f.parish })) {
      items.push({ kind: 'obra', id: o.id, code: o.code, title: o.name, stage: o.stage, parish: o.parish, at: o.updated_at });
    }
  }
  if (!onlyReports && !f.parish) {
    const events = await sql.query<{ id: string; code: string; title: string; boss_decision: string; done_on: string | Date | null; starts_at: string | Date | null; created_at: string | Date }>(
      `select e.id, e.code, e.title, e.boss_decision, e.done_on, sc.starts_at, e.created_at
         from public.events e left join public.event_schedule sc on sc.event_id = e.id
        where e.deleted_at is null and e.cancelled_at is null and e.municipality = $1 order by e.created_at desc limit 100`,
      [municipality],
    );
    for (const e of events) items.push({ kind: 'event', id: e.id, code: e.code, title: e.title, boss_decision: e.boss_decision, done_on: e.done_on, starts_at: e.starts_at, at: e.starts_at ?? e.created_at });
  }
  // Overdue reports stay on top; the rest by date, newest first.
  const time = (v: string | Date) => new Date(v).getTime() || 0;
  return items.sort((a, b) => Number(b.kind === 'report' && b.overdue) - Number(a.kind === 'report' && a.overdue) || time(b.at) - time(a.at));
}

// The brand's greeting and closings for «Lo que voy a decir» (Ajustes → Marca, else the client config).
export async function dialogBrand(sql: Sql): Promise<DialogBrand> {
  const saved = (await sql.one<{ value: { greeting?: string; closings?: string[] } }>(`select value from public.app_settings where key = 'brand'`))?.value;
  return { greeting: saved?.greeting || brand.greeting, closings: saved?.closings?.length ? saved.closings : brand.closings };
}
