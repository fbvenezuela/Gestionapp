'use server';

import { z } from 'zod';
import { DateTime } from 'luxon';
import { act, UserError, type Result } from './run';
import { TZ } from '../time';
import { notify, usersWithRole } from '../notify';
import { scheduleShape, text, titleField, toRange } from './schemas';
import { CLASH, afterAgendaSave, clashWith, eventPeople, managers, saveMessage, saveSchedule, sendAgendaNotice } from './agenda-shared';
import { datedMessage, datedTitle } from '@/lib/domain/event-title';
import { eventFromObra, eventFromReport } from '@/lib/domain/ficha-event';
import {
  cancelledNotice,
  newEventNotice,
  noticeEventTitle,
  noticeRecipients,
  scheduledNotice,
  toScheduleNotice,
  type FichaRef,
} from '@/lib/domain/agenda-notices';
import { looksLikeDateTime } from '@/lib/push/text';

// The shared agenda (cambios del 27/10/2026, §3 and §4): «Ponerle fecha» to a ficha, «Mover», «Cancelar» and «No va».
// Only the boss and despacho (the database: can_manage_agenda(), schedule_ficha()). What the boss dates himself is
// accepted at once; what despacho dates waits for him («Por decidir»). Every notice carries the title only.

const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null);
const REVALIDATE = ['/agenda', '/hoy', '/jefe', '/obras', '/municipios', '/reportes', '/eventos'];
const withMessage = <T extends { message?: string }>(r: Result<T>): Result<T> => (r.ok ? { ...r, message: r.data?.message } : r);
const isManager = (roles: string[]) => roles.some((r) => r === 'boss' || r === 'dispatch');

// ---------------------------------------------------------------------------
// «Ponerle fecha»: the ficha becomes an event («Visita de obra» or the community activity), with its schedule, its
// brief (main-table fields only: domain/ficha-event.ts) and, if chosen, who records it.
// ---------------------------------------------------------------------------
const scheduleFichaSchema = z.object({
  id: uuid,
  title: titleField,
  placeName: text(200),
  cameraUserId: optUuid,
  allowOverlap: z.boolean().default(false),
  ...scheduleShape,
});

async function scheduleFicha(kind: FichaRef['kind'], raw: unknown) {
  return act(scheduleFichaSchema, raw, async (sql, i, s) => {
    if (!isManager(s.roles)) throw new UserError('La fecha la ponen el jefe o el despacho.');
    const table = kind === 'obra' ? 'obra_fichas' : 'community_reports';
    const row = await sql.one<Record<string, unknown>>(`select * from public.${table} where id = $1 and deleted_at is null`, [i.id]);
    if (!row) throw new UserError('No encontramos esta ficha.');
    const draft = kind === 'obra' ? eventFromObra(row) : eventFromReport(row);
    const { starts, ends } = toRange(i.date, i.time, i.durationMin);
    // The title goes to everyone (Redes too): never the date it is being given.
    const dated = datedTitle(i.title, DateTime.fromISO(i.date, { zone: TZ }));
    if (dated) throw new UserError(datedMessage(dated));
    if (!i.allowOverlap) {
      const clash = await clashWith(sql, starts, ends);
      if (clash) throw new UserError(CLASH(clash));
    }
    const ev = await sql.one<{ id: string }>(
      `select public.schedule_ficha($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb) as id`,
      [kind === 'obra' ? 'obra' : 'community', i.id, i.title, i.placeName || draft.placeName, starts, ends, i.exactAddress, i.directions, i.siteContacts, JSON.stringify(draft.brief)],
    );
    if (i.cameraUserId) {
      await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera') on conflict do nothing`, [ev!.id, i.cameraUserId]);
    }
    const decided = await sql.one<{ boss_decision: string }>(`select boss_decision from public.events where id = $1`, [ev!.id]);
    const accepted = decided?.boss_decision === 'accepted';
    return {
      eventId: ev!.id,
      title: i.title,
      fichaId: i.id,
      cameraUserId: i.cameraUserId,
      accepted,
      actorId: s.userId,
      message: accepted
        ? 'Listo: ya está en la agenda. Le avisamos a quien cargó la ficha, sin la fecha para quien no la ve.'
        : 'Listo: ya está en la agenda, por decidir. Le avisamos al jefe.',
    };
  }, { revalidate: REVALIDATE }).then(async (r) => {
    if (r.ok && r.data) {
      const d = r.data;
      const ev = { id: d.eventId, title: d.title };
      if (d.cameraUserId) {
        await notify({ userIds: [d.cameraUserId], kind: 'event_assigned', title: 'Te asignaron un evento', body: noticeEventTitle(d.title), link: `/eventos/${d.eventId}`, key: `assigned:${d.eventId}`, email: true });
      }
      // Whoever loaded the ficha: the IVT opens the visit and sees its date (2FA); política gets «Ya tiene fecha» on
      // its report, never the date.
      if (kind === 'obra') {
        await sendAgendaNotice(scheduledNotice(ev, `/eventos/${d.eventId}`, 'scheduled'), async () => noticeRecipients(await usersWithRole('ivt'), d.actorId));
      } else {
        await sendAgendaNotice(scheduledNotice(ev, `/reportes/${d.fichaId}`, 'scheduled'), async () => noticeRecipients(await usersWithRole('politics'), d.actorId));
      }
      if (d.accepted) {
        await sendAgendaNotice(scheduledNotice(ev, `/eventos/${d.eventId}`, 'scheduled-managers'), async () => noticeRecipients(await usersWithRole('dispatch'), d.actorId));
      } else {
        await sendAgendaNotice(newEventNotice(ev), async () => noticeRecipients(await managers(), d.actorId));
      }
    }
    return withMessage(r);
  });
}

