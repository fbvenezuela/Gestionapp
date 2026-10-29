'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { friendlyDbError } from '../db/core';
import { notifyChat } from '../notify';
import {
  CHAT_BODY_MAX, CHAT_GROUP_MAX, CHAT_GROUP_MIN, CHAT_PHONE_LINK_TEXT, CHAT_PHONE_TEXT, CHAT_RELATIVE_ASK, CHAT_ROLE_NAME,
  CHAT_ROLE_PAIRS, CHAT_TIMECODE_ASK, CHAT_TITLE_MAX, chatTextProblem, chatTitleProblem, fillWord, type ChatTextProblem,
} from '../domain/chat';

// Mensajes (R3, design §4.3). Every action runs as the person (RLS); the database decides who reads and writes
// (20261028002400_internal_chat.sql) and these only say it first, in Spanish. A message's text is never logged and
// never comes back in an error. sendMessage is called straight from the phone's send queue (not with useAction, which
// refreshes the whole page) and revalidates nothing.

const uuid = z.string().uuid();

/** The text the person reads when a message would be refused before it is even sent (the database's own wording). */
function refusal(p: ChatTextProblem): string {
  if (p.kind === 'phone') return p.inLink ? CHAT_PHONE_LINK_TEXT : CHAT_PHONE_TEXT;
  return friendlyDbError({ code: '23514', message: 'chat_messages_no_agenda_when' });
}

// «Lo lee el jefe»: accepted once, before writing (D-59).
export async function acceptNotice() {
  return act(z.object({}), {}, async (sql) => {
    await sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid()) on conflict (user_id) do nothing`);
  }, { revalidate: ['/mensajes'] });
}

const startSchema = z.object({
  kind: z.enum(['direct', 'group']),
  memberIds: z.array(uuid).min(1, 'Elige a alguien.').max(CHAT_GROUP_MAX - 1, `Un grupo es de ${CHAT_GROUP_MIN} a ${CHAT_GROUP_MAX} personas, contándote.`),
  title: z.string().trim().max(CHAT_TITLE_MAX, `El nombre del grupo va de 1 a ${CHAT_TITLE_MAX} letras.`).optional(),
});

/** One person (the direct that exists, or a new one) or a new group; the screen then opens it. */
export async function startConversation(raw: unknown): Promise<Result<{ id: string }>> {
  return act(startSchema, raw, async (sql, i, s) => {
    const others = [...new Set(i.memberIds)].filter((x) => x !== s.userId);
    if (i.kind === 'direct' && others.length !== 1) throw new UserError('Elige a una persona.');
    if (i.kind === 'group') {
      if (others.length + 1 < CHAT_GROUP_MIN || others.length + 1 > CHAT_GROUP_MAX) throw new UserError(`Un grupo es de ${CHAT_GROUP_MIN} a ${CHAT_GROUP_MAX} personas, contándote.`);
      if (!i.title) throw new UserError('Ponle un nombre al grupo.');
      if (chatTitleProblem(i.title)) throw new UserError(friendlyDbError({ code: '23514', message: 'chat_title_private' }));
    }
    const row = await sql.one<{ id: string }>(`select public.chat_start($1, $2::uuid[], $3) as id`, [i.kind, others, i.kind === 'group' ? i.title : null]);
    return { id: row!.id };
  }, { revalidate: ['/mensajes'] });
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
  | { kind: 'confirm'; confirm: 'timecode' | 'relative'; word: string; question: string };

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

/** Read up to `upTo` (the newest message on my screen) or now. Only members: the boss reading someone else's
 * conversation marks nothing for anyone. `upTo` comes from the screen in milliseconds (toISOString) while Postgres keeps
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

/** Silence a conversation (its messages do not ring the phone), or not. */
export async function setMuted(raw: unknown) {
  return act(z.object({ conversationId: uuid, muted: z.boolean() }), raw, async (sql, i) => {
    const member = await sql.one<{ m: boolean }>(`select public.chat_is_member($1) as m`, [i.conversationId]);
    if (!member?.m) throw new UserError('Solo silencias tus conversaciones.');
    // A first row starts unread (what I have not opened stays new).
    await sql.query(
      `insert into public.chat_reads (conversation_id, user_id, last_read_at, muted) values ($1, auth.uid(), '-infinity', $2)
       on conflict (conversation_id, user_id) do update set muted = excluded.muted`,
      [i.conversationId, i.muted],
    );
    return { message: i.muted ? 'Listo: esta conversación ya no suena en tu teléfono.' : 'Listo: esta conversación vuelve a sonar.' };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

const pairKeys = CHAT_ROLE_PAIRS.map((p) => `${p.roleA}:${p.roleB}`);
const ruleSchema = z
  .object({ roleA: z.string(), roleB: z.string(), allowed: z.boolean() })
  .refine((r) => pairKeys.includes(`${r.roleA}:${r.roleB}`), 'Esa pareja no existe.');

/** «Quién habla con quién»: the boss (2FA, RLS) opens or closes a pair of roles. */
export async function setRoleRule(raw: unknown) {
  return act(ruleSchema, raw, async (sql, i) => {
    await sql.query(
      `insert into public.chat_rules (role_a, role_b, allowed) values ($1::public.app_role, $2::public.app_role, $3)
       on conflict (role_a, role_b) do update set allowed = excluded.allowed`,
      [i.roleA, i.roleB, i.allowed],
    );
    const a = CHAT_ROLE_NAME[i.roleA as keyof typeof CHAT_ROLE_NAME];
    const b = CHAT_ROLE_NAME[i.roleB as keyof typeof CHAT_ROLE_NAME];
    return {
      message: i.allowed
        ? `Listo: ${a} y ${b} ya pueden escribirse.`
        : `Listo: ${a} y ${b} ya no pueden escribirse. En Todo el equipo siguen escribiendo todos.`,
    };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

/** «Solo el jefe escribe» in a group or in «Todo el equipo» ('team': made first if it does not exist yet). */
export async function setOnlyBoss(raw: unknown) {
  return act(z.object({ conversationId: z.union([uuid, z.literal('team')]), value: z.boolean() }), raw, async (sql, i) => {
    const id = i.conversationId === 'team' ? (await sql.one<{ id: string }>(`select public.chat_team_channel() as id`))!.id : i.conversationId;
    const kind = (await sql.one<{ kind: string }>(`select kind from public.chat_conversations where id = $1`, [id]))?.kind;
    await sql.query(`select public.chat_set_only_boss($1, $2)`, [id, i.value]);
    const where = kind === 'team' ? 'en Todo el equipo' : 'en este grupo';
    return { message: i.value ? `Listo: ${where} solo escribe el jefe.` : `Listo: ${where} escriben todos otra vez.` };
  }, { revalidate: ['/mensajes'] }).then(withMessage);
}

function withMessage<T extends { message?: string }>(r: Result<T>): Result<T> {
  return r.ok ? { ...r, message: r.data?.message } : r;
}
