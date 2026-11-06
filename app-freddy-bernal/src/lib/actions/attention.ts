'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import type { Sql } from '../db';
import { openContact } from '../participation/contact-crypto';
import { env } from '../env';
import { queueStatusEmails } from './attention-email';
import { duplicateCandidates } from '../data/attention';
import { REDACT_FIELDS, REQUEST_PRIORITIES, REQUEST_STATES, REQUEST_TYPES, type RequestState } from '../domain/attention';

// What the team does with a citizen request (design §5, /admin/atencion). Every action runs AS THE PERSON (act():
// zod, RLS, Spanish messages) and calls the database's own functions (20261106000200_participacion.sql): each one checks
// who may do it on that case, follows the state machine, asks for the reason where it is required and writes the
// history (request_events) with who and when; the audit triggers keep the rest. Nothing is deleted. After a reply, a
// request for information or a change of state, the person's status email is queued (attention-email.ts), after the
// action committed. The citizen's contact is decrypted here only for «Ver contacto», and request_contact() records who
// looked.

const PATHS = { revalidate: ['/admin/atencion'] };
const NOT_YOURS = 'No encontramos esa solicitud o no te toca atenderla.';
const uuid = (message = 'Solicitud inválida.') => z.string().uuid(message);
const reason = (max = 2000) => z.string().trim().max(max, `El motivo va hasta ${max} letras.`).optional().default('');
const opt = (s: string) => (s ? s : null);

/** The state this person reads now, or the one refusal (a case they may not read is not found). */
async function currentState(sql: Sql, id: string): Promise<RequestState> {
  const r = await sql.one<{ state: RequestState }>(`select state from public.requests where id = $1`, [id]);
  if (!r) throw new UserError(NOT_YOURS);
  return r.state;
}

const lastEvent = async (sql: Sql, id: string, kind: string) =>
  (await sql.one<{ id: string }>(`select id from public.request_events where request_id = $1 and kind = $2 order by created_at desc, id desc limit 1`, [id, kind]))?.id ?? null;

// --- State -----------------------------------------------------------------------------------------------------------------

const stateSchema = z.object({
  id: uuid(),
  state: z.enum(REQUEST_STATES, 'Elige el estado.'),
  reason: reason(),
  note: z.string().trim().max(4000, 'El mensaje para la persona va hasta 4000 letras.').optional().default(''),
});

/** A change of state (the database's machine; the reason where it asks for it; `note` goes to the person). */
export async function changeRequestState(raw: unknown) {
  const r = await act(stateSchema, raw, async (sql, input) => {
    const from = await currentState(sql, input.id);
    if (from === input.state) throw new UserError('Ya está en ese estado.');
    await sql.query(`select public.set_request_state($1, $2, $3, $4)`, [input.id, input.state, opt(input.reason), opt(input.note)]);
    return { eventId: await lastEvent(sql, input.id, 'state'), state: input.state };
  }, PATHS);
  if (r.ok && r.data?.eventId) {
    queueStatusEmails({ requestId: stateSchema.parse(raw).id, kind: r.data.state === 'requiere_informacion' ? 'info_request' : 'state', state: r.data.state, key: r.data.eventId });
  }
  return r.ok ? { ok: true as const, message: 'Listo: cambió el estado.' } : r;
}

// --- Area and responsible ----------------------------------------------------------------------------------------------

const assignSchema = z.object({ id: uuid(), areaId: uuid('Área inválida.').nullable(), assigneeId: uuid('Persona inválida.').nullable(), reason: reason() });

export async function assignRequest(raw: unknown) {
  const r = await act(assignSchema, raw, async (sql, input) => {
    const from = await currentState(sql, input.id);
    await sql.query(`select public.assign_request($1, $2, $3, $4)`, [input.id, input.areaId, input.assigneeId, opt(input.reason)]);
    const to = await currentState(sql, input.id);
    return { stateEvent: to !== from ? await lastEvent(sql, input.id, 'state') : null, state: to };
  }, PATHS);
  if (r.ok && r.data?.stateEvent) queueStatusEmails({ requestId: assignSchema.parse(raw).id, kind: 'state', state: r.data.state, key: r.data.stateEvent });
  return r.ok ? { ok: true as const, message: 'Listo: quedó asignada.' } : r;
}

// --- Priority, due date, kind -------------------------------------------------------------------------------------------

