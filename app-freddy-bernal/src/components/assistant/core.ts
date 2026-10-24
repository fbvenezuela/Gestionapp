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
export const DEMO_LABEL = 'modo demostración, sin IA';
/** When the request fails we did NOT tell the team, so we don't say we did. */
export const FAILED_TEXT = 'No pude consultar bien ahora mismo. Si es urgente, escríbele a administración.';
export const DEGRADED_LABEL = 'No pude consultar bien';

export type GoTo = { href: string; label: string };
export type ChatMsg = {
  id: string;
  who: 'persona' | 'asistente';
  text: string;
  at: number;
  goTo?: GoTo | null;
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
  return {
    id: x.id,
    who: x.who,
    text: x.text.slice(0, 4000),
    at: typeof x.at === 'number' ? x.at : 0,
    ...(goTo ? { goTo } : {}),
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
// modelo, ms, degradado, hizo, ir: {href,label} | null, conversacion }, or { error } with
// 401 / 403 / 400 / 404.
// ---------------------------------------------------------------------------

/** Only a path inside this app. A button that leaves the app (or runs code) is never drawn. */
export function safeGoTo(v: unknown): GoTo | null {
  if (!v || typeof v !== 'object') return null;
  const { href, label } = v as { href?: unknown; label?: unknown };
  if (typeof href !== 'string' || typeof label !== 'string' || !label.trim()) return null;
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\s]/.test(href) || href.length > 300) return null;
  return { href, label: label.trim().slice(0, 60) };
}

export type Outcome =
  | { ok: true; text: string; degraded: boolean; goTo: GoTo | null; model: string; conversationId: string | null }
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
      model: typeof b.modelo === 'string' ? b.modelo : '',
      conversationId: typeof b.conversacion === 'string' && UUID.test(b.conversacion) ? b.conversacion : null,
    };
  }
  const error = typeof b.error === 'string' && b.error.trim() ? b.error.trim().slice(0, 300) : '';
  if (status === 401) return { ok: false, text: error || 'Tienes que entrar de nuevo.', degraded: false, goTo: { href: '/entrar', label: 'Entrar de nuevo' }, retry: false };
  if ((status === 400 || status === 403 || status === 404) && error) return { ok: false, text: error, degraded: false, goTo: null, retry: false };
  return { ok: false, text: FAILED_TEXT, degraded: true, goTo: null, retry: true };
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
