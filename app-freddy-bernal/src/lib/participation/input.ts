import { z } from 'zod';
import { REFERENCE_PATTERN } from './receipt-code';

// Citizen participation (D-92): the six kinds of request, their states and what the public form sends. The same checks
// the database makes again (citizen.submit_request, 20261106000300_citizen.sql), with the same words, so the form
// can say them next to the field before sending, and the server before calling. Pure: the form imports it too.

export const REQUEST_TYPES = ['reporte', 'peticion', 'acotacion', 'sugerencia', 'reconocimiento', 'denuncia'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  reporte: 'Reporte',
  peticion: 'Petición',
  acotacion: 'Acotación',
  sugerencia: 'Sugerencia',
  reconocimiento: 'Reconocimiento',
  denuncia: 'Denuncia',
};

/** What each kind is, in the words of the form. */
export const REQUEST_TYPE_HINT: Record<RequestType, string> = {
  reporte: 'Un problema en tu comunidad: agua, luz, vialidad, aseo, salud, escuelas…',
  peticion: 'Pedir algo al despacho: una ayuda, un trámite, algo para la comunidad.',
  acotacion: 'Una opinión o una observación sobre la gestión o una obra.',
  sugerencia: 'Una idea para mejorar algo.',
  reconocimiento: 'Agradecer algo que se hizo bien.',
  denuncia: 'Un hecho grave. Es privada de punta a punta: solo la leen el operador de denuncias y la coordinación.',
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

export const REQUEST_PRIORITIES = ['baja', 'normal', 'alta', 'urgente'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];
export const REQUEST_PRIORITY_LABEL: Record<RequestPriority, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

export const CONTACT_CHANNELS = ['email', 'phone', 'whatsapp', 'none'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = { email: 'Correo', phone: 'Llamada', whatsapp: 'WhatsApp', none: 'Que no me contacten' };

const uuid = z.string().uuid();
const optionalText = (max: number, message: string) => z.string().trim().max(max, message).default('');

export const contactInput = z.object({
  name: optionalText(120, 'El nombre va hasta 120 letras.'),
  email: z.union([z.literal(''), z.string().trim().max(254).email('Revisa el correo.')]).default(''),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || /^\+?[0-9 ()-]{7,20}$/.test(v), 'Revisa el teléfono: solo números, con el código de área.')
    .default(''),
  channel: z.enum(CONTACT_CHANNELS).default('none'),
});
export type ContactInputValue = z.infer<typeof contactInput>;

/** What the public form sends (step by step, then once more whole on the server). */
export const requestInput = z
  .object({
    type: z.enum(REQUEST_TYPES, { message: 'Elige qué quieres enviar.' }),
    categoryId: uuid.or(z.literal('')).refine((v) => v !== '', 'Elige una categoría de la lista.'),
    title: z.string().trim().min(3, 'El título va de 3 a 140 letras.').max(140, 'El título va de 3 a 140 letras.'),
    description: z.string().trim().min(10, 'Cuéntanos qué pasa en 10 a 4000 letras.').max(4000, 'Cuéntanos qué pasa en 10 a 4000 letras.'),
    municipalityId: uuid.nullable().default(null),
    parishId: uuid.nullable().default(null),
    sector: optionalText(200, 'La parroquia, localidad o sector va hasta 200 letras.'),
    locationReference: optionalText(300, 'La referencia va hasta 300 letras.'),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Revisa la fecha del hecho.').nullable().default(null),
    point: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
    locationConsent: z.boolean().default(false),
    anonymous: z.boolean().default(false),
    publishNameConsent: z.boolean().default(false),
    linkedItemId: uuid.nullable().default(null),
    contact: contactInput.nullable().default(null),
    privacyAccepted: z.literal(true, { message: 'Lee y acepta el aviso de privacidad para enviar.' }),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (PLACE_REQUIRED.includes(v.type) && !v.municipalityId) issue('municipalityId', 'Elige el municipio.');
    if (v.parishId && !v.municipalityId) issue('parishId', 'Elige primero el municipio.');
    if (v.type === 'denuncia' && (v.point || v.locationReference)) issue('locationReference', 'En una denuncia va solo el lugar aproximado: municipio y sector.');
    if (v.point && !v.locationConsent) issue('locationConsent', 'Para guardar tu ubicación hace falta tu permiso.');
    const c = v.contact;
    const hasContact = !!c && !!(c.name || c.email || c.phone);
    if (v.anonymous && (hasContact || v.publishNameConsent)) issue('anonymous', 'Una solicitud anónima va sin contacto.');
    if (c && c.channel === 'email' && !c.email) issue('contact', 'Escribe el correo, o elige otra forma de contacto.');
    if (c && (c.channel === 'phone' || c.channel === 'whatsapp') && !c.phone) issue('contact', 'Escribe el teléfono, o elige otra forma de contacto.');
  });
export type RequestInput = z.infer<typeof requestInput>;

/** «Consultar mi solicitud»: the reference and the secret as typed (normalized afterwards). */
export const lookupInput = z.object({
  reference: z.string().trim().min(8).max(40),
  secret: z.string().trim().min(16).max(40),
});

export const isReference = (v: string) => REFERENCE_PATTERN.test(v);
