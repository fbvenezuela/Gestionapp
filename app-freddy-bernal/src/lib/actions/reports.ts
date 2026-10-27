'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { formValuesSchema, marksSchema, parseFicha, writeFicha, writePrivate } from './schemas';
import { notify, usersWithRole } from '../notify';
import { REPORT_FIELDS } from '@/lib/domain/ficha-fields';
import { isClosed } from '@/lib/domain/report-status';
import { REPORT_STATUSES } from '@/lib/data/ficha-labels';
import { noticeRecipients, toScheduleNotice, type AgendaNotice } from '@/lib/domain/agenda-notices';
import type { Role } from '../roles';

// The community report (§4.2): the Director de política loads every event, advance or incident per municipality,
// one ficha per activity or situation. «¿Va a la agenda del jefe?» on: the boss and despacho get «Por ponerle
// fecha» (the boss puts the date); off: it stays in the register without going to the agenda. Redes never sees a
// report; contacts (reporter's name and phone, address, the activity's date) need 2FA.

const uuid = z.string().uuid();
const REPORT_ROLES: Role[] = ['admin', 'boss', 'dispatch', 'politics'];
const REVALIDATE = ['/municipios', '/reportes', '/hoy', '/jefe'];

async function sendNotice(n: AgendaNotice, recipients: () => Promise<string[]>) {
  try {
    const userIds = await recipients();
    if (userIds.length) await notify({ userIds, kind: n.kind, title: n.title, body: n.body, link: n.link, key: n.key });
  } catch (e) {
    console.warn('[notify] reportes:', (e as Error).message);
  }
}

const withMessage = <T extends { message?: string }>(r: Result<T>): Result<T> => (r.ok ? { ...r, message: r.data?.message } : r);

const saveSchema = z.object({
  id: uuid.optional(),
  rev: z.coerce.number().int().min(1).optional(),
  wantsAgenda: z.boolean().default(false),
  values: formValuesSchema,
  marks: marksSchema,
});

export async function saveReport(raw: unknown) {
  return act(saveSchema, raw, async (sql, i, s) => {
    const canPrivate = s.mfaOk && s.roles.some((r) => REPORT_ROLES.includes(r));
    const defs = canPrivate ? REPORT_FIELDS : REPORT_FIELDS.filter((d) => !d.private);
    const p = parseFicha(defs, i.values, i.marks);
    const before = i.id
      ? await sql.one<{ wants_agenda: boolean; rev: number }>(`select wants_agenda, rev from public.community_reports where id = $1 and deleted_at is null`, [i.id])
      : null;
    if (i.id && !before) throw new UserError('No encontramos este reporte, o tu rol no lo puede cambiar.');
    const saved = await writeFicha(sql, 'community_reports', i.id ?? null, { ...p.main, wants_agenda: i.wantsAgenda }, p.marks.main);
    if (!saved) throw new UserError('No tienes permiso para cambiar este reporte.');
    if (canPrivate) await writePrivate(sql, 'community_reports', saved.id, p.priv, p.marks.priv);
    // To the agenda now (new, or switched on), and still open: the boss and despacho put the date.
    const toAgenda = i.wantsAgenda && (!before || !before.wants_agenda) && !isClosed(String(p.main.status));
    const overwrote = !!before && i.rev !== undefined && before.rev !== i.rev;
    const message = [
      toAgenda ? 'Guardado. Le avisamos al jefe y al despacho: «Por ponerle fecha».' : before ? 'Cambios guardados.' : 'Reporte guardado en el registro.',
      overwrote ? 'Ojo: alguien lo cambió mientras escribías. Quedó lo tuyo; lo anterior está en la historia.' : '',
    ].filter(Boolean).join(' ');
    return { id: saved.id, code: saved.code, message, notice: toAgenda ? { title: String(p.main.title), municipality: String(p.main.municipality) } : null, actorId: s.userId };
  }, { revalidate: REVALIDATE }).then(async (r) => {
    if (r.ok && r.data?.notice) {
      const { id, notice, actorId } = r.data;
      await sendNotice(toScheduleNotice({ kind: 'report', id, title: notice.title, municipality: notice.municipality }), async () =>
        noticeRecipients([...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return withMessage(r);
  });
}

// A change of state with its reason: both go into the history («cambió de Programado a En ejecución: …»).
export async function setReportStatus(raw: unknown) {
  return act(
    z.object({ id: uuid, status: z.enum(REPORT_STATUSES), note: z.string().trim().max(2000, 'Máximo 2000 caracteres.').default('') }),
    raw,
    async (sql, i) => {
      const before = await sql.one<{ status: string }>(`select status from public.community_reports where id = $1 and deleted_at is null`, [i.id]);
      if (!before) throw new UserError('No encontramos este reporte.');
      if (before.status === i.status) throw new UserError('Ya está en ese estado.');
      if (i.note) await sql.query(`select set_config('app.history_note', $1, true)`, [i.note]);
      const r = await sql.one(`update public.community_reports set status = $2 where id = $1 and deleted_at is null returning id`, [i.id, i.status]);
      if (!r) throw new UserError('No tienes permiso para cambiar este reporte.');
      return { message: 'Estado cambiado. Quedó en la historia.' };
    },
    { revalidate: REVALIDATE },
  ).then(withMessage);
}

export async function addReportNote(raw: unknown) {
  return act(z.object({ id: uuid, note: z.string().trim().min(2, 'Escribe la nota.').max(2000, 'Máximo 2000 caracteres.') }), raw, async (sql, i) => {
    await sql.query(`insert into public.ficha_updates (community_report_id, kind, note) values ($1, 'note', $2)`, [i.id, i.note]);
    return { message: 'Nota guardada en la historia.' };
  }, { revalidate: ['/reportes'] }).then(withMessage);
}
