import 'server-only';
import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
import { createHmac } from 'node:crypto';
import { createElement } from 'react';
import { brand } from '../client-config';
import { withAnon } from '../db';
import { friendlyDbError } from '../db/core';
import { env } from '../env';
import { canDeliver, sendEmail } from '../email/send';
import { NoticeEmail } from '@emails/templates';
import {
  DEVICE_COOKIE,
  ParticipationConfigError,
  clientIp,
  deviceCookieOptions,
  deviceKey,
  ipKey,
  isDeviceId,
  newDeviceId,
  participationPepper,
} from '../participation/keys';
import { LOOKUP_COOKIE, lookupCookieOptions, openLookup, sealLookup, type LookupGrant } from '../participation/lookup-cookie';
import { CITIZEN_EMAIL_FOOTER, receiptEmail } from '../participation/emails';
import { requestInput, type RequestInput } from '../participation/input';
import { crockfordFromBytes, normalizeSecret } from '../participation/receipt-code';
import { turnstileEnabled, verifyTurnstile } from '../participation/turnstile';
import { addCitizenAttachment, submitRequest, type RateKeys, type ReceiptGrant, type ReceiptKeys } from '../web/participation';
import { dropPrivateFile, preparePrivateFile, putPrivateFile, scanStoredAttachment } from '../storage/participation-files';
import { ATTACHMENT_LIMITS } from '../participation/files';
import { readFormCapped } from '../request-body';
import { today } from '../time';
import { eventDateProblem, type FieldErrors, type SendResult } from './participation-types';

// What the citizen's server actions (participation.ts) and the attention routes (src/app/api/atencion,
// src/app/(web)/atencion/consultar/…) share: the rate limit's keys (the first-party device cookie and the network), the
// app's own checks before the database (honeypot, Turnstile when configured, the form's zod schema), the uniform
// «not found», the lookup cookie, the attachments' way in and the confirmation email. Everything the database answers
// is called as anon (withAnon, D-96): never withSystem for a person's request. Nothing here logs a secret, a contact or
// what the person wrote.

/** The one answer for a wrong reference, a wrong secret, a malformed receipt or a closed consultation. */
export const NOT_FOUND_TEXT = 'No encontramos una solicitud con esos datos.';
export const EXPIRED_TEXT = 'Su consulta se cerró por seguridad. Vuelva a entrar con su código y su clave.';
export const HONEYPOT_TEXT = 'No se pudo enviar. Revise los datos e intente de nuevo.';
export const TURNSTILE_TEXT = 'No se pudo completar la verificación de seguridad. Intente de nuevo.';
export const OFF_TEXT = 'Atención ciudadana no está disponible en este momento. Intente más tarde.';
export const NO_CONTACT_KEY_TEXT =
  'Por ahora no es posible guardar datos de contacto. Envíe la solicitud sin ellos (marque «Enviar como anónimo») y guarde su código y su clave.';
const GENERIC_TEXT = 'No se pudo completar. Revise la señal e intente de nuevo.';
const CHECK_TEXT = 'Revise los datos marcados.';

/**
 * The citizen functions' own messages (20261106000300_citizen.sql, 20261106400200_citizen_solo_app.sql) still speak as
 * «tú»; friendlyDbError passes them through as they are. On their way to the citizen they are said like the rest of the
 * attention desk («usted», «caracteres»; copy audit V20). A message that is not here goes as it came. When a migration
 * gives the database these words, its entries can go (tests/unit/participation-words.test.ts checks every key is still
 * a message of the migrations).
 */
