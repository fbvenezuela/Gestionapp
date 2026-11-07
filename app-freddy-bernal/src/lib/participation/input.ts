import { z } from 'zod';
import { DENUNCIA_PLACE } from './notices';
import { REFERENCE_PATTERN } from './receipt-code';

// Citizen participation (D-92): the six kinds of request, their states and what the public form sends. The same checks
// the database makes again (citizen.submit_request, 20261106000300_citizen.sql), so the form can say them next to the
// field before sending, and the server before calling. The words speak to the citizen as «usted» (copy audit §1); the
// database still raises its own older words, which reach the person through failureOf (participation-core.ts), which
// says them in these. Pure: the form imports it too.

// In the browser, before any schema exists: zod's speed-up compiles its parsers with `new Function`, which the public
// site's CSP refuses ('unsafe-eval' is not allowed), and its probe alone makes the browser report a CSP violation on
// /atencion/nueva (Lighthouse «Buenas prácticas», 06/11). This is the only zod module of the public pages' client code
// (tests/e2e/web-recorridos.spec.ts checks the form reports none); the server keeps the speed-up.
if (typeof window !== 'undefined') z.config({ jitless: true });

export const REQUEST_TYPES = ['reporte', 'peticion', 'acotacion', 'sugerencia', 'reconocimiento', 'denuncia'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  reporte: 'Reporte',
  peticion: 'Petición',
  acotacion: 'Observación',
  sugerencia: 'Sugerencia',
  reconocimiento: 'Reconocimiento',
  denuncia: 'Denuncia',
};

/** What each kind is, in one line: the same in the form, on /atencion and in the home page's block (copy audit I6–I8). */
export const REQUEST_TYPE_HINT: Record<RequestType, string> = {
  reporte: 'Fallas en los servicios públicos de su comunidad.',
  peticion: 'Solicitudes de ayuda o de apoyo al despacho del gobernador.',
  acotacion: 'Opiniones u observaciones sobre la gestión, una obra o una publicación.',
  sugerencia: 'Propuestas para mejorar un servicio.',
  reconocimiento: 'Agradecimientos por un trabajo bien hecho.',
  denuncia: 'Hechos irregulares que deben investigarse. Es confidencial.',
};

// Where the municipality is required (requests_place_needed).
export const PLACE_REQUIRED: readonly RequestType[] = ['reporte', 'peticion', 'denuncia'];

export const REQUEST_STATES = ['recibido', 'en_revision', 'asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'resuelto', 'cerrado', 'no_procede'] as const;
export type RequestState = (typeof REQUEST_STATES)[number];
// The database's own copy is request_state_label().
export const REQUEST_STATE_LABEL: Record<RequestState, string> = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  asignado: 'Asignado',
  en_atencion: 'En atención',
  requiere_informacion: 'Requiere información',
  derivado: 'Derivado',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  no_procede: 'No procede',
};

/** Each state as the citizen reads it (their consultation and their emails): a «solicitud», so in the feminine. */
export const CITIZEN_STATE_LABEL: Record<RequestState, string> = {
  recibido: 'Recibida',
  en_revision: 'En revisión',
  asignado: 'Asignada',
  en_atencion: 'En atención',
  requiere_informacion: 'Requiere información',
  derivado: 'Derivada',
  resuelto: 'Resuelta',
  cerrado: 'Cerrada',
  no_procede: 'No procede',
};

export const REQUEST_PRIORITIES = ['baja', 'normal', 'alta', 'urgente'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];
export const REQUEST_PRIORITY_LABEL: Record<RequestPriority, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

export const CONTACT_CHANNELS = ['email', 'phone', 'whatsapp', 'none'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = { email: 'Correo', phone: 'Llamada', whatsapp: 'WhatsApp', none: 'Que no me contacten' };
/** The same choice as the person reads it in the form (the team's screens and the export keep the short labels above). */
export const CONTACT_CHANNEL_OPTION: Record<ContactChannel, string> = {
  email: 'Correo electrónico',
  phone: 'Llamada telefónica',
  whatsapp: 'WhatsApp',
  none: 'Prefiero que no me contacten',
};

const uuid = z.string().uuid();
const TITLE_TEXT = 'El título debe tener entre 3 y 140 caracteres.';
const DESCRIPTION_TEXT = 'La descripción debe tener entre 10 y 4000 caracteres.';
/** The privacy notice's checkbox, the one thing that always has to be marked to send. */
export const PRIVACY_TEXT = 'Para enviar, debe aceptar el aviso de privacidad.';
const optionalText = (max: number, message: string) => z.string().trim().max(max, message).default('');

export const contactInput = z.object({
  name: optionalText(120, 'El nombre admite hasta 120 caracteres.'),
  email: z.union([z.literal(''), z.string().trim().max(254).email('Revise el correo electrónico.')]).default(''),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || /^\+?[0-9 ()-]{7,20}$/.test(v), 'Revise el teléfono. Use solo números, con el código de área.')
    .default(''),
  channel: z.enum(CONTACT_CHANNELS).default('none'),
});
export type ContactInputValue = z.infer<typeof contactInput>;

/** What the public form sends (step by step, then once more whole on the server). */
export const requestInput = z
  .object({
    type: z.enum(REQUEST_TYPES, { message: 'Elija el tipo de solicitud.' }),
    categoryId: uuid.or(z.literal('')).refine((v) => v !== '', 'Elija una categoría de la lista.'),
    title: z.string().trim().min(3, TITLE_TEXT).max(140, TITLE_TEXT),
    description: z.string().trim().min(10, DESCRIPTION_TEXT).max(4000, DESCRIPTION_TEXT),
    municipalityId: uuid.nullable().default(null),
    parishId: uuid.nullable().default(null),
    sector: optionalText(200, 'La parroquia, localidad o sector admite hasta 200 caracteres.'),
    locationReference: optionalText(300, 'El punto de referencia admite hasta 300 caracteres.'),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Revise la fecha del hecho.').nullable().default(null),
    point: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
    locationConsent: z.boolean().default(false),
    anonymous: z.boolean().default(false),
    publishNameConsent: z.boolean().default(false),
    linkedItemId: uuid.nullable().default(null),
    contact: contactInput.nullable().default(null),
    privacyAccepted: z.literal(true, { message: PRIVACY_TEXT }),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (PLACE_REQUIRED.includes(v.type) && !v.municipalityId) issue('municipalityId', 'Elija el municipio.');
    if (v.parishId && !v.municipalityId) issue('parishId', 'Elija primero el municipio.');
    if (v.type === 'denuncia' && (v.point || v.locationReference)) issue('locationReference', DENUNCIA_PLACE);
    if (v.point && !v.locationConsent) issue('locationConsent', 'Para guardar su ubicación se necesita su autorización.');
    const c = v.contact;
    const hasContact = !!c && !!(c.name || c.email || c.phone);
    if (v.anonymous && (hasContact || v.publishNameConsent)) issue('anonymous', 'Una solicitud anónima no lleva datos de contacto.');
    if (c && c.channel === 'email' && !c.email) issue('contact', 'Escriba el correo o elija otro medio de contacto.');
    if (c && (c.channel === 'phone' || c.channel === 'whatsapp') && !c.phone) issue('contact', 'Escriba el teléfono o elija otro medio de contacto.');
  });
export type RequestInput = z.infer<typeof requestInput>;

/** «Consultar mi solicitud»: the reference and the secret as typed (normalized afterwards). */
export const lookupInput = z.object({
  reference: z.string().trim().min(8).max(40),
  secret: z.string().trim().min(16).max(40),
});

export const isReference = (v: string) => REFERENCE_PATTERN.test(v);
