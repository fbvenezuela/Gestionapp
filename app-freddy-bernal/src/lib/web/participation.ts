import 'server-only';
import type { Sql } from '../db/core';
import { sealContact, type Keyring } from '../participation/contact-crypto';
import { secretDigest, type PepperConfig } from '../participation/keys';
import { normalizeReference, normalizeSecret } from '../participation/receipt-code';
import type { RequestInput, RequestState, RequestType } from '../participation/input';

// The citizen functions (schema citizen, 20261106000300_citizen.sql, D-96), called the way they must be: inside
// withAnon() (role anon, no claims; never from a browser), with named arguments, after the app's own checks
// (requestInput, honeypot, Turnstile when configured). The secret is turned into its HMAC here and never travels
// further; the contact is encrypted here (contact-crypto.ts); the rate limit's keys come from keys.ts. A wrong
// reference or secret answers {status: 'not_found'}, the same whether the request exists or not. Errors keep their
// SQLSTATE (P0429 = too many tries, 22023 = a malformed key, P0001 = a message for the person): friendlyDbError() reads
// them.

export type RateKeys = { deviceKey: string; ipKey: string };
/** The browser's form key (uuid) and the secret it made when the form started (receipt-code.ts). */
export type ReceiptKeys = { submissionKey: string; secret: string };
export type Receipt = { status: 'ok'; id: string; reference: string; kind: 'request' | 'support' };
export type NotFound = { status: 'not_found' };
export type Crypto = { pepper?: PepperConfig; ring?: Keyring };

const one = async <T>(sql: Sql, q: string, p: unknown[]): Promise<T> => (await sql.one<{ v: T }>(q, p))!.v;

function digestOf(secret: string, c: Crypto): string {
  const s = normalizeSecret(secret);
  if (!s) throw Object.assign(new Error('Falta la clave del comprobante.'), { code: '22023' });
  return secretDigest(s, c.pepper);
}

/** «¿Ya lo reportaron?»: how many OPEN reports of the same problem there are nearby, and up to 5 opaque ids. */
export function similarRequests(
  sql: Sql,
  keys: RateKeys,
  q: { categoryId: string; municipalityId?: string | null; parishId?: string | null; sector?: string; point?: { lat: number; lng: number } | null },
): Promise<{ status: 'ok'; count: number; ids: string[] | null }> {
  return one(
    sql,
    `select citizen.similar_requests(p_device_key => $1, p_ip_key => $2, p_category_id => $3, p_municipality_id => $4, p_parish_id => $5,
       p_sector => $6, p_lat => $7, p_lng => $8) as v`,
    [keys.deviceKey, keys.ipKey, q.categoryId, q.municipalityId ?? null, q.parishId ?? null, q.sector ?? '', q.point?.lat ?? null, q.point?.lng ?? null],
  );
}

/** Sends a request (idempotent by the form's key). The fourth of the same problem in the same place comes back as a
 * support of the first one (kind 'support'). */
export function submitRequest(sql: Sql, input: RequestInput, receipt: ReceiptKeys, keys: RateKeys, c: Crypto = {}): Promise<Receipt> {
  const contact = !input.anonymous && input.contact ? sealContact(input.contact, c.ring) : { name: null, email: null, phone: null, channel: 'none' as const };
  return one(
    sql,
    `select citizen.submit_request(
       p_submission_key => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_type => $5, p_category_id => $6,
       p_title => $7, p_description => $8, p_municipality_id => $9, p_parish_id => $10, p_sector => $11, p_location_reference => $12,
       p_event_date => $13::date, p_lat => $14, p_lng => $15, p_location_consent => $16, p_anonymous => $17,
       p_publish_name_consent => $18, p_linked_item_id => $19, p_contact_name => $20, p_contact_email => $21,
       p_contact_phone => $22, p_contact_channel => $23) as v`,
    [
      receipt.submissionKey, digestOf(receipt.secret, c), keys.deviceKey, keys.ipKey, input.type, input.categoryId, input.title,
      input.description, input.municipalityId, input.parishId, input.sector, input.type === 'denuncia' ? '' : input.locationReference,
      input.eventDate, input.point?.lat ?? null, input.point?.lng ?? null, !!input.point && input.locationConsent, input.anonymous,
      !input.anonymous && input.publishNameConsent, input.linkedItemId, contact.name, contact.email, contact.phone, contact.channel,
    ],
  );
}

/** «¿Te sumas?»: a support of one of the reports similarRequests offered, with its own receipt. */
export function supportRequest(
  sql: Sql,
  requestId: string,
  receipt: ReceiptKeys,
  keys: RateKeys,
  extra: { note?: string; contact?: RequestInput['contact'] } = {},
  c: Crypto = {},
): Promise<Receipt> {
  const contact = extra.contact ? sealContact(extra.contact, c.ring) : { name: null, email: null, phone: null, channel: 'none' as const };
  return one(
    sql,
    `select citizen.support_request(p_submission_key => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_request_id => $5,
       p_note => $6, p_contact_name => $7, p_contact_email => $8, p_contact_phone => $9, p_contact_channel => $10) as v`,
    [receipt.submissionKey, digestOf(receipt.secret, c), keys.deviceKey, keys.ipKey, requestId, extra.note ?? '', contact.name, contact.email, contact.phone, contact.channel],
  );
}

