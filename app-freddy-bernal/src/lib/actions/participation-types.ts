// What the citizen's server actions (participation.ts) answer, shared with the public forms (src/components/participation).
// Pure: no server code, no browser code.

export type FieldErrors = Record<string, string>;
export type FailureCode = 'validation' | 'rate' | 'config' | 'turnstile' | 'honeypot' | 'not_found' | 'db';

/** «Enviar» and «Enviar apoyo»: the receipt's reference once the database committed it (never before), or why not.
 * `emailed`: a confirmation with the code (never the secret) is on its way to the person's address. */
export type SendResult =
  | { ok: true; reference: string; kind: 'request' | 'support'; sentAt: string; emailed: boolean }
  | { ok: false; error: string; code: FailureCode; fieldErrors?: FieldErrors };

/** The form without JavaScript (useActionState): the receipt made on the server, or the errors and what was written. */
export type NoJsState =
  | null
  | { status: 'error'; error: string; fieldErrors?: FieldErrors; values: Record<string, string> }
  | { status: 'sent'; reference: string; secret: string; kind: 'request' | 'support'; sentAt: string; type: string };

/** «Reportes parecidos»: only how many open reports of the same problem there are nearby. */
export type SimilarResult = { ok: true; count: number } | { ok: false };

/** «Consultar mi solicitud»: the consultation opened (the page shows it) or the one uniform answer. */
export type LookupState = null | { status: 'error'; error: string; fieldErrors?: FieldErrors; reference?: string };

/** Adding information or confirming: done, or why not (expired = the consultation cookie is gone). */
export type CaseActionState =
  | null
  | { status: 'ok'; messageId?: string; state?: string }
  | { status: 'error'; error: string; fieldErrors?: FieldErrors; expired?: boolean };

// The form's steps and the fields each one owns (errors are shown on the step that owns them). «attachments» is the
// browser's own check of the files (they go after the request, never in it).
export const STEP_FIELDS: Record<1 | 2 | 3 | 4, readonly string[]> = {
  1: ['type', 'categoryId'],
  2: ['municipalityId', 'parishId', 'sector', 'locationReference', 'point', 'point.lat', 'point.lng', 'locationConsent'],
  3: ['title', 'description', 'eventDate', 'attachments'],
  4: ['anonymous', 'publishNameConsent', 'contact', 'contact.name', 'contact.email', 'contact.phone', 'contact.channel', 'privacyAccepted', 'linkedItemId', 'note', 'form'],
};

export function stepOfField(field: string): 1 | 2 | 3 | 4 {
  for (const s of [1, 2, 3, 4] as const) if (STEP_FIELDS[s].includes(field)) return s;
  return 4;
}

/** Field names of the form without JavaScript (and the honeypot's, which people never see). */
export const HONEYPOT_FIELD = 'sitio_web';

/** Files per send (with the request, or with one message of the consultation): the database counts them too. */
export const FILES_PER_SEND = 3;

/** What the file picker offers (the server checks the first bytes again, src/lib/participation/files.ts). */
export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

/**
 * The database's own rule for the date of the event (citizen.submit_request: up to tomorrow, so a phone a few hours off
 * still passes, and ten years back), said before calling it. `now` is today in Táchira («YYYY-MM-DD»).
 */
export function eventDateProblem(date: string | null, now: string): string | null {
  if (!date) return null;
  const d = Date.parse(`${date}T00:00:00Z`);
  const t = Date.parse(`${now}T00:00:00Z`);
  if (Number.isNaN(d) || !new Date(d).toISOString().startsWith(date)) return 'Revise la fecha del hecho.';
  if (d > t + 86_400_000) return 'La fecha del hecho no puede ser en el futuro.';
  if (d < t - 3650 * 86_400_000) return 'Revise la fecha del hecho. Se admiten hasta diez años atrás.';
  return null;
}

/**
 * The preferred channel when the person did not choose one: the email if they wrote one, else the phone, else none.
 * «Que no me contacten» (none) chosen on purpose stays none.
 */
export function chosenChannel(c: { email: string; phone: string; channel: string }): 'email' | 'phone' | 'whatsapp' | 'none' {
  if (c.channel === 'email' || c.channel === 'phone' || c.channel === 'whatsapp' || c.channel === 'none') return c.channel;
  return c.email.trim() ? 'email' : c.phone.trim() ? 'phone' : 'none';
}

// --- «Hacer una observación sobre esta obra»: what a request is about ---------------------------------------------------
export type LinkedKind = 'news' | 'project';
const SOBRE = /^(news|project):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** «?sobre=news:<slug>» or «project:<slug>» as the content pages link it; null for anything else. */
export function parseSobre(raw: unknown): { kind: LinkedKind; slug: string } | null {
  if (typeof raw !== 'string' || raw.length > 140) return null;
  const m = SOBRE.exec(raw.trim());
  return m ? { kind: m[1] as LinkedKind, slug: m[2] } : null;
}

/** The address of the published item a request is about (the public site's routes, D-91). */
export function linkedItemPath(kind: LinkedKind, slug: string): string {
  return kind === 'news' ? `/actualidad/${slug}` : `/gestion/${slug}`;
}
