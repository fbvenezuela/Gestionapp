import type { RequestState, RequestType } from '@/lib/participation/input';
import type { TimelineItem } from '@/lib/web/participation';

// The participation pages' words (D-92, design §4): what each kind of request is for, what to write in it, what each
// state means for the person who sent it and what comes next. Plain, short and respectful; no promised times (the team
// sets each due date) and never an emergency number (none is invented). Pure: server and browser components share it.

export const EMERGENCY_TEXT = 'Esto no es un servicio de emergencias. En una emergencia, llama a los servicios de emergencia locales.';
export const DENUNCIA_TEXT =
  'Tu denuncia es privada de punta a punta: solo la leen el operador de denuncias y la coordinación de atención, y nunca se publica. Si es un delito, acude también a las autoridades competentes.';

/** How each kind is offered (the form's first step and the «¿Qué quieres hacer?» of /atencion). */
export const TYPE_COPY: Record<RequestType, { label: string; action: string; hint: string }> = {
  reporte: { label: 'Reporte', action: 'Reportar un problema', hint: 'Algo que falla en tu comunidad: agua, luz, vialidad, aseo, salud, escuelas…' },
  peticion: { label: 'Petición', action: 'Hacer una petición', hint: 'Pedir algo al despacho: una ayuda, un trámite o algo para la comunidad.' },
  acotacion: { label: 'Acotación', action: 'Dejar una acotación', hint: 'Una opinión u observación sobre la gestión o una obra.' },
  sugerencia: { label: 'Sugerencia', action: 'Proponer una idea', hint: 'Una idea para mejorar algo.' },
  reconocimiento: { label: 'Reconocimiento', action: 'Agradecer algo', hint: 'Contar algo que se hizo bien.' },
  denuncia: { label: 'Denuncia', action: 'Hacer una denuncia', hint: 'Un hecho grave. Es privada de punta a punta.' },
};

/** What to write: the title's example and what the description should tell. */
export const DETAIL_COPY: Record<RequestType, { title: string; description: string }> = {
  reporte: { title: 'Por ejemplo: «Hueco grande en la avenida principal».', description: 'Qué pasa, desde cuándo y a quién afecta.' },
  peticion: { title: 'Por ejemplo: «Jornada de vacunación para el sector».', description: 'Qué pides, para quién y dónde.' },
  acotacion: { title: 'Por ejemplo: «Faltan señales en los desvíos de la obra».', description: 'Tu opinión u observación, con el detalle que haga falta.' },
  sugerencia: { title: 'Por ejemplo: «Publicar las rutas del transporte».', description: 'Tu idea y para qué serviría.' },
  reconocimiento: { title: 'Por ejemplo: «Gracias por arreglar la cancha».', description: 'Qué se hizo bien y, si quieres, quién lo hizo.' },
  denuncia: { title: 'Una frase corta que diga de qué se trata.', description: 'Qué pasó, cuándo y dónde, de forma aproximada.' },
};

/** Each state in the words of the person who sent the request: a name and what it means for them. */
export const STATE_PLAIN: Record<RequestState, { label: string; text: string; tone: 'wait' | 'work' | 'ask' | 'done' | 'stop' }> = {
  recibido: { label: 'Recibida', text: 'Tu solicitud llegó bien y está en la fila para revisarla.', tone: 'wait' },
  en_revision: { label: 'En revisión', text: 'El equipo la está leyendo para saber quién la atiende.', tone: 'work' },
  asignado: { label: 'Asignada', text: 'Ya tiene un área responsable que la va a atender.', tone: 'work' },
  en_atencion: { label: 'En atención', text: 'El área responsable está trabajando en ella.', tone: 'work' },
  requiere_informacion: { label: 'Necesitamos más información', text: 'El equipo te pidió algo más. Respóndele en «Agregar información».', tone: 'ask' },
  derivado: { label: 'Derivada', text: 'Se envió al organismo que la puede atender. Aquí verás lo que te cuenten.', tone: 'work' },
  resuelto: { label: 'Resuelta', text: 'El equipo la marcó como resuelta. Cuéntanos si de verdad se resolvió.', tone: 'done' },
  cerrado: { label: 'Cerrada', text: 'La solicitud terminó y ya no recibe movimientos.', tone: 'stop' },
  no_procede: { label: 'No procede', text: 'El equipo explicó por qué no se puede atender por esta vía.', tone: 'stop' },
};

/** The usual path, for «Qué pasa después» (requiere información and derivado can happen on the way). */
export const USUAL_PATH: RequestState[] = ['recibido', 'en_revision', 'asignado', 'en_atencion', 'resuelto'];

/** A line of the shared timeline, in plain words. */
export function timelineLine(t: Pick<TimelineItem, 'kind' | 'state'>): string {
  switch (t.kind) {
    case 'created':
      return 'Enviaste tu solicitud';
    case 'state':
      return t.state ? `Pasó a «${STATE_PLAIN[t.state]?.label ?? t.state}»` : 'Cambió de estado';
    case 'merged':
      return 'Se unió con otra solicitud del mismo problema';
    case 'citizen_confirmed':
      return 'Confirmaste que se resolvió';
    case 'citizen_not_resolved':
      return 'Dijiste que no está resuelto';
    case 'public_reply':
      return 'Respuesta del equipo';
    case 'info_request':
      return 'El equipo te pide más información';
    case 'citizen_message':
      return 'Tu mensaje';
    case 'support':
      return 'Te sumaste a este reporte';
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
