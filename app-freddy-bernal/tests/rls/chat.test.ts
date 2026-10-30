// Mensajes as channels in the database (20261028002400_internal_chat.sql + 20261029090000_chat_channels.sql; design
// R5 §4, rows 1 to 50, and the review's points 1, 2, 5, 9 and 17). Every probe goes straight to SQL as a person (RLS
// on), as an API client would:
//   * who reads: the members of each channel with 2FA; the boss because he is in every channel by the database; never
//     Administración, an admin account with a team role, a person without a role or deactivated, anon, or 360;
//   * who writes (as themselves, now, where they may, with no notice to accept), append-only;
//   * the boss arms the channels (2FA): makes, renames, chooses members, archives; is never taken out;
//   * the agenda: a concrete date, time or map from who knows it never where Redes or política read (E1: relative
//     words pass); where they do not, agenda_clear is strict (relative words too), so whoever enters later, or gains
//     Redes or política, sees «Mensaje oculto»; phones never;
//   * the text rules are the app's (src/lib/domain/chat.ts), case by case and on generated texts;
//   * the demo seed passes its own rules; what went (the notice, «Quién habla con quién») is gone.
// All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { asUser, friendlyDbError, type Sql } from '@/lib/db/core';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CHAT_DEMO_CHANNELS, CHAT_DEMO_PEOPLE, CHAT_TEAM_ID, chatChannelId } from '@/lib/db/seed-parts/chat';
import { hasConcreteDateTime, hasMap, stripRefs, stripTimecodes } from '@/lib/domain/chat';
import { phonesIn } from '@/lib/domain/phones';
import { looksLikeDateTime } from '@/lib/push/text';
import { CONCRETE_CASES, GUARD_CASES, MAP_CASES, REF_CASES, TIMECODE_CASES, chatGeneratedTexts } from '../unit/fixtures/chat-text-cases';
import { generatedTexts } from '../unit/fixtures/privacy-text-cases';

let t: TestDb;
type Aal = 'aal1' | 'aal2';
type Err = Error & { code?: string };
// The demo people, and the accounts this file adds (invented): an admin account that is also Redes, one person with
// política and the IVT, one without a role, one that gets deactivated, and a second boss (given by the system).
type Extra = 'adminSocial' | 'polIvt' | 'nobody' | 'gone' | 'boss2';
type Who = DemoUserKey | Extra;
const P = {} as Record<Who, string>;

const as = <T>(who: Who, fn: (sql: Sql) => Promise<T>, aal: Aal = 'aal2') => asUser(t.backend, { sub: P[who], aal }, fn);
const asAssistant = <T>(who: Who, fn: (sql: Sql) => Promise<T>) =>
  as(who, async (sql) => {
    await sql.query(`select set_config('app.caller', 'assistant', true)`);
    return fn(sql);
  });
const sys = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const errorOf = async (p: Promise<unknown>): Promise<Err> => {
  try {
    await p;
  } catch (e) {
    return e as Err;
  }
  throw new Error('expected an error');
};
const count = async (who: Who, q: string, params: unknown[] = [], aal: Aal = 'aal2') =>
  (await as(who, (sql) => sql.one<{ n: number }>(`select count(*)::int as n from (${q}) x`, params), aal))!.n;
const send = (who: Who, conv: string, body: string, aal: Aal = 'aal2') =>
  as(who, (sql) => sql.one<{ id: string; agenda_clear: boolean; created_at: Date; now: Date }>(
    `insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), $2) returning id, agenda_clear, created_at, now() as now`,
    [conv, body],
  ), aal);
const create = (who: Who, title: string, members: Who[], description: string | null = null, aal: Aal = 'aal2') =>
  as(who, async (sql) => (await sql.one<{ id: string }>(`select public.chat_channel_create($1, $2, $3::uuid[]) as id`, [title, description, members.map((m) => P[m])]))!.id, aal);
const setMembers = (who: Who, c: string, members: Who[]) =>
  as(who, (sql) => sql.query(`select public.chat_channel_set_members($1, $2::uuid[])`, [c, members.map((m) => P[m])]));
const archive = (who: Who, c: string, v: boolean) => as(who, (sql) => sql.query(`select public.chat_channel_archive($1, $2)`, [c, v]));
const reads = (who: Who, c: string, aal: Aal = 'aal2') => count(who, 'select 1 from public.chat_conversations where id = $1', [c], aal);
const addRole = (who: Who, role: string) => sys(`insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing`, [P[who], role]);
const dropRole = (who: Who, role: string) => sys(`delete from public.user_roles where user_id = $1 and role = $2`, [P[who], role]);
const setActive = (who: Who, active: boolean) => sys(`update public.profiles set active = $2 where id = $1`, [P[who], active]);
const memberIds = (who: Who, c: string) =>
  as(who, (sql) => sql.query<{ user_id: string; current: boolean }>(`select user_id, current from public.chat_member_list($1)`, [c]));

const TABLES = ['chat_conversations', 'chat_members', 'chat_messages', 'chat_reads'];

// The seeded channels (R5, D-88): C «Grabación y Redes» (boss, Daniela, Yorman, Kevin, Mariela); O «Obras y comunidad»
// (boss, Rubén, Elio, Fabián); J «Jefe y despacho» (boss, Rubén); A «Jornada de salud», archived (boss, Rubén, Daniela,
// Kevin); T «Todo el equipo».
const C = chatChannelId('grabacion-y-redes');
const O = chatChannelId('obras-y-comunidad');
const J = chatChannelId('jefe-y-despacho');
const A = chatChannelId('jornada-de-salud');
const T = CHAT_TEAM_ID;
// Made here: N «Obras del IVT» (boss, Fabián, Kevin): no Redes, no política.
let N: string;

