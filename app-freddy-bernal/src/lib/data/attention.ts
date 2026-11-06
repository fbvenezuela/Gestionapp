import 'server-only';
import type { Sql } from '../db/core';
import { env } from '../env';
import {
  DONE_STATES,
  PER_PAGE,
  REQUEST_STATES,
  referenceOf,
  referencePrefix,
  type InboxFilters,
  type RequestPriority,
  type RequestState,
  type RequestType,
} from '../domain/attention';

// What /admin/atencion reads, always AS THE PERSON (db(session) / withUser): RLS decides which requests come back (a
// denuncia only for the denuncias operator and the coordinator; a responsible, their area's or theirs; the auditor and
// the boss everything else, read only; Administración, the web's people and the team, nothing). Nothing here bypasses
// it: a case another person may not read is simply not found. The citizen's contact is never read here (only through
// request_contact(), audited, in the actions).

const DONE = `('resuelto', 'cerrado', 'no_procede')`;

// --- The inbox --------------------------------------------------------------------------------------------------------------

export type InboxRow = {
  id: string;
  reference: string;
  type: RequestType;
  title: string;
  state: RequestState;
  priority: RequestPriority;
  categoryName: string;
  municipalityName: string | null;
  sector: string;
  areaName: string | null;
  assigneeName: string | null;
  createdAt: Date;
  dueAt: Date | null;
  overdue: boolean;
  supportCount: number;
  duplicateOf: string | null;
  isSpam: boolean;
  canWork: boolean;
  files: number;
};

type Where = { sql: string; params: unknown[] };

/** The filters as SQL over public.requests r (parameters numbered from 1), plus whether the state counts. */
function whereOf(f: InboxFilters, userId: string, opts: { skipState?: boolean } = {}): Where {
  const w: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const exact = f.q ? referenceOf(f.q) : null;
  const prefix = f.q && !exact ? referencePrefix(f.q) : null;
  if (exact) w.push(`r.reference = ${p(exact)}`);
  else if (prefix) w.push(`r.reference like ${p(`${prefix}%`)}`);
  else if (f.q) w.push(`(r.title ilike ${p(`%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)} or r.reference ilike $${params.length})`);
  // Merged duplicates and spam stay out unless asked for (or searched by their code).
  if (!f.all && !exact && !prefix) w.push(`r.duplicate_of is null and not r.is_spam`);
  if (f.type) w.push(`r.type = ${p(f.type)}`);
  if (f.categoryId) w.push(`r.category_id = ${p(f.categoryId)}::uuid`);
  if (f.municipalityId) w.push(`r.municipality_id = ${p(f.municipalityId)}::uuid`);
  if (f.parishId) w.push(`r.parish_id = ${p(f.parishId)}::uuid`);
  if (f.sector) w.push(`r.sector ilike ${p(`%${f.sector.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}`);
  if (f.state && !opts.skipState) w.push(`r.state = ${p(f.state)}`);
  if (f.priority) w.push(`r.priority = ${p(f.priority)}`);
  if (f.area === 'none') w.push(`r.area_id is null`);
  else if (f.area) w.push(`r.area_id = ${p(f.area)}::uuid`);
  if (f.assignee === 'none') w.push(`r.assignee_id is null`);
  else if (f.assignee === 'me') w.push(`r.assignee_id = ${p(userId)}::uuid`);
  else if (f.assignee) w.push(`r.assignee_id = ${p(f.assignee)}::uuid`);
  if (f.from) w.push(`r.created_at >= (${p(f.from)}::date)::timestamp at time zone ${p(env.appTz)}`);
  if (f.to) w.push(`r.created_at < (${p(f.to)}::date + 1)::timestamp at time zone ${p(env.appTz)}`);
  if (f.overdue) w.push(`r.due_at < now() and r.state not in ${DONE}`);
  return { sql: w.length ? `where ${w.join(' and ')}` : '', params };
}

const ROW = `r.id, r.reference, r.type, r.title, r.state, r.priority, c.name as category_name, m.name as municipality_name, r.sector,
  a.name as area_name, coalesce(nullif(btrim(pr.full_name), ''), pr.email) as assignee_name, r.created_at, r.due_at,
  (r.due_at < now() and r.state not in ${DONE}) as overdue, r.support_count, r.duplicate_of, r.is_spam,
  public.can_work_request(r.type, r.area_id, r.assignee_id) as can_work,
  (select count(*)::int from public.request_attachments x where x.request_id = r.id) as files`;
