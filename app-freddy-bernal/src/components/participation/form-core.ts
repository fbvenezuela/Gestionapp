import { REQUEST_TYPES, requestInput, type RequestType } from '@/lib/participation/input';
import { STEP_FIELDS, chosenChannel, eventDateProblem, type FieldErrors } from '@/lib/actions/participation-types';
import { generateSecret, normalizeSecret } from '@/lib/participation/receipt-code';

// The request form's state and rules (/atencion/nueva, design §4), pure so the tests read them: the draft the browser
// keeps in sessionStorage (with the form's key and the receipt's secret, made when the form starts, so a retry or a
// dropped connection gets the same receipt), the request the server receives, and the checks: the SAME zod schema as
// the server (requestInput) plus the date rule, each error shown on the step that owns its field.

export type Step = 1 | 2 | 3 | 4;
export const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Tipo' },
  { n: 2, label: 'Lugar' },
  { n: 3, label: 'Detalle' },
  { n: 4, label: 'Contacto' },
];

export type Point = { lat: number; lng: number };
export type FormValues = {
  type: RequestType | '';
  categoryId: string;
  municipalityId: string;
  parishId: string;
  sector: string;
  locationReference: string;
  point: Point | null;
  locationConsent: boolean;
  title: string;
  description: string;
  eventDate: string;
  anonymous: boolean;
  name: string;
  email: string;
  phone: string;
  /** '' = not chosen: the email if there is one, else the phone (chosenChannel). */
  channel: string;
  publishNameConsent: boolean;
  privacyAccepted: boolean;
  linkedItemId: string | null;
  /** What a person who supports an open report adds («Apoyar este reporte»). */
  note: string;
};

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'lost' | 'skipped';
export type ReceiptFile = { id: string; name: string; size: number; status: UploadStatus; error?: string };
export type Receipt = {
  reference: string;
  secret: string;
  kind: 'request' | 'support';
  sentAt: string;
  type: RequestType;
  files: ReceiptFile[];
  /** Whether a confirmation email is on its way (an address, a channel other than «no», and email that delivers). */
  emailNote: boolean;
  /** The person already saved it somewhere (downloaded, printed or copied): «Nueva solicitud» needs no warning. */
  saved: boolean;
};

/** What the form's address chose: the kind (?tipo=) and the published item the request is about (?sobre=). */
export type FormPreset = { type: RequestType | null; linkedItemId: string | null };

export type Draft = {
  v: 1;
  submissionKey: string;
  secret: string;
  step: Step;
  values: FormValues;
  /** The address (kind and item) of the page this draft is on: the one its form started at, or the one that brought it
   * back; its own kind and item once another address's form took its place (setAside). When that page comes back as the
   * person left it (a reload), the draft comes back even after the person changed the kind or dropped the item by hand. */
  opened: FormPreset;
  /** The files chosen before a reload (files themselves cannot be kept): the form asks to choose them again. */
  fileNames: string[];
  receipt: Receipt | null;
  /** The place for which the person said «no, es otro problema» (not asked again for the same place). */
  similarAnswered: string | null;
  savedAt: string;
};

export const DRAFT_KEY = 'fb:atencion:borrador:v1';
const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export const isRequestType = (v: unknown): v is RequestType => typeof v === 'string' && (REQUEST_TYPES as readonly string[]).includes(v);

export function emptyValues(preset: { type?: RequestType | null; linkedItemId?: string | null } = {}): FormValues {
  return {
    type: preset.type ?? '',
    categoryId: '',
    municipalityId: '',
    parishId: '',
    sector: '',
    locationReference: '',
    point: null,
    locationConsent: false,
    title: '',
    description: '',
    eventDate: '',
    anonymous: false,
    name: '',
    email: '',
    phone: '',
    channel: '',
    publishNameConsent: false,
    privacyAccepted: false,
    linkedItemId: preset.linkedItemId ?? null,
    note: '',
  };
}

/** A uuid v4 from the strong random source (crypto.randomUUID needs a secure context; a phone on a LAN address has none). */
export function uuidV4(bytes: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(16))): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A new form: its key and the receipt's secret are made now, in this browser, and kept with what is written. */
export function newDraft(preset: { type?: RequestType | null; linkedItemId?: string | null } = {}, now = new Date()): Draft {
  const opened = { type: preset.type ?? null, linkedItemId: preset.linkedItemId ?? null };
  return { v: 1, submissionKey: uuidV4(), secret: generateSecret(), step: 1, values: emptyValues(preset), opened, fileNames: [], receipt: null, similarAnswered: null, savedAt: now.toISOString() };
}

const nonEmpty = (s: string) => s.trim() !== '';

