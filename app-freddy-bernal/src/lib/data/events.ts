import type { Sql } from '../db/core';
import { fichaMedia, type FichaMedia } from './fichas';
import { OBRA_PHOTO_KINDS, REPORT_PHOTO_KINDS } from '@/lib/domain/media-mime';
import { eventFromObra, eventFromReport } from '@/lib/domain/ficha-event';

export type EventFull = {
  id: string; code: string; title: string; place_name: string; municipality: string; summary: string;
  category_id: string | null; category_name: string | null; priority: number | null; boss_decision: string;
  work_status: string; urgency: number; done_on: string | Date | null; created_by: string | null;
  // The shared agenda (27/10/2026): what it is, who proposed it, its version and who saved it last, and its cancel.
  kind: 'event' | 'obra_visit' | 'community'; origin: 'dispatch' | 'boss' | 'politics' | 'ivt'; rev: number;
  updated_by_name: string | null; updated_at: string | Date;
  cancelled_at: string | Date | null; cancelled_by_name: string | null; cancel_reason: string;
  obra_ficha_id: string | null; community_report_id: string | null;
  schedule: { starts_at: string; ends_at: string; exact_address: string; directions: string; site_contacts: string; rev: number; updated_by_name: string | null } | null;
  brief: { work_description: string; led_by: string; in_charge: string; achievements: string; key_facts: string; protocol: string; notes: string; rev: number } | null;
  storyboard: { id: string; speech: string; rev: number } | null;
  blocks: { id: string; shot: string; angle: string; boss_line: string; broll: string; fact: string; fact_source: string }[];
  cameras: { user_id: string; full_name: string }[];
};

const NAME = (p: string) => `(select coalesce(nullif(${p}.full_name, ''), ${p}.email) from public.profiles ${p} where ${p}.id =`;

// Everything about an event that the CURRENT USER may read. RLS decides: for social, `schedule` simply comes back
// null; for the IVT and política, so do the brief, the storyboard and the cameras (they never enter can_see_event).
// `done_on` (the day it happened) comes from event_done_on(): the column is closed to every API role, and política
// gets null (it never reads a date; 20261028002100_privacy_hardening.sql).
export async function getEvent(sql: Sql, id: string): Promise<EventFull | null> {
  const e = await sql.one<Omit<EventFull, 'schedule' | 'brief' | 'storyboard' | 'blocks' | 'cameras'>>(
    `select e.id, e.code, e.title, e.place_name, e.municipality, e.summary, e.category_id, c.name as category_name,
            e.priority, e.boss_decision, e.work_status, e.urgency, public.event_done_on(e.id) as done_on, e.created_by,
            e.kind, e.origin, e.rev, e.updated_at, ${NAME('pu')} e.updated_by) as updated_by_name,
            e.cancelled_at, ${NAME('pc')} e.cancelled_by) as cancelled_by_name, e.cancel_reason,
            e.obra_ficha_id, e.community_report_id
       from public.events e left join public.categories c on c.id = e.category_id
      where e.id = $1 and e.deleted_at is null`,
    [id],
  );
  if (!e) return null;
  const schedule = await sql.one<EventFull['schedule'] & object>(
    `select s.starts_at, s.ends_at, s.exact_address, s.directions, s.site_contacts, s.rev, ${NAME('pu')} s.updated_by) as updated_by_name
       from public.event_schedule s where s.event_id = $1`,
    [id],
  );
  const brief = await sql.one<EventFull['brief'] & object>(
    `select work_description, led_by, in_charge, achievements, key_facts, protocol, notes, rev from public.event_brief where event_id = $1`,
    [id],
  );
  const storyboard = await sql.one<{ id: string; speech: string; rev: number }>(`select id, speech, rev from public.storyboards where event_id = $1`, [id]);
  const blocks = storyboard
    ? await sql.query<EventFull['blocks'][number]>(
        `select id, shot, angle, boss_line, broll, fact, fact_source from public.storyboard_blocks where storyboard_id = $1 and deleted_at is null order by position`,
        [storyboard.id],
      )
    : [];
  const cameras = await sql.query<{ user_id: string; full_name: string }>(
    `select a.user_id, coalesce(nullif(p.full_name, ''), p.email) as full_name from public.event_assignments a
       join public.profiles p on p.id = a.user_id where a.event_id = $1 and a.duty = 'camera'`,
    [id],
  );
  return { ...e, schedule, brief, storyboard, blocks, cameras };
}

