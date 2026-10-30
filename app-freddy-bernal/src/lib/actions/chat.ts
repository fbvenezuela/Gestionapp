'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { friendlyDbError } from '../db/core';
import { isDemo } from '../env';
import { notifyChat } from '../notify';
import { wasRemoved } from '../data/chat';
import {
  CHAT_BODY_MAX, CHAT_DESC_MAX, CHAT_MEMBERS_MAX, CHAT_PHONE_LINK_TEXT, CHAT_PHONE_TEXT, CHAT_RELATIVE_ASK, CHAT_TEXT_REFUSED,
  CHAT_NOT_IN_LIST, CHAT_TIMECODE_ASK, CHAT_TITLE_MAX, chatChannelTextProblem, chatTextProblem, fillWord, type ChatTextProblem,
} from '../domain/chat';

// Mensajes: channels (R5, D-79 to D-88). Every action runs as the person (RLS); the database decides who reads and
// writes (20261028002400_internal_chat.sql and 20261029090000_chat_channels.sql) and these only say it first, in
// Spanish. Only the boss with 2FA makes a channel and decides who is in it. A message's text is never logged and never
// comes back in an error. sendMessage is called straight from the phone's send queue (not with useAction, which
// refreshes the whole page) and revalidates nothing.

const uuid = z.string().uuid();

/** The text the person reads when a message would be refused before it is even sent (the database's own wording). */
function refusal(p: ChatTextProblem): string {
  if (p.kind === 'phone') return p.inLink ? CHAT_PHONE_LINK_TEXT : CHAT_PHONE_TEXT;
  return friendlyDbError({ code: '23514', message: 'chat_messages_no_agenda_when' });
}

const titleSchema = z.string().trim().min(1, `El nombre del canal va de 1 a ${CHAT_TITLE_MAX} letras.`).max(CHAT_TITLE_MAX, `El nombre del canal va de 1 a ${CHAT_TITLE_MAX} letras.`);
const descSchema = z.string().trim().max(CHAT_DESC_MAX, `La descripción va hasta ${CHAT_DESC_MAX} letras.`).optional();
const membersSchema = z.array(uuid).min(1, 'Elige al menos a una persona.').max(CHAT_MEMBERS_MAX, `Un canal es de hasta ${CHAT_MEMBERS_MAX} personas, además del jefe.`);

// The name and the description: never a phone, a date, a time or a map (the database's guard_chat_channel_text()).
function checkTexts(title: string, description: string | undefined) {
  if (chatChannelTextProblem(title) || (description && chatChannelTextProblem(description))) throw new UserError(CHAT_TEXT_REFUSED);
}

