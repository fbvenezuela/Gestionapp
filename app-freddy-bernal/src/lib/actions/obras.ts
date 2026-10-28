'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { contactsSchema, formValuesSchema, keepOthersContacts, marksSchema, parseFicha, writeFicha, writePrivate } from './schemas';
import { notify, usersWithRole } from '../notify';
import { dialogBrand } from '../data/fichas';
import { OBRA_FIELDS, missingFields, missingMessage } from '@/lib/domain/ficha-fields';
import { noticeRecipients, toScheduleNotice, type AgendaNotice } from '@/lib/domain/agenda-notices';
import { mainPhoneMessage, mainTextPhone } from '@/lib/domain/phones';
import { buildObraDialog, dialogContactProblem, dialogInput, dialogUnknownNumbers } from '@/lib/domain/obra-dialog';
import type { Role } from '../roles';

// The obra ficha (§4.1): the Director del IVT fills it before the boss's visit, WITHOUT a date. «Guardar y avisar»
// sends «Por ponerle fecha» to the boss and despacho (never the date: there is none); «Guardar borrador» sends
// nothing. The visit's date is set later by the boss or despacho («Ponerle fecha», the shared agenda).

const uuid = z.string().uuid();
const OBRA_ROLES: Role[] = ['admin', 'boss', 'dispatch', 'ivt'];
const REVALIDATE = ['/obras', '/municipios', '/hoy', '/jefe'];

// Notices go out AFTER the transaction (notify() opens its own system connection); a failed notice never turns a
// saved ficha into an error.
async function sendNotice(n: AgendaNotice, recipients: () => Promise<string[]>) {
  try {
    const userIds = await recipients();
    if (userIds.length) await notify({ userIds, kind: n.kind, title: n.title, body: n.body, link: n.link, key: n.key });
  } catch (e) {
    console.warn('[notify] fichas:', (e as Error).message);
  }
}

const withMessage = <T extends { message?: string }>(r: Result<T>): Result<T> => (r.ok ? { ...r, message: r.data?.message } : r);

const saveSchema = z.object({
  id: uuid.optional(),
  // The version this person started from: if someone saved in between, theirs is kept in the history and this
  // person is told (last one wins, nothing is lost).
  rev: z.coerce.number().int().min(1).optional(),
  submit: z.boolean().default(false),
  ...contactsSchema,
  values: formValuesSchema,
  marks: marksSchema,
});

export async function saveObraFicha(raw: unknown) {
  return act(saveSchema, raw, async (sql, i, s) => {
    // The contacts need 2FA (obra_ficha_private, mfa_ok()); without it they are neither asked nor written.
    const canPrivate = s.mfaOk && s.roles.some((r) => OBRA_ROLES.includes(r));
    const defs = canPrivate ? OBRA_FIELDS : OBRA_FIELDS.filter((d) => !d.private);
    const before = i.id
      ? await sql.one<{ stage: string; rev: number }>(`select stage, rev from public.obra_fichas where id = $1 and deleted_at is null`, [i.id])
      : null;
    if (i.id && !before) throw new UserError('No encontramos esta ficha, o tu rol no la puede cambiar.');
    const contacts = canPrivate && i.id
      ? await keepOthersContacts(sql, 'obra_fichas', i.id, defs, i.values, i.marks, i.privRev, i.privChanged)
      : { values: i.values, marks: i.marks, moved: false };
    const p = parseFicha(defs, contacts.values, contacts.marks);
    // Redes and Grabación read the main part as stored while the visit is live (visit_obra_ficha()): never a phone in
    // it (the database refuses it too: obra_fichas_main_no_phone).
    const phone = mainTextPhone(defs, p.main);
    if (phone) throw new UserError(mainPhoneMessage('obra', phone));
    if (before && ['scheduled', 'done', 'archived'].includes(before.stage) && i.submit) throw new UserError('Esta ficha ya no está en borrador.');
    // Ready = «Guardar y avisar», or any later save of a ficha that already went out: every field answered.
    // (A draft or an archived ficha saves with whatever it has.)
    const ready = i.submit || (!!before && ['to_schedule', 'scheduled', 'done'].includes(before.stage));
    if (ready) {
      const miss = missingFields(defs, { ...p.main, ...p.priv }, { ...p.marks.main, ...p.marks.priv });
      if (miss.length) throw new UserError(missingMessage(miss));
    }
    const becameReady = i.submit && (!before || before.stage === 'draft');
    const row: Record<string, unknown> = { ...p.main };
    if (!before) row.stage = i.submit ? 'to_schedule' : 'draft';
    else if (becameReady) row.stage = 'to_schedule';
    const saved = await writeFicha(sql, 'obra_fichas', i.id ?? null, row, p.marks.main);
    if (!saved) throw new UserError('No tienes permiso para cambiar esta ficha.');
    if (canPrivate) await writePrivate(sql, 'obra_fichas', saved.id, p.priv, p.marks.priv);
    const overwrote = !!before && i.rev !== undefined && before.rev !== i.rev;
    const message = [
      becameReady ? 'Guardada. Le avisamos al jefe y al despacho: «Por ponerle fecha».' : before ? 'Cambios guardados.' : 'Borrador guardado. Nadie recibe aviso todavía.',
      overwrote ? 'Ojo: alguien la cambió mientras escribías. Quedó lo tuyo; lo anterior está en la historia.' : '',
      contacts.moved ? 'Ojo: alguien cambió los contactos mientras escribías. Guardamos solo los que tú cambiaste; los demás quedaron como los dejó esa persona.' : '',
    ].filter(Boolean).join(' ');
    // The ficha's rev marks this send: a retry of the same save is one notice, a real new send (archived, back to
    // draft and sent again) is another.
    return { id: saved.id, code: saved.code, message, notice: becameReady ? { title: String(p.main.name), municipality: String(p.main.municipality), stamp: String(saved.rev) } : null, actorId: s.userId };
  }, { revalidate: REVALIDATE }).then(async (r) => {
    if (r.ok && r.data?.notice) {
      const { id, notice, actorId } = r.data;
      await sendNotice(toScheduleNotice({ kind: 'obra', id, title: notice.title, municipality: notice.municipality }, notice.stamp), async () =>
        noticeRecipients([...(await usersWithRole('boss')), ...(await usersWithRole('dispatch'))], actorId),
      );
    }
    return withMessage(r);
  });
}

