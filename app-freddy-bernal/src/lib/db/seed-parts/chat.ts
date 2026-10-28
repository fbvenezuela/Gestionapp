import { createHash } from 'node:crypto';
import type { SeedCtx } from './context';
import type { DemoUserKey } from '../seed-demo';

// Mensajes in the demo (R3, D-57, design §9.1): every direct conversation between the eight people of the team (28;
// Administración is not in Mensajes), one group, «Todo el equipo», and an unread message for each of the eight, with
// the SAME ids on every server: a conversation's id comes from who is in it (chatDirectId, chatGroupId, CHAT_TEAM_ID),
// so «Escribirle a alguien» opens the same direct on any demo server (chat_start() returns the one that exists). The
// directs with no message stay out of the list until the first one. INVENTED texts with no dates, times, days, «hoy»
// or «mañana», phones, maps or names like «Domingo»; every message still goes through chat_message_guard() (the seed is
// the system, and the guard checks phones and the agenda for the system too). Nobody of the demo has accepted the
// notice (D-59): each person sees it the first time, as with the real database. No rules of «Quién habla con quién»
// (everybody talks to everybody) and no notices.

/** The 8 people of the team in the demo (not Administración), in a fixed order. */
export const CHAT_DEMO_PEOPLE = ['boss', 'dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2'] as const satisfies readonly DemoUserKey[];

