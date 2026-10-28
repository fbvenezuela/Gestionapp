// Mensajes in the database (20261028002400_internal_chat.sql; design R3 §3.2, rows 1 to 52). Every probe goes straight
// to SQL as a person (RLS on), as an API client would:
//   * who reads (members with 2FA, the boss with 2FA; never Administración, an admin account with a team role, a
//     person without a role or deactivated, anon, or 360), and an audit trail without content;
//   * who writes (as themselves, now, where they may, after accepting the notice), append-only;
//   * the agenda: a concrete date, time or map from who knows it never where Redes or política read (E1: relative
//     words pass), agenda_clear, and «Mensaje oculto» after a change of role; phones never;
//   * who talks to whom (the boss's pairs, the most restrictive rule, «Todo el equipo» apart, the boss always);
//   * the text rules are the app's (src/lib/domain/chat.ts), case by case and on generated texts;
//   * the demo seed passes its own rules.
// All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { asUser, friendlyDbError, type Sql } from '@/lib/db/core';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { CHAT_DEMO_PEOPLE, CHAT_TEAM_ID, chatDirectId, chatGroupId } from '@/lib/db/seed-parts/chat';
import { hasConcreteDateTime, hasMap, stripRefs, stripTimecodes } from '@/lib/domain/chat';
import { phonesIn } from '@/lib/domain/phones';
import { looksLikeDateTime } from '@/lib/push/text';
import { CONCRETE_CASES, GUARD_CASES, MAP_CASES, REF_CASES, TIMECODE_CASES, chatGeneratedTexts } from '../unit/fixtures/chat-text-cases';
import { generatedTexts } from '../unit/fixtures/privacy-text-cases';

let t: TestDb;
type Aal = 'aal1' | 'aal2';
type Err = Error & { code?: string };
// The demo people, and the accounts this file adds (invented): an admin account that is also Redes, one person with
// política and the IVT, one without a role, one that gets deactivated, and four of Grabación (to fill a group of 13).
type Extra = 'adminSocial' | 'polIvt' | 'nobody' | 'gone' | 'r1' | 'r2' | 'r3' | 'r4';
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
const start = (who: Who, kind: string, members: Who[], title?: string) =>
  as(who, async (sql) => (await sql.one<{ id: string }>(`select public.chat_start($1, $2::uuid[], $3) as id`, [kind, members.map((m) => P[m]), title ?? null]))!.id);
const setRule = (a: string, b: string, allowed: boolean) =>
  as('boss', (sql) => sql.query(`insert into public.chat_rules (role_a, role_b, allowed) values ($1, $2, $3) on conflict (role_a, role_b) do update set allowed = excluded.allowed`, [a, b, allowed]));
const clearRules = () => sys(`delete from public.chat_rules`);
const addRole = (who: Who, role: string) => sys(`insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing`, [P[who], role]);
const dropRole = (who: Who, role: string) => sys(`delete from public.user_roles where user_id = $1 and role = $2`, [P[who], role]);
const setActive = (who: Who, active: boolean) => sys(`update public.profiles set active = $2 where id = $1`, [P[who], active]);

const TABLES = ['chat_conversations', 'chat_members', 'chat_messages', 'chat_reads', 'chat_rules', 'chat_notice_ack'];
// The team people who accept the notice in beforeAll (social2 does not: row 46).
const ACCEPTING: Who[] = ['boss', 'dispatch', 'politics', 'ivt', 'social', 'camera', 'camera2', 'polIvt', 'gone', 'r1', 'r2', 'r3', 'r4'];

