import {
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABEL,
  REQUEST_STATES,
  REQUEST_STATE_LABEL,
  REQUEST_TYPES,
  REQUEST_TYPE_LABEL,
  type RequestPriority,
  type RequestState,
  type RequestType,
} from '../participation/input';
import { normalizeReference } from '../participation/receipt-code';

// The attention desk's rules in plain TypeScript (design §5, /admin/atencion): the state machine as the database has it
// (request_transition_ok and request_state_needs_reason, 20261106000200_participacion.sql: the screen offers only what
// the database will take, and says when a reason is needed), the inbox's filters from the address, the words of the
// status emails and of the overdue notices, and the written definition of every figure. Pure: the server, the screens
// and the tests share it. The database decides again every time.

export { REQUEST_STATES, REQUEST_STATE_LABEL, REQUEST_TYPES, REQUEST_TYPE_LABEL, REQUEST_PRIORITIES, REQUEST_PRIORITY_LABEL };
export type { RequestPriority, RequestState, RequestType };

// --- Who does what on the screens (the database decides again: this only chooses what to show) -------------------------------

type AnyRole = string;
const has = (roles: readonly AnyRole[], ...want: AnyRole[]) => roles.some((r) => want.includes(r));

/**
 * D-93 for the screens of /admin/atencion: the coordinator does everything (denuncias too); a responsible of an area and
 * the denuncias operator work their cases; the auditor and the boss read (the auditor without contacts); Administración
 * keeps the areas and the catalogues and never reads a case.
 */
export function deskAccess(roles: readonly AnyRole[]) {
  const coordinator = has(roles, 'attention_coordinator');
  return {
    /** Reads cases (what RLS gives them). */
    readsCases: has(roles, 'attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor', 'boss'),
    /** Works cases: replies, notes, states, evidence (the database decides on each case). */
    works: has(roles, 'attention_coordinator', 'reports_operator', 'complaints_operator'),
    coordinator,
    /** The figures: the coordinator, the auditor and the boss. */
    stats: has(roles, 'attention_coordinator', 'auditor', 'boss'),
    /** The CSV: the coordinator (with the contact only when asked) and the auditor (never with the contact). */
    exports: has(roles, 'attention_coordinator', 'auditor'),
    exportsContacts: coordinator,
    /** Areas, their people, the categories' defaults and the desk's settings: Administración. */
    catalogs: has(roles, 'admin'),
    /** Who sees the areas screen (read only unless Administración). */
    seesAreas: has(roles, 'admin', 'attention_coordinator', 'auditor', 'boss'),
    /** The reply templates: whoever answers reads them; the coordinator writes them. */
    templates: has(roles, 'attention_coordinator', 'reports_operator', 'complaints_operator'),
    /** The desk's audit trail (who looked at a contact, who exported, what changed): the auditor and Administración. */
    auditLog: has(roles, 'auditor', 'admin'),
  };
}
export type DeskAccess = ReturnType<typeof deskAccess>;

/** The kinds of request this person can find (a denuncia only for the coordinator and the denuncias operator). */
export function typesFor(roles: readonly AnyRole[]): RequestType[] {
  if (has(roles, 'attention_coordinator')) return [...REQUEST_TYPES];
  const others = has(roles, 'reports_operator', 'auditor', 'boss');
  const denuncias = has(roles, 'complaints_operator');
  return REQUEST_TYPES.filter((t) => (t === 'denuncia' ? denuncias : others));
}

// --- The state machine --------------------------------------------------------------------------------------------------