// A valid v4 uuid from a name: the same on every server (stable-ids.ts does the same with a counter).
function stableId(name: string): string {
  const h = createHash('md5').update(`fb-demo-chat:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The key chat_start() gives a direct: both ids, the lower first. */
export function chatDirectKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join(':');
}

/** The seeded direct conversation between two people (their user ids). */
export function chatDirectId(a: string, b: string): string {
  return stableId(`direct:${chatDirectKey(a, b)}`);
}

/** A seeded group, by its short name. */
export function chatGroupId(name: string): string {
  return stableId(`group:${name}`);
}

/** The seeded «Todo el equipo». */
export const CHAT_TEAM_ID = stableId('team');

type Line = [DemoUserKey, string];
type Seeded = { id: string; members: DemoUserKey[]; lines: Line[]; unreadFor: DemoUserKey[] };

export async function seedChat(ctx: SeedCtx): Promise<void> {
  const { sql, ids, at } = ctx;
  const id = (k: DemoUserKey) => ids[k];

  // 1. Every direct between the eight (28), and «Todo el equipo». As the system: the ids are ours, the rules are the
  //    same (tests/rls/chat.test.ts: each pair is allowed and chat_start() as either person returns this id).
  for (let i = 0; i < CHAT_DEMO_PEOPLE.length; i++) {
    for (let j = i + 1; j < CHAT_DEMO_PEOPLE.length; j++) {
      const [a, b] = [id(CHAT_DEMO_PEOPLE[i]), id(CHAT_DEMO_PEOPLE[j])];
      const c = chatDirectId(a, b);
      await sql.query(`insert into public.chat_conversations (id, kind, direct_key, created_by) values ($1, 'direct', $2, $3)`, [c, chatDirectKey(a, b), a]);
      await sql.query(`insert into public.chat_members (conversation_id, user_id, added_by) values ($1, $2, $2), ($1, $3, $2)`, [c, a, b]);
    }
  }
  await sql.query(`insert into public.chat_conversations (id, kind, title, created_by) values ($1, 'team', 'Todo el equipo', $2)`, [CHAT_TEAM_ID, id('boss')]);
  const group = chatGroupId('obras-y-comunidad');
  await sql.query(`insert into public.chat_conversations (id, kind, title, created_by) values ($1, 'group', 'Obras y comunidad', $2)`, [group, id('dispatch')]);
  for (const k of ['dispatch', 'politics', 'ivt'] as const) {
    await sql.query(`insert into public.chat_members (conversation_id, user_id, added_by) values ($1, $2, $3)`, [group, id(k), id('dispatch')]);
  }

  // 2. The conversations with messages (C1 to C8 of the design), oldest first. Unread for whoever did not write last.
  const direct = (a: DemoUserKey, b: DemoUserKey) => chatDirectId(id(a), id(b));
  const seeded: Seeded[] = [
    {
      id: direct('social', 'camera'), members: ['social', 'camera'], unreadFor: ['camera'],
      lines: [
        ['camera', 'Ya subí las tomas de la cancha de El Mirador, con la nota para el editor.'],
        ['social', 'Gracias. ¿Las del dron quedaron en la casilla de Dron?'],
        ['camera', 'Sí, y las de apoyo en Tomas de apoyo. El audio del jefe se oye bien.'],
        ['social', 'Perfecto, armo la pieza y te aviso si falta algo.'],
      ],
    },
    {
      id: direct('boss', 'dispatch'), members: ['boss', 'dispatch'], unreadFor: ['dispatch'],
      lines: [
        ['dispatch', 'La ficha del asfaltado de Las Palmas espera que le pongan fecha.'],
        ['boss', 'La veo yo. Pídele al IVT las fotos del antes.'],
      ],
    },
    {
      id: group, members: ['dispatch', 'politics', 'ivt'], unreadFor: ['politics', 'ivt'],
      lines: [
        ['politics', 'La asamblea de La Ermita va a la agenda del jefe; dejé la ficha comunitaria completa.'],
        ['ivt', 'Cerca está el muro de El Rincón; lo tengo en borrador.'],
        ['dispatch', 'Bien. Cuando el jefe decida, les cuento por aquí.'],
      ],
    },
    {
      id: CHAT_TEAM_ID, members: [...CHAT_DEMO_PEOPLE], unreadFor: ['boss'],
      lines: [
        ['boss', 'Bienvenidos a Mensajes. Lo de la agenda se queda en la agenda, y los contactos en las fichas.'],
        ['social', '¡Entendido, jefe!'],
      ],
    },
    {
      id: direct('boss', 'social2'), members: ['boss', 'social2'], unreadFor: ['social2'],
      lines: [
        ['social2', 'Jefe, para la aclaratoria del agua necesitamos su frase grabada.'],
        ['boss', 'La grabo y la subo en la pieza.'],
      ],
    },
    {
      id: direct('camera', 'camera2'), members: ['camera', 'camera2'], unreadFor: [],
      lines: [
        ['camera2', '¿Me prestas la batería extra del dron?'],
        ['camera', 'Sí, está en la oficina.'],
        ['camera2', 'Listo, la paso buscando.'],
      ],
    },
    {
      id: direct('social', 'camera2'), members: ['social', 'camera2'], unreadFor: ['camera2'],
      lines: [['social', 'Mariela, en el storyboard de las viviendas de Nuevo Amanecer dejé dos tomas de apoyo nuevas.']],
    },
    {
      id: direct('dispatch', 'social'), members: ['dispatch', 'social'], unreadFor: ['social'],
      lines: [
        ['social', 'Rubén, ¿la ficha técnica de la jornada de salud ya tiene quién graba?'],
        ['dispatch', 'Sí, Kevin. Ya está en la ficha.'],
      ],
    },
  ];

  // Two days ago, from 9:00, seven minutes apart, conversation by conversation: always in the past.
  let step = 0;
  for (const c of seeded) {
    const lastOwn: Partial<Record<DemoUserKey, string>> = {};
    let last = '';
    for (const [who, body] of c.lines) {
      const created = at(-2, 9 + Math.floor((step * 7) / 60), (step * 7) % 60)!;
      step++;
      await sql.query(`insert into public.chat_messages (conversation_id, author_id, body, created_at) values ($1, $2, $3, $4)`, [c.id, id(who), body, created]);
      lastOwn[who] = created;
      last = created;
    }
    for (const k of c.members) {
      // Read up to the end; or, for the one it is unread for, up to their own last message (writing means you read
      // what came before), or nothing at all.
      const readAt = c.unreadFor.includes(k) ? lastOwn[k] ?? null : last;
      if (readAt) {
        await sql.query(`insert into public.chat_reads (conversation_id, user_id, last_read_at) values ($1, $2, $3)`, [c.id, id(k), readAt]);
      }
    }
  }
}