const JOINS = `from public.requests r
  join public.request_categories c on c.id = r.category_id
  left join public.territories m on m.id = r.municipality_id
  left join public.areas a on a.id = r.area_id
  left join public.profiles pr on pr.id = r.assignee_id`;

type RawRow = {
  id: string; reference: string; type: RequestType; title: string; state: RequestState; priority: RequestPriority; category_name: string;
  municipality_name: string | null; sector: string; area_name: string | null; assignee_name: string | null; created_at: Date; due_at: Date | null;
  overdue: boolean | null; support_count: number; duplicate_of: string | null; is_spam: boolean; can_work: boolean; files: number;
};
const toRow = (r: RawRow): InboxRow => ({
  id: r.id, reference: r.reference, type: r.type, title: r.title, state: r.state, priority: r.priority, categoryName: r.category_name,
  municipalityName: r.municipality_name, sector: r.sector, areaName: r.area_name, assigneeName: r.assignee_name, createdAt: r.created_at,
  dueAt: r.due_at, overdue: !!r.overdue, supportCount: r.support_count, duplicateOf: r.duplicate_of, isSpam: r.is_spam, canWork: !!r.can_work,
  files: r.files,
});

/** A page of the inbox with the filters, newest first; and how many there are in all. */
export async function inboxPage(sql: Sql, f: InboxFilters, userId: string): Promise<{ rows: InboxRow[]; total: number; page: number; pages: number }> {
  const w = whereOf(f, userId);
  const total = (await sql.one<{ n: number }>(`select count(*)::int as n from public.requests r ${w.sql}`, w.params))!.n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(f.page, pages);
  const rows = await sql.query<RawRow>(
    `select ${ROW} ${JOINS} ${w.sql} order by r.created_at desc, r.id limit ${PER_PAGE} offset ${(page - 1) * PER_PAGE}`,
    w.params,
  );
  return { rows: rows.map(toRow), total, page, pages };
}

/** The board: the open cases with the filters (up to 40 per state), and the finished ones counted. */
export async function boardRows(sql: Sql, f: InboxFilters, userId: string): Promise<InboxRow[]> {
  const w = whereOf(f, userId);
  const rows = await sql.query<RawRow & { rn: number }>(
    `select * from (select ${ROW}, row_number() over (partition by r.state order by r.created_at desc, r.id) as rn ${JOINS} ${w.sql}) x
      where x.rn <= 40 order by x.created_at desc, x.id`,
    w.params,
  );
  return rows.map(toRow);
}

/** How many there are in each state with the same filters (the state filter aside). */
export async function stateCounts(sql: Sql, f: InboxFilters, userId: string): Promise<Record<RequestState, number>> {
  const w = whereOf(f, userId, { skipState: true });
  const rows = await sql.query<{ state: RequestState; n: number }>(`select r.state, count(*)::int as n from public.requests r ${w.sql} group by r.state`, w.params);
  const out = Object.fromEntries(REQUEST_STATES.map((s) => [s, 0])) as Record<RequestState, number>;
  for (const r of rows) out[r.state] = r.n;
  return out;
}

/** The four numbers on top: to review, in attention, resolved and overdue (what this person may read). */
export async function inboxSummary(sql: Sql) {
  return (await sql.one<{ arrived: number; working: number; resolved: number; overdue: number }>(
    `select count(*) filter (where state in ('recibido', 'en_revision'))::int as arrived,
            count(*) filter (where state in ('asignado', 'en_atencion', 'requiere_informacion', 'derivado'))::int as working,
            count(*) filter (where state in ('resuelto', 'cerrado'))::int as resolved,
            count(*) filter (where due_at < now() and state not in ${DONE})::int as overdue
       from public.requests where duplicate_of is null and not is_spam`,
  ))!;
}

// --- Catalogues and people ---------------------------------------------------------------------------------------------------

export type Option = { id: string; name: string };
export type MunicipalityOption = Option & { parishes: Option[] };
export type AreaOption = Option & { active: boolean };
export type CategoryOption = Option & { slug: string; active: boolean; defaultAreaId: string | null; defaultDueDays: number | null };

