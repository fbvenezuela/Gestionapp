'use server';

import { z } from 'zod';
import { DateTime } from 'luxon';
import { act, UserError, type Result } from './run';
import { TZ, dt } from '../time';
import type { Sql } from '../db';
import { notify, usersWithRole, withAnyRole } from '../notify';
import {
  bossAddedNotice,
  decisionNotice,
  newEventNotice,
  noticeEventTitle,
  noticeRecipients,
  overwrittenNotice,
} from '@/lib/domain/agenda-notices';
import { datedMessage, datedTitle } from '@/lib/domain/event-title';
import { labelList, same } from '@/lib/domain/agenda-merge';
import {
  BRIEF_COLUMNS, CLASH, EVENT_COLUMNS, afterAgendaSave, clashWith, columnsOf, eventPeople, nameOf, saveAgendaRow, saveMessage, saveSchedule,
  scheduleInput, sendAgendaNotice,
} from './agenda-shared';
import { revSchema, scheduleShape, text, titleField, toRange } from './schemas';

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

const briefShape = {
  workDescription: text(2000),
  ledBy: text(300),
  inCharge: text(300),
  achievements: text(2000),
  keyFacts: text(3000),
  protocol: text(2000),
  notes: text(3000),
};

const categoryField = z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null);

const eventSchema = z.object({
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: categoryField,
  urgency: z.coerce.number().int().min(1).max(3).default(2),
  cameraUserId: z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null),
  allowOverlap: z.boolean().default(false),
  // «Nuevo evento» or «Visita de obra» (the boss's big buttons). A community activity is born only from a report.
  kind: z.enum(['event', 'obra_visit']).default('event'),
  ...scheduleShape,
  ...briefShape,
});

// The boss and despacho put things on the agenda; the database refuses anyone else (events_insert,
// can_manage_agenda()) and decides who proposed it: what the boss creates is accepted at once, despacho's waits
// for him («Por decidir»).
export async function createEvent(raw: unknown) {
  return act(eventSchema, raw, async (sql, i, s) => {
    if (!s.roles.some((r) => r === 'boss' || r === 'dispatch')) throw new UserError('Los eventos los crean el jefe y el despacho.');
    const { starts, ends } = toRange(i.date, i.time, i.durationMin);
    const dated = datedTitle(i.title, DateTime.fromISO(i.date, { zone: TZ }));
    if (dated) throw new UserError(datedMessage(dated));
    if (!i.allowOverlap) {
      const clash = await clashWith(sql, starts, ends);
      if (clash) throw new UserError(CLASH(clash));
    }
    const ev = await sql.one<{ id: string; boss_decision: string }>(
      `insert into public.events (title, place_name, municipality, summary, category_id, urgency, kind, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, auth.uid()) returning id, boss_decision`,
      [i.title, i.placeName, i.municipality, i.summary, i.categoryId, i.urgency, i.kind],
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
    return { id: ev!.id, cameraUserId: assignCam ? i.cameraUserId : null, title: i.title, actorId: s.userId, accepted: ev!.boss_decision === 'accepted' };
  }, { revalidate: ['/agenda', '/hoy', '/jefe'] }).then(async (r) => {
    if (r.ok && r.data?.cameraUserId) {
      // This one is also emailed: only the title, scrubbed of anything like a date (rule 4).
      await notify({ userIds: [r.data.cameraUserId], kind: 'event_assigned', title: 'Te asignaron un evento', body: noticeEventTitle(r.data.title), link: `/eventos/${r.data.id}`, key: `assigned:${r.data.id}`, email: true });
    }
    if (r.ok && r.data) {
      const { actorId, accepted } = r.data;
      if (accepted) {
        // The boss put it there himself: despacho learns (it shares the agenda).
        await sendAgendaNotice(bossAddedNotice(r.data), async () => noticeRecipients(await usersWithRole('dispatch'), actorId));
      } else {
        // Created by despacho: the boss decides, the rest of despacho follows.
        await sendAgendaNotice(newEventNotice(r.data), async () =>
          noticeRecipients([...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))], actorId),
        );
      }
    }
    return r;
  });
}

