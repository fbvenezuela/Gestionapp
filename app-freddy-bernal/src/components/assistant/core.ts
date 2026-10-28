// The assistant window's pure logic (docs/ASISTENTE.md «La ventana», manual §12): the thread
// kept in sessionStorage, what the server's answer means for the window, and where the button
// sits. No React and no I/O here, so it can be tested without a browser.

export const ASSISTANT_URL = '/api/asistente';
export const SCOPE = 'equipo' as const;
/** Same cap as the server (MAX_QUESTION in src/lib/assistant): also enforced in the field. */
export const MAX_QUESTION = 1500;
/** When the counter shows up under the field. */
export const COUNTER_FROM = 1200;
/** Messages kept in the tab (display only: the server keeps the real thread). */
export const MAX_STORED = 80;
export const REQUEST_TIMEOUT_MS = 45_000;

export const NOTE = 'No escribas aquí fechas, horas ni direcciones de la agenda.';
/** Under the field, always (R3, D-50, S8): what is asked here is not private, and 360 never reads Mensajes. */
export const panelNote = (name: string) => `Administración ve lo que le preguntas a ${name.trim() || 'el asistente'}; no pegues aquí mensajes del equipo.`;
export const DEMO_LABEL = 'modo demostración, sin IA';
/** When the request fails we did NOT tell the team, so we don't say we did. */
export const FAILED_TEXT = 'No pude consultar bien ahora mismo. Si es urgente, escríbele a administración.';
export const DEGRADED_LABEL = 'No pude consultar bien';

export type GoTo = { href: string; label: string };
/** A tutorial to start (R3, D-46): its address, or null when its screen needs an id (built only on that screen). */
export type TutorialLink = { id: string; label: string; href: string | null };
export type ChatMsg = {
  id: string;
  who: 'persona' | 'asistente';
  text: string;
  at: number;
  goTo?: GoTo | null;
  tutorial?: TutorialLink | null;
  /** The server marked the answer degraded, or the request failed: same notice for both. */
  degraded?: boolean;
  /** The request never got a real answer: offers «Volver a intentar» with this question. */
  retry?: string;
  model?: string;
};
export type Thread = { v: 1; userId: string; scope: typeof SCOPE; conversationId: string | null; messages: ChatMsg[] };

// ---------------------------------------------------------------------------
// The thread in sessionStorage (it lasts as long as the tab). Saved with the user and the
// scope: the team's thread is never shown to someone else who signs in on the same tab.
// Every access is wrapped: private mode or blocked storage make it throw.
// ---------------------------------------------------------------------------
export type SessionKV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export const THREAD_EVENT = 'fb:asistente';

export function threadKey(userId: string, scope: string = SCOPE) {
  return `fb:asistente:${scope}:${userId}`;
}

