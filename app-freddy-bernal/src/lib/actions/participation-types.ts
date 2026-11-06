// What the citizen's server actions (participation.ts) answer, shared with the public forms (src/components/participation).
// Pure: no server code, no browser code.

export type FieldErrors = Record<string, string>;
export type FailureCode = 'validation' | 'rate' | 'config' | 'turnstile' | 'honeypot' | 'not_found' | 'db';

/** «Enviar» and «Sumarme»: the receipt's reference once the database committed it (never before), or why not. */
export type SendResult =
  | { ok: true; reference: string; kind: 'request' | 'support'; sentAt: string }
  | { ok: false; error: string; code: FailureCode; fieldErrors?: FieldErrors };

/** The form without JavaScript (useActionState): the receipt made on the server, or the errors and what was written. */
export type NoJsState =
  | null
  | { status: 'error'; error: string; fieldErrors?: FieldErrors; values: Record<string, string> }
  | { status: 'sent'; reference: string; secret: string; kind: 'request' | 'support'; sentAt: string; type: string };

/** «¿Ya lo reportaron?»: only how many open reports of the same problem there are nearby. */
export type SimilarResult = { ok: true; count: number } | { ok: false };

/** «Consultar mi solicitud»: the consultation opened (the page shows it) or the one uniform answer. */
export type LookupState = null | { status: 'error'; error: string; fieldErrors?: FieldErrors; reference?: string };

/** Adding information or confirming: done, or why not (expired = the consultation cookie is gone). */
export type CaseActionState =
  | null
  | { status: 'ok'; messageId?: string; state?: string }
  | { status: 'error'; error: string; fieldErrors?: FieldErrors; expired?: boolean };

// The form's steps and the fields each one owns (errors are shown on the step that owns them).
export const STEP_FIELDS: Record<1 | 2 | 3 | 4, readonly string[]> = {
  1: ['type', 'categoryId'],
  2: ['municipalityId', 'parishId', 'sector', 'locationReference', 'point', 'point.lat', 'point.lng', 'locationConsent'],
  3: ['title', 'description', 'eventDate'],
  4: ['anonymous', 'publishNameConsent', 'contact', 'contact.name', 'contact.email', 'contact.phone', 'contact.channel', 'privacyAccepted', 'linkedItemId', 'note', 'form'],
};

export function stepOfField(field: string): 1 | 2 | 3 | 4 {
  for (const s of [1, 2, 3, 4] as const) if (STEP_FIELDS[s].includes(field)) return s;
  return 4;
}

/** Field names of the form without JavaScript (and the honeypot's, which people never see). */
export const HONEYPOT_FIELD = 'sitio_web';