/** Whether the person wrote or chose anything (a draft worth restoring). The kind alone is not: it comes with the link,
 * or is one tick (a draft holding only «Denuncia» used to come back on the petición page, design §11). */
export function hasContent(v: FormValues): boolean {
  return [v.categoryId, v.municipalityId, v.parishId, v.sector, v.locationReference, v.title, v.description, v.eventDate, v.name, v.email, v.phone, v.note].some(nonEmpty) || !!v.point;
}

const sameAddress = (a: FormPreset, b: FormPreset) => a.type === b.type && a.linkedItemId === b.linkedItemId;

/**
 * The tab's saved draft the form starts from, or null for a new form (design §5.1 «Drafts», §11):
 *   * a sent request always comes back, with its receipt: its code and secret cannot be had again;
 *   * what was written comes back only if something was written (hasContent: the kind alone is not), and only when
 *     each kind or item the address names is the draft's own. The address's choice wins over a draft of another kind,
 *     or about another item, every time the form is opened: by a link of the site, or by the address typed or followed;
 *   * the one exception is the page coming back as the person left it (`cameBack`: a reload, or Back or Forward to it,
 *     draft-storage.ts formCameBack): the draft that was on this very page comes back, even after the person changed
 *     the kind or dropped the item by hand;
 *   * anything else is a new form, with a key and a secret of its own (never the draft's: a key that may have reached
 *     the server with other content is not reused for this one), and the draft is set aside (setAside).
 * What comes back is on this page now (its `opened` is this address).
 */
export function resumeDraft(saved: Draft | null, preset: FormPreset, cameBack = false): Draft | null {
  if (!saved) return null;
  if (saved.receipt) return { ...saved, receipt: { ...saved.receipt, files: filesAfterReload(saved.receipt.files) } };
  if (!hasContent(saved.values)) return null;
  const own = (asked: string | null, now: string | null) => !asked || asked === now;
  if (own(preset.type, saved.values.type || null) && own(preset.linkedItemId, saved.values.linkedItemId)) return { ...saved, opened: preset };
  return cameBack && sameAddress(saved.opened, preset) ? saved : null;
}

/** A draft the form of another address took the place of (resumeDraft gave null): it stays in the tab on no page, so
 * only its own kind and item bring it back, never a reload of the page that showed the other form. */
export function setAside(saved: Draft): Draft {
  return { ...saved, opened: { type: saved.values.type || null, linkedItemId: saved.values.linkedItemId } };
}

/** Whether a form's draft is worth keeping in the tab: a receipt, or something written. A form with nothing written
 * yet keeps nothing, so a saved draft of another form stays where it is until this one has something of its own. */
export function worthKeeping(d: Pick<Draft, 'receipt' | 'values'>): boolean {
  return !!d.receipt || hasContent(d.values);
}

/** What the server receives (and what requestInput checks, here and there). */
export function toInput(v: FormValues): Record<string, unknown> {
  const denuncia = v.type === 'denuncia';
  const hasContact = !v.anonymous && [v.name, v.email, v.phone].some(nonEmpty);
  const point = denuncia ? null : v.point;
  return {
    type: v.type,
    categoryId: v.categoryId,
    title: v.title,
    description: v.description,
    municipalityId: v.municipalityId || null,
    parishId: v.municipalityId ? v.parishId || null : null,
    sector: v.sector,
    locationReference: denuncia ? '' : v.locationReference,
    eventDate: v.eventDate || null,
    point,
    locationConsent: !!point && v.locationConsent,
    anonymous: v.anonymous,
    publishNameConsent: !v.anonymous && nonEmpty(v.name) && v.publishNameConsent,
    linkedItemId: v.linkedItemId,
    contact: hasContact ? { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), channel: chosenChannel(v) } : null,
    privacyAccepted: v.privacyAccepted,
  };
}

/** zod's issues as «field → first message». */
export function errorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = i.path.map(String).join('.') || 'form';
    out[key] ??= i.message;
  }
  return out;
}

const PLACEHOLDER_UUID = '00000000-0000-4000-8000-000000000000';

/**
 * zod runs the schema's cross-field rules (the municipality a reporte needs, the denuncia's place, the location's
 * permission, a coherent contact) only once every field passes on its own. To say them on the step that owns them, the
 * form checks a copy where each field that failed on its own holds a valid stand-in that changes none of those rules.
 */