export function emptyThread(userId: string): Thread {
  return { v: 1, userId, scope: SCOPE, conversationId: null, messages: [] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanMsg(m: unknown): ChatMsg | null {
  if (!m || typeof m !== 'object') return null;
  const x = m as Record<string, unknown>;
  if ((x.who !== 'persona' && x.who !== 'asistente') || typeof x.text !== 'string' || typeof x.id !== 'string') return null;
  const goTo = safeGoTo(x.goTo);
  const tutorial = safeTutorial(x.tutorial);
  return {
    id: x.id,
    who: x.who,
    text: x.text.slice(0, 4000),
    at: typeof x.at === 'number' ? x.at : 0,
    ...(goTo ? { goTo } : {}),
    ...(tutorial ? { tutorial } : {}),
    ...(x.degraded === true ? { degraded: true } : {}),
    ...(typeof x.retry === 'string' && x.retry ? { retry: x.retry.slice(0, MAX_QUESTION) } : {}),
    ...(typeof x.model === 'string' ? { model: x.model.slice(0, 80) } : {}),
  };
}

/** Parses what the tab stored. Anything odd, or another person's or scope's thread → empty. */
export function parseThread(raw: string | null, userId: string): Thread {
  if (!raw) return emptyThread(userId);
  try {
    const t = JSON.parse(raw) as Partial<Thread>;
    if (!t || t.v !== 1 || t.userId !== userId || t.scope !== SCOPE || !Array.isArray(t.messages)) return emptyThread(userId);
    const conversationId = typeof t.conversationId === 'string' && UUID.test(t.conversationId) ? t.conversationId : null;
    return { v: 1, userId, scope: SCOPE, conversationId, messages: t.messages.map(cleanMsg).filter((m): m is ChatMsg => !!m).slice(-MAX_STORED) };
  } catch {
    return emptyThread(userId);
  }
}

// When sessionStorage is unavailable the thread lives in memory until the page reloads.
const memory = new Map<string, string>();

export function readRaw(store: SessionKV | null, key: string): string | null {
  try {
    const v = store?.getItem(key);
    if (v != null) return v;
  } catch {
    /* blocked: memory below */
  }
  return memory.get(key) ?? null;
}

export function writeThread(store: SessionKV | null, t: Thread): void {
  const key = threadKey(t.userId, t.scope);
  const raw = JSON.stringify({ ...t, messages: t.messages.slice(-MAX_STORED) });
  memory.set(key, raw);
  try {
    store?.setItem(key, raw);
  } catch {
    /* blocked or full: memory keeps it for this visit */
  }
}

/** «Empezar de nuevo»: drops the thread the window holds. Nothing is deleted in the database. */
export function clearThread(store: SessionKV | null, userId: string): void {
  const key = threadKey(userId);
  memory.delete(key);
  try {
    store?.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

let seq = 0;
export function msgId(now = Date.now()) {
  seq = (seq + 1) % 1_000_000;
  return `${now.toString(36)}-${seq.toString(36)}`;
}

export function addMessage(t: Thread, m: Omit<ChatMsg, 'id' | 'at'> & { id?: string; at?: number }, now = Date.now()): Thread {
  const msg: ChatMsg = { ...m, id: m.id ?? msgId(now), at: m.at ?? now };
  return { ...t, messages: [...t.messages, msg].slice(-MAX_STORED) };
}

/** There is a conversation in progress (the button shows a dot). */
export function inProgress(t: Thread): boolean {
  return t.messages.some((m) => m.who === 'persona');
}

/** The last real answer came from the demo brain (no AI). */
export function isDemo(t: Thread): boolean {
  const last = [...t.messages].reverse().find((m) => m.who === 'asistente' && m.model);
  return last?.model === 'local';
}

// ---------------------------------------------------------------------------
// The server's answer. Contract (src/lib/assistant/index.ts → toApi): { respuesta, ambito,
// modelo, ms, degradado, hizo, ir: {href,label} | null, tutorial: {id, etiqueta, href|null} |
// null, conversacion }, or { error } with 401 / 403 / 400 / 404.
// ---------------------------------------------------------------------------

/** Only a path inside this app. A button that leaves the app (or runs code) is never drawn. */
export function safeGoTo(v: unknown): GoTo | null {
  if (!v || typeof v !== 'object') return null;
  const { href, label } = v as { href?: unknown; label?: unknown };
  if (typeof href !== 'string' || typeof label !== 'string' || !label.trim()) return null;
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\s]/.test(href) || href.length > 300) return null;
  return { href, label: label.trim().slice(0, 60) };
}

const TUTORIAL_ID = /^[a-z0-9-]{1,40}$/;

/** A tutorial the window may start: a known shape of id, a label, and an in-app address (or none). Accepts the
 * server's keys ({ id, etiqueta, href }) and the tab's ({ id, label, href }). */
export function safeTutorial(v: unknown): TutorialLink | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as { id?: unknown; etiqueta?: unknown; label?: unknown; href?: unknown };
  const label = typeof x.etiqueta === 'string' ? x.etiqueta : x.label;
  if (typeof x.id !== 'string' || !TUTORIAL_ID.test(x.id) || typeof label !== 'string' || !label.trim()) return null;
  if (x.href == null) return { id: x.id, label: label.trim().slice(0, 60), href: null };
  const go = safeGoTo({ href: x.href, label });
  return go ? { id: x.id, label: go.label, href: go.href } : null;
}

export type Outcome =
  | { ok: true; text: string; degraded: boolean; goTo: GoTo | null; tutorial: TutorialLink | null; model: string; conversationId: string | null }
  | { ok: false; text: string; degraded: boolean; goTo: GoTo | null; retry: boolean };

/**
 * What the window shows for a response. status 0 = no response at all (no signal, timeout).
 * A breakdown (no answer, 5xx, unreadable) shows the same degraded notice the server uses;
 * refusals (signed out, not allowed, too long) show the server's own short sentence.
 */
export function fromApi(status: number, body: unknown): Outcome {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && typeof b.respuesta === 'string' && b.respuesta.trim()) {
    return {
      ok: true,
      text: b.respuesta,
      degraded: b.degradado === true,
      goTo: b.degradado === true ? null : safeGoTo(b.ir),
      tutorial: b.degradado === true ? null : safeTutorial(b.tutorial),
      model: typeof b.modelo === 'string' ? b.modelo : '',
      conversationId: typeof b.conversacion === 'string' && UUID.test(b.conversacion) ? b.conversacion : null,
    };
  }
  const error = typeof b.error === 'string' && b.error.trim() ? b.error.trim().slice(0, 300) : '';
  if (status === 401) return { ok: false, text: error || 'Tienes que entrar de nuevo.', degraded: false, goTo: { href: '/entrar', label: 'Entrar de nuevo' }, retry: false };
  if ((status === 400 || status === 403 || status === 404) && error) return { ok: false, text: error, degraded: false, goTo: null, retry: false };
  return { ok: false, text: FAILED_TEXT, degraded: true, goTo: null, retry: true };
}

