import 'server-only';
import { DateTime } from 'luxon';
import { withSystem } from '../db';
import type { Sql } from '../db/core';
import { env } from '../env';
import { notify } from '../notify';
import { DEFAULT_STALE_DAYS, alertNotice, alertReason, alertRecipients, type DeskPerson, type RequestState, type RequestType } from '../domain/attention';

// The cron's notices of the attention desk (design §5): an open case past its due date, or without any movement (a
// change, a message, a support) for N days ('participation.alerts' → staleDays, Ajustes de atención), tells the
// coordinators and its responsible (the person it is assigned to; with nobody, the responsibles of its area; a
// denuncia, the denuncias operators) with an internal notice (notify(): «Avisos» and the phone, never an email), at most
// ONCE A DAY PER CASE: request_alerts remembers the case and the day (Táchira's), written after the notice went out, so a
// tick that fails halfway is completed by the next one without repeating anyone (notify()'s key is per case and day).
// This runs as the system: nobody is behind the cron.

export type AlertCase = { id: string; reference: string; type: RequestType; state: RequestState; dueAt: Date | null; lastActivity: Date; areaId: string | null; assigneeId: string | null };

/** The days without movement before a notice (Administración's setting; 5 when it was never set). */
export async function staleDaysSetting(sql: Sql): Promise<number> {
  const v = (await sql.one<{ value: { staleDays?: unknown } | null }>(`select value from public.app_settings where key = 'participation.alerts'`))?.value;
  const n = Number(v?.staleDays);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : DEFAULT_STALE_DAYS;
}

/** The desk's people, as the system reads them (attention_staff() is for a person with the second factor). */
export async function deskPeople(sql: Sql): Promise<DeskPerson[]> {
  const rows = await sql.query<{ id: string; coordinator: boolean; complaints: boolean; reports: boolean; area_ids: string[] | null }>(
    `select p.id, bool_or(ur.role = 'attention_coordinator') as coordinator, bool_or(ur.role = 'complaints_operator') as complaints,
            bool_or(ur.role = 'reports_operator') as reports,
            coalesce((select array_agg(m.area_id) from public.area_members m join public.areas a on a.id = m.area_id
                       where m.user_id = p.id and a.active), '{}'::uuid[]) as area_ids
       from public.profiles p join public.user_roles ur on ur.user_id = p.id
      where p.active and p.deleted_at is null and ur.role in ('attention_coordinator', 'complaints_operator', 'reports_operator')
      group by p.id order by p.id`,
  );
  return rows.map((r) => ({ id: r.id, coordinator: r.coordinator, complaints: r.complaints, reports: r.reports, areaIds: r.area_ids ?? [] }));
}

/** Open cases that may need a notice today and did not get one yet (oldest due date first, at most `limit`). */
export async function alertCandidates(sql: Sql, day: string, staleDays: number, limit = 200): Promise<AlertCase[]> {
  const rows = await sql.query<{ id: string; reference: string; type: RequestType; state: RequestState; due_at: Date | null; last_activity: Date; area_id: string | null; assignee_id: string | null }>(
    `select * from (
       select r.id, r.reference, r.type, r.state, r.due_at, r.area_id, r.assignee_id,
              greatest(r.updated_at,
                       coalesce((select max(e.created_at) from public.request_events e where e.request_id = r.id), r.created_at),
                       coalesce((select max(x.created_at) from public.request_messages x where x.request_id = r.id), r.created_at)) as last_activity
         from public.requests r
        where r.duplicate_of is null and not r.is_spam and r.state not in ('resuelto', 'cerrado', 'no_procede')
          and not exists (select 1 from public.request_alerts a where a.request_id = r.id and a.day = $1::date)) c
      where c.due_at < now() or c.last_activity < now() - make_interval(days => $2::int)
      order by c.due_at nulls last, c.last_activity, c.id
      limit $3::int`,
    [day, staleDays, limit],
  );
  return rows.map((r) => ({ id: r.id, reference: r.reference, type: r.type, state: r.state, dueAt: r.due_at, lastActivity: r.last_activity, areaId: r.area_id, assigneeId: r.assignee_id }));
}

/** One pass of the cron. Answers how many cases it looked at and how many notices went out. */
export async function runAttentionAlerts(now: Date = new Date()): Promise<{ checked: number; notified: number }> {
  const day = DateTime.fromJSDate(now).setZone(env.appTz).toISODate()!;
  const plan = await withSystem(async (sql) => {
    const staleDays = await staleDaysSetting(sql);
    return { staleDays, cases: await alertCandidates(sql, day, staleDays), staff: await deskPeople(sql) };
  });
  let notified = 0;
  for (const c of plan.cases) {
    const reason = alertReason(c, now, plan.staleDays);
    if (!reason) continue;
    const userIds = alertRecipients(c, plan.staff);
    if (userIds.length) {
      const words = alertNotice({ reference: c.reference, reason, staleDays: plan.staleDays, type: c.type });
      await notify({
        userIds,
        kind: reason === 'overdue' ? 'attention_overdue' : 'attention_stale',
        title: words.title,
        body: words.body,
        link: `/admin/atencion/${c.id}`,
        key: `atencion-alerta:${c.id}:${day}`,
      });
      notified++;
    }
    // Remembered even with nobody to tell (no coordinator yet): tomorrow it is looked at again.
    await withSystem((sql) =>
      sql.query(`insert into public.request_alerts (request_id, day, reason) values ($1, $2::date, $3) on conflict (request_id, day) do nothing`, [c.id, day, reason]),
    );
  }
  return { checked: plan.cases.length, notified };
}