// The ficha an event was born from (§4.1, §4.2), as far as THIS person may read it. The database decides: the obra
// roles read the obra row; Redes and Grabación get, from visit_obra_ficha(), only the columns of the «Ficha de obra»
// tab (no stage, author, times, follow-up owner nor the obra's own days) while its visit is live, and never a report
// (null: no tab); the IVT and política never come here (they read the event row only). `contacts`: also read the
// private part (asked only for the boss, despacho and administración; the database still wants 2FA and returns null
// otherwise). `media`: its photos and papers.
// `row` and `priv` stay on the server: pages hand only the fields fit for the person to the screen (ficha-tab.ts).
export type EventFicha = {
  kind: 'obra' | 'report';
  id: string;
  code: string;
  row: Record<string, unknown>;
  priv: Record<string, unknown> | null;
  fab: string; // «Lo que voy a decir» of the obra ('' for a report)
  media: FichaMedia[];
};
export async function linkedFicha(
  sql: Sql,
  ev: Pick<EventFull, 'obra_ficha_id' | 'community_report_id'>,
  opts: { contacts: boolean; media: boolean },
): Promise<EventFicha | null> {
  const kind = ev.obra_ficha_id ? 'obra' : ev.community_report_id ? 'report' : null;
  if (!kind) return null;
  const id = (ev.obra_ficha_id ?? ev.community_report_id)!;
  const [table, privTable] = kind === 'obra' ? ['obra_fichas', 'obra_ficha_private'] : ['community_reports', 'community_report_private'];
  const row =
    (await sql.one<Record<string, unknown>>(`select * from public.${table} where id = $1 and deleted_at is null`, [id])) ??
    (kind === 'obra' ? await sql.one<Record<string, unknown>>(`select * from public.visit_obra_ficha($1)`, [id]) : null);
  if (!row) return null;
  const priv = opts.contacts ? await sql.one<Record<string, unknown>>(`select * from public.${privTable} where id = $1`, [id]) : null;
  return {
    kind,
    id,
    code: String(row.code ?? ''),
    row,
    priv,
    fab: kind === 'obra' && typeof row.fab_dialog === 'string' ? row.fab_dialog : '',
    // Papers only with the contacts: a denuncia or an acta carries the names and phones the private part keeps.
    media: opts.media ? await fichaMedia(sql, kind, id, priv ? undefined : kind === 'obra' ? OBRA_PHOTO_KINDS : REPORT_PHOTO_KINDS) : [],
  };
}

// Who changed what (boss and despacho with 2FA; the database returns nothing to anyone else).
// `block`: a storyboard block's content (so an inserted or removed block can still be read). `storyboard`: only the
// storyboard's rows (what Redes, the boss and administración read: event_history() decides).
export type HistoryRow = {
  at: string | Date;
  actor_name: string | null;
  table_name: string;
  action: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  block: Record<string, string> | null;
};
export async function eventHistory(sql: Sql, id: string, storyboard = false): Promise<HistoryRow[]> {
  return sql.query<HistoryRow>(
    `select at, actor_name, table_name, action, changes, block from public.event_history($1)
      where not $2::boolean or table_name in ('storyboards', 'storyboard_blocks')`,
    [id, storyboard],
  );
}

// «Por ponerle fecha» (view agenda_to_schedule: no date column). Each person sees what their role reads.
// `place`: «A dónde se va» to start «Ponerle fecha» with, the same as on the ficha's own page (eventFromObra: the obra's
// sector and parish; eventFromReport: the report's community). Only those text columns of the ficha's main table, read
// under the person's own RLS like the view itself: nothing with a date or a contact.
export type ToScheduleRow = { kind: 'obra' | 'report'; id: string; code: string; title: string; municipality: string; parish: string; rev: number; waiting_since: string | Date; had_cancelled: boolean; place: string };
export async function toSchedule(sql: Sql, limit = 100): Promise<ToScheduleRow[]> {
  const rows = await sql.query<Omit<ToScheduleRow, 'place'> & { sector: string | null; community: string | null }>(
    `select t.kind, t.id, t.code, t.title, t.municipality, t.parish, t.rev, t.waiting_since, t.had_cancelled, f.sector, r.community
       from public.agenda_to_schedule t
       left join public.obra_fichas f on t.kind = 'obra' and f.id = t.id
       left join public.community_reports r on t.kind = 'report' and r.id = t.id
      order by t.waiting_since limit $1`,
    [limit],
  );
  return rows.map(({ sector, community, ...r }) => ({
    ...r,
    place: r.kind === 'obra' ? eventFromObra({ sector, parish: r.parish }).placeName : eventFromReport({ community }).placeName,
  }));
}
