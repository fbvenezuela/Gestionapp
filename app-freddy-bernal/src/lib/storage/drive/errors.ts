// Drive failures as a few codes, each with one short Spanish message for the person using the
// platform. Never a Google body, a token or a file name: the messages are fixed text.

export type DriveErrorCode =
  | 'auth' // the grant expired or was removed (invalid_grant), or the key changed
  | 'not_found' // the file is gone or the app lost access to it
  | 'full' // the Google account is out of space
  | 'busy' // rate limit, 5xx, download quota: try again later
  | 'not_configured' // variables missing
  | 'not_connected' // nobody connected Drive yet, or it was disconnected
  | 'budget' // this month's transfer cap is used up
  | 'share' // this person used up their share of the cap for today
  | 'refused'; // Drive said no to something we asked (bad request); our bug, not the person's

export const DRIVE_MESSAGE: Record<DriveErrorCode, string> = {
  auth: 'El material no se puede abrir ahora. Ya le avisamos a Administración.',
  not_found: 'Ese archivo ya no está en Drive. Avísale a Administración.',
  full: 'Drive está lleno; Administración tiene que liberar espacio.',
  busy: 'Drive está lento; intenta en un momento.',
  not_configured: 'Drive no está configurado. Avísale a Administración.',
  not_connected: 'Drive no está conectado. Ya le avisamos a Administración.',
  budget: 'Este mes ya se usó todo el cupo para ver y descargar videos. Avísale a Administración.',
  share: 'Ya usaste tu cupo de hoy para ver y descargar videos. Mañana sigue, o pídeselo a Administración.',
  refused: 'Drive no aceptó el archivo. Intenta otra vez o avísale a Administración.',
};

// A request with no Range for a file past FULL_MAX (range.ts): only the platform's own «Descargar»
// (by pieces) gets it.
export const TOO_BIG_MESSAGE = 'Este archivo es grande: descárgalo con el botón «Descargar» de la plataforma.';

// HTTP status the media routes answer with for each code.
export const DRIVE_STATUS: Record<DriveErrorCode, number> = {
  auth: 503,
  not_found: 410,
  full: 507,
  busy: 503,
  not_configured: 503,
  not_connected: 503,
  budget: 503,
  share: 429,
  refused: 502,
};

export class DriveError extends Error {
  readonly code: DriveErrorCode;
  // Google's reason (userRateLimitExceeded, invalid_grant, ...) for logs; never shown.
  readonly reason: string;
  constructor(code: DriveErrorCode, reason = '') {
    super(`drive:${code}${reason ? `:${reason}` : ''}`);
    this.code = code;
    this.reason = reason.slice(0, 60);
  }
}

export function driveMessage(e: unknown): string {
  return e instanceof DriveError ? DRIVE_MESSAGE[e.code] : DRIVE_MESSAGE.busy;
}

// Google's error body: {"error": {"errors": [{"reason": "..."}], "status": "..."}} for the API,
// {"error": "invalid_grant"} for the token endpoint. Only the reason is kept.
export function googleReason(body: unknown): string {
  const b = body as { error?: unknown } | null;
  if (!b || typeof b !== 'object') return '';
  if (typeof b.error === 'string') return b.error.slice(0, 60);
  const err = b.error as { errors?: { reason?: unknown }[]; status?: unknown } | undefined;
  const r = err?.errors?.[0]?.reason ?? err?.status;
  return typeof r === 'string' ? r.slice(0, 60) : '';
}

const RATE = new Set(['userRateLimitExceeded', 'rateLimitExceeded', 'sharingRateLimitExceeded', 'backendError', 'downloadQuotaExceeded', 'RESOURCE_EXHAUSTED']);
const FULL = new Set(['storageQuotaExceeded', 'quotaExceeded', 'teamDriveFileLimitExceeded']);

/** Maps a failed Drive API answer to a DriveError. Rate limits and 5xx come out as 'busy'. */
export function mapDriveFailure(status: number, body: unknown): DriveError {
  const reason = googleReason(body);
  if (status === 401) return new DriveError('auth', reason || 'unauthorized');
  if (status === 404 || status === 410) return new DriveError('not_found', reason || 'notFound');
  if (status === 429 || status >= 500) return new DriveError('busy', reason || `http_${status}`);
  if (status === 403) {
    if (FULL.has(reason)) return new DriveError('full', reason);
    if (RATE.has(reason)) return new DriveError('busy', reason);
    // drive.file without access to that file, or the file owner's restrictions.
    if (/insufficient|appNotAuthorized|forbidden|cannotDownload/i.test(reason)) return new DriveError('not_found', reason);
    return new DriveError('busy', reason || 'forbidden');
  }
  return new DriveError('refused', reason || `http_${status}`);
}

/** True when the request is worth repeating after a pause. */
export function retryable(status: number, body: unknown): boolean {
  if (status === 429 || status >= 500) return true;
  return status === 403 && RATE.has(googleReason(body)) && googleReason(body) !== 'downloadQuotaExceeded';
}