/** recibido → en_revision → asignado → en_atencion → resuelto → cerrado, plus requiere_informacion, derivado, no_procede. */
export const TRANSITIONS: Record<RequestState, readonly RequestState[]> = {
  recibido: ['en_revision', 'asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'no_procede'],
  en_revision: ['asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'no_procede'],
  asignado: ['en_revision', 'en_atencion', 'requiere_informacion', 'derivado', 'no_procede'],
  en_atencion: ['asignado', 'resuelto', 'requiere_informacion', 'derivado', 'no_procede'],
  requiere_informacion: ['en_revision', 'asignado', 'en_atencion', 'no_procede', 'cerrado'],
  derivado: ['en_atencion', 'resuelto', 'cerrado'],
  resuelto: ['cerrado', 'en_atencion'],
  cerrado: ['en_revision'],
  no_procede: ['en_revision'],
};

/** States where the case is finished (the figures' «pending» is everything else). */
export const DONE_STATES: readonly RequestState[] = ['resuelto', 'cerrado', 'no_procede'];
export const OPEN_STATES: readonly RequestState[] = REQUEST_STATES.filter((s) => !DONE_STATES.includes(s));

export const canMove = (from: RequestState, to: RequestState) => TRANSITIONS[from]?.includes(to) ?? false;

/** Reopening: from a finished state back to work. */
export const isReopen = (from: RequestState, to: RequestState) => DONE_STATES.includes(from) && !DONE_STATES.includes(to);

/** Where the database asks for the reason (for «resuelto» it is the justification of the resolution). */
export function needsReason(from: RequestState, to: RequestState): boolean {
  return ['requiere_informacion', 'derivado', 'no_procede', 'cerrado', 'resuelto'].includes(to) || DONE_STATES.includes(from);
}

export type NextState = { state: RequestState; label: string; needsReason: boolean; reopen: boolean; needsNote: boolean };

/** What a case can move to from here, in the machine's order. */
export function nextStates(from: RequestState): NextState[] {
  return (TRANSITIONS[from] ?? []).map((to) => ({
    state: to,
    label: isReopen(from, to) ? `Reabrir: ${REQUEST_STATE_LABEL[to]}` : REQUEST_STATE_LABEL[to],
    needsReason: needsReason(from, to),
    reopen: isReopen(from, to),
    // «Requiere información» is the question itself, and the person reads it.
    needsNote: to === 'requiere_informacion',
  }));
}

/** The label of the reason's field for this move (what the team writes, never read by the citizen). */
export function reasonLabel(from: RequestState, to: RequestState): string {
  if (to === 'resuelto') return 'Cómo se resolvió (justificación)';
  if (isReopen(from, to)) return 'Por qué se reabre';
  if (to === 'derivado') return 'A quién se derivó y por qué';
  if (to === 'no_procede') return 'Por qué no procede';
  if (to === 'cerrado') return 'Por qué se cierra';
  if (to === 'requiere_informacion') return 'Qué información hace falta';
  return 'Motivo';
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export const STATE_TONE: Record<RequestState, Tone> = {
  recibido: 'accent',
  en_revision: 'info',
  asignado: 'info',
  en_atencion: 'info',
  requiere_informacion: 'warn',
  derivado: 'neutral',
  resuelto: 'ok',
  cerrado: 'neutral',
  no_procede: 'neutral',
};

export const PRIORITY_TONE: Record<RequestPriority, Tone> = { baja: 'neutral', normal: 'neutral', alta: 'warn', urgente: 'danger' };

/** The states the board shows as columns (the finished ones go together in a last column). */
export const BOARD_COLUMNS: readonly RequestState[] = ['recibido', 'en_revision', 'asignado', 'en_atencion', 'requiere_informacion', 'derivado', 'resuelto'];

// The usual next step of each state, the one the board offers with one tap (when it needs no reason and no message).
const NATURAL_NEXT: Partial<Record<RequestState, RequestState>> = {
  recibido: 'en_revision',
  en_revision: 'en_atencion',
  asignado: 'en_atencion',
  requiere_informacion: 'en_revision',
  derivado: 'en_atencion',
};

/** The board's one-tap move: the usual next step, when it needs no reason and no note. The rest, on the case page. */
export function quickMoves(from: RequestState): NextState[] {
  const to = NATURAL_NEXT[from];
  const n = to ? nextStates(from).find((x) => x.state === to && !x.needsReason && !x.needsNote) : undefined;
  return n ? [n] : [];
}

// --- The inbox's filters (from the address, GET) ----------------------------------------------------------------------

export type InboxFilters = {
  q: string;
  type: RequestType | null;
  categoryId: string | null;
  municipalityId: string | null;
  parishId: string | null;
  sector: string;
  state: RequestState | null;
  priority: RequestPriority | null;
  /** An area's id, or «none» (no area). */
  area: string | null;
  /** A person's id, «me» (mine) or «none» (nobody). */
  assignee: string | null;
  from: string | null;
  to: string | null;
  overdue: boolean;
  /** Also the merged duplicates and the spam (hidden by default; a search by reference finds them anyway). */
  all: boolean;
  page: number;
  view: 'lista' | 'tablero';
};

export const PER_PAGE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const pick = <T extends string>(v: string, list: readonly T[]): T | null => ((list as readonly string[]).includes(v) ? (v as T) : null);
const validDay = (v: string) => (DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);

export function parseInboxFilters(sp: Record<string, string | string[] | undefined>): InboxFilters {
  const area = one(sp.area);
  const assignee = one(sp.responsable);
  const page = Number.parseInt(one(sp.pagina), 10);
  let from = validDay(one(sp.desde));
  let to = validDay(one(sp.hasta));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: one(sp.q).trim().slice(0, 80),
    type: pick(one(sp.tipo), REQUEST_TYPES),
    categoryId: isUuid(one(sp.categoria)) ? one(sp.categoria) : null,
    municipalityId: isUuid(one(sp.municipio)) ? one(sp.municipio) : null,
    parishId: isUuid(one(sp.parroquia)) ? one(sp.parroquia) : null,
    sector: one(sp.sector).trim().slice(0, 80),
    state: pick(one(sp.estado), REQUEST_STATES),
    priority: pick(one(sp.prioridad), REQUEST_PRIORITIES),
    area: area === 'ninguna' ? 'none' : isUuid(area) ? area : null,
    assignee: assignee === 'yo' ? 'me' : assignee === 'nadie' ? 'none' : isUuid(assignee) ? assignee : null,
    from,
    to,
    overdue: one(sp.vencidas) === '1',
    all: one(sp.ver) === 'todo',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
    view: one(sp.vista) === 'tablero' ? 'tablero' : 'lista',
  };
}

/** The same filters back as an address (empty ones left out), with some changed: pagination, the view, the board. */
export function inboxQuery(f: InboxFilters, over: Partial<InboxFilters> = {}): string {
  const g = { ...f, ...over };
  const p = new URLSearchParams();
  const set = (k: string, v: string | null | undefined) => {
    if (v) p.set(k, v);
  };
  set('q', g.q);
  set('tipo', g.type);
  set('categoria', g.categoryId);
  set('municipio', g.municipalityId);
  set('parroquia', g.parishId);
  set('sector', g.sector);
  set('estado', g.state);
  set('prioridad', g.priority);
  set('area', g.area === 'none' ? 'ninguna' : g.area);
  set('responsable', g.assignee === 'me' ? 'yo' : g.assignee === 'none' ? 'nadie' : g.assignee);
  set('desde', g.from);
  set('hasta', g.to);
  if (g.overdue) p.set('vencidas', '1');
  if (g.all) p.set('ver', 'todo');
  if (g.page > 1) p.set('pagina', String(g.page));
  if (g.view === 'tablero') p.set('vista', 'tablero');
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Whether any filter is on (besides the page and the view). */
export function hasFilters(f: InboxFilters): boolean {
  return !!(f.q || f.type || f.categoryId || f.municipalityId || f.parishId || f.sector || f.state || f.priority || f.area || f.assignee || f.from || f.to || f.overdue || f.all);
}

/** A search that is a reference («ac-2026-k7qm2h», «AC2026K7QM2H»), normalized; or null (then it searches the title). */
export function referenceOf(q: string): string | null {
  return normalizeReference(q);
}

/** A partial reference (at least «AC-2026-K»): searched as the start of the code. */
export function referencePrefix(q: string): string | null {
  const raw = q.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^AC\d{4}[0-9A-Z]{1,5}$/.test(raw)) return null;
  return `AC-${raw.slice(2, 6)}-${raw.slice(6).replace(/[OIL]/g, (c) => (c === 'O' ? '0' : '1'))}`;
}

// --- Times and figures ----------------------------------------------------------------------------------------------------

/** Hours as people say them: «45 min», «5 h», «2,5 días». */
export function fmtHours(h: number | string | null | undefined): string {
  if (h === null || h === undefined || h === '') return '—';
  const n = typeof h === 'string' ? Number(h) : h;
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} min`;
  if (n < 48) return `${(Math.round(n * 10) / 10).toLocaleString('es-VE')} h`;
  return `${(Math.round((n / 24) * 10) / 10).toLocaleString('es-VE')} días`;
}

/** Each figure with its written definition (the screen and docs/MANUAL-ATENCION.md say the same). */
export const STAT_DEFINITIONS = {
  received: 'Solicitudes que llegaron entre las dos fechas. No cuentan el spam ni las que se unieron a otro caso igual.',
  resolved: 'Solicitudes que el equipo marcó «Resuelto» entre las dos fechas, hayan llegado cuando hayan llegado.',
  pending: 'Solicitudes abiertas hoy (ni resueltas, ni cerradas, ni «No procede») que llegaron hasta la fecha final.',
  overdue: 'De las pendientes, las que ya pasaron su fecha comprometida.',
  firstResponse:
    'Desde que llegó hasta la primera respuesta del equipo: una respuesta a la persona, un pedido de información o un cambio de estado. Cuenta las que llegaron entre las fechas y ya tienen respuesta. Una nota interna no es una respuesta.',
  resolution: 'Desde que llegó hasta que el equipo la marcó «Resuelto». Cuenta las resueltas entre las fechas.',
  median: 'La mediana es el tiempo del caso del medio: la mitad tardó menos y la otra mitad más. El promedio se mueve mucho con unos pocos casos muy lentos.',
  distribution: 'Lo que llegó entre las fechas, por categoría, municipio y área. Para auditoría y el jefe, las denuncias cuentan solo en los totales por tipo y estado.',
} as const;

// --- Status emails (to the citizen, through the outbox) -------------------------------------------------------------------

export type StatusEmailKind = 'state' | 'reply' | 'info_request' | 'merged';
/** Who the email is for: who sent the request, someone who joined it («¿te sumas?») or the sender of a merged duplicate. */
export type StatusEmailRole = 'owner' | 'supporter' | 'duplicate';

/**
 * The words of a status email: what happened and where to read it, NEVER the secret, the team's notes, what the team
 * wrote or the kind of request (a shared inbox must not learn that it is a denuncia). The person reads everything in
 * «Consultar mi solicitud» with their code and secret.
 */
export function statusEmail(kind: StatusEmailKind, o: { reference: string; state?: RequestState | null; role?: StatusEmailRole }) {
  const ref = o.reference;
  const role = o.role ?? 'owner';
  const how = 'Para ver el detalle, entra a «Consultar mi solicitud» con tu código y la clave de tu comprobante. Por seguridad, la clave no va en este correo y nadie del equipo la tiene.';
  const safety = 'Esto no es un servicio de emergencias: en una emergencia, llama a los servicios de emergencia locales.';
  if (kind === 'reply') {
    return { subject: `Te respondimos: ${ref}`, title: 'Tienes una respuesta', body: [`El equipo te escribió sobre tu solicitud ${ref}.`, how, safety].join('\n') };
  }
  if (kind === 'info_request') {
    return {
      subject: `Necesitamos un dato: ${ref}`,
      title: 'Necesitamos más información',
      body: [`Para seguir con tu solicitud ${ref} necesitamos un dato más. En tu consulta verás qué hace falta y podrás responder ahí mismo.`, how, safety].join('\n'),
    };
  }
  if (kind === 'merged') {
    return {
      subject: `Tu solicitud ${ref} se unió a otra igual`,
      title: 'Tu solicitud se unió a otra igual',
      body: [`Tu solicitud ${ref} es el mismo caso que otra que ya se estaba atendiendo, y se unieron. La sigues con tu mismo código: verás cómo va el caso.`, how, safety].join('\n'),
    };
  }
  const label = o.state ? REQUEST_STATE_LABEL[o.state] : 'actualizada';
  const lead =
    role === 'supporter'
      ? `El reporte al que te sumaste (tu código: ${ref}) ahora está «${label}».`
      : role === 'duplicate'
        ? `El caso al que se unió tu solicitud ${ref} ahora está «${label}».`
        : `Tu solicitud ${ref} ahora está «${label}».`;
  const extra =
    o.state === 'resuelto'
      ? role === 'owner'
        ? 'Si no se resolvió, dínoslo desde tu consulta y la revisamos de nuevo.'
        : null
      : o.state === 'requiere_informacion' && role === 'owner'
        ? 'Necesitamos un dato más: en tu consulta verás qué hace falta.'
        : null;
  return { subject: `Tu solicitud ${ref}: ${label}`, title: 'Tu solicitud cambió de estado', body: [lead, ...(extra ? [extra] : []), how, safety].join('\n') };
}

/** Who gets a status email: a reply or a request for information only the sender; a change of state, everyone who follows the case. */
export function statusEmailRoles(kind: StatusEmailKind): StatusEmailRole[] {
  if (kind === 'state') return ['owner', 'supporter', 'duplicate'];
  return ['owner'];
}

/** The email of a contact, when the person wants to be written to (not «Que no me contacten»). */
export function contactEmail(c: { email: string | null; preferredChannel: string }): string | null {
  const e = (c.email ?? '').trim();
  return e && c.preferredChannel !== 'none' ? e : null;
}

// --- Overdue and quiet cases -----------------------------------------------------------------------------------------------

export const DEFAULT_STALE_DAYS = 5;
export type AlertReason = 'overdue' | 'stale';

/** Why an open case needs a notice today: its due date passed, or nothing moved in `staleDays` days. */
export function alertReason(c: { state: RequestState; dueAt: Date | string | null; lastActivity: Date | string }, now: Date, staleDays: number): AlertReason | null {
  if (DONE_STATES.includes(c.state)) return null;
  if (c.dueAt && new Date(c.dueAt).getTime() < now.getTime()) return 'overdue';
  if (staleDays > 0 && now.getTime() - new Date(c.lastActivity).getTime() >= staleDays * 86_400_000) return 'stale';
  return null;
}

export type DeskPerson = { id: string; coordinator: boolean; complaints: boolean; reports: boolean; areaIds: string[] };

/**
 * Who hears about it: every coordinator, and the responsible: the person it is assigned to (if they can still work it);
 * with nobody assigned, the responsibles of its area (a denuncia: the denuncias operators).
 */
export function alertRecipients(c: { type: RequestType; assigneeId: string | null; areaId: string | null }, staff: DeskPerson[]): string[] {
  const out = new Set(staff.filter((p) => p.coordinator).map((p) => p.id));
  const denuncia = c.type === 'denuncia';
  const canWork = (p: DeskPerson) => p.coordinator || (denuncia ? p.complaints : p.reports && (p.id === c.assigneeId || (!!c.areaId && p.areaIds.includes(c.areaId))));
  const assignee = c.assigneeId ? staff.find((p) => p.id === c.assigneeId) : undefined;
  if (assignee && canWork(assignee)) out.add(assignee.id);
  else for (const p of staff) if (denuncia ? p.complaints : p.reports && !!c.areaId && p.areaIds.includes(c.areaId)) out.add(p.id);
  return [...out];
}

/** The notice's words: the code, never the citizen's words or data (a phone's lock screen shows it). */
export function alertNotice(c: { reference: string; reason: AlertReason; staleDays: number; type: RequestType }) {
  const what = c.type === 'denuncia' ? 'Denuncia' : 'Solicitud';
  return c.reason === 'overdue'
    ? { title: `${what} vencida: ${c.reference}`, body: 'Pasó su fecha comprometida y sigue abierta.' }
    : { title: `${what} sin movimiento: ${c.reference}`, body: `Lleva ${c.staleDays} días o más sin cambios ni mensajes.` };
}

// --- Words of the timeline ---------------------------------------------------------------------------------------------------

export const MESSAGE_LABEL: Record<'internal_note' | 'public_reply' | 'info_request' | 'citizen_message', string> = {
  internal_note: 'Nota interna',
  public_reply: 'Respuesta a la persona',
  info_request: 'Pedido de información',
  citizen_message: 'Mensaje de la persona',
};

export const REDACT_FIELDS = ['title', 'description', 'location_reference', 'sector', 'location'] as const;
export type RedactField = (typeof REDACT_FIELDS)[number];
export const REDACT_FIELD_LABEL: Record<RedactField, string> = {
  title: 'El título',
  description: 'La descripción',
  location_reference: 'El punto de referencia',
  sector: 'La parroquia, localidad o sector',
  location: 'La ubicación en el mapa',
};

/** Initials as «lo atendido» accepts them without the person's permission for their name: «María Pérez» → «M. P.». */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => `${w.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase()}.`)
    .join(' ');
}
