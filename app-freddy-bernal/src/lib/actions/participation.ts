'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { withAnon } from '../db';
import { ParticipationConfigError, clientIp, deviceKey, ipKey } from '../participation/keys';
import { CONTACT_CHANNELS, contactInput, type RequestInput } from '../participation/input';
import { normalizeSecret } from '../participation/receipt-code';
import { addCitizenMessage, confirmRequest, lookupRequest, receiptGrant, similarRequests, supportRequest } from '../web/participation';
import {
  EXPIRED_TEXT,
  HONEYPOT_TEXT,
  NOT_FOUND_TEXT,
  NO_CONTACT_KEY_TEXT,
  TURNSTILE_TEXT,
  checkRequest,
  closeConsultation,
  deviceId,
  failureOf,
  fieldErrorsOf,
  honeypotTripped,
  isUuid,
  lookupGrant,
  noJsSecret,
  openConsultation,
  queueReceiptEmail,
  rateKeys,
  sendChecked,
  turnstilePasses,
} from './participation-core';
import { HONEYPOT_FIELD, type CaseActionState, type LookupState, type NoJsState, type SendResult, type SimilarResult } from './participation-types';

// The citizen's actions on the public website (D-92, D-96, design §4): no account, so no act() (it needs a session).
// Each one checks its input with zod (the form's own schema, requestInput, the same the browser runs), then the
// honeypot and Turnstile when configured, then calls the database AS ANON (withAnon) with the rate limit's keys: the
// first-party device cookie and the network, both as HMAC. «Éxito» only once the database committed. A wrong receipt,
// in any part, always gets the same answer. The secret travels from the browser only to be turned into its HMAC here;
// it never comes back in an answer (except the no-JavaScript form, whose secret the server makes).

const secretField = z.string().max(64).refine((v) => normalizeSecret(v) !== null, 'Falta la clave del comprobante.');
const receiptFields = { submissionKey: z.string().uuid(), secret: secretField };
const MISSING_KEYS = 'Falta la clave del comprobante: recarga la página y vuelve a intentarlo (lo que escribiste queda guardado).';

const sendSchema = z.object({
  ...receiptFields,
  input: z.unknown(),
  hp: z.string().max(500).optional(),
  turnstileToken: z.string().max(4096).nullable().optional(),
});

/** «Enviar»: the stepped form, with the receipt the browser made when the form started (a retry gets the same one). */
export async function sendRequest(raw: unknown): Promise<SendResult> {
  const p = sendSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: MISSING_KEYS, code: 'validation' };
  if (honeypotTripped(p.data.hp)) return { ok: false, error: HONEYPOT_TEXT, code: 'honeypot' };
  const checked = checkRequest(p.data.input);
  if (!checked.ok) return checked;
  if (!(await turnstilePasses(p.data.turnstileToken))) return { ok: false, error: TURNSTILE_TEXT, code: 'turnstile' };
  try {
    const keys = await rateKeys();
    return await sendChecked(checked.input, { submissionKey: p.data.submissionKey, secret: p.data.secret }, keys);
  } catch (e) {
    return failureOf(e, 'envío');
  }
}

// --- Without JavaScript ---------------------------------------------------------------------------------------------
const text = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};
const checked = (fd: FormData, name: string) => fd.get(name) === 'on' || fd.get(name) === 'true';
const FORM_FIELDS = ['type', 'categoryId', 'municipalityId', 'parishId', 'sector', 'locationReference', 'title', 'description', 'eventDate', 'name', 'email', 'phone', 'channel', 'linkedItemId'] as const;

/** The plain form's fields as the request the schema checks. */
function inputFromForm(fd: FormData): Record<string, unknown> {
  const anonymous = checked(fd, 'anonymous');
  const name = text(fd, 'name').trim();
  const email = text(fd, 'email').trim();
  const phone = text(fd, 'phone').trim();
  const channel = (CONTACT_CHANNELS as readonly string[]).includes(text(fd, 'channel')) ? text(fd, 'channel') : 'none';
  const hasContact = !!(name || email || phone);
  return {
    type: text(fd, 'type'),
    categoryId: text(fd, 'categoryId'),
    title: text(fd, 'title'),
    description: text(fd, 'description'),
    municipalityId: text(fd, 'municipalityId') || null,
    parishId: text(fd, 'parishId') || null,
    sector: text(fd, 'sector'),
    locationReference: text(fd, 'type') === 'denuncia' ? '' : text(fd, 'locationReference'),
    eventDate: text(fd, 'eventDate') || null,
    point: null,
    locationConsent: false,
    anonymous,
    publishNameConsent: checked(fd, 'publishNameConsent') && !!name,
    linkedItemId: isUuid(text(fd, 'linkedItemId')) ? text(fd, 'linkedItemId') : null,
    contact: hasContact ? { name, email, phone, channel } : null,
    privacyAccepted: checked(fd, 'privacyAccepted'),
  };
}