function standInsFor(input: Record<string, unknown>, issues: readonly { path: readonly PropertyKey[] }[]): Record<string, unknown> {
  const bad = new Set(issues.map((i) => i.path.map(String).join('.')));
  const out: Record<string, unknown> = { ...input };
  if (bad.has('categoryId')) out.categoryId = PLACEHOLDER_UUID;
  if (bad.has('title')) out.title = 'xxx';
  if (bad.has('description')) out.description = 'xxxxxxxxxx';
  if (bad.has('privacyAccepted')) out.privacyAccepted = true;
  if (bad.has('eventDate')) out.eventDate = null;
  if (bad.has('sector')) out.sector = '';
  if (bad.has('locationReference')) out.locationReference = 'x';
  const c = input.contact as Record<string, string> | null;
  if (c) {
    out.contact = {
      ...c,
      ...(bad.has('contact.name') ? { name: 'x' } : {}),
      ...(bad.has('contact.email') ? { email: 'a@b.co' } : {}),
      ...(bad.has('contact.phone') ? { phone: '0000000' } : {}),
    };
  }
  return out;
}

/** Every problem of the whole form (the same schema as the server, plus the date rule with Táchira's today). */
export function validate(v: FormValues, today: string): FieldErrors {
  const input = toInput(v);
  const r = requestInput.safeParse(input);
  const errors = r.success ? {} : errorsOf(r.error.issues);
  if (!r.success && v.type) {
    const again = requestInput.safeParse(standInsFor(input, r.error.issues));
    if (!again.success) for (const [k, m] of Object.entries(errorsOf(again.error.issues))) errors[k] ??= m;
  }
  const date = eventDateProblem(v.eventDate || null, today);
  if (date) errors.eventDate ??= date;
  // The category's question shows once the kind is chosen: one thing at a time.
  if (!v.type) delete errors.categoryId;
  return errors;
}

/** The errors a step shows (its own fields only). */
export function errorsOfStep(errors: FieldErrors, step: Step): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => STEP_FIELDS[step].includes(k) || (step === 4 && !Object.values(STEP_FIELDS).flat().includes(k))));
}

/** The first step with a problem, or null. */
export function firstErrorStep(errors: FieldErrors): Step | null {
  for (const s of [1, 2, 3, 4] as const) if (Object.keys(errorsOfStep(errors, s)).length) return s;
  return null;
}

/** The checks of «Enviar apoyo» (a support): the contact part of the same schema, the privacy notice and the note's length. */
export function validateJoin(v: FormValues): FieldErrors {
  const all = validate({ ...v, type: v.type || 'reporte', title: 'apoyo', description: 'un apoyo a un reporte abierto' }, '2000-01-01');
  const errors = errorsOfStep(all, 4);
  delete errors.linkedItemId;
  if (v.note.trim().length > 2000) errors.note = 'El comentario admite hasta 2000 caracteres.';
  return errors;
}

/** The same place and problem (for «Reportes parecidos»: asked once per place). */
export function similarKey(v: FormValues): string {
  const p = v.point ? `${v.point.lat.toFixed(4)},${v.point.lng.toFixed(4)}` : '';
  return [v.categoryId, v.municipalityId, v.parishId, v.sector.trim().toLowerCase().replace(/\s+/g, ' '), p].join('|');
}

/** Whether the «Reportes parecidos» question makes sense: a report with its category and a place to compare. */
export function canAskSimilar(v: FormValues): boolean {
  return v.type === 'reporte' && !!v.categoryId && (!!v.municipalityId || !!v.point);
}

// --- The draft in sessionStorage ------------------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (x: unknown, max = 4000) => (typeof x === 'string' ? x.slice(0, max) : '');
const bool = (x: unknown) => x === true;

