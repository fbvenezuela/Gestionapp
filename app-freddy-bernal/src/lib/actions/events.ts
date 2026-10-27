'use server';

import { z } from 'zod';
import { DateTime } from 'luxon';
import { act, UserError } from './run';
import { TZ, dt } from '../time';
import type { Sql } from '../db';
import { notify, usersWithRole, withAnyRole } from '../notify';
import {
  decisionNotice,
  newEventNotice,
  noticeEventTitle,
  noticeRecipients,
  type AgendaNotice,
} from '@/lib/domain/agenda-notices';
import { DATED, MAX_TITLE, alwaysWhen, datedMessage, datedTitle } from '@/lib/domain/event-title';

const text = (max: number) => z.string().trim().max(max).default('');

// Event titles never carry the event's when (rule 4): the checks are in domain/event-title.ts.
async function refuseDatedTitle(sql: Sql, id: string, title: string) {
  const ev = await sql.one<{ title: string; starts_at: string | Date | null }>(
    `select e.title, sc.starts_at from public.events e left join public.event_schedule sc on sc.event_id = e.id where e.id = $1`,
    [id],
  );
  // The schedule row comes back only to whoever may see the date (RLS).
  const hit = datedTitle(title, dt(ev?.starts_at), ev?.title ?? '');
  if (hit) throw new UserError(datedMessage(hit));
}

const titleField = z
  .string()
  .trim()
  .min(3, 'Escribe un título.')
  .max(MAX_TITLE, 'Máximo 140 caracteres.')
  // Zod still runs a refine after .max fails: never feed the date patterns an over-long title.
  .refine((t) => t.length > MAX_TITLE || !alwaysWhen(t), DATED);

const scheduleShape = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Elige la hora.'),
  durationMin: z.coerce.number().int().min(15, 'Mínimo 15 minutos.').max(24 * 60),
  exactAddress: text(500),
  directions: text(2000),
  siteContacts: text(1000),
};

const briefShape = {
  workDescription: text(2000),
  ledBy: text(300),
  inCharge: text(300),
  achievements: text(2000),
  keyFacts: text(3000),
  protocol: text(2000),
  notes: text(3000),
};

const eventSchema = z.object({
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  urgency: z.coerce.number().int().min(1).max(3).default(2),
  cameraUserId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  allowOverlap: z.boolean().default(false),
  ...scheduleShape,
  ...briefShape,
});

// Agenda notices go out AFTER the transaction (notify() opens its own system connection).
async function sendAgendaNotice(n: AgendaNotice, recipients: () => Promise<string[]>) {
  try {
    const userIds = await recipients();
    if (userIds.length) await notify({ userIds, kind: n.kind, title: n.title, body: n.body, link: n.link, key: n.key });
  } catch (e) {
    // The change is already saved: a failed notice must not turn it into an error.
    console.warn('[notify] agenda:', (e as Error).message);
  }
}

function toRange(date: string, time: string, durationMin: number) {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
  if (!start.isValid) throw new UserError('La fecha u hora no es válida.');
  return { starts: start.toUTC().toISO()!, ends: start.plus({ minutes: durationMin }).toUTC().toISO()! };
}