export async function deskCatalogs(sql: Sql) {
  // One after another: a transaction is one connection.
  const categories = await sql.query<{ id: string; name: string; slug: string; active: boolean; default_area_id: string | null; default_due_days: number | null }>(
    `select id, name, slug, active, default_area_id, default_due_days from public.request_categories order by sort, name`,
  );
  const areas = await sql.query<{ id: string; name: string; active: boolean }>(`select id, name, active from public.areas order by name`);
  const territories = await sql.query<{ id: string; kind: string; parent_id: string | null; name: string }>(
    `select id, kind, parent_id, name from public.territories where active order by sort, name`,
  );
  const municipalities: MunicipalityOption[] = territories.filter((t) => t.kind === 'municipality').map((t) => ({ id: t.id, name: t.name, parishes: [] }));
  const byId = new Map(municipalities.map((m) => [m.id, m]));
  for (const t of territories) if (t.kind === 'parish') byId.get(t.parent_id ?? '')?.parishes.push({ id: t.id, name: t.name });
  return {
    categories: categories.map((c): CategoryOption => ({ id: c.id, name: c.name, slug: c.slug, active: c.active, defaultAreaId: c.default_area_id, defaultDueDays: c.default_due_days })),
    areas: areas.map((a): AreaOption => ({ id: a.id, name: a.name, active: a.active })),
    municipalities,
  };
}
export type DeskCatalogs = Awaited<ReturnType<typeof deskCatalogs>>;

/** The people cases are assigned to, among what this person reads (the filter «Responsable»). */
export async function assigneeOptions(sql: Sql): Promise<Option[]> {
  return sql.query<Option>(
    `select distinct p.id, coalesce(nullif(btrim(p.full_name), ''), p.email) as name
       from public.requests r join public.profiles p on p.id = r.assignee_id order by 2`,
  );
}

export type DeskPersonRow = { id: string; name: string; coordinator: boolean; complaints: boolean; reports: boolean; areaIds: string[] };

/** The desk's people who can be given a case (public.attention_staff(): only for who assigns; empty for anyone else). */
export async function deskStaff(sql: Sql): Promise<DeskPersonRow[]> {
  const rows = await sql.query<{ id: string; name: string; coordinator: boolean; complaints: boolean; reports: boolean; area_ids: string[] | null }>(
    `select id, name, coordinator, complaints, reports, area_ids from public.attention_staff()`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, coordinator: r.coordinator, complaints: r.complaints, reports: r.reports, areaIds: r.area_ids ?? [] }));
}

// --- One case --------------------------------------------------------------------------------------------------------------

export type CaseRequest = {
  id: string; reference: string; type: RequestType; title: string; description: string; eventDate: string | null; sector: string;
  locationReference: string; lat: number | null; lng: number | null; locationConsent: boolean; anonymous: boolean; publishNameConsent: boolean;
  linkedItemId: string | null; state: RequestState; priority: RequestPriority; categoryId: string; categoryName: string;
  municipalityId: string | null; municipalityName: string | null; parishName: string | null; areaId: string | null; areaName: string | null;
  assigneeId: string | null; assigneeName: string | null; dueAt: Date | null; firstResponseAt: Date | null; resolvedAt: Date | null;
  resolutionNote: string | null; duplicateOf: string | null; mainReference: string | null; supportCount: number; isSpam: boolean;
  citizenConfirmation: 'resolved' | 'not_resolved' | null; citizenConfirmedAt: Date | null; createdAt: Date; updatedAt: Date;
  canWork: boolean; canSteer: boolean; overdue: boolean;
};

export type CaseEvent = {
  id: string; kind: string; fromState: RequestState | null; toState: RequestState | null; detail: Record<string, unknown>; reason: string | null;
  actorKind: 'staff' | 'citizen' | 'system'; actorName: string | null; at: Date;
};
export type CaseMessage = {
  id: string; kind: 'internal_note' | 'public_reply' | 'info_request' | 'citizen_message'; body: string; authorName: string | null;
  redacted: boolean; at: Date;
};
export type CaseFile = {
  id: string; kind: 'citizen' | 'evidence'; mime: string; bytes: number; scanStatus: 'cuarentena' | 'limpio' | 'infectado' | 'sin_analizar';
  shared: boolean; withheld: boolean; withheldReason: string | null; messageId: string | null; uploadedBy: string | null; at: Date;
};
export type CaseDetail = {
  request: CaseRequest;
  events: CaseEvent[];
  messages: CaseMessage[];
  files: CaseFile[];
  merged: { id: string; reference: string; state: RequestState; createdAt: Date }[];
  supports: { id: string; reference: string; note: string; automatic: boolean; createdAt: Date }[];
  attended: { status: 'published' | 'withdrawn'; summary: string; displayName: string | null; publishedAt: Date; withdrawnAt: Date | null } | null;
  names: Record<string, string>;
};