const DB_WORDS: Record<string, string> = {
  'Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.': 'Se hicieron demasiados intentos seguidos. Espere unos minutos e intente de nuevo.',
  'Ese reporte ya no está abierto: envía el tuyo.': 'Ese reporte ya no está abierto. Envíe su propio reporte.',
  'Elige qué quieres enviar.': 'Elija el tipo de solicitud.',
  'Elige una categoría de la lista.': 'Elija una categoría de la lista.',
  'El título va de 3 a 140 letras.': 'El título debe tener entre 3 y 140 caracteres.',
  'Cuéntanos qué pasa en 10 a 4000 letras.': 'La descripción debe tener entre 10 y 4000 caracteres.',
  'Revisa la fecha del hecho.': 'Revise la fecha del hecho.',
  'Elige el municipio.': 'Elija el municipio.',
  'Elige el municipio de la lista.': 'Elija un municipio de la lista.',
  'Elige la parroquia de la lista del municipio.': 'Elija una parroquia de la lista del municipio.',
  'La parroquia, localidad o sector va hasta 200 letras.': 'La parroquia, localidad o sector admite hasta 200 caracteres.',
  'La referencia va hasta 300 letras.': 'El punto de referencia admite hasta 300 caracteres.',
  'En una denuncia va solo el lugar aproximado: municipio y sector.': 'En una denuncia se indica solo el lugar aproximado, es decir, el municipio y el sector.',
  'Para guardar tu ubicación hace falta tu permiso.': 'Para guardar su ubicación se necesita su autorización.',
  'Una solicitud anónima va sin contacto.': 'Una solicitud anónima no lleva datos de contacto.',
  'Lo que agregas va hasta 2000 letras.': 'El comentario admite hasta 2000 caracteres.',
  'Esta solicitud ya está cerrada: si es otra cosa, envía una nueva.': 'Esta solicitud ya está cerrada. Si se trata de otro asunto, envíe una nueva.',
  'El mensaje va de 1 a 4000 letras.': 'El mensaje debe tener entre 1 y 4000 caracteres.',
  'Van hasta 3 archivos por envío.': 'Se admiten hasta 3 archivos por envío.',
  'Dinos si se resolvió o no.': 'Indique si se resolvió o no.',
  'Esta solicitud no está esperando tu confirmación.': 'Esta solicitud no está esperando su confirmación.',
  'El comentario va hasta 4000 letras.': 'El comentario admite hasta 4000 caracteres.',
};

/** A database message as the citizen reads it (see DB_WORDS). */
export const citizenDbText = (message: string): string => DB_WORDS[message] ?? message;
/** The database's messages that are said again, for the test that keeps them tied to the migrations. */
export const DB_MESSAGES_SAID_AGAIN = Object.keys(DB_WORDS);

/** The public site's name, as the citizen reads it (never the internal platform's). */
export const SITE_NAME = `${brand.clientName} · ${brand.clientTitle}`;

export type Failure = Extract<SendResult, { ok: false }>;

// --- Keys -----------------------------------------------------------------------------------------------------------

/** The first-party device id of this browser; a new one is set when missing (only where cookies can be set). */
export async function deviceId(opts: { canSet?: boolean } = {}): Promise<string> {
  const jar = await cookies();
  const current = jar.get(DEVICE_COOKIE)?.value;
  if (isDeviceId(current)) return current;
  const id = newDeviceId();
  if (opts.canSet !== false) jar.set(DEVICE_COOKIE, id, deviceCookieOptions());
  return id;
}

/** The rate limit's keys of this request: the HMAC of the device cookie and of the network (never the cookie or IP). */
export async function rateKeys(opts: { canSet?: boolean } = {}): Promise<RateKeys> {
  const id = await deviceId(opts);
  return { deviceKey: deviceKey(id), ipKey: ipKey(clientIp(await headers())) };
}

// --- Errors ---------------------------------------------------------------------------------------------------------

/** zod's issues as «field → first message» (contact.email, municipalityId…). */
export function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = i.path.map(String).join('.') || 'form';
    out[key] ??= i.message;
  }
  return out;
}

