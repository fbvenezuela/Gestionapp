import { createHash } from 'node:crypto';
import type { SeedCtx } from './context';
import type { DemoUserKey } from '../seed-demo';

// Mensajes in the demo (R5, D-88): «Todo el equipo» and four channels the boss armed, one of them archived, with the
// SAME ids on every server (chatChannelId, CHAT_TEAM_ID), and exactly one channel with something new for each of the
// eight people of the team (Administración is not in Mensajes). Made as the system: the database puts the boss in
// every channel (chat_channel_add_bosses); the seed adds the others. INVENTED texts with no dates, times, days, «hoy»
// or «mañana», phones, maps or names like «Domingo»; every message still goes through chat_message_guard() (the seed
// is the system, and the guard checks phones and the agenda for the system too). No notices.

/** The 8 people of the team in the demo (not Administración), in a fixed order. */
export const CHAT_DEMO_PEOPLE = ['boss', 'dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2'] as const satisfies readonly DemoUserKey[];

// A valid v4 uuid from a name: the same on every server (stable-ids.ts does the same with a counter).
function stableId(name: string): string {
  const h = createHash('md5').update(`fb-demo-chat:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** A seeded channel, by its short name. */
export function chatChannelId(name: string): string {
  return stableId(`channel:${name}`);
}

/** The seeded «Todo el equipo». */
export const CHAT_TEAM_ID = stableId('team');

type Line = [DemoUserKey, string];
type Seeded = {
  id: string;
  // A channel (null for «Todo el equipo»): its name, description and the people besides the boss.
  channel: { title: string; description: string; members: DemoUserKey[]; archived?: boolean } | null;
  lines: Line[];
  unreadFor: DemoUserKey[];
};

// The channels of the demo (design R5 §9), oldest movement first.
export const CHAT_DEMO_CHANNELS: Seeded[] = [
  {
    id: chatChannelId('jornada-de-salud'),
    channel: { title: 'Jornada de salud', description: 'Lo de la jornada', members: ['dispatch', 'social', 'camera'], archived: true },
    unreadFor: [],
    lines: [
      ['social', '¿La ficha técnica de la jornada ya tiene quién graba?'],
      ['dispatch', 'Sí, Kevin. Ya está en la ficha.'],
    ],
  },
  {
    id: chatChannelId('obras-y-comunidad'),
    channel: { title: 'Obras y comunidad', description: 'Fichas de obra y comunitarias', members: ['dispatch', 'politics', 'ivt'] },
    unreadFor: ['politics', 'ivt'],
    lines: [
      ['politics', 'La asamblea de La Ermita va a la agenda del jefe; dejé la ficha comunitaria completa.'],
      ['ivt', 'Cerca está el muro de El Rincón; lo tengo en borrador.'],
      ['dispatch', 'Bien. Cuando el jefe decida, les cuento por aquí.'],
    ],
  },
  {
    id: chatChannelId('jefe-y-despacho'),
    channel: { title: 'Jefe y despacho', description: 'Lo del despacho', members: ['dispatch'] },
    unreadFor: ['dispatch'],
    lines: [
      ['dispatch', 'La ficha del asfaltado de Las Palmas espera que le pongan fecha.'],
      ['boss', 'La veo yo. Pídele al IVT las fotos del antes.'],
    ],
  },
  {
    id: CHAT_TEAM_ID,
    channel: null,
    unreadFor: ['boss'],
    lines: [
      ['boss', 'Bienvenidos a Mensajes. Lo de la agenda se queda en la agenda, y los contactos en las fichas.'],
      ['social', '¡Listo, jefe!'],
    ],
  },
  {
    id: chatChannelId('grabacion-y-redes'),
    channel: { title: 'Grabación y Redes', description: 'Tomas, material y piezas', members: ['social', 'social2', 'camera', 'camera2'] },
    unreadFor: ['social', 'social2', 'camera', 'camera2'],
    lines: [
      ['camera', 'Ya subí las tomas de la cancha de El Mirador, con la nota para el editor.'],
      ['social', 'Gracias. ¿Las del dron quedaron en la casilla de Dron?'],
      ['camera', 'Sí, y las de apoyo en Tomas de apoyo.'],
      ['boss', 'Buen trabajo. Daniela, me pasas la pieza cuando esté.'],
    ],
  },
];

export async function seedChat(ctx: SeedCtx): Promise<void> {
  const { sql, ids, at } = ctx;
  const id = (k: DemoUserKey) => ids[k];

  // 1. «Todo el equipo» and the channels. As the system: the ids are ours, the rules the same (the boss goes in by the
  //    database, tests/rls/chat.test.ts).
  await sql.query(`insert into public.chat_conversations (id, kind, title, created_by) values ($1, 'team', 'Todo el equipo', $2)`, [CHAT_TEAM_ID, id('boss')]);
  for (const c of CHAT_DEMO_CHANNELS) {
    if (!c.channel) continue;
    await sql.query(`insert into public.chat_conversations (id, kind, title, description, created_by) values ($1, 'channel', $2, $3, $4)`, [
      c.id, c.channel.title, c.channel.description, id('boss'),
    ]);
    for (const k of c.channel.members) {
      await sql.query(`insert into public.chat_members (conversation_id, user_id, added_by, via) values ($1, $2, $3, 'picked')`, [c.id, id(k), id('boss')]);
    }
  }

  // 2. The messages, oldest first, two days ago from 9:00, seven minutes apart: always in the past. Unread for the
  //    ones in unreadFor (read up to their own last message, or nothing).
  let step = 0;
  for (const c of CHAT_DEMO_CHANNELS) {
    const lastOwn: Partial<Record<DemoUserKey, string>> = {};
    let last = '';
    for (const [who, body] of c.lines) {
      const created = at(-2, 9 + Math.floor((step * 7) / 60), (step * 7) % 60)!;
      step++;
      await sql.query(`insert into public.chat_messages (conversation_id, author_id, body, created_at) values ($1, $2, $3, $4)`, [c.id, id(who), body, created]);
      lastOwn[who] = created;
      last = created;
    }
    const people: DemoUserKey[] = c.channel ? ['boss', ...c.channel.members] : [...CHAT_DEMO_PEOPLE];
    for (const k of people) {
      const readAt = c.unreadFor.includes(k) ? lastOwn[k] ?? null : last;
      if (readAt) {
        await sql.query(`insert into public.chat_reads (conversation_id, user_id, last_read_at) values ($1, $2, $3)`, [c.id, id(k), readAt]);
      }
    }
    // 3. The archived one: archived by the boss after its last message.
    if (c.channel?.archived) {
      await sql.query(`update public.chat_conversations set archived_at = $2, archived_by = $3 where id = $1`, [c.id, last, id('boss')]);
    }
  }
}
