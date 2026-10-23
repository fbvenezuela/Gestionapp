import type { Sql } from '../db/core';

export type EventFull = {
  id: string; code: string; title: string; place_name: string; municipality: string; summary: string;
  category_id: string | null; category_name: string | null; priority: number | null; boss_decision: string;
  work_status: string; urgency: number; done_on: string | Date | null; created_by: string | null;
  schedule: { starts_at: string; ends_at: string; exact_address: string; directions: string; site_contacts: string } | null;
  brief: { work_description: string; led_by: string; in_charge: string; achievements: string; key_facts: string; protocol: string; notes: string } | null;
  storyboard: { id: string; speech: string } | null;
  blocks: { id: string; shot: string; angle: string; boss_line: string; broll: string; fact: string; fact_source: string }[];
  cameras: { user_id: string; full_name: string }[];
};

// Everything about an event that the CURRENT USER may read. RLS decides: for
// social, `schedule` simply comes back null.
export async function getEvent(sql: Sql, id: string): Promise<EventFull | null> {
  const e = await sql.one<Omit<EventFull, 'schedule' | 'brief' | 'storyboard' | 'blocks' | 'cameras'>>(
    `select e.id, e.code, e.title, e.place_name, e.municipality, e.summary, e.category_id, c.name as category_name,
            e.priority, e.boss_decision, e.work_status, e.urgency, e.done_on, e.created_by
       from public.events e left join public.categories c on c.id = e.category_id
      where e.id = $1 and e.deleted_at is null`,
    [id],
  );
  if (!e) return null;
  const schedule = await sql.one<EventFull['schedule'] & object>(
    `select starts_at, ends_at, exact_address, directions, site_contacts from public.event_schedule where event_id = $1`,
    [id],
  );
  const brief = await sql.one<EventFull['brief'] & object>(
    `select work_description, led_by, in_charge, achievements, key_facts, protocol, notes from public.event_brief where event_id = $1`,
    [id],
  );
  const storyboard = await sql.one<{ id: string; speech: string }>(`select id, speech from public.storyboards where event_id = $1`, [id]);
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