/** A database or configuration error in the person's words (P0429 = too many tries, P0001 = the function's message). */
export function failureOf(e: unknown, where: string): Failure {
  if (e instanceof ParticipationConfigError) {
    console.error(`[atencion] ${where}: falta configuración (${e.message})`);
    return { ok: false, error: OFF_TEXT, code: 'config' };
  }
  const code = (e as { code?: string })?.code;
  if (code === 'P0429') return { ok: false, error: citizenDbText(friendlyDbError(e)), code: 'rate' };
  if (code === 'P0001' && (e as Error).message) return { ok: false, error: citizenDbText(friendlyDbError(e)), code: 'db' };
  if (code === '22023') return { ok: false, error: GENERIC_TEXT, code: 'db' };
  console.error(`[atencion] ${where}: ${(e as Error)?.message ?? e}`);
  return { ok: false, error: GENERIC_TEXT, code: 'db' };
}

// --- The app's own checks before the database -------------------------------------------------------------------------

/** Turnstile, only when both keys are configured; off otherwise (the honeypot and the persistent limits stay). */
export async function turnstilePasses(token: string | null | undefined): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  return verifyTurnstile(token, clientIp(await headers()));
}

/** The honeypot field: people never see it, so anything in it is a robot. */
export const honeypotTripped = (value: unknown) => typeof value === 'string' && value.trim() !== '';

/** «YYYY-MM-DD» in Táchira's calendar. */
export const todayIso = () => today().toISODate()!;

/** The whole form, checked with the same schema as the browser plus the date rule. */
export function checkRequest(raw: unknown): { ok: true; input: RequestInput } | Failure {
  const parsed = requestInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error.issues);
    return { ok: false, error: CHECK_TEXT, code: 'validation', fieldErrors };
  }
  const dateProblem = eventDateProblem(parsed.data.eventDate, todayIso());
  if (dateProblem) return { ok: false, error: CHECK_TEXT, code: 'validation', fieldErrors: { eventDate: dateProblem } };
  return { ok: true, input: parsed.data };
}

// --- The receipt (no-JS fallback) ---------------------------------------------------------------------------------------

/**
 * Without JavaScript the browser cannot make the secret: the server does, from the form's key (a uuid written into the
 * page when it was rendered) and this browser's device id, with the pepper. The same form sent again from the same
 * browser gets the same secret, so the database answers with the same receipt (idempotent); another browser with a copy
 * of the page gets a different secret, which the database refuses for that key.
 */
export function noJsSecret(submissionKey: string, device: string): string {
  const mac = createHmac('sha256', participationPepper()).update(`sin-js:${submissionKey}:${device}`).digest();
  return normalizeSecret(crockfordFromBytes(new Uint8Array(mac), 16))!;
}

// --- Send -----------------------------------------------------------------------------------------------------------

export type Sent = Extract<SendResult, { ok: true }>;

/** Sends a checked request as anon (idempotent by its key) and queues the confirmation email when there is an address. */
export async function sendChecked(input: RequestInput, receipt: ReceiptKeys, keys: RateKeys): Promise<Sent | Failure> {
  try {
    const r = await withAnon((sql) => submitRequest(sql, input, receipt, keys));
    const emailed = queueReceiptEmail(wantsEmail(input.anonymous ? null : input.contact), r.reference, r.kind);
    return { ok: true, reference: r.reference, kind: r.kind, sentAt: new Date().toISOString(), emailed };
  } catch (e) {
    if (e instanceof ParticipationConfigError && input.contact && !input.anonymous) {
      // The contact cannot be encrypted (production without PARTICIPATION_DATA_KEY): never stored in the clear.
      console.error('[atencion] envío: falta PARTICIPATION_DATA_KEY para cifrar el contacto');
      return { ok: false, error: NO_CONTACT_KEY_TEXT, code: 'config', fieldErrors: { contact: NO_CONTACT_KEY_TEXT } };
    }
    return failureOf(e, 'envío');
  }
}

/** The address the confirmation goes to: the person's email, unless they chose «Que no me contacten». */
export function wantsEmail(contact: RequestInput['contact'] | undefined): string {
  return contact && contact.channel !== 'none' ? contact.email : '';
}

/** Where the person follows the case (the public site's address, else the app's). */
export function lookupUrl(): string {
  return `${(env.site.url || env.appUrl).replace(/\/+$/, '')}/atencion/consultar`;
}

