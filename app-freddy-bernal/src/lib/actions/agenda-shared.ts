import 'server-only';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { Sql } from '../db';
import { TZ } from '../time';
import { UserError } from './run';
import { revSchema, scheduleShape, toRange } from './schemas';
import { datedTitle } from '@/lib/domain/event-title';
import { notify, usersWithRole } from '../notify';
import { saveWithRev, type AgendaTable, type SaveResult } from '../data/agenda-write';
import { labelList } from '@/lib/domain/agenda-merge';
import {
  changedNotice,
  movedNotice,
  noticeRecipients,
  overwrittenNotice,
  type AgendaNotice,
} from '@/lib/domain/agenda-notices';

// What the agenda actions share (NOT a 'use server' file: those may export only actions). Saves go through
// saveWithRev (data/agenda-write.ts); the notices go out AFTER the transaction (notify() opens its own system
// connection) and never carry a date: titles and field names only.

// A failed notice never turns a saved change into an error.
export async function sendAgendaNotice(n: AgendaNotice, recipients: () => Promise<string[]>) {
  try {
    const userIds = await recipients();
    if (userIds.length) await notify({ userIds, kind: n.kind, title: n.title, body: n.body, link: n.link, key: n.key });
  } catch (e) {
    console.warn('[notify] agenda:', (e as Error).message);
  }
}

export const managers = async () => [...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))];

// Who must know about an event, read as the person who changed it (boss or despacho read all of it).
export type EventPeople = { title: string; cameras: string[]; obraFichaId: string | null; communityReportId: string | null };
export async function eventPeople(sql: Sql, id: string): Promise<EventPeople | null> {
  const e = await sql.one<{ title: string; obra_ficha_id: string | null; community_report_id: string | null }>(
    `select title, obra_ficha_id, community_report_id from public.events where id = $1`,
    [id],
  );
  if (!e) return null;
  const cams = await sql.query<{ user_id: string }>(`select user_id from public.event_assignments where event_id = $1 and duty = 'camera'`, [id]);
  return { title: e.title, cameras: cams.map((c) => c.user_id), obraFichaId: e.obra_ficha_id, communityReportId: e.community_report_id };
}

export async function nameOf(sql: Sql, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return (await sql.one<{ n: string }>(`select coalesce(nullif(full_name, ''), email) as n from public.profiles where id = $1`, [userId]))?.n ?? null;
}

export type AgendaSave = SaveResult & {
  eventId: string;
  table: AgendaTable;
  actorId: string;
  actorName: string;
  people: EventPeople;
  overwrittenName: string | null;
  moved: boolean;
};

// Save one agenda row (merge by field, last one wins) and gather what the notices need.
export async function saveAgendaRow(
  sql: Sql,
  o: { table: AgendaTable; eventId: string; rev?: number | null; base?: Record<string, unknown> | null; mine: Record<string, unknown>; actor: { id: string; name: string } },
): Promise<AgendaSave | null> {
  const r = await saveWithRev(sql, { table: o.table, id: o.eventId, rev: o.rev, base: o.base, mine: o.mine, me: o.actor.id });
  if (!r.found) return null;
  const people = (await eventPeople(sql, o.eventId)) ?? { title: '', cameras: [], obraFichaId: null, communityReportId: null };
  return {
    ...r,
    eventId: o.eventId,
    table: o.table,
    actorId: o.actor.id,
    actorName: o.actor.name,
    people,
    overwrittenName: await nameOf(sql, r.overwrittenUserId),
    moved: o.table === 'event_schedule' && r.changed.some((k) => k === 'starts_at' || k === 'ends_at'),
  };
}

// The message for the person who saved.
export function saveMessage(r: AgendaSave | null, ok = 'Guardado.'): string {
  if (!r || !r.changed.length) return 'No había cambios que guardar.';
  if (r.overlap.length) {
    return `Guardado. ${r.overwrittenName ?? 'Otra persona'} también había cambiado ${labelList(r.overlap)}: quedó lo tuyo, y lo de antes está en el historial.`;
  }
  return ok;
}

// After the transaction: the overwritten person (field names only), Grabación and the IVT when the date moved
// (critical: they have to be there), and the other managers (optional «cambió» notice).
export async function afterAgendaSave(r: AgendaSave | null) {
  if (!r || !r.changed.length) return;
  const ev = { id: r.eventId, title: r.people.title };
  const stamp = `${r.table}:${r.rev}`;
  if (r.overwrittenUserId) {
    await sendAgendaNotice(overwrittenNotice(ev, r.actorName, labelList(r.overlap), stamp), async () => noticeRecipients([r.overwrittenUserId], r.actorId));
  }
  if (r.moved) {
    await sendAgendaNotice(movedNotice(ev, String(r.rev)), async () =>
      noticeRecipients([...r.people.cameras, ...(r.people.obraFichaId ? await usersWithRole('ivt') : [])], r.actorId),
    );
  }
  await sendAgendaNotice(changedNotice(ev, r.actorName, labelList(r.changed), stamp), async () =>
    noticeRecipients(await managers(), r.actorId).filter((u) => u !== r.overwrittenUserId),
  );
}

