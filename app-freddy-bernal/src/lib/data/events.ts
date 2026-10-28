import type { Sql } from '../db/core';

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
export async function getEvent(sql: Sql, id: string): Promise<EventFull | null> {
  const e = await sql.one<Omit<EventFull, 'schedule' | 'brief' | 'storyboard' | 'blocks' | 'cameras'>>(
    `select e.id, e.code, e.title, e.place_name, e.municipality, e.summary, e.category_id, c.name as category_name,
            e.priority, e.boss_decision, e.work_status, e.urgency, e.done_on, e.created_by,
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
export type ToScheduleRow = { kind: 'obra' | 'report'; id: string; code: string; title: string; municipality: string; parish: string; rev: number; waiting_since: string | Date; had_cancelled: boolean };
export async function toSchedule(sql: Sql, limit = 100): Promise<ToScheduleRow[]> {
  return sql.query<ToScheduleRow>(
    `select kind, id, code, title, municipality, parish, rev, waiting_since, had_cancelled from public.agenda_to_schedule order by waiting_since limit $1`,
    [limit],
  );
}