/**
 * Whether a confirmation is written at all, and whether it reaches the person. Only when email is set up to deliver to
 * that address (canDeliver), or in the demo, where everything is invented and the outbox stands in for the inbox.
 * Elsewhere (production with EMAIL_MODE=outbox) nothing is written: a citizen's address is never kept in the clear in
 * the outbox for an email that will not leave (the contact itself is stored encrypted, request_contacts).
 */
export function confirmationPlan(to: string, mode: 'demo' | 'supabase' = env.dataMode, deliver: (to: string) => boolean = canDeliver) {
  if (!to) return { queue: false, delivers: false };
  const delivers = deliver(to);
  return { queue: delivers || mode === 'demo', delivers };
}

/**
 * The confirmation email (outbox first; it leaves the platform only when email is configured to send, src/lib/email):
 * the reference and how to follow it, NEVER the secret, and never the kind of request (like the status emails): an
 * inbox or a phone's lock screen is seen by others, and «Recibimos su denuncia» there could put the person at risk
 * (the security review of 06/11). Its words are receiptEmail() (src/lib/participation/emails.ts). After the response,
 * outside the anon transaction. Answers whether it is on its way to the person (the receipt says «Se envió un correo»
 * only then).
 */
export function queueReceiptEmail(to: string, reference: string, kind: 'request' | 'support'): boolean {
  const plan = confirmationPlan(to);
  if (!plan.queue) return false;
  const words = receiptEmail(kind, reference);
  after(async () => {
    try {
      await sendEmail({
        to,
        subject: words.subject,
        template: 'atencion_recibida',
        element: createElement(NoticeEmail, { appName: SITE_NAME, title: words.title, body: words.body, url: lookupUrl(), cta: 'Consultar mi solicitud', footer: CITIZEN_EMAIL_FOOTER }),
        idempotencyKey: `atencion-recibida:${reference}`,
      });
    } catch (e) {
      console.error(`[atencion] correo de ${reference}: ${(e as Error).message}`);
    }
  });
  return plan.delivers;
}

// --- The lookup cookie ------------------------------------------------------------------------------------------------

/** The consultation this browser opened (reference + digest), or null (none, expired, tampered). */
export async function lookupGrant(): Promise<LookupGrant | null> {
  return openLookup((await cookies()).get(LOOKUP_COOKIE)?.value);
}

export async function openConsultation(g: ReceiptGrant) {
  (await cookies()).set(LOOKUP_COOKIE, sealLookup(g), lookupCookieOptions());
}

export async function closeConsultation() {
  (await cookies()).set(LOOKUP_COOKIE, '', { ...lookupCookieOptions(), maxAge: 0 });
}

// --- Attachments ----------------------------------------------------------------------------------------------------

export type AttachOutcome = { status: 200; id: string } | { status: 400 | 404 | 409 | 413 | 422 | 429 | 500 | 503; error: string };

/**
 * One file of a request (with the request, or with one of the person's messages): checked and cleaned in memory
 * (preparePrivateFile: extension, size, first bytes, pixels, metadata), registered with the receipt
 * (citizen.add_request_attachment checks the receipt, the rate limit, the counts and the state) and only then written
 * to the private bucket, inside the same transaction: a wrong receipt or a person over the limit never makes the server
 * store anything, and a write that fails takes the row back. Scanned after the response.
 */