// ---------------------------------------------------------------------------
// Inputs shared by the event editors and the agenda actions
// ---------------------------------------------------------------------------
// Form keys → columns.
export const EVENT_COLUMNS = { title: 'title', placeName: 'place_name', municipality: 'municipality', summary: 'summary', categoryId: 'category_id', urgency: 'urgency' } as const;
export const SCHEDULE_COLUMNS = { exactAddress: 'exact_address', directions: 'directions', siteContacts: 'site_contacts' } as const;
export const BRIEF_COLUMNS = {
  workDescription: 'work_description', ledBy: 'led_by', inCharge: 'in_charge', achievements: 'achievements',
  keyFacts: 'key_facts', protocol: 'protocol', notes: 'notes',
} as const;

// With the same clean-up as the input (an empty category is none; urgency is a number; text trimmed).
export function columnsOf(map: Record<string, string>, v: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!v) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(map)) {
    if (!(k in v)) continue;
    let x = v[k];
    if (col === 'category_id') x = x || null;
    else if (col === 'urgency') x = x === null || x === '' ? null : Number(x);
    else if (typeof x === 'string') x = x.trim();
    out[col] = x;
  }
  return out;
}

// Another live event at that time (rejected and cancelled ones do not count). `except` = the event being moved.
export async function clashWith(sql: Sql, starts: string, ends: string, except: string | null = null): Promise<string | null> {
  const clash = await sql.one<{ title: string }>(
    `select e.title from public.event_schedule sc join public.events e on e.id = sc.event_id
      where e.deleted_at is null and e.cancelled_at is null and e.boss_decision <> 'rejected'
        and sc.starts_at < $2 and sc.ends_at > $1 and ($3::uuid is null or e.id <> $3::uuid) limit 1`,
    [starts, ends, except],
  );
  return clash?.title ?? null;
}

export const CLASH = (title: string) => `Choca con «${title}». Si igual quieres guardarlo, marca «Guardar aunque choque».`;

// Date, time and place of an event: an upsert (an event without a date gets one here). `onlyWhen` = «Mover»: only
// the date, time and duration. Moving it onto a date its title names would put that date in the title.
export const scheduleInput = z.object({ id: z.string().uuid(), ...scheduleShape, ...revSchema, allowOverlap: z.boolean().default(true) });
export type ScheduleInput = z.infer<typeof scheduleInput>;

export async function saveSchedule(sql: Sql, i: ScheduleInput, actor: { id: string; name: string }, onlyWhen = false): Promise<AgendaSave | null> {
  const { starts, ends } = toRange(i.date, i.time, i.durationMin);
  const ev = await sql.one<{ title: string; cancelled_at: unknown }>(`select title, cancelled_at from public.events where id = $1`, [i.id]);
  if (!ev) throw new UserError('No encontramos este evento.');
  if (ev.cancelled_at) throw new UserError('Este evento está cancelado: tráelo de vuelta antes de moverlo.');
  if (datedTitle(ev.title, DateTime.fromISO(i.date, { zone: TZ }))) throw new UserError('El título dice esa fecha: cámbialo primero.');
  if (!i.allowOverlap) {
    const clash = await clashWith(sql, starts, ends, i.id);
    if (clash) throw new UserError(CLASH(clash));
  }
  const mine: Record<string, unknown> = { starts_at: starts, ends_at: ends, ...(onlyWhen ? {} : columnsOf(SCHEDULE_COLUMNS, i)) };
  let base: Record<string, unknown> | undefined;
  if (i.base) {
    const b = i.base as Record<string, unknown>;
    base = onlyWhen ? {} : (columnsOf(SCHEDULE_COLUMNS, b) ?? {});
    if (typeof b.date === 'string' && typeof b.time === 'string' && b.durationMin !== undefined && b.durationMin !== null && b.durationMin !== '') {
      const r = toRange(b.date, b.time, Number(b.durationMin));
      base.starts_at = r.starts;
      base.ends_at = r.ends;
    }
  }
  const save = await saveAgendaRow(sql, { table: 'event_schedule', eventId: i.id, rev: i.rev, base, mine, actor });
  if (save) return save;
  // No schedule yet: this puts the date (the database lets only the boss and despacho, with 2FA).
  const created = await sql.one<{ rev: number }>(
    `insert into public.event_schedule (event_id, starts_at, ends_at, exact_address, directions, site_contacts) values ($1, $2, $3, $4, $5, $6) returning rev`,
    [i.id, starts, ends, i.exactAddress, i.directions, i.siteContacts],
  );
  if (!created) return null;
  const people = (await eventPeople(sql, i.id))!;
  return {
    found: true, rev: created.rev, changed: Object.keys(mine), overlap: [], overwrittenUserId: null,
    eventId: i.id, table: 'event_schedule', actorId: actor.id, actorName: actor.name, people, overwrittenName: null, moved: true,
  };
}