/**
 * The same form without JavaScript (useActionState's progressive enhancement): the form's key comes from the page (made
 * when it was rendered) and the secret is made here, from that key and this browser's device id; the same form sent
 * twice gets the same receipt. No files (they need JavaScript); no map.
 */
export async function sendRequestWithoutJs(_prev: NoJsState, fd: FormData): Promise<NoJsState> {
  const values: Record<string, string> = {};
  for (const f of FORM_FIELDS) values[f] = text(fd, f).slice(0, 4000);
  for (const f of ['anonymous', 'publishNameConsent', 'privacyAccepted']) values[f] = checked(fd, f) ? 'on' : '';
  const fail = (error: string, fieldErrors?: Record<string, string>): NoJsState => ({ status: 'error', error, fieldErrors, values });
  const key = text(fd, 'submissionKey');
  if (!isUuid(key)) return fail(MISSING_KEYS);
  if (honeypotTripped(fd.get(HONEYPOT_FIELD))) return fail(HONEYPOT_TEXT);
  const r = checkRequest(inputFromForm(fd));
  if (!r.ok) return fail(r.error, r.fieldErrors);
  if (!(await turnstilePasses(text(fd, 'cf-turnstile-response')))) return fail(TURNSTILE_TEXT);
  try {
    const device = await deviceId();
    const secret = noJsSecret(key, device);
    const keys = { deviceKey: deviceKey(device), ipKey: ipKey(clientIp(await headers())) };
    const sent = await sendChecked(r.input, { submissionKey: key, secret }, keys);
    if (!sent.ok) return fail(sent.error, sent.fieldErrors);
    return { status: 'sent', reference: sent.reference, secret, kind: sent.kind, sentAt: sent.sentAt, type: r.input.type };
  } catch (e) {
    return fail(failureOf(e, 'envío sin JavaScript').error);
  }
}

// --- «¿Ya lo reportaron?» and «¿Te sumas?» ----------------------------------------------------------------------------
const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const placeSchema = z.object({
  categoryId: z.string().uuid(),
  municipalityId: z.string().uuid().nullable().default(null),
  parishId: z.string().uuid().nullable().default(null),
  sector: z.string().trim().max(200).default(''),
  point: pointSchema.nullable().default(null),
});
type Place = z.infer<typeof placeSchema>;
const placeQuery = (p: Place) => ({ categoryId: p.categoryId, municipalityId: p.municipalityId, parishId: p.parishId, sector: p.sector, point: p.point });

/** How many OPEN reports of the same problem there are nearby: a count only (never their ids, texts, photos or names). */
export async function checkSimilar(raw: unknown): Promise<SimilarResult> {
  const p = placeSchema.safeParse(raw);
  if (!p.success) return { ok: false };
  if (!p.data.municipalityId && !p.data.point) return { ok: true, count: 0 };
  try {
    const keys = await rateKeys();
    const r = await withAnon((sql) => similarRequests(sql, keys, placeQuery(p.data)));
    return { ok: true, count: r.count };
  } catch (e) {
    failureOf(e, 'parecidos');
    return { ok: false };
  }
}

const joinSchema = z
  .object({
    ...receiptFields,
    place: placeSchema,
    note: z.string().trim().max(2000, 'Lo que agregas va hasta 2000 letras.').default(''),
    anonymous: z.boolean().default(false),
    contact: contactInput.nullable().default(null),
    privacyAccepted: z.literal(true, { message: 'Lee y acepta el aviso de privacidad para enviar.' }),
    hp: z.string().max(500).optional(),
    turnstileToken: z.string().max(4096).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const c = v.contact;
    const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['contact'], message });
    if (v.anonymous && c && (c.name || c.email || c.phone)) issue('Una solicitud anónima va sin contacto.');
    if (c && c.channel === 'email' && !c.email) issue('Escribe el correo, o elige otra forma de contacto.');
    if (c && (c.channel === 'phone' || c.channel === 'whatsapp') && !c.phone) issue('Escribe el teléfono, o elige otra forma de contacto.');
  });

/** «Sí, me sumo»: a support of the oldest open report that matches the person's own place and category (found again
 * here, so nobody can add to a report they were not offered), with their own receipt. */