beforeAll(async () => {
  t = await makeTestDb();
  for (const u of DEMO_USERS) P[u.key] = t.ids[u.key];
  const account = async (key: Who, email: string, name: string, roles: string | null) => {
    if (roles) await sys(`insert into public.invitations (email, full_name, roles) values ($1, $2, $3::public.app_role[])`, [email, name, roles]);
    P[key] = (await t.system((sql) => sql.one<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email])))!.id;
  };
  await account('adminSocial', 'tecnica.redes@demo.test', 'Técnica y Redes (demo)', '{admin,social}');
  await account('polIvt', 'politica.ivt@demo.test', 'Política e IVT (demo)', '{politics,ivt}');
  await account('nobody', 'sin.rol@demo.test', 'Sin Rol (demo)', null);
  await account('gone', 'se.va@demo.test', 'Se Va (demo)', '{social}');
  await account('boss2', 'otro.jefe@demo.test', 'Otro Jefe (demo)', '{dispatch}');
  N = await create('boss', 'Obras del IVT (demo)', ['ivt', 'camera']);
}, 180_000);

// ---------------------------------------------------------------------------------------------------------------
// The demo seed (row 50) and what went (row 48)
// ---------------------------------------------------------------------------------------------------------------
describe('la semilla de Mensajes pasa sus propias reglas (fila 50)', () => {
  it('cinco canales con los mismos ids en cada servidor; el jefe en los cuatro canales por la base; uno archivado', async () => {
    const rows = await sys<{ id: string; kind: string; title: string; archived: boolean }>(
      `select id, kind, title, archived_at is not null as archived from public.chat_conversations where id = any ($1::uuid[]) order by title`,
      [[C, O, J, A, T]],
    );
    expect(rows.map((r) => [r.kind, r.title, r.archived])).toEqual([
      ['channel', 'Grabación y Redes', false], ['channel', 'Jefe y despacho', false], ['channel', 'Jornada de salud', true],
      ['channel', 'Obras y comunidad', false], ['team', 'Todo el equipo', false],
    ]);
    expect(CHAT_DEMO_CHANNELS.map((c) => c.id).sort()).toEqual([C, O, J, A, T].sort());
    const boss = await sys<{ conversation_id: string; via: string }>(`select conversation_id, via from public.chat_members where user_id = $1 and conversation_id = any ($2::uuid[]) and removed_at is null`, [P.boss, [C, O, J, A]]);
    expect(boss.map((b) => b.via)).toEqual(['boss', 'boss', 'boss', 'boss']);
    const picked = await sys<{ user_id: string }>(`select user_id from public.chat_members where conversation_id = $1 and via = 'picked'`, [C]);
    expect(picked.map((m) => m.user_id).sort()).toEqual([P.social, P.social2, P.camera, P.camera2].sort());
    expect(await sys(`select 1 from public.chat_members where user_id = $1`, [P.admin])).toEqual([]);
  });

  it('textos inventados sin fecha, hora, día, teléfono ni mapa; un canal sin leer para cada una de las 8; nada de avisos', async () => {
    const fresh = await makeTestDb();
    const seeded = await fresh.system((sql) => sql.query<{ body: string; agenda_clear: boolean }>(`select body, agenda_clear from public.chat_messages`));
    expect(seeded.length).toBe(13);
    for (const m of seeded) {
      expect(looksLikeDateTime(m.body), m.body).toBe(false);
      expect(phonesIn(m.body), m.body).toEqual([]);
      expect(hasMap(m.body), m.body).toBe(false);
      expect(m.agenda_clear, m.body).toBe(true);
      expect(m.body, m.body).not.toMatch(/entendido/i);
    }
    const titles = await fresh.system((sql) => sql.query<{ t: string }>(`select concat_ws(' ', title, description) as t from public.chat_conversations`));
    for (const { t: x } of titles) expect(looksLikeDateTime(x) || hasMap(x) || phonesIn(x).length > 0, x).toBe(false);
    const unread = await fresh.system((sql) =>
      sql.query<{ n: number }>(
        `select (select count(*)::int from public.chat_conversations k
            where k.archived_at is null
              and (k.kind = 'team' or exists (select 1 from public.chat_members m where m.conversation_id = k.id and m.user_id = u.id and m.removed_at is null))
              and exists (select 1 from public.chat_messages x where x.conversation_id = k.id and x.author_id <> u.id
                            and x.created_at > coalesce((select r.last_read_at from public.chat_reads r where r.conversation_id = k.id and r.user_id = u.id), '-infinity'))) as n
           from unnest($1::uuid[]) with ordinality u(id, i) order by i`,
        [CHAT_DEMO_PEOPLE.map((k) => fresh.ids[k])],
      ),
    );
    expect(unread.map((r) => r.n)).toEqual(CHAT_DEMO_PEOPLE.map(() => 1));
    expect(await fresh.system((sql) => sql.query(`select 1 from public.notifications where kind in ('chat_message', 'team_role_granted')`))).toEqual([]);
    expect(await fresh.system((sql) => sql.query(`select 1 from public.chat_messages where created_at > now()`))).toEqual([]);
  }, 120_000);

  it('48: el aviso y «Quién habla con quién» ya no existen (tablas y funciones), y nada de Mensajes en Realtime', async () => {
    expect(await sys(`select to_regclass('public.chat_notice_ack') as a, to_regclass('public.chat_rules') as b`)).toEqual([{ a: null, b: null }]);
    expect(await sys(`select proname from pg_proc where proname in ('chat_start', 'chat_pair_allowed', 'chat_stamp_rule')`)).toEqual([]);
    expect(await sys(`select 1 from pg_publication_tables where tablename like 'chat\\_%'`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The text rules: the database's copy is the app's (row 49)
// ---------------------------------------------------------------------------------------------------------------
describe('las reglas de texto de la base son las de la app (fila 49)', () => {
  it('caso por caso: concreto, mapas, lo que se quita', async () => {
    const one = async (fn: string, texts: string[]) =>
      (await as('social', (sql) => sql.query<{ v: unknown }>(`select public.${fn}(s) as v from unnest($1::text[]) with ordinality as x(s, n) order by n`, [texts]))).map((r) => r.v);
    expect(await one('text_has_concrete_datetime', CONCRETE_CASES.map((c) => c.text))).toEqual(CONCRETE_CASES.map((c) => c.concrete));
    expect(await one('chat_has_map', MAP_CASES.map((c) => c.text))).toEqual(MAP_CASES.map((c) => c.map));
    expect(await one('chat_strip_refs', REF_CASES.map((c) => c.text))).toEqual(REF_CASES.map((c) => c.out));
    expect(await one('chat_strip_timecodes', TIMECODE_CASES.map((c) => c.text))).toEqual(TIMECODE_CASES.map((c) => c.out));
  });

  it('y en 12000 textos generados las cuatro dan lo mismo que la app', async () => {
    const texts = [...chatGeneratedTexts(6000), ...generatedTexts(6000)];
    const rows = await as('social', (sql) =>
      sql.query<{ s: string; c: boolean; m: boolean; r: string; k: string }>(
        `select s, public.text_has_concrete_datetime(s) as c, public.chat_has_map(s) as m, public.chat_strip_refs(s) as r,
                public.chat_strip_timecodes(s) as k
           from unnest($1::text[]) with ordinality as x(s, n) order by n`,
        [texts],
      ),
    );
    expect(rows).toHaveLength(texts.length);
    expect(rows.filter((x) => x.c !== hasConcreteDateTime(x.s)).map((x) => x.s)).toEqual([]);
    expect(rows.filter((x) => x.m !== hasMap(x.s)).map((x) => x.s)).toEqual([]);
    expect(rows.filter((x) => x.r !== stripRefs(x.s)).map((x) => x.s)).toEqual([]);
    expect(rows.filter((x) => x.k !== stripTimecodes(x.s)).map((x) => x.s)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Reading (rows 1-9, 40-46)
// ---------------------------------------------------------------------------------------------------------------
describe('leer: los miembros de cada canal y nadie más (filas 1 a 9)', () => {
  it('1-2: Daniela lee los suyos y nada de los demás, ni por las funciones', async () => {
    expect(await reads('social', C)).toBe(1);
    expect(await count('social', 'select 1 from public.chat_messages where conversation_id = $1', [C])).toBeGreaterThan(3);
    for (const c of [O, J, N]) {
      for (const table of ['chat_conversations', 'chat_members', 'chat_messages']) {
        const col = table === 'chat_conversations' ? 'id' : 'conversation_id';
        expect(await count('social', `select 1 from public.${table} where ${col} = $1`, [c]), `${table} ${c}`).toBe(0);
      }
      expect(await memberIds('social', c)).toEqual([]);
      expect(await count('social', 'select * from public.chat_hidden_marks($1)', [c])).toBe(0);
      expect(await as('social', (sql) => sql.one(`select public.chat_may_post($1) as p, public.chat_hides_agenda_for_me($1) as h`, [c]))).toEqual({ p: false, h: false });
    }
  });

  it('3: el jefe con doble factor lee cada canal como miembro (su fila «boss»), y no hay rama de «leer todas»', async () => {
    for (const c of [C, O, J, A, T, N]) expect(await reads('boss', c), c).toBe(1);
    // A channel without the boss would not be his to read: the database never lets one exist (row 30), so the test
    // takes his row away as the owner would, and he stops reading it.
    const x = await create('boss', 'Sin el jefe (demo)', ['camera2']);
    await sys(`alter table public.chat_members disable trigger chat_members_guard`);
    try {
      await sys(`update public.chat_members set removed_at = now() where conversation_id = $1 and user_id = $2`, [x, P.boss]);
    } finally {
      await sys(`alter table public.chat_members enable trigger chat_members_guard`);
    }
    expect(await reads('boss', x)).toBe(0);
    expect(await reads('camera2', x)).toBe(1);
  });

  it('4: sin doble factor, ni el jefe ni el despacho leen (tampoco los suyos); Redes y Grabación no lo usan', async () => {
    expect(await reads('boss', C, 'aal1')).toBe(0);
    expect(await count('boss', 'select 1 from public.chat_messages', [], 'aal1')).toBe(0);
    expect(await count('dispatch', 'select 1 from public.chat_messages where conversation_id = $1', [J], 'aal1')).toBe(0);
    expect(await count('social', 'select 1 from public.chat_messages where conversation_id = $1', [C], 'aal1')).toBeGreaterThan(0);
  });

  it('5: Administración no lee nada, no crea, no cambia y no escribe', async () => {
    for (const table of TABLES) expect(await count('admin', `select 1 from public.${table}`), table).toBe(0);
    for (const q of [`select * from public.chat_people()`, `select * from public.chat_member_list('${C}')`, `select * from public.chat_hidden_marks('${J}')`]) {
      expect(await count('admin', q), q).toBe(0);
    }
    expect(await as('admin', (sql) => sql.one(`select public.chat_can_read($1) as r, public.chat_hides_agenda_for_me($1) as h, public.chat_may_post($1) as p`, [C])))
      .toEqual({ r: false, h: false, p: false });
    await expect(create('admin', 'X (demo)', ['social'])).rejects.toThrow(/boss only/);
    await expect(setMembers('admin', C, ['social'])).rejects.toThrow(/boss only/);
    await expect(archive('admin', C, true)).rejects.toThrow(/boss only/);
    await expect(as('admin', (sql) => sql.query(`select public.chat_team_channel()`))).rejects.toThrow(/not allowed/);
    expect((await errorOf(send('admin', T, 'Hola (demo)'))).code).toBe('42501');
  });

  it('6: una cuenta con Administración y Redes no está en Mensajes, ni el jefe puede meterla en un canal', async () => {
    for (const c of [C, T]) expect(await reads('adminSocial', c), c).toBe(0);
    expect(await count('adminSocial', 'select 1 from public.chat_messages')).toBe(0);
    await expect(create('boss', 'Con técnica (demo)', ['adminSocial'])).rejects.toThrow(/not a team member/);
    await expect(setMembers('boss', N, ['ivt', 'camera', 'adminSocial'])).rejects.toThrow(/not a team member/);
    const people = await as('boss', (sql) => sql.query<{ id: string }>(`select id from public.chat_people()`));
    expect(people.map((p) => p.id)).not.toContain(P.adminSocial);
    // Not even by the table as the system: an admin account is never a member.
    await expect(sys(`insert into public.chat_members (conversation_id, user_id) values ($1, $2)`, [N, P.adminSocial])).rejects.toThrow(/not a team member/);
  });

  it('7: sin rol o desactivada: nada, y el jefe no la mete en un canal', async () => {
    await setActive('gone', false);
    try {
      for (const who of ['nobody', 'gone'] as const) {
        for (const table of TABLES) expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
        expect((await errorOf(send(who, T, 'Hola (demo)'))).code, who).toBe('42501');
      }
      await expect(create('boss', 'Con quien se fue (demo)', ['gone'])).rejects.toThrow(/not a team member/);
    } finally {
      await setActive('gone', true);
    }
  });

  it('8: anon no toca ninguna tabla ni función de Mensajes', async () => {
    const asAnon = (q: string) =>
      t.backend.transaction(async (sql) => {
        await sql.query('set local role anon');
        return sql.query(q);
      });
    for (const table of TABLES) await expect(asAnon(`select * from public.${table}`), table).rejects.toThrow(/permission denied/);
    for (const q of [`select public.chat_people()`, `select public.chat_team_channel()`, `select public.chat_channel_create('x', null, '{}'::uuid[])`,
      `select public.chat_member_list('${C}')`, `select public.is_team_member()`]) {
      await expect(asAnon(q), q).rejects.toThrow(/permission denied/);
    }
  });

  it('9: lo que corre 360 (app.caller = assistant) no lee, no escribe ni arma canales, ni como Daniela ni como el jefe', async () => {
    for (const who of ['social', 'boss'] as const) {
      for (const table of ['chat_conversations', 'chat_members', 'chat_messages']) {
        expect((await asAssistant(who, (sql) => sql.query(`select 1 from public.${table}`))).length, `${who} ${table}`).toBe(0);
      }
      expect(await asAssistant(who, (sql) => sql.query(`select * from public.chat_people()`))).toEqual([]);
      expect(await asAssistant(who, (sql) => sql.query(`select * from public.chat_member_list($1)`, [C]))).toEqual([]);
      await expect(asAssistant(who, (sql) => sql.query(`select public.chat_team_channel()`)), who).rejects.toThrow(/not allowed/);
      await expect(asAssistant(who, (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), 'Desde 360')`, [C])), who).rejects.toThrow();
    }
    for (const q of [`select public.chat_channel_create('Desde 360', null, $1::uuid[])`, `select public.chat_channel_set_members('${C}', $1::uuid[])`]) {
      await expect(asAssistant('boss', (sql) => sql.query(q, [[P.social]])), q).rejects.toThrow(/boss only/);
    }
    for (const q of [`select public.chat_channel_update('${C}', 'Desde 360', null)`, `select public.chat_channel_archive('${C}', true)`, `select public.chat_set_only_boss('${T}', true)`]) {
      await expect(asAssistant('boss', (sql) => sql.query(q)), q).rejects.toThrow(/boss only/);
    }
    expect(await sys(`select 1 from public.chat_messages where body = 'Desde 360'`)).toEqual([]);
    expect(await sys(`select 1 from public.chat_conversations where title = 'Desde 360'`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Writing: the guard (rows 10-20) and the agenda in the history (review, point 1)
// ---------------------------------------------------------------------------------------------------------------
describe('escribir: como uno mismo, ahora, sin aviso que aceptar, y la regla de la agenda (filas 10 a 20)', () => {
  // A channel where the author is a member, with or without Redes or política in it.
  const where = (author: DemoUserKey, hides: boolean): string => {
    const table: Partial<Record<DemoUserKey, [string, string | null]>> = {
      boss: [C, J], dispatch: [O, J], ivt: [O, N], politics: [O, null], social: [C, null], camera: [C, N],
    };
    const c = table[author]?.[hides ? 0 : 1];
    if (!c) throw new Error(`no channel for ${author} ${hides}`);
    return c;
  };

  it('cada caso de la tabla, escrito por esa persona en su canal: pasa (con su agenda_clear), teléfono o fecha', async () => {
    for (const c of GUARD_CASES) {
      const label = `${c.author} ${c.hides ? 'con Redes/política' : 'sin'}: ${c.text}`;
      const p = send(c.author, where(c.author, c.hides), c.text);
      if (c.result === 'ok') {
        expect((await p)!.agenda_clear, label).toBe(c.agendaClear);
      } else {
        const e = await errorOf(p);
        expect(e.code, label).toBe('23514');
        expect(e.message, label).toBe(c.result === 'phone' ? 'chat_messages_no_phone' : 'chat_messages_no_agenda_when');
        expect(friendlyDbError(e), label).not.toContain(c.text);
      }
    }
  });

  it('10: Daniela escribe en el suyo como sí misma, sin haber aceptado nada: la hora es la de la base y agenda_clear no se manda', async () => {
    const m = (await send('social2', C, 'Texto de prueba de Yorman (demo).'))!;
    expect(m.agenda_clear).toBe(true);
    expect(new Date(m.created_at).getTime()).toBe(new Date(m.now).getTime());
    for (const q of [
      `insert into public.chat_messages (conversation_id, author_id, body, created_at) values ($1, auth.uid(), 'Con otra hora', now() - interval '3 days')`,
      `insert into public.chat_messages (conversation_id, author_id, body, agenda_clear) values ($1, auth.uid(), 'Con su marca', false)`,
    ]) {
      expect((await errorOf(as('social', (sql) => sql.query(q, [C])))).message, q).toMatch(/permission denied/);
    }
  });

  it('11: no como otra persona, no donde no está', async () => {
    const e = await errorOf(as('camera', (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, 'Como Redes')`, [C, P.social])));
    expect(e.code).toBe('42501');
    expect(friendlyDbError(e)).toBe('Ya no puedes escribir en este canal.');
    for (const [who, c] of [['social', J], ['social', O], ['politics', C]] as const) {
      expect((await errorOf(send(who, c, 'Hola (demo)'))).code, `${who} ${c}`).toBe('42501');
    }
    // The refusal says nothing of that channel: a date where the person cannot write is the same refusal.
    expect((await errorOf(send('dispatch', C, 'el jueves a las 10'))).message).toBe('Ya no puedes escribir en este canal.');
  });

  it('12 a 17: el jefe y la agenda; quien entra después ve «Mensaje oculto», también para «mañana» (punto 1 de la revisión)', async () => {
    expect((await errorOf(send('boss', C, 'a las 10:30 en la plaza'))).message).toBe('chat_messages_no_agenda_when');
    expect((await send('boss', C, 'Mañana lo revisamos (demo).'))!.agenda_clear).toBe(true);
    // A channel of two, without Redes: what the boss writes with a time, or with «mañana», is kept from who enters later.
    const x = await create('boss', 'Prueba de agenda (demo)', ['dispatch']);
    const timed = (await send('boss', x, 'a las 10:30 en la cancha'))!;
    const relative = (await send('boss', x, 'Mañana salimos temprano a la cancha de El Mirador'))!;
    const plain = (await send('boss', x, 'Rubén, gracias (demo).'))!;
    expect([timed.agenda_clear, relative.agenda_clear, plain.agenda_clear]).toEqual([false, false, true]);
    expect(await count('dispatch', 'select 1 from public.chat_messages where conversation_id = $1', [x])).toBe(3);
    await setMembers('boss', x, ['dispatch', 'social']);
    // Daniela reads what came before, except those two: their place only, never their text.
    const visible = (await as('social', (sql) => sql.query<{ id: string }>(`select id from public.chat_messages where conversation_id = $1`, [x]))).map((r) => r.id);
    expect(visible).toEqual([plain.id]);
    const marks = await as('social', (sql) => sql.query<{ id: string }>(`select id from public.chat_hidden_marks($1)`, [x]));
    expect(marks.map((m) => m.id).sort()).toEqual([timed.id, relative.id].sort());
    // Now Redes is in it: no time any more.
    expect((await errorOf(send('boss', x, 'a las 11'))).message).toBe('chat_messages_no_agenda_when');
  });

  it('17b: un miembro que gana Redes deja de leer el «mañana» que se escribió sin Redes en su canal', async () => {
    const y = await create('boss', 'Visitas del IVT (demo)', ['ivt']);
    const m = (await send('boss', y, 'Mañana vamos al muro de El Rincón'))!;
    expect(m.agenda_clear).toBe(false);
    expect(await count('ivt', 'select 1 from public.chat_messages where id = $1', [m.id])).toBe(1);
    await addRole('ivt', 'social');
    try {
      expect(await count('ivt', 'select 1 from public.chat_messages where id = $1', [m.id])).toBe(0);
      expect(await count('ivt', 'select * from public.chat_hidden_marks($1)', [y])).toBe(1);
      expect(await count('boss', 'select 1 from public.chat_messages where id = $1', [m.id])).toBe(1);
    } finally {
      await dropRole('ivt', 'social');
    }
    expect(await count('ivt', 'select 1 from public.chat_messages where id = $1', [m.id])).toBe(1);
  });

  it('18-20: un teléfono nunca; nadie edita, borra ni vacía (el sistema tampoco)', async () => {
    expect((await errorOf(send('social', T, 'llámalo al 0414 555 12 34'))).message).toBe('chat_messages_no_phone');
    const msg = (await sys<{ id: string }>(`select id from public.chat_messages where conversation_id = $1 limit 1`, [C]))[0].id;
    for (const q of [`update public.chat_messages set body = 'x' where id = $1`, `delete from public.chat_messages where id = $1`]) {
      await expect(as('camera', (sql) => sql.query(q, [msg])), q).rejects.toThrow(/permission denied/);
      await expect(t.system((sql) => sql.query(q, [msg])), q).rejects.toThrow(/append-only/);
    }
    await expect(t.system((sql) => sql.query(`delete from public.chat_conversations where id = $1`, [C]))).rejects.toThrow(/append-only/);
    for (const table of ['chat_messages', 'chat_members', 'chat_conversations']) {
      await expect(t.system((sql) => sql.query(`truncate public.${table} cascade`)), table).rejects.toThrow(/append-only/);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The boss arms the channels (rows 21-35)
// ---------------------------------------------------------------------------------------------------------------
describe('el jefe arma los canales (filas 21 a 35)', () => {
  it('21-25: crear: solo el jefe con doble factor; él entra solo; al menos una persona; nombre y descripción sin agenda ni teléfono', async () => {
    const c = await create('boss', 'Prueba (demo)', ['camera'], 'Para probar');
    const rows = await sys<{ user_id: string; via: string; added_by: string | null }>(`select user_id, via, added_by from public.chat_members where conversation_id = $1 order by via`, [c]);
    expect(rows).toEqual([{ user_id: P.boss, via: 'boss', added_by: P.boss }, { user_id: P.camera, via: 'picked', added_by: P.boss }]);
    for (const [who, aal] of [['boss', 'aal1'], ['dispatch', 'aal2'], ['social', 'aal2']] as const) {
      const e = await errorOf(create(who, 'X (demo)', ['camera'], null, aal));
      expect(e.message, `${who} ${aal}`).toBe('chat: boss only');
      expect(friendlyDbError(e)).toBe('Para esto necesitas entrar con el doble factor.');
    }
    for (const members of [[], ['boss']] as Who[][]) {
      const e = await errorOf(create('boss', 'Vacío (demo)', members));
      expect(e.message).toBe('chat_channel_needs_member');
      expect(friendlyDbError(e)).toBe('Elige al menos a una persona además de ti.');
    }
    for (const [title, description, rule] of [
      ['Gira del 12 de noviembre', null, 'chat_title_private'], ['Lo de mañana', null, 'chat_title_private'], ['Plaza maps.google.com', null, 'chat_title_private'],
      ['Gira', 'Salimos a las 3 pm', 'chat_desc_private'], ['Gira', 'El sábado en la plaza', 'chat_desc_private'],
    ] as const) {
      const e = await errorOf(create('boss', title, ['camera'], description));
      expect(e.message, title).toBe(rule);
      expect(friendlyDbError(e)).toMatch(/^El nombre y la descripción no llevan teléfonos/);
    }
    expect((await errorOf(create('boss', 'Vocera 0414-555-1234', ['camera']))).code).toBe('23514');
    expect(friendlyDbError(await errorOf(create('boss', 'x'.repeat(61), ['camera'])))).toBe('El nombre del canal va de 1 a 60 letras.');
    expect(friendlyDbError(await errorOf(create('boss', 'Largo (demo)', ['camera'], 'y'.repeat(141))))).toBe('La descripción va hasta 140 letras.');
  });

  it('26: nadie inserta ni cambia canales o miembros por la tabla', async () => {
    for (const q of [
      `insert into public.chat_conversations (kind, title) values ('channel', 'Por la tabla')`,
      `insert into public.chat_members (conversation_id, user_id) values ('${N}', auth.uid())`,
      `update public.chat_conversations set title = 'Otro' where id = '${N}'`,
      `update public.chat_members set removed_at = now() where conversation_id = '${N}'`,
    ]) {
      await expect(as('boss', (sql) => sql.query(q)), q).rejects.toThrow(/permission denied/);
    }
  });

  it('27-29, 5 y 17: cambiar quién está: entran y salen sin borrar; el que sale deja de leer; el que entra lee lo anterior pero no ve quién salió; vuelve con el silencio apagado', async () => {
    const x = await create('boss', 'Material del parque (demo)', ['social2', 'camera', 'camera2']);
    const hello = (await send('camera', x, 'Ya subí las tomas del parque (demo).'))!.id;
    await as('camera2', (sql) => sql.query(`insert into public.chat_reads (conversation_id, user_id, muted) values ($1, auth.uid(), true)`, [x]));
    await setMembers('boss', x, ['social2', 'camera', 'politics']);
    // Mariela left: a mark on her row, by the boss; she reads nothing of it any more, also what came before.
    expect(await sys(`select removed_by from public.chat_members where conversation_id = $1 and user_id = $2`, [x, P.camera2])).toEqual([{ removed_by: P.boss }]);
    expect(await reads('camera2', x)).toBe(0);
    expect(await count('camera2', 'select 1 from public.chat_messages where id = $1', [hello])).toBe(0);
    expect((await errorOf(send('camera2', x, 'Hola (demo)'))).message).toBe('Ya no puedes escribir en este canal.');
    // Elio entered: he reads what came before, and sees who is in it now, never who left (or when, or by whom).
    expect(await count('politics', 'select 1 from public.chat_messages where id = $1', [hello])).toBe(1);
    expect(await count('politics', 'select 1 from public.chat_members where conversation_id = $1 and removed_at is not null', [x])).toBe(0);
    const list = await memberIds('politics', x);
    expect(list.filter((m) => m.current).map((m) => m.user_id).sort()).toEqual([P.boss, P.social2, P.camera, P.politics].sort());
    expect(list.map((m) => m.user_id)).not.toContain(P.camera2);
    // Someone who left is named only as the author of an old message.
    await setMembers('boss', x, ['social2', 'politics']);
    expect((await memberIds('politics', x)).find((m) => m.user_id === P.camera)).toEqual({ user_id: P.camera, current: false });
    // 28: back in, a new row; the old one stays; her «Silenciar» does not come back.
    await setMembers('boss', x, ['social2', 'politics', 'camera2']);
    expect(await sys(`select removed_at is null as now from public.chat_members where conversation_id = $1 and user_id = $2 order by created_at`, [x, P.camera2])).toEqual([{ now: false }, { now: true }]);
    expect(await sys(`select muted from public.chat_reads where conversation_id = $1 and user_id = $2`, [x, P.camera2])).toEqual([{ muted: false }]);
    expect(await reads('camera2', x)).toBe(1);
    // 29: the boss is not on the list and stays.
    expect(await reads('boss', x)).toBe(1);
    expect(await sys(`select 1 from public.chat_members where conversation_id = $1 and user_id = $2 and removed_at is null`, [x, P.boss])).toHaveLength(1);
    // 45: whoever left cannot mark it read.
    await setMembers('boss', x, ['social2', 'politics']);
    await expect(as('camera2', (sql) => sql.query(`insert into public.chat_reads (conversation_id, user_id) values ($1, auth.uid()) on conflict (conversation_id, user_id) do update set last_read_at = now()`, [x]))).rejects.toThrow(/row-level security/);
  });

  it('27b: guardar el canal no saca a quien está desactivado (el editor no lo muestra): vuelve a leerlo al reactivarlo', async () => {
    // R5 review 2, point 3: the editor lists only the active team, so the list the boss sends never has her.
    const x = await create('boss', 'Cancha nueva (demo)', ['camera', 'camera2']);
    await setActive('camera2', false);
    try {
      expect((await memberIds('camera', x)).map((m) => m.user_id)).not.toContain(P.camera2);
      await setMembers('boss', x, ['camera', 'social2']);
      expect(await sys(`select removed_at is null as now from public.chat_members where conversation_id = $1 and user_id = $2`, [x, P.camera2])).toEqual([{ now: true }]);
    } finally {
      await setActive('camera2', true);
    }
    expect(await reads('camera2', x)).toBe(1);
    expect((await memberIds('camera', x)).filter((m) => m.current).map((m) => m.user_id).sort()).toEqual([P.boss, P.camera, P.camera2, P.social2].sort());
    // Active again, she is on the list, and a save without her takes her out.
    await setMembers('boss', x, ['camera', 'social2']);
    expect(await reads('camera2', x)).toBe(0);
  });

  it('27c: chat_was_removed() dice solo si a uno mismo lo sacaron del canal; nunca de otro, ni de uno donde nunca estuvo, ni a 360', async () => {
    // R5 review 2, point 1: the open channel says «Ya no estás en este canal.» only then (anything else is «nothing
    // this time»: in the demo a channel may live on another server, D-88).
    const x = await create('boss', 'Salida y vuelta (demo)', ['camera', 'camera2']);
    const removed = (who: Who, c: string = x) => as(who, async (sql) => (await sql.one<{ r: boolean }>(`select public.chat_was_removed($1) as r`, [c]))!.r);
    expect(await removed('camera2')).toBe(false);
    await setMembers('boss', x, ['camera']);
    expect(await removed('camera2')).toBe(true);
    expect(await removed('camera')).toBe(false);
    expect(await removed('politics')).toBe(false);
    expect(await removed('camera2', J)).toBe(false);
    expect(await asAssistant('camera2', async (sql) => (await sql.one<{ r: boolean }>(`select public.chat_was_removed($1) as r`, [x]))!.r)).toBe(false);
    await setMembers('boss', x, ['camera', 'camera2']);
    expect(await removed('camera2')).toBe(false);
  });

  it('30-31: al jefe no se le saca (ni por la tabla, ni el sistema, ni con la marca de confianza); nadie borra un miembro', async () => {
    await expect(as('boss', async (sql) => {
      await sql.query(`select set_config('app.trusted_update', 'on', true)`);
      return sql.query(`update public.chat_members set removed_at = now() where conversation_id = $1 and user_id = $2`, [N, P.boss]);
    })).rejects.toThrow(/permission denied|chat_boss_stays/);
    const e = await errorOf(sys(`update public.chat_members set removed_at = now() where conversation_id = $1 and user_id = $2`, [N, P.boss]));
    expect(e.message).toBe('chat_boss_stays');
    expect(friendlyDbError(e)).toBe('El jefe está en todos los canales: no se puede quitar.');
    await expect(sys(`delete from public.chat_members where conversation_id = $1`, [N])).rejects.toThrow(/append-only/);
    expect(await reads('boss', N)).toBe(1);
  });

  it('32-35: solo el jefe cambia, archiva y prende «Solo el jefe escribe»; «Todo el equipo» no se renombra ni se archiva', async () => {
    for (const who of ['dispatch', 'social', 'admin'] as const) {
      await expect(setMembers(who, N, ['ivt']), who).rejects.toThrow(/boss only/);
      await expect(as(who, (sql) => sql.query(`select public.chat_channel_update($1, 'Mío', null)`, [N])), who).rejects.toThrow(/boss only/);
      await expect(archive(who, N, true), who).rejects.toThrow(/boss only/);
      await expect(as(who, (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [N])), who).rejects.toThrow(/boss only/);
    }
    for (const q of [`select public.chat_channel_set_members('${T}', $1::uuid[])`]) {
      await expect(as('boss', (sql) => sql.query(q, [[P.social]]))).rejects.toThrow(/not found/);
    }
    await expect(as('boss', (sql) => sql.query(`select public.chat_channel_update($1, 'Otro', null)`, [T]))).rejects.toThrow(/not found/);
    await expect(archive('boss', T, true)).rejects.toThrow(/not found/);
    await as('boss', (sql) => sql.query(`select public.chat_channel_update($1, 'Obras del IVT (demo)', 'Lo de las visitas')`, [N]));
    expect(await sys(`select title, description, updated_at is not null as u from public.chat_conversations where id = $1`, [N])).toEqual([{ title: 'Obras del IVT (demo)', description: 'Lo de las visitas', u: true }]);
    // 34: archived: members read it, nobody writes (the boss neither), members do not change; back as it was.
    await archive('boss', N, true);
    try {
      expect(await reads('camera', N)).toBe(1);
      for (const who of ['camera', 'boss'] as const) expect((await errorOf(send(who, N, 'Hola (demo)'))).message, who).toBe('Ya no puedes escribir en este canal.');
      const e = await errorOf(setMembers('boss', N, ['ivt']));
      expect(friendlyDbError(e)).toBe('Este canal está archivado: sácalo del archivo para cambiar quién está.');
    } finally {
      await archive('boss', N, false);
    }
    expect((await send('camera', N, 'Ya volvió (demo).'))!.agenda_clear).toBe(true);
    // 35: «Solo el jefe escribe» in a channel and in «Todo el equipo».
    for (const c of [N, T]) {
      await as('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [c]));
      try {
        expect((await errorOf(send(c === N ? 'camera' : 'social', c, 'Hola (demo)'))).code).toBe('42501');
        expect((await send('boss', c, 'Solo yo por ahora (demo).'))!.agenda_clear).toBe(true);
      } finally {
        await as('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, false)`, [c]));
      }
    }
    expect(await sys(`select title from public.chat_conversations where id = $1`, [T])).toEqual([{ title: 'Todo el equipo' }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The boss's role (rows 36-39, review points 2 and 9)
// ---------------------------------------------------------------------------------------------------------------
describe('el rol de jefe y los canales (filas 36 a 39)', () => {
  it('36-39 y 9: el sistema da el rol: en todos los canales; desactivado no sale en las listas; al quitárselo, sale', async () => {
    await expect(as('admin', (sql) => sql.query(`insert into public.user_roles (user_id, role) values ($1, 'boss')`, [P.boss2]))).rejects.toThrow();
    await addRole('boss2', 'boss');
    try {
      const all = (await sys<{ n: number }>(`select count(*)::int as n from public.chat_conversations where kind = 'channel'`))[0].n;
      expect(await sys(`select count(*)::int as n from public.chat_members where user_id = $1 and removed_at is null and via = 'boss'`, [P.boss2])).toEqual([{ n: all }]);
      expect(await reads('boss2', A)).toBe(1);
      const later = await create('boss', 'Después del segundo jefe (demo)', ['camera']);
      expect((await memberIds('camera', later)).map((m) => m.user_id).sort()).toEqual([P.boss, P.boss2, P.camera].sort());
      // 9: a boss whose profile is inactive is not listed (nor counted), in any channel.
      await setActive('boss2', false);
      try {
        expect((await memberIds('camera', later)).map((m) => m.user_id)).not.toContain(P.boss2);
        expect((await memberIds('social', C)).map((m) => m.user_id)).not.toContain(P.boss2);
      } finally {
        await setActive('boss2', true);
      }
      expect((await memberIds('social', C)).map((m) => m.user_id)).toContain(P.boss2);
    } finally {
      await dropRole('boss2', 'boss');
    }
    expect(await sys(`select count(*)::int as n from public.chat_members where user_id = $1 and removed_at is null`, [P.boss2])).toEqual([{ n: 0 }]);
    expect(await reads('boss2', C)).toBe(0);
  });

  it('el orden de los disparadores: dar el jefe a una cuenta de Administración dice por qué (no «not a team member»)', async () => {
    const e = await errorOf(sys(`insert into public.user_roles (user_id, role) values ($1, 'boss')`, [P.admin]));
    expect(e.message).toMatch(/no puede ser también el jefe ni el despacho/);
    expect(await sys(`select 1 from public.chat_members where user_id = $1`, [P.admin])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Lists, own state, audit, catalogue (rows 40-47)
// ---------------------------------------------------------------------------------------------------------------
describe('listas, lo propio, el registro y el catálogo (filas 40 a 47)', () => {
  it('40-43: chat_people() es del jefe; la lista de miembros, de quien lee el canal; «Todo el equipo» es el equipo activo', async () => {
    expect(await as('social', (sql) => sql.query(`select * from public.chat_people()`))).toEqual([]);
    expect(await as('boss', (sql) => sql.query(`select * from public.chat_people()`), 'aal1')).toEqual([]);
    await setActive('gone', false);
    try {
      const people = await as('boss', (sql) => sql.query<{ id: string; roles: string }>(`select id, roles::text from public.chat_people()`));
      const ids = people.map((p) => p.id);
      for (const k of ['boss', 'dispatch', 'politics', 'ivt', 'social', 'social2', 'camera', 'camera2', 'polIvt'] as Who[]) expect(ids, k).toContain(P[k]);
      for (const k of ['admin', 'adminSocial', 'nobody', 'gone'] as Who[]) expect(ids, k).not.toContain(P[k]);
      expect(people.find((p) => p.id === P.polIvt)?.roles).toBe('{politics,ivt}');
      const team = (await memberIds('social', T)).filter((m) => m.current).map((m) => m.user_id);
      expect(team).toContain(P.boss);
      expect(team).not.toContain(P.admin);
      expect(team).not.toContain(P.gone);
    } finally {
      await setActive('gone', true);
    }
    const c = await memberIds('social', C);
    expect(c.filter((m) => m.current).map((m) => m.user_id)).toEqual(expect.arrayContaining([P.boss, P.social, P.social2, P.camera, P.camera2]));
  });

  it('44: lo leído es de cada quien; marcar o silenciar solo donde uno está', async () => {
    await as('social', (sql) => sql.query(`insert into public.chat_reads (conversation_id, user_id, muted) values ($1, auth.uid(), true) on conflict (conversation_id, user_id) do update set muted = true`, [C]));
    expect(await count('social', 'select 1 from public.chat_reads where user_id <> auth.uid()')).toBe(0);
    for (const [q, p] of [
      [`insert into public.chat_reads (conversation_id, user_id) values ($1, auth.uid())`, [J]],
      [`insert into public.chat_reads (conversation_id, user_id) values ($1, $2)`, [C, P.camera]],
    ] as [string, unknown[]][]) {
      await expect(as('social', (sql) => sql.query(q, p)), q).rejects.toThrow(/row-level security|duplicate/);
    }
    await as('social', (sql) => sql.query(`update public.chat_reads set muted = false where conversation_id = $1`, [C]));
  });

  it('46: el registro guarda que hubo un canal, un cambio de miembros o un mensaje, quién y cuándo; nunca el texto, el nombre ni los miembros', async () => {
    const log = await as('admin', (sql) =>
      sql.query<{ table_name: string; row_id: string; old_data: unknown; new_data: unknown }>(
        `select table_name, row_id, old_data, new_data from public.audit_log where table_name like 'chat\\_%' order by id`,
      ),
    );
    expect(new Set(log.map((r) => r.table_name))).toEqual(new Set(['chat_conversations', 'chat_members', 'chat_messages']));
    for (const r of log) expect([r.old_data, r.new_data], r.table_name).toEqual([null, null]);
    const memberRows = new Set((await sys<{ id: string }>(`select id from public.chat_members`)).map((r) => r.id));
    expect(log.filter((r) => r.table_name === 'chat_members').every((r) => memberRows.has(r.row_id))).toBe(true);
    const text = JSON.stringify(log);
    for (const s of ['Grabación y Redes', 'Material del parque', 'Todo el equipo', 'Ya subí las tomas', 'Lo de las visitas', 'body', 'title']) {
      expect(text, s).not.toContain(s);
    }
  });

  it('47: cada función con el permiso que le toca', async () => {
    const INTERNAL = ['chat_team_roles', 'chat_author_knows_agenda', 'chat_author_camera_only', 'chat_hides_agenda', 'chat_channel_people'];
    const TRIGGERS = ['chat_message_guard', 'chat_append_only', 'guard_chat_conversation_update', 'guard_chat_channel_text', 'guard_chat_member_change',
      'chat_channel_add_bosses', 'chat_boss_role_change', 'audit_chat_row'];
    const API = ['is_team_member', 'chat_reader_knows_agenda', 'chat_by_assistant', 'text_has_concrete_datetime', 'chat_strip_refs', 'chat_has_map',
      'chat_strip_timecodes', 'chat_is_member', 'chat_can_read', 'chat_hides_agenda_for_me', 'chat_may_post', 'chat_team_channel', 'chat_set_only_boss',
      'chat_people', 'chat_member_list', 'chat_was_removed', 'chat_hidden_marks', 'chat_channel_create', 'chat_channel_update', 'chat_channel_set_members', 'chat_channel_archive'];
    const rows = await sys<{ f: string; anon: boolean; auth: boolean }>(
      `select p.proname as f, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any ($1::text[]) order by 1`,
      [[...INTERNAL, ...TRIGGERS, ...API]],
    );
    expect(rows).toHaveLength(INTERNAL.length + TRIGGERS.length + API.length);
    for (const r of rows) expect(r, r.f).toMatchObject({ anon: false, auth: API.includes(r.f) });
    // Every function of Mensajes is in one of the three lists.
    const all = await sys<{ f: string }>(`select distinct p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'chat\\_%' or p.proname like 'guard\\_chat%' or p.proname like 'audit\\_chat%')`);
    expect(all.map((r) => r.f).sort()).toEqual([...INTERNAL, ...TRIGGERS, ...API].filter((f) => f.startsWith('chat_') || f.startsWith('guard_chat') || f.startsWith('audit_chat')).sort());
  });
});