export async function attachFile(g: ReceiptGrant, keys: RateKeys, file: { name: string; bytes: Uint8Array }, messageId: string | null): Promise<AttachOutcome> {
  const prepared = preparePrivateFile(file.name, file.bytes);
  if (!prepared.ok) return { status: 422, error: prepared.error };
  const f = prepared.file;
  let written = false;
  try {
    const r = await withAnon(async (sql) => {
      const row = await addCitizenAttachment(sql, g, keys, { storageKey: f.storageKey, mime: f.mime, bytes: f.bytes, scanStatus: f.scanStatus, messageId });
      if (row.status === 'ok') {
        await putPrivateFile(f);
        written = true;
      }
      return row;
    });
    if (r.status !== 'ok') return { status: 404, error: NOT_FOUND_TEXT };
    after(() => scanStoredAttachment(r.id, f.storageKey));
    return { status: 200, id: r.id };
  } catch (e) {
    // The row did not commit: a copy already written goes too (nothing stays in the bucket without its row).
    if (written) await dropPrivateFile(f.storageKey);
    const fail = failureOf(e, 'archivo');
    if (fail.code === 'rate') return { status: 429, error: fail.error };
    if (fail.code === 'config') return { status: 503, error: fail.error };
    // The function's own refusals: 3 per send, 12 per request, a closed case, a message of another request.
    if ((e as { code?: string })?.code === 'P0001') return { status: 409, error: fail.error };
    return { status: 500, error: fail.error };
  }
}

/** A same-site request (design §7: route handlers check Origin/Host as well as SameSite cookies). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

/**
 * The largest file this deployment takes. 8 MB is the rule (design §4, the database's check); on Vercel a function's
 * request body stops at 4.5 MB, so there a file goes up to 4 MB (photos are re-encoded in the browser and stay well
 * under it; a heavier PDF would need a direct upload to Supabase Storage with a signed upload URL, not built yet: a
 * pending item for docs/PENDIENTES.md). The form says the same limit before uploading.
 */
export function maxAttachmentBytes(platform: string | undefined = process.env.VERCEL): number {
  return platform ? 4 * 1024 * 1024 : ATTACHMENT_LIMITS.maxBytes;
}

const sizeText = (bytes: number) => `El archivo supera los ${Math.round(bytes / (1024 * 1024))} MB. Envíe uno más liviano.`;
const NO_FILE_TEXT = 'No se recibió el archivo. Intente de nuevo.';

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
export const jsonResponse = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/**
 * POST of one file (multipart: «file», plus what `grantOf` reads: the receipt in the body, or the consultation cookie).
 * Answers JSON: {ok: true, id} or {ok: false, error} with the status (403 another site, 400 nothing came, 404 the one
 * «not found», 409 the request does not take more, 413 too big, 422 not a valid file, 429 too many tries).
 */
export async function handleUpload(
  req: Request,
  grantOf: (form: FormData) => Promise<ReceiptGrant | null> | ReceiptGrant | null,
  messageIdOf: (form: FormData) => string | null = () => null,
): Promise<Response> {
  if (!sameOrigin(req)) return jsonResponse(403, { ok: false, error: 'No permitido.' });
  const max = maxAttachmentBytes();
  // The body is read only up to the file's limit plus its form fields, with or without Content-Length.
  const body = await readFormCapped(req, max + 64 * 1024);
  if (!body.ok && body.reason === 'too_big') return jsonResponse(413, { ok: false, error: sizeText(max) });
  if (!body.ok) return jsonResponse(400, { ok: false, error: NO_FILE_TEXT });
  const form = body.form;
  const file = form.get('file');
  if (!file || typeof file === 'string') return jsonResponse(400, { ok: false, error: NO_FILE_TEXT });
  if (file.size > max) return jsonResponse(413, { ok: false, error: sizeText(max) });
  const grant = await grantOf(form);
  if (!grant) return jsonResponse(404, { ok: false, error: NOT_FOUND_TEXT });
  const messageId = messageIdOf(form);
  try {
    const keys = await rateKeys();
    const r = await attachFile(grant, keys, { name: file.name || 'archivo', bytes: new Uint8Array(await file.arrayBuffer()) }, messageId);
    return r.status === 200 ? jsonResponse(200, { ok: true, id: r.id }) : jsonResponse(r.status, { ok: false, error: r.error });
  } catch (e) {
    const f = failureOf(e, 'archivo');
    return jsonResponse(f.code === 'config' ? 503 : 500, { ok: false, error: f.error });
  }
}
