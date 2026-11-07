import { CITIZEN_STATE_LABEL, REQUEST_TYPE_HINT, REQUEST_TYPE_LABEL, type RequestState, type RequestType } from '@/lib/participation/input';
import type { TimelineItem } from '@/lib/web/participation';

// The participation pages' words (D-92, design §4): what each kind of request is for, what to write in it, what each
// state means for the person who sent it and what comes next. The citizen is «usted»; whoever attends is «el personal
// de atención», Atención ciudadana or an impersonal «se» (copy audit §1, §6). No promised times (each due date is set
// case by case) and never an emergency number (none is invented). The two legal notices are one text each, in
// src/lib/participation/notices.ts. Pure: server and browser components share it.

export {
  ANTI_FRAUD_NOTICE, DENUNCIA_LEAD, DENUNCIA_NOTICE, DENUNCIA_PLACE, DENUNCIA_REST, EMERGENCY_LEAD, EMERGENCY_NOTICE, EMERGENCY_REST, PHOTO_CLEANING,
  PUBLICATION_NOTICE,
} from '@/lib/participation/notices';

const ACTION: Record<RequestType, string> = {
  reporte: 'Hacer un reporte',
  peticion: 'Hacer una petición',
  acotacion: 'Enviar una observación',
  sugerencia: 'Enviar una sugerencia',
  reconocimiento: 'Enviar un reconocimiento',
  denuncia: 'Hacer una denuncia',
};

/** How each kind is offered (the form's first step and «Tipos de solicitud» of /atencion): one hint per kind, the same
 * the home page's block shows (REQUEST_TYPE_HINT). */
export const TYPE_COPY: Record<RequestType, { label: string; action: string; hint: string }> = Object.fromEntries(
  (Object.keys(ACTION) as RequestType[]).map((t) => [t, { label: REQUEST_TYPE_LABEL[t], action: ACTION[t], hint: REQUEST_TYPE_HINT[t] }]),
) as Record<RequestType, { label: string; action: string; hint: string }>;

/** What to write: the title's example and what the description should tell. */
export const DETAIL_COPY: Record<RequestType, { title: string; description: string }> = {
  reporte: { title: 'Por ejemplo: «Hueco grande en la avenida principal».', description: 'Describa el problema, desde cuándo ocurre y a quién afecta.' },
  peticion: { title: 'Por ejemplo: «Jornada de vacunación para el sector».', description: 'Indique qué solicita, para quién y dónde.' },
  acotacion: { title: 'Por ejemplo: «Faltan señales en los desvíos de la obra».', description: 'Escriba su observación.' },
  sugerencia: { title: 'Por ejemplo: «Publicar las rutas del transporte».', description: 'Describa su propuesta y para qué serviría.' },
  reconocimiento: { title: 'Por ejemplo: «Gracias por arreglar la cancha».', description: 'Indique qué se hizo bien y, si lo desea, quién lo hizo.' },
  denuncia: { title: 'Una frase corta que resuma el hecho.', description: 'Indique qué ocurrió, cuándo y dónde, de forma aproximada.' },
};

/** Each state as the person who sent the request reads it: its name (CITIZEN_STATE_LABEL) and what it means for them. */
export const STATE_PLAIN: Record<RequestState, { label: string; text: string; tone: 'wait' | 'work' | 'ask' | 'done' | 'stop' }> = {
  recibido: { label: CITIZEN_STATE_LABEL.recibido, text: 'Su solicitud fue recibida y está en espera de revisión.', tone: 'wait' },
  en_revision: { label: CITIZEN_STATE_LABEL.en_revision, text: 'El personal de atención la está revisando para asignarla.', tone: 'work' },
  asignado: { label: CITIZEN_STATE_LABEL.asignado, text: 'Ya tiene un área responsable.', tone: 'work' },
  en_atencion: { label: CITIZEN_STATE_LABEL.en_atencion, text: 'El área responsable está trabajando en ella.', tone: 'work' },
  requiere_informacion: { label: CITIZEN_STATE_LABEL.requiere_informacion, text: 'Se le pidió información adicional. Puede responder más abajo.', tone: 'ask' },
  derivado: { label: CITIZEN_STATE_LABEL.derivado, text: 'Se remitió al organismo que puede atenderla. Aquí verá sus respuestas.', tone: 'work' },
  resuelto: { label: CITIZEN_STATE_LABEL.resuelto, text: 'Se marcó como resuelta. Usted puede confirmar si el problema se resolvió.', tone: 'done' },
  cerrado: { label: CITIZEN_STATE_LABEL.cerrado, text: 'La solicitud finalizó y no admite nuevos movimientos.', tone: 'stop' },
  no_procede: { label: CITIZEN_STATE_LABEL.no_procede, text: 'Se explicó por qué no puede atenderse por esta vía.', tone: 'stop' },
};

/** The usual path, for «Estados de una solicitud» (requiere información and derivado can happen on the way). */
export const USUAL_PATH: RequestState[] = ['recibido', 'en_revision', 'asignado', 'en_atencion', 'resuelto'];

/** A line of the shared timeline, in plain words. */
export function timelineLine(t: Pick<TimelineItem, 'kind' | 'state'>): string {
  switch (t.kind) {
    case 'created':
      return 'Solicitud enviada';
    case 'state':
      return t.state ? `Pasó a «${STATE_PLAIN[t.state]?.label ?? t.state}»` : 'Cambió de estado';
    case 'merged':
      return 'Se unió a otra solicitud sobre el mismo problema';
    case 'citizen_confirmed':
      return 'Usted confirmó que se resolvió';
    case 'citizen_not_resolved':
      return 'Usted indicó que no está resuelto';
    case 'public_reply':
      return 'Respuesta de Atención ciudadana';
    case 'info_request':
      return 'Solicitud de información';
    case 'citizen_message':
      return 'Su mensaje';
    case 'support':
      return 'Apoyo registrado';
    default:
      return 'Movimiento';
  }
}

/** «1 reporte» / «3 reportes». */
export const reportsCount = (n: number) => (n === 1 ? '1 reporte' : `${n} reportes`);

/** Spanish dates for the citizen (Táchira's calendar). */
const DATE = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' });
const DATE_TIME = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas',
});
export const longDate = (iso: string | Date) => DATE.format(typeof iso === 'string' ? new Date(iso) : iso);
export const longDateTime = (iso: string | Date) => DATE_TIME.format(typeof iso === 'string' ? new Date(iso) : iso).replace(/ | /g, ' ');

/** A plain date «YYYY-MM-DD» (no time zone shift: it is a day, not an instant). */
export function dayDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Today in Táchira as «YYYY-MM-DD» (the browser's clock read in Táchira's time zone). */
export function tachiraToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Caracas' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** «2,4 MB» / «380 KB». */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