export async function scheduleObraFicha(raw: unknown) {
  return scheduleFicha('obra', raw);
}

export async function scheduleReport(raw: unknown) {
  return scheduleFicha('report', raw);
}

// ---------------------------------------------------------------------------
// «Mover»: only the date, time and duration (the address stays). Same merge as the full editor: the last save wins
// and the other person is told; Grabación and the IVT get «Cambió la fecha u hora» (critical), without the new one.
// ---------------------------------------------------------------------------
const moveSchema = z.object({
  id: uuid,
  date: scheduleShape.date,
  time: scheduleShape.time,
  durationMin: scheduleShape.durationMin,
  rev: z.coerce.number().int().min(1).optional(),
  base: z.object({ date: z.string(), time: z.string(), durationMin: z.union([z.string(), z.number()]) }).optional(),
  allowOverlap: z.boolean().default(false),
});

export async function moveEvent(raw: unknown) {
  return act(moveSchema, raw, async (sql, i, s) => {
    if (!isManager(s.roles)) throw new UserError('La fecha la ponen el jefe o el despacho.');
    const save = await saveSchedule(
      sql,
      { ...i, exactAddress: '', directions: '', siteContacts: '', base: i.base as Record<string, string | number> | undefined },
      { id: s.userId, name: s.name },
      true,
    );
    if (!save) throw new UserError('No tienes permiso para cambiar la fecha.');
    return { save, message: saveMessage(save, 'Listo: la nueva fecha quedó. Le avisamos a quien graba.') };
  }, { revalidate: REVALIDATE }).then(async (r) => {
    if (r.ok) await afterAgendaSave(r.data!.save);
    return withMessage(r);
  });
}

// ---------------------------------------------------------------------------
// «Cancelar» (never deleting: the event stays, struck through, with who and why). Its reason is read by everyone who
// sees the event (Redes too): no date or time in it. A visit born from a ficha puts the ficha back in «Por ponerle
// fecha» (the database does it) and the boss and despacho get that notice again, as a new one.
// ---------------------------------------------------------------------------
const cancelSchema = z.object({
  id: uuid,
  reason: z.string().trim().max(500, 'Máximo 500 caracteres.').default(''),
});