export type TimelineItem = {
  at: string;
  kind: 'created' | 'state' | 'merged' | 'citizen_confirmed' | 'citizen_not_resolved' | 'public_reply' | 'info_request' | 'citizen_message' | 'support';
  by: 'citizen' | 'team';
  state?: RequestState;
  body?: string;
  redacted?: boolean;
};
export type CitizenAttachment = { id: string; kind: 'citizen' | 'evidence'; mime: string; bytes: number; at: string; scanStatus: string; messageId: string | null };
export type CitizenView = {
  status: 'ok';
  kind: 'request' | 'support';
  request: {
    reference: string; type: RequestType; category: string; municipality: string | null; parish?: string | null; sector?: string;
    locationReference?: string; title?: string; description?: string; eventDate?: string | null; hasLocation?: boolean; anonymous?: boolean;
    state: RequestState; merged?: boolean; mainState?: RequestState | null; supportCount: number; citizenConfirmation?: 'resolved' | 'not_resolved' | null;
    note?: string; automatic?: boolean; createdAt: string; updatedAt: string; resolvedAt: string | null; canAddInfo: boolean; canConfirm: boolean;
  };
  timeline: TimelineItem[];
  attachments: CitizenAttachment[];
};

export type ReceiptGrant = { reference: string; digest: string };

/** The reference and the secret as the person typed them, checked and turned into what the database compares. Null
 * when they cannot be a receipt (the page says the same «not found» as for a wrong one). */
export function receiptGrant(reference: string, secret: string, c: Crypto = {}): ReceiptGrant | null {
  const ref = normalizeReference(reference);
  const s = normalizeSecret(secret);
  return ref && s ? { reference: ref, digest: secretDigest(s, c.pepper) } : null;
}

/** «Consultar mi solicitud». A failed lookup still counts against the limit (the function answers instead of failing). */
export function lookupRequest(sql: Sql, g: ReceiptGrant, keys: RateKeys): Promise<CitizenView | NotFound> {
  return one(sql, `select citizen.lookup_request(p_reference => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4) as v`, [
    g.reference, g.digest, keys.deviceKey, keys.ipKey,
  ]);
}

/** «Agregar información»: a message to the team (a case waiting for information goes back to review). */
export function addCitizenMessage(sql: Sql, g: ReceiptGrant, keys: RateKeys, body: string): Promise<{ status: 'ok'; id: string } | NotFound> {
  return one(sql, `select citizen.add_citizen_message(p_reference => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_body => $5) as v`, [
    g.reference, g.digest, keys.deviceKey, keys.ipKey, body,
  ]);
}

/** A file the app already checked, cleaned and stored (src/lib/storage/participation-files.ts). */
export function addCitizenAttachment(
  sql: Sql,
  g: ReceiptGrant,
  keys: RateKeys,
  f: { storageKey: string; mime: string; bytes: number; scanStatus: 'cuarentena' | 'sin_analizar'; messageId?: string | null },
): Promise<{ status: 'ok'; id: string } | NotFound> {
  return one(
    sql,
    `select citizen.add_request_attachment(p_reference => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_storage_key => $5,
       p_mime => $6, p_bytes => $7, p_scan_status => $8, p_message_id => $9) as v`,
    [g.reference, g.digest, keys.deviceKey, keys.ipKey, f.storageKey, f.mime, f.bytes, f.scanStatus, f.messageId ?? null],
  );
}

/** Before serving a file to the citizen: theirs or evidence the team shared, of this request, not withheld. */
export function citizenAttachment(
  sql: Sql,
  g: ReceiptGrant,
  keys: RateKeys,
  attachmentId: string,
): Promise<{ status: 'ok'; storageKey: string; mime: string; bytes: number; scanStatus: 'cuarentena' | 'limpio' | 'infectado' | 'sin_analizar' } | NotFound> {
  return one(
    sql,
    `select citizen.request_attachment(p_reference => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_attachment_id => $5) as v`,
    [g.reference, g.digest, keys.deviceKey, keys.ipKey, attachmentId],
  );
}

/** «¿Se resolvió?»: yes (recorded) or no (the case reopens; the comment goes to the team). */
export function confirmRequest(
  sql: Sql,
  g: ReceiptGrant,
  keys: RateKeys,
  resolved: boolean,
  comment = '',
): Promise<{ status: 'ok'; state: RequestState } | NotFound> {
  return one(
    sql,
    `select citizen.confirm_request(p_reference => $1, p_secret_digest => $2, p_device_key => $3, p_ip_key => $4, p_resolved => $5, p_comment => $6) as v`,
    [g.reference, g.digest, keys.deviceKey, keys.ipKey, resolved, comment],
  );
}

export type PublicStats = {
  from: string; to: string; received: number; resolved: number; pending: number; overdue: number;
  avgFirstResponseHours: number | null; avgResolutionHours: number | null;
  byType: Partial<Record<RequestType, number>>; byState: Partial<Record<RequestState, number>>;
  byCategory: { id: string; name: string; count: number }[]; byMunicipality: { id: string; name: string; count: number }[];
};

/** The public figures (/transparencia): no data of any person, denuncias only in the totals by type and state. */
export function publicRequestStats(sql: Sql, from: string | null = null, to: string | null = null): Promise<PublicStats> {
  return one(sql, `select citizen.request_stats(p_from => $1::date, p_to => $2::date) as v`, [from, to]);
}