/** A stored draft, checked field by field (anything odd is dropped, never trusted); null when it cannot be one. */
export function parseDraft(raw: string | null, now = Date.now()): Draft | null {
  if (!raw) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || d.v !== 1 || typeof d.submissionKey !== 'string' || !UUID.test(d.submissionKey)) return null;
  const secret = normalizeSecret(str(d.secret, 40));
  if (!secret) return null;
  const savedAt = Date.parse(str(d.savedAt, 40));
  if (Number.isNaN(savedAt) || now - savedAt > DRAFT_MAX_AGE_MS) return null;
  const x = (d.values ?? {}) as Record<string, unknown>;
  const p = x.point as { lat?: unknown; lng?: unknown } | null;
  const point = p && typeof p.lat === 'number' && typeof p.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? { lat: p.lat, lng: p.lng } : null;
  const values: FormValues = {
    type: isRequestType(x.type) ? x.type : '',
    categoryId: UUID.test(str(x.categoryId)) ? str(x.categoryId) : '',
    municipalityId: UUID.test(str(x.municipalityId)) ? str(x.municipalityId) : '',
    parishId: UUID.test(str(x.parishId)) ? str(x.parishId) : '',
    sector: str(x.sector, 200),
    locationReference: str(x.locationReference, 300),
    point,
    locationConsent: !!point && bool(x.locationConsent),
    title: str(x.title, 140),
    description: str(x.description, 4000),
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(str(x.eventDate)) ? str(x.eventDate) : '',
    anonymous: bool(x.anonymous),
    name: str(x.name, 120),
    email: str(x.email, 254),
    phone: str(x.phone, 40),
    channel: ['email', 'phone', 'whatsapp', 'none'].includes(str(x.channel)) ? str(x.channel) : '',
    publishNameConsent: bool(x.publishNameConsent),
    privacyAccepted: bool(x.privacyAccepted),
    linkedItemId: UUID.test(str(x.linkedItemId)) ? str(x.linkedItemId) : null,
    note: str(x.note, 2000),
  };
  const step = [1, 2, 3, 4].includes(d.step as number) ? (d.step as Step) : 1;
  // A draft kept before this field existed opened with no choice: only its own kind and item bring it back.
  const o = (d.opened ?? {}) as Record<string, unknown>;
  const opened: FormPreset = { type: isRequestType(o.type) ? o.type : null, linkedItemId: UUID.test(str(o.linkedItemId)) ? str(o.linkedItemId) : null };
  return {
    v: 1,
    submissionKey: d.submissionKey,
    secret,
    step,
    values,
    opened,
    fileNames: Array.isArray(d.fileNames) ? d.fileNames.filter((n): n is string => typeof n === 'string').slice(0, 3).map((n) => n.slice(0, 120)) : [],
    receipt: parseReceipt(d.receipt, secret),
    similarAnswered: typeof d.similarAnswered === 'string' ? d.similarAnswered.slice(0, 400) : null,
    savedAt: new Date(savedAt).toISOString(),
  };
}

function parseReceipt(raw: unknown, secret: string): Receipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.reference !== 'string' || !/^AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/.test(r.reference)) return null;
  if (!isRequestType(r.type)) return null;
  const files = Array.isArray(r.files)
    ? r.files.slice(0, 3).flatMap((f): ReceiptFile[] => {
        if (!f || typeof f !== 'object') return [];
        const o = f as Record<string, unknown>;
        if (typeof o.id !== 'string' || typeof o.name !== 'string') return [];
        const status = ['pending', 'uploading', 'done', 'failed', 'lost', 'skipped'].includes(String(o.status)) ? (o.status as UploadStatus) : 'lost';
        return [{ id: o.id.slice(0, 60), name: o.name.slice(0, 120), size: typeof o.size === 'number' ? o.size : 0, status, error: typeof o.error === 'string' ? o.error.slice(0, 300) : undefined }];
      })
    : [];
  return {
    reference: r.reference,
    secret,
    kind: r.kind === 'support' ? 'support' : 'request',
    sentAt: typeof r.sentAt === 'string' && !Number.isNaN(Date.parse(r.sentAt)) ? r.sentAt : new Date().toISOString(),
    type: r.type,
    files,
    emailNote: r.emailNote === true,
    saved: r.saved === true,
  };
}

/** After a reload the chosen files are gone (only their names were kept): what was not up yet cannot go up now. */
export function filesAfterReload(files: ReceiptFile[]): ReceiptFile[] {
  return files.map((f) => (f.status === 'pending' || f.status === 'uploading' || f.status === 'failed' ? { ...f, status: 'lost' as const, error: undefined } : f));
}

// --- Words of the form --------------------------------------------------------------------------------------------------
/** The label a field's error is listed with in the summary at the top. */
export const FIELD_LABEL: Record<string, string> = {
  type: 'Tipo de solicitud',
  categoryId: 'Categoría',
  municipalityId: 'Municipio',
  parishId: 'Parroquia',
  sector: 'Parroquia, localidad o sector',
  locationReference: 'Punto de referencia',
  point: 'Ubicación',
  locationConsent: 'Ubicación',
  title: 'Título',
  description: 'Descripción',
  eventDate: 'Fecha del hecho',
  attachments: 'Archivos',
  anonymous: 'Enviar como anónimo',
  publishNameConsent: 'Su nombre en «Casos atendidos»',
  contact: 'Medio de contacto',
  'contact.name': 'Nombre',
  'contact.email': 'Correo',
  'contact.phone': 'Teléfono',
  'contact.channel': 'Medio de contacto',
  privacyAccepted: 'Aviso de privacidad',
  note: 'Comentario',
  form: 'Formulario',
};

/** The id of the control a field's error points to (the first option of a group). */
export const fieldId = (field: string) => `f-${field.replace(/\./g, '-')}`;