export async function joinReport(raw: unknown): Promise<SendResult> {
  const p = joinSchema.safeParse(raw);
  if (!p.success) {
    const fieldErrors = fieldErrorsOf(p.error.issues);
    if (fieldErrors.submissionKey || fieldErrors.secret) return { ok: false, error: MISSING_KEYS, code: 'validation' };
    return { ok: false, error: 'Revisa los datos marcados.', code: 'validation', fieldErrors };
  }
  if (honeypotTripped(p.data.hp)) return { ok: false, error: HONEYPOT_TEXT, code: 'honeypot' };
  if (!p.data.place.municipalityId && !p.data.place.point) return { ok: false, error: 'Elige el municipio.', code: 'validation', fieldErrors: { municipalityId: 'Elige el municipio.' } };
  if (!(await turnstilePasses(p.data.turnstileToken))) return { ok: false, error: TURNSTILE_TEXT, code: 'turnstile' };
  const c = p.data.contact;
  const contact: RequestInput['contact'] = !p.data.anonymous && c && (c.name || c.email || c.phone) ? c : null;
  try {
    const keys = await rateKeys();
    const receipt = { submissionKey: p.data.submissionKey, secret: p.data.secret };
    const r = await withAnon(async (sql) => {
      const found = await similarRequests(sql, keys, placeQuery(p.data.place));
      const target = found.ids?.[0];
      if (!target) return null;
      return supportRequest(sql, target, receipt, keys, { note: p.data.note, contact });
    });
    if (!r) return { ok: false, error: 'Ese reporte ya no está abierto: sigue con el tuyo.', code: 'not_found' };
    if (contact?.email) queueReceiptEmail(contact.email, r.reference, r.kind, 'reporte');
    return { ok: true, reference: r.reference, kind: r.kind, sentAt: new Date().toISOString() };
  } catch (e) {
    if (e instanceof ParticipationConfigError && contact) return { ok: false, error: NO_CONTACT_KEY_TEXT, code: 'config', fieldErrors: { contact: NO_CONTACT_KEY_TEXT } };
    return failureOf(e, 'apoyo');
  }
}

// --- «Consultar mi solicitud» ---------------------------------------------------------------------------------------

/** Reference + secret by POST (never in the address): the uniform answer, or the short consultation cookie. */
export async function openCase(_prev: LookupState, fd: FormData): Promise<LookupState> {
  const reference = text(fd, 'reference').trim().slice(0, 40);
  const secret = text(fd, 'secret').trim().slice(0, 64);
  const fieldErrors: Record<string, string> = {};
  if (!reference) fieldErrors.reference = 'Escribe tu código.';
  if (!secret) fieldErrors.secret = 'Escribe tu clave.';
  if (Object.keys(fieldErrors).length) return { status: 'error', error: 'Escribe tu código y tu clave.', fieldErrors, reference };
  const grant = receiptGrant(reference, secret);
  if (!grant) return { status: 'error', error: NOT_FOUND_TEXT, reference };
  try {
    const keys = await rateKeys();
    const view = await withAnon((sql) => lookupRequest(sql, grant, keys));
    if (view.status !== 'ok') return { status: 'error', error: NOT_FOUND_TEXT, reference };
    await openConsultation(grant);
    return null;
  } catch (e) {
    return { status: 'error', error: failureOf(e, 'consulta').error, reference };
  }
}

/** «Agregar información»: a message to the team (files follow, with its id, to /atencion/consultar/adjuntos). */
export async function addCaseInfo(_prev: CaseActionState, fd: FormData): Promise<CaseActionState> {
  const grant = await lookupGrant();
  if (!grant) return { status: 'error', error: EXPIRED_TEXT, expired: true };
  const body = text(fd, 'body').trim();
  if (body.length < 1 || body.length > 4000) return { status: 'error', error: 'Revisa el mensaje.', fieldErrors: { body: 'El mensaje va de 1 a 4000 letras.' } };
  try {
    const keys = await rateKeys();
    const r = await withAnon((sql) => addCitizenMessage(sql, grant, keys, body));
    if (r.status !== 'ok') {
      await closeConsultation();
      return { status: 'error', error: EXPIRED_TEXT, expired: true };
    }
    return { status: 'ok', messageId: r.id };
  } catch (e) {
    return { status: 'error', error: failureOf(e, 'mensaje').error };
  }
}

/** «¿Se resolvió?»: yes (recorded), or no with what is missing (the case reopens, with a record). */
export async function confirmCase(_prev: CaseActionState, fd: FormData): Promise<CaseActionState> {
  const grant = await lookupGrant();
  if (!grant) return { status: 'error', error: EXPIRED_TEXT, expired: true };
  const answer = text(fd, 'resolved');
  const comment = text(fd, 'comment').trim();
  if (answer !== 'si' && answer !== 'no') return { status: 'error', error: 'Dinos si se resolvió o no.', fieldErrors: { resolved: 'Elige una respuesta.' } };
  if (answer === 'no' && !comment) return { status: 'error', error: 'Cuéntanos qué falta.', fieldErrors: { comment: 'Cuéntanos qué falta para que esté resuelto.' } };
  if (comment.length > 4000) return { status: 'error', error: 'El comentario va hasta 4000 letras.', fieldErrors: { comment: 'El comentario va hasta 4000 letras.' } };
  try {
    const keys = await rateKeys();
    const r = await withAnon((sql) => confirmRequest(sql, grant, keys, answer === 'si', comment));
    if (r.status !== 'ok') {
      await closeConsultation();
      return { status: 'error', error: EXPIRED_TEXT, expired: true };
    }
    return { status: 'ok', state: r.state };
  } catch (e) {
    return { status: 'error', error: failureOf(e, 'confirmación').error };
  }
}

/** «Salir»: the consultation cookie goes away (the page shows the form again). */
export async function closeCase(): Promise<void> {
  await closeConsultation();
}
