// Mensajes (R3, D-49 to D-59): the pure pieces the screens share, on the server and in the phone. No React, no
// database: names and roles as the screens say them, the shapes the pages and the GET routes hand to the client, what
// a read-only conversation says, and how Enter behaves in the box. The rules themselves (what a message may say, who
// talks to whom) are in src/lib/domain/chat.ts; the database decides.
import type { Role } from '@/lib/roles';
import { CHAT_ROLE_NAME, type ChatPairRole } from '@/lib/domain/chat';
import { dt, fmtAt } from '@/lib/time';

// ---------------------------------------------------------------------------------------------------------------
// Names and roles
// ---------------------------------------------------------------------------------------------------------------
// The short names of the team's roles in Mensajes (ROLE_LABEL says «Director de despacho»: too long for a chip).
export const CHAT_ROLE_SHORT: Record<'boss' | ChatPairRole, string> = { boss: 'Jefe', ...CHAT_ROLE_NAME };
const ORDER: ('boss' | ChatPairRole)[] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'];

/** The team roles of a person, short and in a fixed order: «Política · IVT». Empty for nobody of the team. */
export function chatRoles(roles: readonly Role[]): string {
  return ORDER.filter((r) => roles.includes(r)).map((r) => CHAT_ROLE_SHORT[r]).join(' · ');
}

/** The first word of a name («Daniela Pernía» → «Daniela»). */
export function firstName(name: string): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

// A link to the platform inside a message that the reader cannot open (D-54).
export const LINK_LOCKED = 'Algo que no puedes abrir';

// ---------------------------------------------------------------------------------------------------------------
// What the server hands to the screens (pages and /api/mensajes/*)
// ---------------------------------------------------------------------------------------------------------------
export type ChatMember = { id: string; name: string; roles: Role[]; active: boolean };

// A link to the platform in a message, with what it is («Evento») and the title as the READER sees it (null: «Algo
// que no puedes abrir»).
export type ChatLink = { href: string; kind: string; title: string | null };

// What each kind of link is called on its little card.
export const LINK_KIND: Record<string, string> = {
  event: 'Evento',
  piece: 'Pieza',
  obra: 'Obra',
  report: 'Reporte',
  publication: 'Publicación',
  tweets: 'Tweets',
  chat: 'Mensajes',
};

// One message as the reader sees it. body null = «Mensaje oculto» (it had a date of the agenda and the reader does
// not know the agenda, D-52): only who and when travel, never the text.
export type ChatItem = {
  id: string;
  authorId: string;
  author: string;
  role: string;
  body: string | null;
  createdAt: string;
  links: ChatLink[];
};

// Why there is no box to write in (D-50, D-51, D-59). null = there is one.
export type ReadOnly =
  | { reason: 'needs-ack' }
  | { reason: 'boss-reader' }
  | { reason: 'only-boss' }
  | { reason: 'nobody-left' }
  | { reason: 'pair-closed'; pair: [string, string] }
  | { reason: 'closed' };

export const CHAT_NEEDS_ACK = 'Para escribir, acepta el aviso.';

/** The line in place of the box. */
export function readOnlyText(r: ReadOnly): string {
  switch (r.reason) {
    case 'needs-ack':
      return CHAT_NEEDS_ACK;
    case 'boss-reader':
      return 'Estás leyendo como jefe. Aquí no escribes.';
    case 'only-boss':
      return 'Solo el jefe escribe en esta conversación.';
    case 'nobody-left':
      return 'Ya no queda nadie activo en esta conversación.';
    case 'pair-closed':
      return `El jefe cerró los mensajes entre ${r.pair[0]} y ${r.pair[1]}. Puedes leer lo anterior.`;
    default:
      return 'Ya no puedes escribir en esta conversación.';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Dates (Táchira's time, plain spaces: the same text on the server and in the phone)
// ---------------------------------------------------------------------------------------------------------------
/** The day of a message, for the separators: «lunes 26 de octubre». */
export function chatDay(iso: string): string {
  return fmtAt(dt(iso), "cccc d 'de' LLLL");
}

/** Each message with the day separator that goes before it (the first of each day in Táchira), or null. */
export function withDays<T extends { createdAt: string }>(items: readonly T[]): { item: T; day: string | null }[] {
  let last = '';
  return items.map((item) => {
    const key = chatDayKey(item.createdAt);
    const day = key !== last ? chatDay(item.createdAt) : null;
    last = key;
    return { item, day };
  });
}

/** A key per day in Táchira (two messages of the same day share it). */
export function chatDayKey(iso: string): string {
  return dt(iso)?.toISODate() ?? '';
}

// ---------------------------------------------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------------------------------------------
/**
 * Whether this key sends the message (U12). On a phone (coarse pointer) Enter is a new line and only the button
 * sends: the keyboard's Enter is too close to the letters. With a mouse and keyboard Enter sends and Shift+Enter is a
 * new line. Never while an accent or a word is being composed (IME).
 */
export function enterSends(e: { key: string; shiftKey: boolean; isComposing?: boolean }, coarse: boolean): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse;
}

/** A new id for a message (the message's own id in the database: a retried send never duplicates). Also over plain
 * http, where crypto.randomUUID() does not exist. */
export function newClientId(c: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Near the limit, the box shows how many letters are left.
export const CHAT_COUNTER_FROM = 1800;