// The shared agenda: every save says which version (rev) and which values (base) it started from. Only what this
// person changed is written; when the other one changed the same field in between, this save wins and that person
// is told (field names only). Without rev/base (an old form) everything sent is written, as before.
const updateEventSchema = z.object({
  id: z.string().uuid(),
  title: titleField,
  placeName: text(200),
  municipality: text(100),
  summary: text(1000),
  categoryId: categoryField,
  urgency: z.coerce.number().int().min(1).max(3),
  ...revSchema,
});

const withMessage = <T extends { message?: string }>(r: Result<T>): Result<T> => (r.ok ? { ...r, message: r.data?.message } : r);

export async function updateEvent(raw: unknown) {
  return act(updateEventSchema, raw, async (sql, i, s) => {
    await refuseDatedTitle(sql, i.id, i.title);
    const save = await saveAgendaRow(sql, {
      table: 'events', eventId: i.id, rev: i.rev, base: columnsOf(EVENT_COLUMNS, i.base),
      mine: columnsOf(EVENT_COLUMNS, i)!, actor: { id: s.userId, name: s.name },
    });
    if (!save) throw new UserError('No tienes permiso para cambiar este evento.');
    return { save, message: saveMessage(save) };
  }, { revalidate: ['/agenda', '/eventos'] }).then(async (r) => {
    if (r.ok) await afterAgendaSave(r.data!.save);
    return withMessage(r);
  });
}

// Date, time and place: an upsert (an event without a date gets one here). Moving it onto a date its title names
// would put that date in the title.
export async function updateSchedule(raw: unknown) {
  return act(scheduleInput, raw, async (sql, i, s) => {
    const save = await saveSchedule(sql, i, { id: s.userId, name: s.name });
    if (!save) throw new UserError('No tienes permiso para cambiar la fecha.');
    return { save, message: saveMessage(save) };
  }, { revalidate: ['/agenda', '/eventos', '/hoy'] }).then(async (r) => {
    if (r.ok) await afterAgendaSave(r.data!.save);
    return withMessage(r);
  });
}

const updateBriefSchema = z.object({ id: z.string().uuid(), ...briefShape, ...revSchema });

export async function updateBrief(raw: unknown) {
  return act(updateBriefSchema, raw, async (sql, i, s) => {
    const actor = { id: s.userId, name: s.name };
    const mine = columnsOf(BRIEF_COLUMNS, i)!;
    let save = await saveAgendaRow(sql, { table: 'event_brief', eventId: i.id, rev: i.rev, base: columnsOf(BRIEF_COLUMNS, i.base), mine, actor });
    if (!save) {
      // No brief yet: the first one.
      const r = await sql.one<{ rev: number }>(
        `insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning rev`,
        [i.id, i.workDescription, i.ledBy, i.inCharge, i.achievements, i.keyFacts, i.protocol, i.notes],
      );
      if (!r) throw new UserError('No tienes permiso para cambiar la ficha.');
      save = {
        found: true, rev: r.rev, changed: Object.keys(mine).filter((k) => !same(mine[k], '')), overlap: [], overwrittenUserId: null,
        eventId: i.id, table: 'event_brief', actorId: actor.id, actorName: actor.name, people: (await eventPeople(sql, i.id))!, overwrittenName: null, moved: false,
      };
    }
    return { save, message: saveMessage(save, 'Ficha guardada.') };
  }, { revalidate: ['/eventos'] }).then(async (r) => {
    if (r.ok) await afterAgendaSave(r.data!.save);
    return withMessage(r);
  });
}