export async function setRequestPriority(raw: unknown) {
  return act(z.object({ id: uuid(), priority: z.enum(REQUEST_PRIORITIES, 'Elige la prioridad.'), reason: reason() }), raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.set_request_priority($1, $2, $3)`, [input.id, input.priority, opt(input.reason)]);
  }, PATHS);
}

const dueSchema = z.object({
  id: uuid(),
  // The day it is promised for; it counts until the end of that day in Táchira. Empty takes it away.
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Revisa la fecha.').nullable(),
  reason: reason(),
});

export async function setRequestDue(raw: unknown) {
  return act(dueSchema, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(
      `select public.set_request_due($1, case when $2::date is null then null else (($2::date + 1)::timestamp at time zone $3) - interval '1 second' end, $4)`,
      [input.id, input.due, env.appTz, opt(input.reason)],
    );
  }, PATHS);
}

export async function reclassifyRequest(raw: unknown) {
  const s = z.object({ id: uuid(), type: z.enum(REQUEST_TYPES, 'Elige el tipo.'), categoryId: uuid('Elige la categoría.'), reason: z.string().trim().min(1, 'Escribe el motivo.').max(2000) });
  return act(s, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.reclassify_request($1, $2, $3, $4)`, [input.id, input.type, input.categoryId, input.reason]);
  }, PATHS);
}

// --- Messages ----------------------------------------------------------------------------------------------------------

const messageSchema = z.object({
  id: uuid(),
  kind: z.enum(['internal_note', 'public_reply', 'info_request'], 'Elige qué escribes.'),
  body: z.string().trim().min(1, 'Escribe el mensaje.').max(4000, 'El mensaje va hasta 4000 letras.'),
});

/** An internal note (never seen by the person), a reply to the person, or «Pedir más información». */
export async function addRequestMessage(raw: unknown) {
  const r = await act(messageSchema, raw, async (sql, input) => {
    await currentState(sql, input.id);
    const m = await sql.one<{ id: string }>(`select public.add_request_message($1, $2, $3) as id`, [input.id, input.kind, input.body]);
    return { messageId: m!.id, kind: input.kind };
  }, PATHS);
  if (r.ok && r.data && r.data.kind !== 'internal_note') {
    const info = r.data.kind === 'info_request';
    queueStatusEmails({ requestId: messageSchema.parse(raw).id, kind: info ? 'info_request' : 'reply', state: info ? 'requiere_informacion' : null, key: r.data.messageId });
  }
  if (!r.ok) return r;
  const text = r.data?.kind === 'internal_note' ? 'Nota guardada: solo la ve el equipo.' : r.data?.kind === 'info_request' ? 'Listo: le pedimos la información.' : 'Respuesta enviada a la persona.';
  return { ok: true as const, message: text };
}

// --- Files ---------------------------------------------------------------------------------------------------------------

export async function shareEvidence(raw: unknown) {
  return act(z.object({ attachmentId: uuid('Archivo inválido.'), shared: z.boolean() }), raw, async (sql, input) => {
    await sql.query(`select public.set_request_attachment_shared($1, $2)`, [input.attachmentId, input.shared]);
    return { shared: input.shared };
  }, PATHS);
}

export async function withholdAttachment(raw: unknown) {
  const s = z.object({ attachmentId: uuid('Archivo inválido.'), reason: z.string().trim().min(1, 'Escribe el motivo.').max(1000, 'El motivo va hasta 1000 letras.') });
  return act(s, raw, async (sql, input) => {
    await sql.query(`select public.withhold_request_attachment($1, $2)`, [input.attachmentId, input.reason]);
  }, PATHS);
}

// --- Duplicates ----------------------------------------------------------------------------------------------------------

/** Open cases of the same kind to merge with: by code, by words, or (nothing typed) the same category and municipality. */
export async function findDuplicates(raw: unknown) {
  return act(z.object({ id: uuid(), q: z.string().trim().max(80).default('') }), raw, async (sql, input) => {
    const c = await sql.one<{ id: string; type: (typeof REQUEST_TYPES)[number]; category_id: string; municipality_id: string | null }>(
      `select id, type, category_id, municipality_id from public.requests where id = $1`,
      [input.id],
    );
    if (!c) throw new UserError(NOT_YOURS);
    const rows = await duplicateCandidates(sql, { id: c.id, type: c.type, categoryId: c.category_id, municipalityId: c.municipality_id }, input.q);
    return rows.map((x) => ({ id: x.id, reference: x.reference, title: x.title, state: x.state, municipality: x.municipality_name, createdAt: x.created_at.toISOString() }));
  });
}