export async function createEvent(raw: unknown) {
  return act(eventSchema, raw, async (sql, i, s) => {
    const { starts, ends } = toRange(i.date, i.time, i.durationMin);
    const dated = datedTitle(i.title, DateTime.fromISO(i.date, { zone: TZ }));
    if (dated) throw new UserError(datedMessage(dated));
    if (!i.allowOverlap) {
      const clash = await sql.one<{ title: string }>(
        `select e.title from public.event_schedule sc join public.events e on e.id = sc.event_id
          where e.deleted_at is null and e.boss_decision <> 'rejected' and sc.starts_at < $2 and sc.ends_at > $1 limit 1`,
        [starts, ends],
      );
      if (clash) throw new UserError(`Choca con «${clash.title}». Si igual quieres guardarlo, marca «Guardar aunque choque».`);
    }
    const ev = await sql.one<{ id: string }>(
      `insert into public.events (title, place_name, municipality, summary, category_id, urgency, created_by)
       values ($1, $2, $3, $4, $5, $6, auth.uid()) returning id`,
      [i.title, i.placeName, i.municipality, i.summary, i.categoryId, i.urgency],
    );
    await sql.query(
      `insert into public.event_schedule (event_id, starts_at, ends_at, exact_address, directions, site_contacts) values ($1, $2, $3, $4, $5, $6)`,
      [ev!.id, starts, ends, i.exactAddress, i.directions, i.siteContacts],
    );
    await sql.query(
      `insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ev!.id, i.workDescription, i.ledBy, i.inCharge, i.achievements, i.keyFacts, i.protocol, i.notes],
    );
    const assignCam = !!i.cameraUserId;
    if (assignCam) {
      await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera')`, [ev!.id, i.cameraUserId]);
    }
    return { id: ev!.id, cameraUserId: assignCam ? i.cameraUserId : null, title: i.title, actorId: s.userId };
  }, { revalidate: ['/agenda', '/hoy'] }).then(async (r) => {
    if (r.ok && r.data?.cameraUserId) {
      // This one is also emailed: only the title, scrubbed of anything like a date (rule 4).
      await notify({ userIds: [r.data.cameraUserId], kind: 'event_assigned', title: 'Te asignaron un evento', body: noticeEventTitle(r.data.title), link: `/eventos/${r.data.id}`, key: `assigned:${r.data.id}`, email: true });
    }
    if (r.ok && r.data) {
      // Created by despacho or admin: the boss decides, despacho follows.
      const { actorId } = r.data;
      await sendAgendaNotice(newEventNotice(r.data), async () =>
        noticeRecipients([...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return r;
  });
}

const updateEventSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  urgency: z.coerce.number().int().min(1).max(3),
});

export async function updateEvent(raw: unknown) {
  return act(updateEventSchema, raw, async (sql, i) => {
    await refuseDatedTitle(sql, i.id, i.title);
    const r = await sql.query(
      `update public.events set title = $2, place_name = $3, municipality = $4, summary = $5, category_id = $6, urgency = $7 where id = $1 returning id`,
      [i.id, i.title, i.placeName, i.municipality, i.summary, i.categoryId, i.urgency],
    );
    if (!r.length) throw new UserError('No tienes permiso para cambiar este evento.');
  }, { revalidate: ['/agenda', '/eventos'] });
}

export async function updateSchedule(raw: unknown) {
  return act(z.object({ id: z.string().uuid(), ...scheduleShape }), raw, async (sql, i) => {
    const { starts, ends } = toRange(i.date, i.time, i.durationMin);
    // Moving the event onto a date its title names would put that date in the title.
    const ev = await sql.one<{ title: string }>(`select title from public.events where id = $1`, [i.id]);
    if (ev && datedTitle(ev.title, DateTime.fromISO(i.date, { zone: TZ }))) throw new UserError('El título dice esa fecha: cámbialo primero.');
    const r = await sql.query(
      `update public.event_schedule set starts_at = $2, ends_at = $3, exact_address = $4, directions = $5, site_contacts = $6 where event_id = $1 returning event_id`,
      [i.id, starts, ends, i.exactAddress, i.directions, i.siteContacts],
    );
    if (!r.length) throw new UserError('No tienes permiso para cambiar la fecha.');
  }, { revalidate: ['/agenda', '/eventos'] });
}

export async function updateBrief(raw: unknown) {
  return act(z.object({ id: z.string().uuid(), ...briefShape }), raw, async (sql, i) => {
    const r = await sql.query(
      `insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, notes, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, auth.uid())
       on conflict (event_id) do update set work_description = excluded.work_description, led_by = excluded.led_by, in_charge = excluded.in_charge,
         achievements = excluded.achievements, key_facts = excluded.key_facts, protocol = excluded.protocol, notes = excluded.notes, updated_by = auth.uid()
       returning event_id`,
      [i.id, i.workDescription, i.ledBy, i.inCharge, i.achievements, i.keyFacts, i.protocol, i.notes],
    );
    if (!r.length) throw new UserError('No tienes permiso para cambiar la ficha.');
  }, { revalidate: ['/eventos'] });
}

export async function bossDecide(raw: unknown) {
  return act(
    z.object({ id: z.string().uuid(), priority: z.coerce.number().int().min(1).max(10).nullable(), decision: z.enum(['pending', 'accepted', 'rejected']) }),
    raw,
    async (sql, i, s) => {
      // The database lets admin and despacho change any column; deciding is the boss's alone.
      if (!s.roles.includes('boss')) throw new UserError('Solo el jefe decide.');
      const before = await sql.one<{ boss_decision: string; title: string; created_by: string | null }>(
        `select boss_decision, title, created_by from public.events where id = $1`,
        [i.id],
      );
      const r = await sql.query(`update public.events set priority = $2, boss_decision = $3 where id = $1 returning id`, [i.id, i.priority, i.decision]);
      if (!r.length || !before) throw new UserError('No autorizado.');
      return { changed: before.boss_decision !== i.decision, title: before.title, createdBy: before.created_by, actorId: s.userId };
    },
    { revalidate: ['/agenda', '/eventos', '/jefe'] },
  ).then(async (r) => {
    const i = raw as { id: string; decision: string };
    if (r.ok && r.data?.changed && (i.decision === 'accepted' || i.decision === 'rejected')) {
      // Whoever created it and despacho learn the decision (never the date or place). Someone left without a role
      // (an ex-secretaría account, 27/10/2026) is skipped.
      const { createdBy, actorId, title } = r.data;
      await sendAgendaNotice(decisionNotice({ id: i.id, title }, i.decision, new Date().toISOString().slice(0, 16)), async () =>
        noticeRecipients([...(await withAnyRole([createdBy])), ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return r;
  });
}

export async function setWorkStatus(raw: unknown) {
  return act(
    z.object({ id: z.string().uuid(), status: z.enum(['brief', 'storyboard', 'recording', 'material', 'editing', 'published']) }),
    raw,
    async (sql, i) => {
      await sql.query(`update public.events set work_status = $2 where id = $1`, [i.id, i.status]);
    },
    { revalidate: ['/agenda', '/eventos'] },
  );
}

export async function markDone(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, i) => {
    await sql.query(`select public.mark_event_done($1)`, [i.id]);
  }, { revalidate: ['/agenda', '/eventos', '/biblioteca'] });
}

export async function assignCamera(raw: unknown) {
  return act(z.object({ id: z.string().uuid(), userId: z.string().uuid(), on: z.boolean() }), raw, async (sql, i) => {
    if (i.on) {
      await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera') on conflict do nothing`, [i.id, i.userId]);
      const t = await sql.one<{ title: string }>(`select title from public.events where id = $1`, [i.id]);
      return { notifyUser: i.userId, title: t?.title ?? '' };
    }
    await sql.query(`delete from public.event_assignments where event_id = $1 and user_id = $2 and duty = 'camera'`, [i.id, i.userId]);
    return null;
  }, { revalidate: ['/eventos'] }).then(async (r) => {
    if (r.ok && r.data) {
      const i = raw as { id: string };
      await notify({ userIds: [r.data.notifyUser], kind: 'event_assigned', title: 'Te asignaron un evento', body: noticeEventTitle(r.data.title), link: `/eventos/${i.id}`, key: `assigned:${i.id}`, email: true });
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------
const blockSchema = z.object({
  id: z.string().uuid().optional(),
  shot: text(200),
  angle: text(200),
  bossLine: text(2000),
  broll: text(1000),
  fact: text(500),
  factSource: text(300),
});

export async function saveStoryboard(raw: unknown) {
  return act(z.object({ eventId: z.string().uuid(), speech: text(10000), blocks: z.array(blockSchema).max(60) }), raw, async (sql, i) => {
    for (const b of i.blocks) {
      if (b.fact && !b.factSource) throw new UserError('Cada dato que dice el jefe necesita su fuente.');
    }
    const sb = await sql.one<{ id: string }>(
      `insert into public.storyboards (event_id, speech, updated_by) values ($1, $2, auth.uid())
       on conflict (event_id) do update set speech = excluded.speech, updated_by = auth.uid() returning id`,
      [i.eventId, i.speech],
    );
    if (!sb) throw new UserError('No tienes permiso para el storyboard.');
    const keep = i.blocks.filter((b) => b.id).map((b) => b.id!);
    await sql.query(
      `update public.storyboard_blocks set deleted_at = now() where storyboard_id = $1 and deleted_at is null and not (id = any($2::uuid[]))`,
      [sb.id, keep],
    );
    for (const [pos, b] of i.blocks.entries()) {
      if (b.id) {
        await sql.query(
          `update public.storyboard_blocks set position = $2, shot = $3, angle = $4, boss_line = $5, broll = $6, fact = $7, fact_source = $8 where id = $1`,
          [b.id, pos, b.shot, b.angle, b.bossLine, b.broll, b.fact, b.factSource],
        );
      } else {
        await sql.query(
          `insert into public.storyboard_blocks (storyboard_id, position, shot, angle, boss_line, broll, fact, fact_source) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sb.id, pos, b.shot, b.angle, b.bossLine, b.broll, b.fact, b.factSource],
        );
      }
    }
    await sql.query(`update public.events set work_status = 'recording' where id = $1 and work_status in ('brief', 'storyboard')`, [i.eventId]);
  }, { revalidate: ['/eventos', '/hoy'] });
}