export async function bossDecide(raw: unknown) {
  return act(
    z.object({ id: z.string().uuid(), priority: z.coerce.number().int().min(1).max(10).nullable(), decision: z.enum(['pending', 'accepted', 'rejected']) }),
    raw,
    async (sql, i, s) => {
      // Deciding is the boss's alone (the column guard says so too).
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

type BlockIn = z.infer<typeof blockSchema>;
// Same content saved again (a retry) = the same notice key.
function contentStamp(speech: string, blocks: Partial<BlockIn>[]): string {
  let h = 5381;
  for (const ch of JSON.stringify([speech, blocks.map(blockKey)])) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
const blockKey = (b: Partial<BlockIn>) => [b.id ?? '', b.shot ?? '', b.angle ?? '', b.bossLine ?? '', b.broll ?? '', b.fact ?? '', b.factSource ?? ''].map((x) => x.trim());
const sameBlocks = (a: Partial<BlockIn>[], b: Partial<BlockIn>[]) => JSON.stringify(a.map(blockKey)) === JSON.stringify(b.map(blockKey));

const storyboardSchema = z.object({
  eventId: z.string().uuid(),
  speech: text(10000),
  blocks: z.array(blockSchema).max(60),
  // What the editor started from: the speech and the blocks. A block list nobody else touched is replaced as is;
  // one this person did not touch is left as the other person saved it.
  rev: z.coerce.number().int().min(1).optional(),
  base: z.object({ speech: z.string().max(10000), blocks: z.array(blockSchema.partial()).max(60) }).optional(),
});

export async function saveStoryboard(raw: unknown) {
  return act(storyboardSchema, raw, async (sql, i, s) => {
    for (const b of i.blocks) {
      if (b.fact && !b.factSource) throw new UserError('Cada dato que dice el jefe necesita su fuente.');
    }
    const cur = await sql.one<{ id: string; speech: string; updated_by: string | null }>(
      `select id, speech, updated_by from public.storyboards where event_id = $1 for update`,
      [i.eventId],
    );
    const curBlocks: BlockIn[] = cur
      ? (await sql.query<{ id: string; shot: string; angle: string; boss_line: string; broll: string; fact: string; fact_source: string }>(
          `select id, shot, angle, boss_line, broll, fact, fact_source from public.storyboard_blocks where storyboard_id = $1 and deleted_at is null order by position`,
          [cur.id],
        )).map((b) => ({ id: b.id, shot: b.shot, angle: b.angle, bossLine: b.boss_line, broll: b.broll, fact: b.fact, factSource: b.fact_source }))
      : [];
    const overlap: string[] = [];
    let speech = i.speech;
    let writeBlocks = true;
    if (i.base && cur) {
      if (same(i.speech, i.base.speech)) speech = cur.speech;
      else if (!same(cur.speech, i.base.speech) && !same(cur.speech, i.speech)) overlap.push('speech');
      writeBlocks = !sameBlocks(i.blocks, i.base.blocks);
      if (writeBlocks && !sameBlocks(curBlocks, i.base.blocks) && !sameBlocks(curBlocks, i.blocks)) overlap.push('blocks');
    }
    const sb = await sql.one<{ id: string; rev: number }>(
      `insert into public.storyboards (event_id, speech, updated_by) values ($1, $2, auth.uid())
       on conflict (event_id) do update set speech = excluded.speech, updated_by = auth.uid() returning id, rev`,
      [i.eventId, speech],
    );
    if (!sb) throw new UserError('No tienes permiso para el storyboard.');
    if (writeBlocks) {
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
    }
    // Redes and the boss move an event's work (the column guard); administración's storyboard is saved all the same.
    if (s.roles.some((x) => x === 'social' || x === 'boss')) {
      await sql.query(`update public.events set work_status = 'recording' where id = $1 and work_status in ('brief', 'storyboard')`, [i.eventId]);
    }
    // Someone else saved the same part since this person opened it: this one wins, that person is told.
    const lastBy = overlap.length && cur?.updated_by && cur.updated_by !== s.userId ? cur.updated_by : null;
    const people = await eventPeople(sql, i.eventId);
    const otherName = await nameOf(sql, lastBy);
    return {
      overwritten: lastBy ? { userId: lastBy, title: people?.title ?? '', labels: labelList(overlap), stamp: `storyboards:${sb.rev}:${contentStamp(speech, i.blocks)}` } : null,
      actor: { id: s.userId, name: s.name },
      message: lastBy ? `Guardado. ${otherName ?? 'Otra persona'} también había cambiado ${labelList(overlap)}: quedó lo tuyo, y lo de antes está en el historial.` : 'Storyboard guardado.',
    };
  }, { revalidate: ['/eventos', '/hoy'] }).then(async (r) => {
    if (r.ok && r.data?.overwritten) {
      const o = r.data.overwritten;
      const i = raw as { eventId: string };
      await sendAgendaNotice(overwrittenNotice({ id: i.eventId, title: o.title }, r.data.actor.name, o.labels, o.stamp), async () =>
        noticeRecipients([o.userId], r.data!.actor.id),
      );
    }
    return r.ok ? { ...r, message: r.data?.message } : r;
  });
}