export async function cancelEvent(raw: unknown) {
  return act(cancelSchema, raw, async (sql, i, s) => {
    if (!isManager(s.roles)) throw new UserError('Cancelan el jefe o el despacho.');
    if (i.reason && looksLikeDateTime(i.reason)) {
      throw new UserError('El motivo lo leen todos (Redes también): escríbelo sin fecha, hora ni teléfono.');
    }
    const before = await sql.one<{ cancelled_at: unknown; done_on: unknown }>(`select cancelled_at, done_on from public.events where id = $1 and deleted_at is null`, [i.id]);
    if (!before) throw new UserError('No encontramos este evento.');
    if (before.cancelled_at) throw new UserError('Este evento ya estaba cancelado.');
    if (before.done_on) throw new UserError('Este evento ya se realizó: no se cancela.');
    const ev = await sql.one<{ rev: number; title: string; obra_ficha_id: string | null; community_report_id: string | null }>(
      `update public.events set cancelled_at = now(), cancel_reason = $2 where id = $1 and cancelled_at is null
       returning rev, title, obra_ficha_id, community_report_id`,
      [i.id, i.reason],
    );
    if (!ev) throw new UserError('No tienes permiso para cancelar este evento.');
    const people = (await eventPeople(sql, i.id))!;
    // The ficha back in the queue (as the database left it): its name and municipality for «Por ponerle fecha».
    let ficha: FichaRef | null = null;
    if (ev.obra_ficha_id) {
      const f = await sql.one<{ name: string; municipality: string; stage: string }>(`select name, municipality, stage from public.obra_fichas where id = $1`, [ev.obra_ficha_id]);
      if (f?.stage === 'to_schedule') ficha = { kind: 'obra', id: ev.obra_ficha_id, title: f.name, municipality: f.municipality };
    } else if (ev.community_report_id) {
      const f = await sql.one<{ id: string; title: string; municipality: string }>(
        `select id, title, municipality from public.agenda_to_schedule where kind = 'report' and id = $1`,
        [ev.community_report_id],
      );
      if (f) ficha = { kind: 'report', id: f.id, title: f.title, municipality: f.municipality };
    }
    return {
      ev: { id: i.id, title: ev.title }, rev: ev.rev, people, ficha, actorId: s.userId,
      message: ficha ? 'Cancelado. La ficha volvió a «Por ponerle fecha».' : 'Cancelado. Le avisamos a quien graba y a Redes.',
    };
  }, { revalidate: REVALIDATE }).then(async (r) => {
    if (r.ok && r.data) {
      const d = r.data;
      await sendAgendaNotice(cancelledNotice(d.ev, String(d.rev)), async () =>
        noticeRecipients(
          [
            ...d.people.cameras,
            ...(await usersWithRole('social')),
            ...(d.people.obraFichaId ? await usersWithRole('ivt') : []),
            ...(d.people.communityReportId ? await usersWithRole('politics') : []),
            ...(await managers()),
          ],
          d.actorId,
        ),
      );
      // «Por ponerle fecha» again: a new notice (its key names this cancellation), never the old one.
      if (d.ficha) {
        const f = d.ficha;
        await sendAgendaNotice(toScheduleNotice(f, `cancel-${d.ev.id}-${d.rev}`), async () => noticeRecipients(await managers(), d.actorId));
      }
    }
    return withMessage(r);
  });
}

// Back on the agenda (a cancel by mistake). A ficha that got another visit in between cannot have two.
export async function restoreEvent(raw: unknown) {
  return act(z.object({ id: uuid }), raw, async (sql, i, s) => {
    if (!isManager(s.roles)) throw new UserError('Solo el jefe o el despacho.');
    let ev: { rev: number; title: string } | null;
    try {
      ev = await sql.one<{ rev: number; title: string }>(
        `update public.events set cancelled_at = null where id = $1 and cancelled_at is not null returning rev, title`,
        [i.id],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new UserError('Esa ficha ya tiene otra visita con fecha: cancela esa primero.');
      throw e;
    }
    if (!ev) throw new UserError('Este evento no está cancelado, o no tienes permiso.');
    return { ev: { id: i.id, title: ev.title }, rev: ev.rev, people: (await eventPeople(sql, i.id))!, actorId: s.userId, message: 'Volvió a la agenda.' };
  }, { revalidate: REVALIDATE }).then(async (r) => {
    if (r.ok && r.data) {
      const d = r.data;
      await sendAgendaNotice(cancelledNotice(d.ev, String(d.rev), true), async () =>
        noticeRecipients(
          [
            ...d.people.cameras,
            ...(await usersWithRole('social')),
            ...(d.people.obraFichaId ? await usersWithRole('ivt') : []),
            ...(d.people.communityReportId ? await usersWithRole('politics') : []),
            ...(await managers()),
          ],
          d.actorId,
        ),
      );
    }
    return withMessage(r);
  });
}

// ---------------------------------------------------------------------------
// «No va»: a ficha leaves «Por ponerle fecha» for good, with its reason in the history. An obra is archived (it can
// be brought back from its page); a report stops going to the agenda («¿Va a la agenda?» off).
// ---------------------------------------------------------------------------
const dismissSchema = z.object({
  kind: z.enum(['obra', 'report']),
  id: uuid,
  note: z.string().trim().min(3, 'Escribe por qué no va.').max(500, 'Máximo 500 caracteres.'),
});

export async function dismissFromAgenda(raw: unknown) {
  return act(dismissSchema, raw, async (sql, i, s) => {
    if (!isManager(s.roles)) throw new UserError('Solo el jefe o el despacho.');
    await sql.query(`select set_config('app.history_note', $1, true)`, [`No va a la agenda: ${i.note}`]);
    const r =
      i.kind === 'obra'
        ? await sql.one(`update public.obra_fichas set stage = 'archived' where id = $1 and deleted_at is null and stage = 'to_schedule' returning id`, [i.id])
        : await sql.one(`update public.community_reports set wants_agenda = false where id = $1 and deleted_at is null and wants_agenda returning id`, [i.id]);
    if (!r) throw new UserError('Esta ficha ya no está por ponerle fecha.');
    return { message: i.kind === 'obra' ? 'Listo: la obra quedó archivada, con el motivo en su historia.' : 'Listo: el reporte quedó en el registro, sin ir a la agenda.' };
  }, { revalidate: REVALIDATE }).then(withMessage);
}