// ---------------------------------------------------------------------------
// The screen the person is on, as 360 may know it (R3, design §8.1): the pattern only. An id (any uuid) becomes
// [id], a role's guide (/ayuda/<slug>) becomes /ayuda/[id]; never the query, the hash or anything typed.
// ---------------------------------------------------------------------------
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCREEN = /^\/[a-z0-9\-/[\]]{1,80}$/;

export function screenPattern(pathname: string | null | undefined): string | null {
  const path = String(pathname ?? '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const segs = path.split('/').map((seg, i, all) => (UUID_SEGMENT.test(seg) || (i === 2 && all[1] === 'ayuda' && all.length === 3 && !['flujos', 'administracion'].includes(seg)) ? '[id]' : seg));
  const out = segs.join('/');
  return SCREEN.test(out) ? out : null;
}

/** Where a tutorial button leads: its address, or (a screen with an id) this very screen with ?tutorial=<id>, only
 * when the person is on that screen (`pattern` is the tutorial's screen, without its tab). */
export function tutorialHref(t: TutorialLink, pathname: string, search: string, pattern: string | null): string | null {
  if (t.href) return t.href;
  if (!pattern || screenPattern(pathname) !== pattern) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.set('tutorial', t.id);
  return `${pathname}?${params.toString()}`;
}

/** «Ir a Hoy», «Ir a Por aprobar»; labels that already say what they do («Abrir la pieza», «Entrar de nuevo») stay. */
export function goToText(label: string): string {
  return /^(abrir|ver|ir|entrar)\b/i.test(label) ? label : `Ir a ${label}`;
}

export function canSend(text: string, waiting: boolean): boolean {
  const t = text.trim();
  return !waiting && t.length > 0 && t.length <= MAX_QUESTION;
}

/** The face on the button: the emoji, or else the name's first letter. */
export function faceOf(p: { name: string; emoji?: string | null }): string {
  const e = p.emoji?.trim();
  if (e) return e;
  return (Array.from(p.name.trim())[0] ?? '?').toLocaleUpperCase('es');
}

// ---------------------------------------------------------------------------
// Where the button sits. Above the phone's bottom bar (64 px + safe area, in CSS) and above
// any sticky action bar of the page (forms keep «Guardar» stuck to the bottom): the lift is
// how far from the bottom of the screen the highest of those bars reaches.
// ---------------------------------------------------------------------------
export type StickyBox = { position: string; bottom: string; height: number; visible: boolean };

export function liftFrom(boxes: StickyBox[]): number {
  let max = 0;
  for (const b of boxes) {
    if (b.position !== 'sticky' || !b.visible) continue;
    const bottom = Number.parseFloat(b.bottom);
    if (!Number.isFinite(bottom)) continue;
    max = Math.max(max, Math.ceil(bottom + b.height));
  }
  return max;
}