// The conversations of the matrix.
let D1: string; // social ↔ camera (seeded, C1)
let D2: string; // boss ↔ dispatch (seeded, C2)
let G1: string; // dispatch + politics + ivt (new)
let T: string; // «Todo el equipo» (seeded)
let D3: string; // camera ↔ camera2 (seeded, C6)
let D4: string; // dispatch ↔ camera (seeded, no messages)
let BS: string; // boss ↔ social (seeded, no messages)
let G2: string; // dispatch + camera2 + gone (gone deactivated later)

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
  for (const k of ['r1', 'r2', 'r3', 'r4'] as const) await account(k, `grabacion.${k}@demo.test`, `Grabación ${k} (demo)`, '{camera}');
  for (const who of ACCEPTING) await as(who, (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid())`));

  D1 = await start('social', 'direct', ['camera']);
  D2 = await start('boss', 'direct', ['dispatch']);
  G1 = await start('dispatch', 'group', ['politics', 'ivt'], 'Grupo de prueba');
  T = (await as('social', (sql) => sql.one<{ id: string }>(`select public.chat_team_channel() as id`)))!.id;
  D3 = await start('camera', 'direct', ['camera2']);
  D4 = await start('dispatch', 'direct', ['camera']);
  BS = await start('boss', 'direct', ['social']);
  G2 = await start('dispatch', 'group', ['camera2', 'gone'], 'Grupo con quien se va');
}, 180_000);

// ---------------------------------------------------------------------------------------------------------------
// The demo seed
// ---------------------------------------------------------------------------------------------------------------
describe('la semilla de Mensajes pasa sus propias reglas', () => {
  it('las 28 directas, un grupo y «Todo el equipo», con los mismos ids en cada servidor; chat_start() devuelve la sembrada', async () => {
    const kinds = await sys<{ kind: string; n: number }>(`select kind, count(*)::int as n from public.chat_conversations
      where id in (select unnest($1::uuid[])) group by kind order by kind`, [[
      ...CHAT_DEMO_PEOPLE.flatMap((a, i) => CHAT_DEMO_PEOPLE.slice(i + 1).map((b) => chatDirectId(P[a], P[b]))), CHAT_TEAM_ID, chatGroupId('obras-y-comunidad')]]);
    expect(kinds).toEqual([{ kind: 'direct', n: 28 }, { kind: 'group', n: 1 }, { kind: 'team', n: 1 }]);
    expect(D1).toBe(chatDirectId(P.social, P.camera));
    expect(D2).toBe(chatDirectId(P.boss, P.dispatch));
    expect(T).toBe(CHAT_TEAM_ID);
    // Either person of a seeded direct gets the same id; every seeded pair is allowed; Administración is in none.
    for (const [a, b] of [['camera', 'social'], ['dispatch', 'boss'], ['camera2', 'camera']] as const) {
      expect(await start(a, 'direct', [b])).toBe(chatDirectId(P[a], P[b]));
    }
    const pairs = await sys<{ ok: boolean }>(`select public.chat_pair_allowed(a.user_id, b.user_id) as ok
      from public.chat_members a join public.chat_members b on b.conversation_id = a.conversation_id and a.user_id < b.user_id`);
    expect(pairs.length).toBeGreaterThan(28);
    expect(pairs.every((p) => p.ok)).toBe(true);
    expect(await sys(`select 1 from public.chat_members where user_id = $1`, [P.admin])).toEqual([]);
  });

  it('textos inventados sin fecha, hora, día, teléfono ni mapa; un mensaje sin leer para cada una de las 8; nada aceptado ni avisado', async () => {
    const seeded = await sys<{ body: string; agenda_clear: boolean }>(`select body, agenda_clear from public.chat_messages
      where conversation_id in (select id from public.chat_conversations where id = any ($1::uuid[]))`, [[
      ...CHAT_DEMO_PEOPLE.flatMap((a, i) => CHAT_DEMO_PEOPLE.slice(i + 1).map((b) => chatDirectId(P[a], P[b]))), CHAT_TEAM_ID, chatGroupId('obras-y-comunidad')]]);
    expect(seeded.length).toBeGreaterThanOrEqual(19);
    for (const m of seeded) {
      expect(looksLikeDateTime(m.body), m.body).toBe(false);
      expect(phonesIn(m.body), m.body).toEqual([]);
      expect(hasMap(m.body), m.body).toBe(false);
      expect(m.agenda_clear, m.body).toBe(true);
    }
    // A fresh database: what the seed alone left (this file accepted notices above).
    const fresh = await makeTestDb();
    const unread = await fresh.system((sql) =>
      sql.query<{ user_id: string; n: number }>(
        `select u.id as user_id, (select count(*)::int from public.chat_conversations k
            where (k.kind = 'team' or exists (select 1 from public.chat_members m where m.conversation_id = k.id and m.user_id = u.id))
              and exists (select 1 from public.chat_messages x where x.conversation_id = k.id and x.author_id <> u.id
                            and x.created_at > coalesce((select r.last_read_at from public.chat_reads r where r.conversation_id = k.id and r.user_id = u.id), '-infinity'))) as n
           from unnest($1::uuid[]) u(id)`,
        [CHAT_DEMO_PEOPLE.map((k) => fresh.ids[k])],
      ),
    );
    expect(unread.map((r) => r.n)).toEqual(CHAT_DEMO_PEOPLE.map(() => 1));
    for (const q of ['select 1 from public.chat_notice_ack', 'select 1 from public.chat_rules', `select 1 from public.notifications where kind in ('chat_message', 'team_role_granted')`]) {
      expect(await fresh.system((sql) => sql.query(q)), q).toEqual([]);
    }
    expect(await fresh.system((sql) => sql.query(`select 1 from public.chat_messages where created_at > now()`))).toEqual([]);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------
// The text rules: the database's copy is the app's (row 51)
// ---------------------------------------------------------------------------------------------------------------
describe('las reglas de texto de la base son las de la app (fila 51)', () => {
  it('caso por caso: concreto, mapas, lo que se quita', async () => {
    const one = async (fn: string, texts: string[]) =>
      (await as('social', (sql) => sql.query<{ v: unknown }>(`select public.${fn}(s) as v from unnest($1::text[]) with ordinality as x(s, n) order by n`, [texts]))).map((r) => r.v);
    expect(await one('text_has_concrete_datetime', CONCRETE_CASES.map((c) => c.text))).toEqual(CONCRETE_CASES.map((c) => c.concrete));
    expect(await one('chat_has_map', MAP_CASES.map((c) => c.text))).toEqual(MAP_CASES.map((c) => c.map));
    expect(await one('chat_strip_refs', REF_CASES.map((c) => c.text))).toEqual(REF_CASES.map((c) => c.out));
    expect(await one('chat_strip_timecodes', TIMECODE_CASES.map((c) => c.text))).toEqual(TIMECODE_CASES.map((c) => c.out));
    expect(await as('social', (sql) => sql.one(`select public.text_has_concrete_datetime(null) as a, public.chat_has_map(null) as b,
      public.chat_strip_refs(null) as c, public.chat_strip_timecodes(null) as d`))).toEqual({ a: false, b: false, c: '', d: '' });
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
    for (const n of [rows.filter((x) => x.c).length, rows.filter((x) => x.m).length, rows.filter((x) => x.r !== x.s).length, rows.filter((x) => x.k !== x.s).length]) {
      expect(n).toBeGreaterThan(300);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Writing: the guard (rows 11-15, 19-30)
// ---------------------------------------------------------------------------------------------------------------
describe('escribir: como uno mismo, ahora, y la regla de la agenda (filas 11 a 30)', () => {
  // A conversation where the author is a member, with or without Redes or política in it.
  const where = (author: DemoUserKey, hides: boolean): string => {
    const table: Partial<Record<DemoUserKey, [string, string | null]>> = {
      boss: [BS, D2], dispatch: [G1, D2], ivt: [G1, null], politics: [G1, null], social: [D1, null], camera: [D1, D3],
    };
    const c = table[author]?.[hides ? 0 : 1];
    if (!c) throw new Error(`no conversation for ${author} ${hides}`);
    return c;
  };

  it('cada caso de la tabla, escrito por esa persona en su conversación: pasa (con su agenda_clear), teléfono o fecha', async () => {
    for (const c of GUARD_CASES) {
      const label = `${c.author} ${c.hides ? 'con Redes/política' : 'sin'}: ${c.text}`;
      const p = send(c.author, where(c.author, c.hides), c.text);
      if (c.result === 'ok') {
        expect((await p)!.agenda_clear, label).toBe(c.agendaClear);
      } else {
        const e = await errorOf(p);
        expect(e.code, label).toBe('23514');
        expect(e.message, label).toBe(c.result === 'phone' ? 'chat_messages_no_phone' : 'chat_messages_no_agenda_when');
        // The person reads the rule, never the text.
        expect(friendlyDbError(e), label).not.toContain(c.text);
        expect(friendlyDbError(e), label).toMatch(c.result === 'phone' ? /^Los teléfonos no van/ : /^Aquí está Redes o política/);
      }
    }
  });

  it('11: Grabación escribe en la suya como sí misma: la hora es la de la base, y agenda_clear no se manda', async () => {
    const m = (await send('camera', D1, 'Texto de prueba de Grabación (demo).'))!;
    expect(m.agenda_clear).toBe(true);
    expect(new Date(m.created_at).getTime()).toBe(new Date(m.now).getTime());
    for (const q of [
      `insert into public.chat_messages (conversation_id, author_id, body, created_at) values ($1, auth.uid(), 'Con otra hora', now() - interval '3 days')`,
      `insert into public.chat_messages (conversation_id, author_id, body, agenda_clear) values ($1, auth.uid(), 'Con su marca', false)`,
    ]) {
      expect((await errorOf(as('camera', (sql) => sql.query(q, [D1])))).message, q).toMatch(/permission denied/);
    }
    // The same id twice (a retried send): one message.
    const id = '7a1c0e52-9b3d-4f6a-8e21-5c4b3a291807';
    await as('camera', (sql) => sql.query(`insert into public.chat_messages (id, conversation_id, author_id, body) values ($1, $2, auth.uid(), 'Una vez (demo).')`, [id, D1]));
    await as('camera', (sql) => sql.query(`insert into public.chat_messages (id, conversation_id, author_id, body) values ($1, $2, auth.uid(), 'Una vez (demo).') on conflict (id) do nothing`, [id, D1]));
    expect(await sys(`select 1 from public.chat_messages where id = $1`, [id])).toHaveLength(1);
  });

  it('12 a 14: no como otra persona, no donde no es miembro, y el jefe no escribe donde solo lee', async () => {
    const e12 = await errorOf(as('camera', (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, 'Como Redes')`, [D1, P.social])));
    expect(e12.code).toBe('42501');
    expect(friendlyDbError(e12)).toBe('Ya no puedes escribir en esta conversación.');
    for (const [who, c] of [['social', D2], ['boss', D1], ['social', G1]] as const) {
      const e = await errorOf(send(who, c, 'Hola (demo)'));
      expect(e.code, `${who} ${c}`).toBe('42501');
    }
    // The refusal says nothing of that conversation: a date where the person cannot write is the same refusal.
    expect((await errorOf(send('dispatch', D1, 'el jueves a las 10'))).message).toBe('Ya no puedes escribir en esta conversación.');
  });

  it('15: nadie edita ni borra un mensaje, un miembro ni el aviso aceptado; nadie vacía las tablas (el sistema tampoco)', async () => {
    const msg = (await sys<{ id: string }>(`select id from public.chat_messages where conversation_id = $1 limit 1`, [D1]))[0].id;
    for (const q of [`update public.chat_messages set body = 'x' where id = $1`, `delete from public.chat_messages where id = $1`]) {
      await expect(as('camera', (sql) => sql.query(q, [msg])), q).rejects.toThrow(/permission denied/);
      await expect(t.system((sql) => sql.query(q, [msg])), q).rejects.toThrow(/append-only/);
    }
    const member = (await sys<{ id: string }>(`select id from public.chat_members where conversation_id = $1 limit 1`, [D1]))[0].id;
    for (const q of [`update public.chat_members set user_id = user_id where id = $1`, `delete from public.chat_members where id = $1`]) {
      await expect(as('social', (sql) => sql.query(q, [member])), q).rejects.toThrow(/permission denied/);
      await expect(t.system((sql) => sql.query(q, [member])), q).rejects.toThrow(/append-only/);
    }
    for (const q of [`update public.chat_notice_ack set ack_at = now() where user_id = auth.uid()`, `delete from public.chat_notice_ack where user_id = auth.uid()`]) {
      await expect(as('social', (sql) => sql.query(q)), q).rejects.toThrow(/permission denied/);
    }
    await expect(t.system((sql) => sql.query(`delete from public.chat_notice_ack where user_id = $1`, [P.social]))).rejects.toThrow(/append-only/);
    await expect(t.system((sql) => sql.query(`delete from public.chat_conversations where id = $1`, [D1]))).rejects.toThrow(/append-only/);
    for (const table of ['chat_messages', 'chat_members', 'chat_conversations', 'chat_notice_ack']) {
      await expect(t.system((sql) => sql.query(`truncate public.${table} cascade`)), table).rejects.toThrow(/append-only/);
    }
    expect(await sys(`select 1 from public.chat_messages where id = $1`, [msg])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// «Solo el jefe escribe» (rows 16-18)
// ---------------------------------------------------------------------------------------------------------------
describe('«Solo el jefe escribe» (filas 16 a 18)', () => {
  it('el jefe no cambia una conversación por la tabla; con chat_set_only_boss() sí, y nadie más', async () => {
    await expect(as('boss', (sql) => sql.query(`update public.chat_conversations set only_boss_posts = true where id = $1`, [T]))).rejects.toThrow(/permission denied/);
    await expect(as('dispatch', (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [T]))).rejects.toThrow(/boss only/);
    await expect(as('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [T]), 'aal1')).rejects.toThrow(/boss only/);
    // A direct has no «Solo el jefe escribe».
    await expect(as('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [D2]))).rejects.toThrow(/not found/);
    await as('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [T]));
    try {
      expect((await errorOf(send('social', T, 'Hola a todos (demo)'))).code).toBe('42501');
      expect((await send('boss', T, 'Solo el jefe escribe aquí por ahora (demo).'))!.agenda_clear).toBe(true);
      // The flag of a trusted update does not stay on after the function.
      expect(await as('boss', async (sql) => {
        await sql.query(`select public.chat_set_only_boss($1, true)`, [T]);
        return (await sql.one<{ v: string | null }>(`select current_setting('app.trusted_update', true) as v`))!.v ?? '';
      })).not.toBe('on');
    } finally {
      await as('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, false)`, [T]));
    }
    expect((await send('social', T, 'Ya escribimos todos otra vez (demo).'))!.agenda_clear).toBe(true);
    const shape = await sys<{ only_boss_posts: boolean; title: string }>(`select only_boss_posts, title from public.chat_conversations where id = $1`, [T]);
    expect(shape).toEqual([{ only_boss_posts: false, title: 'Todo el equipo' }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Reading (rows 1-10, 31-33, 52)
// ---------------------------------------------------------------------------------------------------------------
describe('leer (filas 1 a 10)', () => {
  it('1-2: cada quien lee sus conversaciones y nada de las ajenas', async () => {
    expect(await count('social', 'select 1 from public.chat_conversations where id = $1', [D1])).toBe(1);
    expect(await count('social', 'select 1 from public.chat_messages where conversation_id = $1', [D1])).toBeGreaterThan(3);
    expect(await count('social', 'select 1 from public.chat_members where conversation_id = $1', [D1])).toBe(2);
    for (const c of [D2, G1]) {
      for (const table of ['chat_conversations', 'chat_members', 'chat_messages']) {
        const col = table === 'chat_conversations' ? 'id' : 'conversation_id';
        expect(await count('social', `select 1 from public.${table} where ${col} = $1`, [c]), `${table} ${c}`).toBe(0);
      }
      expect(await as('social', (sql) => sql.query(`select * from public.chat_member_list($1)`, [c]))).toEqual([]);
    }
  });

  it('3: el jefe con doble factor lee todas las conversaciones y todos sus mensajes', async () => {
    for (const c of [D1, D2, G1, T, D3, D4]) expect(await count('boss', 'select 1 from public.chat_conversations where id = $1', [c]), c).toBe(1);
    const all = (await sys<{ n: number }>(`select count(*)::int as n from public.chat_messages`))[0].n;
    expect(await count('boss', 'select 1 from public.chat_messages')).toBe(all);
    expect(await count('boss', 'select 1 from public.chat_conversations')).toBe((await sys<{ n: number }>(`select count(*)::int as n from public.chat_conversations`))[0].n);
  });

  it('4 y 10: sin doble factor, ni el jefe ni el despacho leen (tampoco las suyas)', async () => {
    expect(await count('boss', 'select 1 from public.chat_conversations where id = $1', [D1], 'aal1')).toBe(0);
    expect(await count('boss', 'select 1 from public.chat_conversations where id = $1', [D2], 'aal1')).toBe(0);
    expect(await count('boss', 'select 1 from public.chat_messages', [], 'aal1')).toBe(0);
    expect(await count('dispatch', 'select 1 from public.chat_messages where conversation_id = $1', [G1], 'aal1')).toBe(0);
    // Grabación and Redes do not use 2FA: they read theirs on a first factor.
    expect(await count('social', 'select 1 from public.chat_messages where conversation_id = $1', [D1], 'aal1')).toBeGreaterThan(0);
  });

  it('5: Administración no lee nada: ni las seis tablas ni las funciones', async () => {
    await setRule('politics', 'social', true);
    try {
      for (const table of TABLES) expect(await count('admin', `select 1 from public.${table}`), table).toBe(0);
      for (const q of [`select * from public.chat_people()`, `select * from public.chat_member_list('${D1}')`, `select * from public.chat_hidden_marks('${D4}')`]) {
        expect(await count('admin', q), q).toBe(0);
      }
      expect(await as('admin', (sql) => sql.one(`select public.chat_can_read($1) as r, public.chat_hides_agenda_for_me($1) as h, public.chat_may_post($1) as p`, [D1])))
        .toEqual({ r: false, h: false, p: false });
      await expect(start('admin', 'direct', ['social'])).rejects.toThrow(/not allowed/);
      await expect(as('admin', (sql) => sql.query(`select public.chat_team_channel()`))).rejects.toThrow(/not allowed/);
      await expect(as('admin', (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid())`))).rejects.toThrow(/row-level security/);
    } finally {
      await clearRules();
    }
  });

  it('6: el registro de cambios guarda que hubo un mensaje, quién y cuándo; nunca el texto, el nombre del grupo ni los miembros', async () => {
    const log = await as('admin', (sql) =>
      sql.query<{ table_name: string; row_id: string; action: string; old_data: unknown; new_data: unknown; actor_id: string | null }>(
        `select table_name, row_id, action, old_data, new_data, actor_id from public.audit_log where table_name like 'chat\\_%' order by id`,
      ),
    );
    const content = log.filter((r) => r.table_name !== 'chat_rules');
    expect(new Set(content.map((r) => r.table_name))).toEqual(new Set(['chat_conversations', 'chat_members', 'chat_messages', 'chat_notice_ack']));
    for (const r of content) expect([r.old_data, r.new_data], r.table_name).toEqual([null, null]);
    const messageIds = new Set((await sys<{ id: string }>(`select id from public.chat_messages`)).map((r) => r.id));
    expect(content.filter((r) => r.table_name === 'chat_messages').every((r) => messageIds.has(r.row_id))).toBe(true);
    // A member row is named by its own id, never by the person it holds.
    const memberIds = new Set((await sys<{ id: string }>(`select id from public.chat_members`)).map((r) => r.id));
    expect(content.filter((r) => r.table_name === 'chat_members').every((r) => memberIds.has(r.row_id))).toBe(true);
    const text = JSON.stringify(log);
    for (const s of ['Grupo de prueba', 'Obras y comunidad', 'Todo el equipo', 'Texto de prueba de Grabación', 'Ya subí las tomas', 'mañana te mando la frase', 'body']) {
      expect(text, s).not.toContain(s);
    }
  });

  it('7: una cuenta con Administración y Redes no está en Mensajes', async () => {
    for (const c of [D1, T, G1]) expect(await count('adminSocial', 'select 1 from public.chat_conversations where id = $1', [c]), c).toBe(0);
    expect(await count('adminSocial', 'select 1 from public.chat_messages')).toBe(0);
    await expect(start('adminSocial', 'direct', ['social'])).rejects.toThrow(/not allowed/);
    // Nor is it a person someone can write to.
    await expect(start('social', 'direct', ['adminSocial'])).rejects.toThrow(/not a team member/);
    const people = await as('social', (sql) => sql.query<{ id: string }>(`select id from public.chat_people()`));
    expect(people.map((p) => p.id)).not.toContain(P.adminSocial);
    await expect(as('adminSocial', (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid())`))).rejects.toThrow(/row-level security/);
  });

  it('8: sin rol o desactivada: nada, y no arma conversaciones', async () => {
    await setActive('gone', false);
    try {
      for (const who of ['nobody', 'gone'] as const) {
        for (const table of TABLES.filter((x) => x !== 'chat_notice_ack')) expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
        await expect(start(who, 'direct', ['social']), who).rejects.toThrow(/not allowed/);
      }
      // An inactive person is not someone to write to either.
      await expect(start('social', 'direct', ['gone'])).rejects.toThrow(/not a team member/);
    } finally {
      await setActive('gone', true);
    }
  });

  it('9: anon no toca ninguna tabla ni función de Mensajes', async () => {
    const asAnon = (q: string) =>
      t.backend.transaction(async (sql) => {
        await sql.query('set local role anon');
        return sql.query(q);
      });
    for (const table of TABLES) await expect(asAnon(`select * from public.${table}`), table).rejects.toThrow(/permission denied/);
    for (const q of [`select public.chat_people()`, `select public.chat_team_channel()`, `select public.text_has_concrete_datetime('x')`, `select public.is_team_member()`]) {
      await expect(asAnon(q), q).rejects.toThrow(/permission denied/);
    }
  });
});

describe('«Mensaje oculto»: lo escrito con fecha solo lo lee quien conoce la agenda (filas 31 a 33 y 52)', () => {
  let dated: string;

  it('31 y 52: Grabación pasa a Redes y deja de leerlo; el jefe sí; al quitárselo, lo lee otra vez; visible + oculto = todo', async () => {
    await send('dispatch', D4, 'Kevin, la toma de apoyo va completa (demo).');
    dated = (await send('dispatch', D4, 'el jueves a las 10 en la plaza'))!.id;
    await send('camera', D4, 'Listo, entendido (demo).');
    expect((await sys<{ agenda_clear: boolean }>(`select agenda_clear from public.chat_messages where id = $1`, [dated]))[0].agenda_clear).toBe(false);
    expect(await count('camera', 'select 1 from public.chat_messages where id = $1', [dated])).toBe(1);
    await addRole('camera', 'social');
    try {
      expect(await count('camera', 'select 1 from public.chat_messages where id = $1', [dated])).toBe(0);
      expect(await count('boss', 'select 1 from public.chat_messages where id = $1', [dated])).toBe(1);
      const marks = await as('camera', (sql) => sql.query<{ id: string; author_id: string }>(`select id, author_id from public.chat_hidden_marks($1)`, [D4]));
      expect(marks).toEqual([{ id: dated, author_id: P.dispatch }]);
      // Row 52: what camera sees plus where the hidden ones sit = every message of D4.
      const visible = (await as('camera', (sql) => sql.query<{ id: string }>(`select id from public.chat_messages where conversation_id = $1`, [D4]))).map((r) => r.id);
      const all = (await sys<{ id: string }>(`select id from public.chat_messages where conversation_id = $1`, [D4])).map((r) => r.id);
      expect([...visible, ...marks.map((m) => m.id)].sort()).toEqual([...all].sort());
      expect(visible).not.toContain(dated);
      // Now Redes is in D4: despacho cannot write a date there any more.
      expect((await errorOf(send('dispatch', D4, 'a las 11'))).message).toBe('chat_messages_no_agenda_when');
      // Nobody sees the hidden marks of a conversation they cannot read.
      expect(await count('social', 'select * from public.chat_hidden_marks($1)', [D4])).toBe(0);
    } finally {
      await dropRole('camera', 'social');
    }
    expect(await count('camera', 'select 1 from public.chat_messages where id = $1', [dated])).toBe(1);
    expect(await count('camera', 'select * from public.chat_hidden_marks($1)', [D4])).toBe(0);
  });

  it('32 y 48: una persona de Redes desactivada en un grupo cuenta igual para la regla; para escribir, se ignora; una directa sin nadie activo, no', async () => {
    await setActive('gone', false);
    try {
      expect((await errorOf(send('dispatch', G2, 'mañana a las 9'))).message).toBe('chat_messages_no_agenda_when');
      expect((await send('dispatch', G2, 'Mariela, ya está la nota (demo).'))!.agenda_clear).toBe(true);
    } finally {
      await setActive('gone', true);
    }
    await setActive('camera', false);
    try {
      expect((await errorOf(send('social', D1, 'Kevin, ¿estás? (demo)'))).code).toBe('42501');
      expect(await as('social', (sql) => sql.one(`select public.chat_may_post($1) as p`, [D1]))).toEqual({ p: false });
    } finally {
      await setActive('camera', true);
    }
    expect(await as('social', (sql) => sql.one(`select public.chat_may_post($1) as p`, [D1]))).toEqual({ p: true });
  });

  it('33: política + IVT no lee lo escrito con fecha en su grupo, y no se lo escribe a Redes (conoce la agenda por el IVT)', async () => {
    // Made while the person had the IVT only, so despacho could write a date there.
    await dropRole('polIvt', 'politics');
    let G3: string;
    let hidden: string;
    try {
      G3 = await start('dispatch', 'group', ['polIvt', 'camera'], 'Grupo de la visita');
      hidden = (await send('dispatch', G3, 'el jueves a las 10'))!.id;
      expect(await count('polIvt', 'select 1 from public.chat_messages where id = $1', [hidden])).toBe(1);
    } finally {
      await addRole('polIvt', 'politics');
    }
    expect(await count('polIvt', 'select 1 from public.chat_messages where id = $1', [hidden])).toBe(0);
    expect(await count('polIvt', 'select * from public.chat_hidden_marks($1)', [G3])).toBe(1);
    expect(await count('camera', 'select 1 from public.chat_messages where id = $1', [hidden])).toBe(1);
    const toSocial = await start('polIvt', 'direct', ['social']);
    expect((await errorOf(send('polIvt', toSocial, 'el jueves a las 10'))).message).toBe('chat_messages_no_agenda_when');
    expect((await send('polIvt', toSocial, 'Daniela, ya está la ficha (demo).'))!.agenda_clear).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Who talks to whom (rows 34-44)
// ---------------------------------------------------------------------------------------------------------------
describe('quién habla con quién lo decide el jefe (filas 34 a 44)', () => {
  it('34 a 37: el jefe con doble factor cambia las reglas (queda quién); nadie más; solo parejas de roles distintos del equipo; el equipo las lee', async () => {
    try {
      await setRule('politics', 'social', false);
      expect(await sys(`select role_a::text, role_b::text, allowed, updated_by from public.chat_rules`)).toEqual([
        { role_a: 'politics', role_b: 'social', allowed: false, updated_by: P.boss },
      ]);
      expect(await as('boss', (sql) => sql.query(`update public.chat_rules set allowed = true where role_a = 'politics' and role_b = 'social' returning allowed`))).toEqual([{ allowed: true }]);
      await setRule('politics', 'social', false);
      for (const who of ['admin', 'dispatch'] as const) {
        await expect(as(who, (sql) => sql.query(`insert into public.chat_rules (role_a, role_b, allowed) values ('dispatch', 'camera', false)`)), who).rejects.toThrow(/row-level security/);
        expect(await as(who, (sql) => sql.query(`update public.chat_rules set allowed = true returning 1`)), who).toEqual([]);
      }
      await expect(as('boss', (sql) => sql.query(`insert into public.chat_rules (role_a, role_b, allowed) values ('dispatch', 'camera', false)`), 'aal1')).rejects.toThrow(/row-level security/);
      for (const [a, b] of [['boss', 'social'], ['admin', 'social'], ['social', 'social'], ['camera', 'social']]) {
        const e = await errorOf(as('boss', (sql) => sql.query(`insert into public.chat_rules (role_a, role_b, allowed) values ($1, $2, false)`, [a, b])));
        expect(e.code, `${a} ${b}`).toBe('23514');
      }
      expect(await count('social', 'select 1 from public.chat_rules')).toBe(1);
      expect(await count('camera', 'select 1 from public.chat_rules')).toBe(1);
    } finally {
      await clearRules();
    }
  });

  it('38 a 40: con Redes ↔ Política cerrada no se arma ni se escribe; lo de antes se sigue leyendo; con dos roles gana la regla más restrictiva', async () => {
    const before = await start('social', 'direct', ['politics']);
    await send('social', before, 'Elio, te paso la pieza (demo).');
    const polIvtSocial = await start('polIvt', 'direct', ['social']);
    await setRule('politics', 'social', false);
    await setRule('ivt', 'social', true);
    try {
      // 38: the direct that existed comes back (its history is read), and nobody writes in it.
      expect(await start('social', 'direct', ['politics'])).toBe(before);
      expect(await count('social', 'select 1 from public.chat_messages where conversation_id = $1', [before])).toBeGreaterThan(0);
      expect((await errorOf(send('social', before, 'Otra vez (demo)'))).code).toBe('42501');
      expect((await errorOf(send('politics', before, 'Otra vez (demo)'))).code).toBe('42501');
      // A new one is not made.
      const e = await errorOf(start('social2', 'direct', ['polIvt']));
      expect(e.message).toBe('chat_pair_not_allowed');
      expect(friendlyDbError(e)).toBe('El jefe no permite mensajes entre estas personas.');
      // 39: nor a group with the pair inside.
      expect((await errorOf(start('dispatch', 'group', ['politics', 'social'], 'Grupo mezclado'))).message).toBe('chat_pair_not_allowed');
      // 40: política + IVT ↔ Redes: closed, although IVT ↔ Redes is open.
      expect((await sys<{ ok: boolean }>(`select public.chat_pair_allowed($1, $2) as ok`, [P.polIvt, P.social]))[0].ok).toBe(false);
      expect((await sys<{ ok: boolean }>(`select public.chat_pair_allowed($1, $2) as ok`, [P.ivt, P.social]))[0].ok).toBe(true);
      expect((await errorOf(send('polIvt', polIvtSocial, 'Hola (demo)'))).code).toBe('42501');
      const people = await as('polIvt', (sql) => sql.query<{ id: string; can_write: boolean }>(`select id, can_write from public.chat_people()`));
      expect(people.find((p) => p.id === P.social)?.can_write).toBe(false);
      expect(people.find((p) => p.id === P.camera)?.can_write).toBe(true);
      // 41: «Todo el equipo» does not follow the pairs.
      expect((await send('social', T, 'Para todos (demo).'))!.agenda_clear).toBe(true);
      expect((await send('politics', T, 'Recibido (demo).'))!.agenda_clear).toBe(true);
    } finally {
      await clearRules();
    }
    expect((await send('social', before, 'Ya se puede otra vez (demo).'))!.agenda_clear).toBe(true);
  });

  it('42: con todas las parejas cerradas, todos le escriben al jefe y el jefe a todos', async () => {
    const pairs = [['dispatch', 'politics'], ['dispatch', 'ivt'], ['dispatch', 'social'], ['dispatch', 'camera'], ['politics', 'ivt'],
      ['politics', 'social'], ['politics', 'camera'], ['ivt', 'social'], ['ivt', 'camera'], ['social', 'camera']];
    try {
      for (const [a, b] of pairs) await setRule(a, b, false);
      expect(await count('social', 'select 1 from public.chat_rules where not allowed')).toBe(10);
      expect((await send('social', BS, 'Jefe, ¿lo vemos? (demo)'))!.agenda_clear).toBe(true);
      expect((await send('boss', BS, 'Sí, pásamelo (demo).'))!.agenda_clear).toBe(true);
      const toBoss = await start('camera', 'direct', ['boss']);
      expect((await send('camera', toBoss, 'Jefe, ya está el material (demo).'))!.agenda_clear).toBe(true);
      expect((await errorOf(send('social', D1, 'Kevin (demo)'))).code).toBe('42501');
      const people = await as('social', (sql) => sql.query<{ id: string; can_write: boolean }>(`select id, can_write from public.chat_people()`));
      // The boss, and the other people of Redes (v1 has no rule between people of the same role, U14).
      expect(people.filter((p) => p.can_write).map((p) => p.id).sort()).toEqual([P.boss, P.social2, P.gone].sort());
    } finally {
      await clearRules();
    }
  });

  it('43: la misma directa una sola vez, también si se pide dos veces a la vez', async () => {
    const [a, b] = await Promise.all([start('camera', 'direct', ['r1']), start('camera', 'direct', ['r1'])]);
    expect(a).toBe(b);
    expect(await start('r1', 'direct', ['camera'])).toBe(a);
    expect(await sys(`select 1 from public.chat_members where conversation_id = $1`, [a])).toHaveLength(2);
    // The same with the seeded one.
    expect(await start('camera', 'direct', ['camera2'])).toBe(D3);
  });

  it('44: un grupo va de 3 a 12 personas, con nombre, sin teléfono, y sin fecha ni mapa en el nombre si están Redes o política', async () => {
    const twelve: Who[] = ['boss', 'dispatch', 'politics', 'ivt', 'social2', 'camera', 'camera2', 'polIvt', 'r1', 'r2', 'r3', 'r4'];
    for (const [members, title] of [[['camera'], 'Dos'], [twelve, 'Trece'], [['camera', 'camera2'], null], [['camera', 'camera2'], '   ']] as [Who[], string | null][]) {
      expect((await errorOf(start('social', 'group', members, title ?? undefined))).code, `${members.length} ${title}`).toBe('22023');
    }
    for (const title of ['Vocera 0414-555-1234', 'Lo de mañana', 'Plaza maps.google.com', 'El 12/11']) {
      const e = await errorOf(start('social', 'group', ['politics', 'camera'], title));
      expect(e.message, title).toBe('chat_title_private');
    }
    // Without Redes or política a name may say «mañana» (never a phone).
    expect(await start('camera', 'group', ['camera2', 'r1'], 'Lo de mañana')).toMatch(/^[0-9a-f-]{36}$/);
    expect((await errorOf(start('camera', 'group', ['camera2', 'r1'], 'Vocera 0414-555-1234'))).message).toBe('chat_title_private');
    expect(await start('social', 'group', twelve.slice(0, 10), 'Grupo grande (demo)')).toMatch(/^[0-9a-f-]{36}$/);
    await expect(start('social', 'team', ['camera'], 'Otro equipo')).rejects.toThrow(/kind/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Own state, the notice, the directory, 360 (rows 45-49)
// ---------------------------------------------------------------------------------------------------------------
describe('lo propio, el aviso, la lista de personas y 360 (filas 45 a 49)', () => {
  it('45: lo leído es de cada quien', async () => {
    await as('camera', (sql) => sql.query(`insert into public.chat_reads (conversation_id, user_id) values ($1, auth.uid()) on conflict (conversation_id, user_id) do update set last_read_at = now()`, [D1]));
    expect(await count('social', 'select 1 from public.chat_reads where user_id <> auth.uid()')).toBe(0);
    await as('social', (sql) => sql.query(`insert into public.chat_reads (conversation_id, user_id, muted) values ($1, auth.uid(), true) on conflict (conversation_id, user_id) do update set muted = true`, [D1]));
    expect(await as('social', (sql) => sql.query(`update public.chat_reads set muted = false, last_read_at = now() where conversation_id = $1 returning muted`, [D1]))).toEqual([{ muted: false }]);
    for (const [q, p] of [
      [`insert into public.chat_reads (conversation_id, user_id) values ($1, auth.uid())`, [D2]],
      [`insert into public.chat_reads (conversation_id, user_id) values ($1, $2)`, [D1, P.camera]],
    ] as [string, unknown[]][]) {
      await expect(as('social', (sql) => sql.query(q, p)), q).rejects.toThrow(/row-level security|duplicate/);
    }
    expect(await as('social', (sql) => sql.query(`update public.chat_reads set muted = true where user_id = $1 returning 1`, [P.camera]))).toEqual([]);
    // «Todo el equipo» is everyone's.
    await as('social', (sql) => sql.query(`insert into public.chat_reads (conversation_id, user_id) values ($1, auth.uid()) on conflict do nothing`, [T]));
  });

  it('46: sin aceptar el aviso no se escribe; aceptarlo es la fila propia y nada más', async () => {
    const mine = chatDirectId(P.boss, P.social2);
    expect((await errorOf(send('social2', mine, 'Jefe, la frase (demo)'))).code).toBe('42501');
    await expect(as('social2', (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values ($1)`, [P.camera2]))).rejects.toThrow(/row-level security|duplicate/);
    await as('social2', (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid()) on conflict do nothing`));
    expect((await send('social2', mine, 'Jefe, ya acepté el aviso (demo).'))!.agenda_clear).toBe(true);
    expect(await as('social2', (sql) => sql.query<{ user_id: string }>(`select user_id from public.chat_notice_ack`))).toEqual([{ user_id: P.social2 }]);
    // The second time is nothing new.
    await as('social2', (sql) => sql.query(`insert into public.chat_notice_ack (user_id) values (auth.uid()) on conflict do nothing`));
    expect(await sys(`select 1 from public.chat_notice_ack where user_id = $1`, [P.social2])).toHaveLength(1);
  });

  it('47: la lista de personas: el equipo activo menos uno mismo, sin cuentas de Administración, con sus roles del equipo', async () => {
    await setActive('gone', false);
    try {
      const people = await as('social', (sql) => sql.query<{ id: string; full_name: string; roles: string; can_write: boolean }>(`select id, full_name, roles::text, can_write from public.chat_people()`));
      const expected = (['boss', 'dispatch', 'politics', 'ivt', 'social2', 'camera', 'camera2', 'polIvt', 'r1', 'r2', 'r3', 'r4'] as Who[]).map((k) => P[k]);
      expect(people.map((p) => p.id).sort()).toEqual(expected.sort());
      expect(people.every((p) => p.can_write)).toBe(true);
      expect(people.find((p) => p.id === P.polIvt)?.roles).toBe('{politics,ivt}');
      expect(people.find((p) => p.id === P.camera)?.full_name).toBe('Kevin Sánchez');
      // The members of a conversation, with names and roles, for whoever reads it.
      const members = await as('social', (sql) => sql.query<{ user_id: string; roles: string; active: boolean }>(`select user_id, roles::text, active from public.chat_member_list($1)`, [D1]));
      expect(members.map((m) => m.user_id).sort()).toEqual([P.social, P.camera].sort());
      const g2 = await as('dispatch', (sql) => sql.query<{ user_id: string; active: boolean }>(`select user_id, active from public.chat_member_list($1)`, [G2]));
      expect(g2.find((m) => m.user_id === P.gone)?.active).toBe(false);
    } finally {
      await setActive('gone', true);
    }
  });

  it('49: lo que corre 360 (app.caller = assistant) no lee ni escribe Mensajes, ni para Redes ni para el jefe', async () => {
    for (const who of ['social', 'boss'] as const) {
      for (const table of TABLES.filter((x) => !['chat_rules', 'chat_notice_ack', 'chat_reads'].includes(x))) {
        expect((await asAssistant(who, (sql) => sql.query(`select 1 from public.${table}`))).length, `${who} ${table}`).toBe(0);
      }
      expect(await asAssistant(who, (sql) => sql.query(`select * from public.chat_people()`))).toEqual([]);
      await expect(asAssistant(who, (sql) => sql.query(`select public.chat_start('direct', $1::uuid[], null)`, [[P.camera2]])), who).rejects.toThrow(/not allowed/);
      await expect(asAssistant(who, (sql) => sql.query(`select public.chat_team_channel()`)), who).rejects.toThrow(/not allowed/);
      const c = who === 'social' ? D1 : D2;
      await expect(asAssistant(who, (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), 'Desde 360')`, [c])), who).rejects.toThrow();
    }
    await expect(asAssistant('boss', (sql) => sql.query(`select public.chat_set_only_boss($1, true)`, [T]))).rejects.toThrow(/boss only/);
    expect(await sys(`select 1 from public.chat_messages where body = 'Desde 360'`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The catalogue (row 50: the other files run unchanged; here, the new functions)
// ---------------------------------------------------------------------------------------------------------------
describe('las funciones nuevas: cerradas a anon; las internas y los disparadores, a todos', () => {
  it('cada una con el permiso que le toca', async () => {
    const INTERNAL = ['chat_team_roles', 'chat_author_knows_agenda', 'chat_author_camera_only', 'chat_pair_allowed', 'chat_hides_agenda'];
    const TRIGGERS = ['chat_message_guard', 'chat_append_only', 'guard_chat_conversation_update', 'chat_stamp_rule', 'audit_chat_row'];
    const API = ['is_team_member', 'chat_reader_knows_agenda', 'chat_by_assistant', 'text_has_concrete_datetime', 'chat_strip_refs', 'chat_has_map',
      'chat_strip_timecodes', 'chat_is_member', 'chat_can_read', 'chat_hides_agenda_for_me', 'chat_may_post', 'chat_start', 'chat_team_channel',
      'chat_set_only_boss', 'chat_people', 'chat_member_list', 'chat_hidden_marks'];
    const rows = await sys<{ f: string; anon: boolean; auth: boolean }>(
      `select p.proname as f, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any ($1::text[]) order by 1`,
      [[...INTERNAL, ...TRIGGERS, ...API]],
    );
    expect(rows).toHaveLength(INTERNAL.length + TRIGGERS.length + API.length);
    for (const r of rows) expect(r, r.f).toMatchObject({ anon: false, auth: API.includes(r.f) });
    // Nothing of Mensajes in the Realtime publication (there is none in the shim; the migration adds nothing anyway).
    expect(await sys(`select 1 from pg_publication_tables where tablename like 'chat\\_%'`)).toEqual([]);
  });
});