const mergeSchema = z.object({ id: uuid(), into: uuid('Elige el caso que se queda.'), reason: z.string().trim().min(1, 'Escribe el motivo.').max(2000) });

/** The duplicate (`id`) closes into the case that stays (`into`); both keep their history; the supports move and count. */
export async function mergeRequest(raw: unknown) {
  const r = await act(mergeSchema, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.merge_request($1, $2, $3)`, [input.id, input.into, input.reason]);
    return { eventId: await lastEvent(sql, input.id, 'merged') };
  }, PATHS);
  if (r.ok && r.data?.eventId) queueStatusEmails({ requestId: mergeSchema.parse(raw).id, kind: 'merged', key: r.data.eventId });
  return r.ok ? { ok: true as const, message: 'Listo: los dos casos quedaron unidos.' } : r;
}

// --- Moderation (never to discard criticism) -------------------------------------------------------------------------------

export async function redactRequestField(raw: unknown) {
  const s = z.object({ id: uuid(), field: z.enum(REDACT_FIELDS, 'Elige el dato.'), reason: z.string().trim().min(1, 'Escribe el motivo.').max(2000) });
  return act(s, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.redact_request($1, $2, $3)`, [input.id, input.field, input.reason]);
  }, PATHS);
}

export async function redactRequestMessage(raw: unknown) {
  const s = z.object({ messageId: uuid('Mensaje inválido.'), reason: z.string().trim().min(1, 'Escribe el motivo.').max(2000) });
  return act(s, raw, async (sql, input) => {
    await sql.query(`select public.redact_request_message($1, $2)`, [input.messageId, input.reason]);
  }, PATHS);
}

/** Spam (advertising, nonsense, abuse): «No procede» marked as spam, kept. No email to the sender. */
export async function markRequestSpam(raw: unknown) {
  const s = z.object({ id: uuid(), reason: z.string().trim().min(1, 'Escribe el motivo.').max(2000) });
  return act(s, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.mark_request_spam($1, $2)`, [input.id, input.reason]);
  }, PATHS);
}

// --- The contact ---------------------------------------------------------------------------------------------------------

export type RevealedContact = { name: string | null; email: string | null; phone: string | null; preferredChannel: string } | null;

/** «Ver contacto»: who works the case reads it; the database writes who looked, and when, in the audit log. */
export async function revealContact(raw: unknown) {
  return act(z.object({ id: uuid() }), raw, async (sql, input): Promise<RevealedContact> => {
    const row = await sql.one<{ name_enc: string | null; email_enc: string | null; phone_enc: string | null; preferred_channel: string }>(
      `select name_enc, email_enc, phone_enc, preferred_channel from public.request_contact($1)`,
      [input.id],
    );
    return row ? openContact(row) : null;
  });
}

/** The person asked that their contact be erased (privacy notice): the coordinator does it, with the reason. */
export async function eraseContact(raw: unknown) {
  const s = z.object({ id: uuid(), reason: z.string().trim().min(1, 'Escribe el motivo.').max(2000) });
  return act(s, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.erase_request_contact($1, $2, null)`, [input.id, input.reason]);
  }, PATHS);
}

// --- «Lo atendido» -------------------------------------------------------------------------------------------------------

const attendedSchema = z.object({
  id: uuid(),
  summary: z.string().trim().max(600, 'El resumen va hasta 600 letras.').default(''),
  displayName: z.string().trim().max(80, 'El nombre va hasta 80 letras.').default(''),
});

/** The public summary of a resolved case (a denuncia: the database writes «Denuncia atendida en el municipio X»). */
export async function publishAttended(raw: unknown) {
  return act(attendedSchema, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.publish_attended($1, $2, $3)`, [input.id, input.summary, opt(input.displayName)]);
  }, { revalidate: ['/admin/atencion', '/atencion/atendido'] });
}

export async function withdrawAttended(raw: unknown) {
  const s = z.object({ id: uuid(), reason: z.string().trim().min(1, 'Escribe el motivo.').max(1000, 'El motivo va hasta 1000 letras.') });
  return act(s, raw, async (sql, input) => {
    await currentState(sql, input.id);
    await sql.query(`select public.withdraw_attended($1, $2)`, [input.id, input.reason]);
  }, { revalidate: ['/admin/atencion', '/atencion/atendido'] });
}