/** The case as this person may read it, or null (it does not exist, or RLS says it is not theirs: the same answer). */
export async function caseDetail(sql: Sql, id: string): Promise<CaseDetail | null> {
  const r = await sql.one<{
    id: string; reference: string; type: RequestType; title: string; description: string; event_date: string | null; sector: string;
    location_reference: string; lat: string | null; lng: string | null; location_consent: boolean; anonymous: boolean; publish_name_consent: boolean;
    linked_item_id: string | null; state: RequestState; priority: RequestPriority; category_id: string; category_name: string;
    municipality_id: string | null; municipality_name: string | null; parish_name: string | null; area_id: string | null; area_name: string | null;
    assignee_id: string | null; assignee_name: string | null; due_at: Date | null; first_response_at: Date | null; resolved_at: Date | null;
    resolution_note: string | null; duplicate_of: string | null; main_reference: string | null; support_count: number; is_spam: boolean;
    citizen_confirmation: 'resolved' | 'not_resolved' | null; citizen_confirmed_at: Date | null; created_at: Date; updated_at: Date;
    can_work: boolean; can_steer: boolean; overdue: boolean | null;
  }>(
    `select r.id, r.reference, r.type, r.title, r.description, r.event_date::text as event_date, r.sector, r.location_reference,
            r.lat::text as lat, r.lng::text as lng, r.location_consent, r.anonymous, r.publish_name_consent, r.linked_item_id, r.state,
            r.priority, r.category_id, c.name as category_name, r.municipality_id, m.name as municipality_name, pa.name as parish_name,
            r.area_id, a.name as area_name, r.assignee_id, coalesce(nullif(btrim(pr.full_name), ''), pr.email) as assignee_name, r.due_at,
            r.first_response_at, r.resolved_at, r.resolution_note, r.duplicate_of,
            (select d.reference from public.requests d where d.id = r.duplicate_of) as main_reference, r.support_count, r.is_spam,
            r.citizen_confirmation, r.citizen_confirmed_at, r.created_at, r.updated_at,
            public.can_work_request(r.type, r.area_id, r.assignee_id) as can_work, public.can_steer_request(r.type) as can_steer,
            (r.due_at < now() and r.state not in ${DONE}) as overdue
       from public.requests r
       join public.request_categories c on c.id = r.category_id
       left join public.territories m on m.id = r.municipality_id
       left join public.territories pa on pa.id = r.parish_id
       left join public.areas a on a.id = r.area_id
       left join public.profiles pr on pr.id = r.assignee_id
      where r.id = $1`,
    [id],
  );
  if (!r) return null;
  const events = await sql.query<{ id: string; kind: string; from_state: RequestState | null; to_state: RequestState | null; detail: Record<string, unknown> | null; reason: string | null; actor_kind: 'staff' | 'citizen' | 'system'; actor_name: string | null; created_at: Date }>(
    `select e.id, e.kind, e.from_state, e.to_state, e.detail, e.reason, e.actor_kind,
            coalesce(nullif(btrim(p.full_name), ''), p.email) as actor_name, e.created_at
       from public.request_events e left join public.profiles p on p.id = e.actor_id
      where e.request_id = $1 order by e.created_at, e.id`,
    [id],
  );
  const messages = await sql.query<{ id: string; kind: CaseMessage['kind']; body: string; author_name: string | null; redacted: boolean; created_at: Date }>(
    `select x.id, x.kind, x.body, coalesce(nullif(btrim(p.full_name), ''), p.email) as author_name, x.redacted_at is not null as redacted, x.created_at
       from public.request_messages x left join public.profiles p on p.id = x.author_id
      where x.request_id = $1 order by x.created_at, x.id`,
    [id],
  );
  const files = await sql.query<{ id: string; kind: CaseFile['kind']; mime: string; bytes: string | number; scan_status: CaseFile['scanStatus']; shared: boolean; withheld: boolean; withheld_reason: string | null; message_id: string | null; uploaded_by: string | null; created_at: Date }>(
    `select f.id, f.kind, f.mime, f.bytes, f.scan_status, f.shared, f.withheld_at is not null as withheld, f.withheld_reason, f.message_id,
            coalesce(nullif(btrim(p.full_name), ''), p.email) as uploaded_by, f.created_at
       from public.request_attachments f left join public.profiles p on p.id = f.uploaded_by
      where f.request_id = $1 order by f.created_at, f.id`,
    [id],
  );
  const merged = await sql.query<{ id: string; reference: string; state: RequestState; created_at: Date }>(
    `select id, reference, state, created_at from public.requests where duplicate_of = $1 order by created_at`,
    [id],
  );
  const supports = await sql.query<{ id: string; reference: string; note: string; automatic: boolean; created_at: Date }>(
    `select id, reference, note, automatic, created_at from public.request_supports where request_id = $1 order by created_at`,
    [id],
  );
  const attended = await sql.one<{ status: 'published' | 'withdrawn'; public_summary: string; display_name: string | null; published_at: Date; withdrawn_at: Date | null }>(
    `select status, public_summary, display_name, published_at, withdrawn_at from public.attended_publications where request_id = $1`,
    [id],
  );
  // The names behind the ids of the history (areas, people, categories): read with the same RLS.
  const ids = new Set<string>();
  for (const e of events) collectIds(e.detail ?? {}, ids);
  const names: Record<string, string> = {};
  if (ids.size) {
    const list = [...ids];
    const rows = await sql.query<{ id: string; name: string }>(
      `select id, coalesce(nullif(btrim(full_name), ''), email) as name from public.profiles where id = any($1::uuid[])
       union all select id, name from public.areas where id = any($1::uuid[])
       union all select id, name from public.request_categories where id = any($1::uuid[])`,
      [list],
    );
    for (const x of rows) names[x.id] = x.name;
  }
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    request: {
      id: r.id, reference: r.reference, type: r.type, title: r.title, description: r.description, eventDate: r.event_date, sector: r.sector,
      locationReference: r.location_reference, lat: num(r.lat), lng: num(r.lng), locationConsent: r.location_consent, anonymous: r.anonymous,
      publishNameConsent: r.publish_name_consent, linkedItemId: r.linked_item_id, state: r.state, priority: r.priority, categoryId: r.category_id,
      categoryName: r.category_name, municipalityId: r.municipality_id, municipalityName: r.municipality_name, parishName: r.parish_name,
      areaId: r.area_id, areaName: r.area_name, assigneeId: r.assignee_id, assigneeName: r.assignee_name, dueAt: r.due_at,
      firstResponseAt: r.first_response_at, resolvedAt: r.resolved_at, resolutionNote: r.resolution_note, duplicateOf: r.duplicate_of,
      mainReference: r.main_reference, supportCount: r.support_count, isSpam: r.is_spam, citizenConfirmation: r.citizen_confirmation,
      citizenConfirmedAt: r.citizen_confirmed_at, createdAt: r.created_at, updatedAt: r.updated_at, canWork: !!r.can_work, canSteer: !!r.can_steer,
      overdue: !!r.overdue,
    },
    events: events.map((e) => ({ id: e.id, kind: e.kind, fromState: e.from_state, toState: e.to_state, detail: e.detail ?? {}, reason: e.reason, actorKind: e.actor_kind, actorName: e.actor_name, at: e.created_at })),
    messages: messages.map((m) => ({ id: m.id, kind: m.kind, body: m.body, authorName: m.author_name, redacted: m.redacted, at: m.created_at })),
    files: files.map((f) => ({ id: f.id, kind: f.kind, mime: f.mime, bytes: Number(f.bytes), scanStatus: f.scan_status, shared: f.shared, withheld: f.withheld, withheldReason: f.withheld_reason, messageId: f.message_id, uploadedBy: f.uploaded_by, at: f.created_at })),
    merged: merged.map((d) => ({ id: d.id, reference: d.reference, state: d.state, createdAt: d.created_at })),
    supports: supports.map((s) => ({ id: s.id, reference: s.reference, note: s.note, automatic: s.automatic, createdAt: s.created_at })),
    attended: attended ? { status: attended.status, summary: attended.public_summary, displayName: attended.display_name, publishedAt: attended.published_at, withdrawnAt: attended.withdrawn_at } : null,
    names,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function collectIds(v: unknown, out: Set<string>) {
  if (typeof v === 'string') {
    if (UUID.test(v)) out.add(v);
  } else if (Array.isArray(v)) for (const x of v) collectIds(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) collectIds(x, out);
}

/** Open cases of the same kind this one could be merged into (or that could be merged into it): by code or by words. */
export async function duplicateCandidates(sql: Sql, c: { id: string; type: RequestType; categoryId: string; municipalityId: string | null }, q: string) {
  const exact = q ? referenceOf(q) : null;
  const params: unknown[] = [c.id, c.type];
  let match: string;
  if (exact) {
    params.push(exact);
    match = `r.reference = $3`;
  } else if (q.trim().length >= 3) {
    params.push(`%${q.trim().replace(/[\\%_]/g, (x) => `\\${x}`)}%`);
    match = `(r.title ilike $3 or r.reference ilike $3)`;
  } else {
    // With nothing typed: the same category in the same municipality.
    params.push(c.categoryId, c.municipalityId);
    match = `r.category_id = $3 and r.municipality_id is not distinct from $4::uuid`;
  }
  return sql.query<{ id: string; reference: string; title: string; state: RequestState; created_at: Date; municipality_name: string | null }>(
    `select r.id, r.reference, r.title, r.state, r.created_at, m.name as municipality_name
       from public.requests r left join public.territories m on m.id = r.municipality_id
      where r.id <> $1 and r.type = $2 and r.duplicate_of is null and not r.is_spam and r.state not in ${DONE} and ${match}
      order by r.created_at desc limit 8`,
    params,
  );
}

// --- Templates -------------------------------------------------------------------------------------------------------------

export type ReplyTemplate = { id: string; kind: 'public_reply' | 'info_request'; title: string; body: string; sort: number; active: boolean };

export async function replyTemplates(sql: Sql, opts: { all?: boolean } = {}): Promise<ReplyTemplate[]> {
  return sql.query<ReplyTemplate>(
    `select id, kind, title, body, sort, active from public.request_reply_templates ${opts.all ? '' : 'where active'} order by sort, title`,
  );
}

// --- Figures ---------------------------------------------------------------------------------------------------------------

export type DeskStats = {
  from: string; to: string; received: number; resolved: number; pending: number; overdue: number; answered: number;
  avgFirstResponseHours: number | null; medianFirstResponseHours: number | null; avgResolutionHours: number | null; medianResolutionHours: number | null;
  byType: Record<string, number>; byState: Record<string, number>;
  byCategory: { id: string; name: string; count: number }[]; byMunicipality: { id: string; name: string; count: number }[]; byArea: { id: string; name: string; count: number }[];
};

/** public.request_stats() as the person (the coordinator, the auditor or the boss; anyone else is refused there). */
export async function deskStats(sql: Sql, from: string | null, to: string | null): Promise<DeskStats> {
  const v = (await sql.one<{ v: Record<string, unknown> }>(`select public.request_stats($1::date, $2::date) as v`, [from, to]))!.v;
  const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  return {
    from: String(v.from), to: String(v.to), received: Number(v.received), resolved: Number(v.resolved), pending: Number(v.pending), overdue: Number(v.overdue),
    answered: Number(v.answered ?? 0), avgFirstResponseHours: n(v.avgFirstResponseHours), medianFirstResponseHours: n(v.medianFirstResponseHours),
    avgResolutionHours: n(v.avgResolutionHours), medianResolutionHours: n(v.medianResolutionHours),
    byType: (v.byType ?? {}) as Record<string, number>, byState: (v.byState ?? {}) as Record<string, number>,
    byCategory: (v.byCategory ?? []) as DeskStats['byCategory'], byMunicipality: (v.byMunicipality ?? []) as DeskStats['byMunicipality'],
    byArea: (v.byArea ?? []) as DeskStats['byArea'],
  };
}

// --- The map ---------------------------------------------------------------------------------------------------------------

export type MapPoint = { id: string; reference: string; lat: number; lng: number; state: RequestState; categoryName: string };

/**
 * The map (design §5): the cases with a point the person consented to, never a denuncia (the database never stores one
 * for them either); the rest of what this person reads, counted by municipality. Same filters as the inbox.
 */
export async function mapData(sql: Sql, f: InboxFilters, userId: string) {
  const w = whereOf(f, userId);
  const and = w.sql ? `${w.sql} and` : 'where';
  const points = await sql.query<{ id: string; reference: string; lat: string; lng: string; state: RequestState; category_name: string }>(
    `select r.id, r.reference, r.lat::text as lat, r.lng::text as lng, r.state, c.name as category_name
       from public.requests r join public.request_categories c on c.id = r.category_id
       ${and} r.type <> 'denuncia' and r.location_consent and r.lat is not null and r.lng is not null
      order by r.created_at desc limit 1000`,
    w.params,
  );
  const byMunicipality = await sql.query<{ id: string | null; name: string | null; n: number }>(
    `select r.municipality_id as id, m.name, count(*)::int as n
       from public.requests r left join public.territories m on m.id = r.municipality_id
       ${and} r.type <> 'denuncia' and r.lat is null
      group by r.municipality_id, m.name order by 3 desc, 2`,
    w.params,
  );
  return {
    points: points.map((p): MapPoint => ({ id: p.id, reference: p.reference, lat: Number(p.lat), lng: Number(p.lng), state: p.state, categoryName: p.category_name })),
    byMunicipality: byMunicipality.map((m) => ({ id: m.id, name: m.name ?? 'Sin municipio', count: m.n })),
  };
}

// --- The export ------------------------------------------------------------------------------------------------------------

export type ExportRow = {
  id: string; reference: string; type: RequestType; category: string; state: RequestState; priority: RequestPriority; municipality: string | null;
  parish: string | null; sector: string; area: string | null; assignee: string | null; createdAt: Date; dueAt: Date | null; firstResponseAt: Date | null;
  resolvedAt: Date | null; overdue: boolean; supports: number; confirmation: string | null; title: string; duplicateOf: string | null; spam: boolean;
};

/** Every case with the inbox's filters (RLS decides which), up to 5000, oldest first. Never the contact (see the route). */
export async function exportRows(sql: Sql, f: InboxFilters, userId: string): Promise<ExportRow[]> {
  const w = whereOf(f, userId);
  const rows = await sql.query<{
    id: string; reference: string; type: RequestType; category: string; state: RequestState; priority: RequestPriority; municipality: string | null;
    parish: string | null; sector: string; area: string | null; assignee: string | null; created_at: Date; due_at: Date | null; first_response_at: Date | null;
    resolved_at: Date | null; overdue: boolean | null; support_count: number; citizen_confirmation: string | null; title: string; main_reference: string | null; is_spam: boolean;
  }>(
    `select r.id, r.reference, r.type, c.name as category, r.state, r.priority, m.name as municipality, pa.name as parish, r.sector, a.name as area,
            coalesce(nullif(btrim(pr.full_name), ''), pr.email) as assignee, r.created_at, r.due_at, r.first_response_at, r.resolved_at,
            (r.due_at < now() and r.state not in ${DONE}) as overdue, r.support_count, r.citizen_confirmation, r.title,
            (select d.reference from public.requests d where d.id = r.duplicate_of) as main_reference, r.is_spam
       from public.requests r
       join public.request_categories c on c.id = r.category_id
       left join public.territories m on m.id = r.municipality_id
       left join public.territories pa on pa.id = r.parish_id
       left join public.areas a on a.id = r.area_id
       left join public.profiles pr on pr.id = r.assignee_id
       ${w.sql}
      order by r.created_at, r.id limit 5000`,
    w.params,
  );
  return rows.map((r) => ({
    id: r.id, reference: r.reference, type: r.type, category: r.category, state: r.state, priority: r.priority, municipality: r.municipality, parish: r.parish,
    sector: r.sector, area: r.area, assignee: r.assignee, createdAt: r.created_at, dueAt: r.due_at, firstResponseAt: r.first_response_at, resolvedAt: r.resolved_at,
    overdue: !!r.overdue, supports: r.support_count, confirmation: r.citizen_confirmation, title: r.title, duplicateOf: r.main_reference, spam: r.is_spam,
  }));
}

export const isDone = (s: RequestState) => DONE_STATES.includes(s);