/** «Nuevo canal» (the boss with 2FA): a name, a short description and who goes. The bosses are in it on their own. */
export async function createChannel(raw: unknown): Promise<Result<{ id: string }>> {
  return act(z.object({ title: titleSchema, description: descSchema, memberIds: membersSchema }), raw, async (sql, i) => {
    checkTexts(i.title, i.description);
    const row = await sql.one<{ id: string }>(`select public.chat_channel_create($1, $2, $3::uuid[]) as id`, [i.title, i.description || null, [...new Set(i.memberIds)]]);
    return { id: row!.id, message: 'Listo: se creó el canal.' };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

/** «Editar canal» (the boss with 2FA): the name, the description and who is in it, saved together. Whoever is taken
 * out stops reading the channel (also what came before); whoever is added reads it all (D-85). */
export async function saveChannel(raw: unknown) {
  return act(z.object({ id: uuid, title: titleSchema, description: descSchema, memberIds: membersSchema.optional() }), raw, async (sql, i) => {
    checkTexts(i.title, i.description);
    await sql.query(`select public.chat_channel_update($1, $2, $3)`, [i.id, i.title, i.description || null]);
    if (i.memberIds) await sql.query(`select public.chat_channel_set_members($1, $2::uuid[])`, [i.id, [...new Set(i.memberIds)]]);
    return { message: 'Listo: se guardó el canal.' };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

/** Archive a channel (nobody writes in it; its members still read it) or take it out of the archive. */
export async function archiveChannel(raw: unknown) {
  return act(z.object({ id: uuid, archived: z.boolean() }), raw, async (sql, i) => {
    await sql.query(`select public.chat_channel_archive($1, $2)`, [i.id, i.archived]);
    return { message: i.archived ? 'Listo: el canal quedó archivado.' : 'Listo: el canal volvió a la lista.' };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

/** «Todo el equipo»: the database makes it the first time someone opens it. */
export async function openTeamChannel(): Promise<Result<{ id: string }>> {
  return act(z.object({}), {}, async (sql) => ({ id: (await sql.one<{ id: string }>(`select public.chat_team_channel() as id`))!.id }));
}

const sendSchema = z.object({
  conversationId: uuid,
  clientId: uuid,
  body: z.string().trim().min(1, 'Escribe el mensaje.').max(CHAT_BODY_MAX, `El mensaje tiene que tener entre 1 y ${CHAT_BODY_MAX} letras.`),
  timecodeOk: z.boolean().optional(),
  relativeOk: z.boolean().optional(),
});

export type SendData =
  | { kind: 'sent'; id: string; createdAt: string; fresh: boolean }
  | { kind: 'confirm'; confirm: 'timecode' | 'relative'; word: string; question: string }
  // The database says the boss took the person out of this channel meanwhile: the screen says so and stops.
  | { kind: 'gone' };

/**
 * Sends a message with the phone's own id (clientId): sending it again never makes a second one. Before writing, the
 * same checks as the database, so the person reads why at once: a phone (never), and, from whoever knows the agenda
 * where Redes or política read, a concrete date, time or map (refused); a bare time code of Grabación or a relative
 * word («mañana», E1) is asked first ({ kind: 'confirm' }, nothing saved). The phones of the others ring after the
 * transaction (notifyChat), never with the text.
 */
export async function sendMessage(raw: unknown): Promise<Result<SendData>> {
  const res = await act(sendSchema, raw, async (sql, i, s): Promise<SendData> => {
    // Already saved (a send repeated after a lost answer): the same message, nothing new.
    const same = await sql.one<{ id: string; created_at: Date }>(`select id, created_at from public.chat_messages where id = $1 and author_id = auth.uid()`, [i.clientId]);
    if (same) return { kind: 'sent', id: same.id, createdAt: new Date(same.created_at).toISOString(), fresh: false };
    if (!(await sql.one<{ r: boolean }>(`select public.chat_can_read($1) as r`, [i.conversationId]))?.r) {
      // «gone» only when the database says they were taken out; otherwise the text goes back to the box (in the demo
      // the channel may live on another server, D-88: sending again may reach it). Nothing said about the channel.
      if (await wasRemoved(sql, i.conversationId)) return { kind: 'gone' };
      throw new UserError(isDemo() ? CHAT_NOT_IN_LIST : 'Ya no puedes escribir en este canal.');
    }
    const hides = !!(await sql.one<{ h: boolean }>(`select public.chat_hides_agenda_for_me($1) as h`, [i.conversationId]))?.h;
    const p = chatTextProblem(i.body, { hidesAgenda: hides, authorRoles: s.roles, timecodeOk: i.timecodeOk, relativeOk: i.relativeOk });
    if (p?.kind === 'timecode') return { kind: 'confirm', confirm: 'timecode', word: p.word, question: fillWord(CHAT_TIMECODE_ASK, p.word) };
    if (p?.kind === 'relative') return { kind: 'confirm', confirm: 'relative', word: p.word, question: fillWord(CHAT_RELATIVE_ASK, p.word) };
    if (p) throw new UserError(refusal(p));
    const row = await sql.one<{ id: string; created_at: Date }>(
      `insert into public.chat_messages (id, conversation_id, author_id, body) values ($1, $2, auth.uid(), $3)
       on conflict (id) do nothing returning id, created_at`,
      [i.clientId, i.conversationId, i.body],
    );
    if (!row) throw new UserError('No se pudo enviar. Vuelve a intentar.');
    // Writing means having read what came before. The time is taken from the row itself: a JavaScript Date keeps only
    // milliseconds, and Postgres keeps microseconds.
    await sql.query(
      `insert into public.chat_reads (conversation_id, user_id, last_read_at)
       select $1, auth.uid(), x.created_at from public.chat_messages x where x.id = $2
       on conflict (conversation_id, user_id) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at)`,
      [i.conversationId, row.id],
    );
    return { kind: 'sent', id: row.id, createdAt: new Date(row.created_at).toISOString(), fresh: true };
  });
  if (!res.ok || !res.data) return res;
  const data = res.data;
  if (data.kind === 'sent' && data.fresh) {
    try {
      await notifyChat({ messageId: data.id });
    } catch (e) {
      // Sent is sent: a notice that failed never undoes the message.
      console.error('[chat] notice:', (e as Error).message);
    }
  }
  return { ok: true, data };
}

const readSchema = z.object({ conversationId: uuid, upTo: z.string().datetime({ offset: true }).optional() });

/** Read up to `upTo` (the newest message on my screen) or now. Only who is in the channel now. `upTo` comes from the screen in milliseconds (toISOString) while Postgres keeps
 * microseconds: it is moved to the full time of the newest message (or hidden mark) within that millisecond, or the
 * message read would still count as new. */
export async function markRead(raw: unknown) {
  return act(readSchema, raw, async (sql, i) => {
    const member = await sql.one<{ m: boolean }>(`select public.chat_is_member($1) and public.mfa_ok() as m`, [i.conversationId]);
    if (!member?.m) return { marked: false };
    await sql.query(
      `with up as (select coalesce($2::timestamptz, now()) as t),
            seen as (select x.created_at from public.chat_messages x, up
                      where x.conversation_id = $1 and x.created_at < up.t + interval '1 millisecond'
                     union all
                     select h.created_at from public.chat_hidden_marks($1) h, up
                      where h.created_at < up.t + interval '1 millisecond')
       insert into public.chat_reads (conversation_id, user_id, last_read_at)
       select $1, auth.uid(), least(greatest(up.t, (select max(created_at) from seen)), now()) from up
       on conflict (conversation_id, user_id) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at)`,
      [i.conversationId, i.upTo ?? null],
    );
    return { marked: true };
  });
}

/** Silence a channel (its messages do not ring the phone), or not. */
export async function setMuted(raw: unknown) {
  return act(z.object({ conversationId: uuid, muted: z.boolean() }), raw, async (sql, i) => {
    const member = await sql.one<{ m: boolean }>(`select public.chat_is_member($1) as m`, [i.conversationId]);
    if (!member?.m) throw new UserError('Solo silencias tus canales.');
    // A first row starts unread (what I have not opened stays new).
    await sql.query(
      `insert into public.chat_reads (conversation_id, user_id, last_read_at, muted) values ($1, auth.uid(), '-infinity', $2)
       on conflict (conversation_id, user_id) do update set muted = excluded.muted`,
      [i.conversationId, i.muted],
    );
    return { message: i.muted ? 'Listo: este canal ya no suena en tu teléfono.' : 'Listo: este canal vuelve a sonar.' };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

/** «Solo el jefe escribe» in a channel or in «Todo el equipo» ('team': made first if it does not exist yet). */
export async function setOnlyBoss(raw: unknown) {
  return act(z.object({ conversationId: z.union([uuid, z.literal('team')]), value: z.boolean() }), raw, async (sql, i) => {
    const id = i.conversationId === 'team' ? (await sql.one<{ id: string }>(`select public.chat_team_channel() as id`))!.id : i.conversationId;
    const kind = (await sql.one<{ kind: string }>(`select kind from public.chat_conversations where id = $1`, [id]))?.kind;
    await sql.query(`select public.chat_set_only_boss($1, $2)`, [id, i.value]);
    const where = kind === 'team' ? 'en Todo el equipo' : 'en este canal';
    return { message: i.value ? `Listo: ${where} solo escribe el jefe.` : `Listo: ${where} escriben todos otra vez.` };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

function withMessage<T extends { message?: string }>(r: Result<T>): Result<T> {
  return r.ok ? { ...r, message: r.data?.message } : r;
}