// «Lo que voy a decir»: the text shown (from the template, or edited before saving) goes into the ficha. It is
// 'template' when untouched, 'manual' when edited. A figure that is not in the ficha is a warning, never a block.
export async function saveObraDialog(raw: unknown) {
  return act(z.object({ id: uuid, text: z.string().max(6000, 'Máximo 6000 caracteres.') }), raw, async (sql, i, s) => {
    const f = await sql.one<Record<string, unknown>>(`select * from public.obra_fichas where id = $1 and deleted_at is null`, [i.id]);
    if (!f) throw new UserError('No encontramos esta ficha.');
    const brand = await dialogBrand(sql);
    const input = dialogInput(f);
    const text = i.text.replace(/\r\n/g, '\n').trim();
    // Redes and Grabación read this text: no contact of the ficha and nothing that looks like a phone. The contacts
    // are read as this person (2FA; without it the database gives none and only the phone check runs).
    const priv = s.mfaOk ? await sql.one<Record<string, unknown>>(`select * from public.obra_ficha_private where id = $1`, [i.id]) : null;
    const problem = text ? dialogContactProblem(text, input, brand, priv) : null;
    if (problem) throw new UserError(problem);
    const by = !text ? null : text === buildObraDialog(input, brand).text ? 'template' : 'manual';
    const r = await sql.one(`update public.obra_fichas set fab_dialog = $2, fab_generated_by = $3 where id = $1 and deleted_at is null returning id`, [i.id, text, by]);
    if (!r) throw new UserError('No tienes permiso para cambiar esta ficha.');
    const unknown = text ? dialogUnknownNumbers(text, input, brand) : [];
    return {
      message: !text
        ? 'Se borró «Lo que voy a decir».'
        : unknown.length
          ? `Guardado. Ojo: estas cifras no están en la ficha: ${unknown.join(', ')}. Revísalas antes de leerlo.`
          : 'Guardado: «Lo que voy a decir» quedó en la ficha.',
    };
  }, { revalidate: ['/obras'] }).then(withMessage);
}

// Archive a ficha that will not be visited (only a draft or one waiting for a date), or bring it back as a draft.
// The reason goes into the history.
export async function archiveObraFicha(raw: unknown) {
  return act(
    z.object({ id: uuid, archive: z.boolean(), note: z.string().trim().max(500).default('') }),
    raw,
    async (sql, i) => {
      const f = await sql.one<{ stage: string }>(`select stage from public.obra_fichas where id = $1 and deleted_at is null`, [i.id]);
      if (!f) throw new UserError('No encontramos esta ficha.');
      if (i.archive && !['draft', 'to_schedule'].includes(f.stage)) throw new UserError('Una visita con fecha se cancela en la agenda, no aquí.');
      if (!i.archive && f.stage !== 'archived') throw new UserError('Esta ficha no está archivada.');
      if (i.note) await sql.query(`select set_config('app.history_note', $1, true)`, [i.note]);
      const r = await sql.one(`update public.obra_fichas set stage = $2 where id = $1 returning id`, [i.id, i.archive ? 'archived' : 'draft']);
      if (!r) throw new UserError('No tienes permiso para cambiar esta ficha.');
      return { message: i.archive ? 'Ficha archivada.' : 'La ficha volvió a borrador.' };
    },
    { revalidate: REVALIDATE },
  ).then(withMessage);
}

// A note in the ficha's history (it only grows: nobody edits or deletes it).
export async function addObraNote(raw: unknown) {
  return act(z.object({ id: uuid, note: z.string().trim().min(2, 'Escribe la nota.').max(2000, 'Máximo 2000 caracteres.') }), raw, async (sql, i) => {
    await sql.query(`insert into public.ficha_updates (obra_ficha_id, kind, note) values ($1, 'note', $2)`, [i.id, i.note]);
    return { message: 'Nota guardada en la historia.' };
  }, { revalidate: ['/obras'] }).then(withMessage);
}
