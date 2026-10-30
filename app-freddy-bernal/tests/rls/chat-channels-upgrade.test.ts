// What Mensajes held BEFORE 20261029090000_chat_channels.sql becomes channels (R5, D-87): every direct and group turns
// into an ARCHIVED channel with the same members plus the bosses, nothing is deleted, the notice (chat_notice_ack) and
// «Quién habla con quién» (chat_rules) go, and the boss's notice about a new team role opens /mensajes. The database
// is built up to the migration before it, the old rows are written as 20261028002400 let them be written, then the
// rest run, as on a real project (PGlite by default; a throwaway Postgres 16 database on TEST_DATABASE_URL). All data
// here is invented.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { asSystem, asUser, type Backend, type Row, type Sql } from '@/lib/db/core';
import { pgliteBackend } from '@/lib/db/pglite';
import { readMigrations, readShim } from '@/lib/db/migrations';

const FIRST_NEW = '20261029090000';

type Fresh = { backend: Backend; exec: (text: string) => Promise<void>; close: () => Promise<void> };

async function freshDb(): Promise<Fresh> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const db = new PGlite();
    return { backend: pgliteBackend(db), exec: async (t) => void (await db.exec(t)), close: () => db.close() };
  }
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const name = `fb_chatup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const u = new URL(url);
  u.pathname = `/${name}`;
  const client = postgres(u.toString(), { max: 2, onnotice: () => {} });
  const wrap = (tx: postgres.TransactionSql): Sql => ({
    query: async <T = Row>(t: string, p: unknown[] = []) => (await tx.unsafe(t, p as never[])) as unknown as T[],
    one: async <T = Row>(t: string, p: unknown[] = []) => ((await tx.unsafe(t, p as never[])) as unknown as T[])[0] ?? null,
  });
  return {
    backend: {
      transaction: (fn) => client.begin((tx) => fn(wrap(tx))) as Promise<never>,
      exec: async (t) => void (await client.unsafe(t)),
    },
    exec: async (t) => void (await client.unsafe(t)),
    close: () => client.end(),
  };
}

const ID = {
  boss: '00000000-0000-4000-8000-0000000000b1',
  dispatch: '00000000-0000-4000-8000-0000000000d1',
  social: '00000000-0000-4000-8000-0000000000a1',
  camera: '00000000-0000-4000-8000-0000000000c1',
  politics: '00000000-0000-4000-8000-0000000000e1',
} as const;
const NAMES: Record<keyof typeof ID, string> = {
  boss: 'Jefe Prueba', dispatch: 'Rubén Prueba', social: 'Daniela Prueba', camera: 'Kevin Prueba', politics: 'Elio Prueba',
};
let f: Fresh;
const sys = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => asSystem(f.backend, (sql) => sql.query<T>(q, p));
const as = <T>(who: keyof typeof ID, fn: (sql: Sql) => Promise<T>) => asUser(f.backend, { sub: ID[who], aal: 'aal2' }, fn);
let d1: string;
let d2: string;
let g1: string;
let team: string;
let g2: string;

beforeAll(async () => {
  f = await freshDb();
  await f.exec(readShim());
  const migrations = readMigrations();
  for (const m of migrations.filter((x) => x.name < FIRST_NEW)) await f.exec(m.sql);
  for (const [k, id] of Object.entries(ID) as [keyof typeof ID, string][]) {
    await sys(`insert into public.invitations (email, full_name, roles) values ($1, $2, $3::public.app_role[])`, [`${k}@prueba.test`, NAMES[k], `{${k}}`]);
    await sys(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@prueba.test`]);
  }
  await sys(`insert into public.app_settings (key, value) values ('security.mfa_roles', '["admin","boss","dispatch","politics","ivt"]'::jsonb)
             on conflict (key) do update set value = excluded.value`);
  // As 20261028002400 left them: two directs, a group, «Todo el equipo», messages, accepted notices, a rule, and the
  // boss's notice pointing at «Quién habla con quién».
  const direct = async (a: keyof typeof ID, b: keyof typeof ID) => {
    const id = (await sys<{ id: string }>(`insert into public.chat_conversations (kind, direct_key, created_by) values ('direct', $1, $2) returning id`, [[ID[a], ID[b]].sort().join(':'), ID[a]]))[0].id;
    await sys(`insert into public.chat_members (conversation_id, user_id, added_by) values ($1, $2, $2), ($1, $3, $2)`, [id, ID[a], ID[b]]);
    return id;
  };
  d1 = await direct('social', 'camera');
  d2 = await direct('boss', 'dispatch');
  g1 = (await sys<{ id: string }>(`insert into public.chat_conversations (kind, title, created_by) values ('group', 'Obras y comunidad', $1) returning id`, [ID.dispatch]))[0].id;
  for (const k of ['dispatch', 'politics', 'camera'] as const) await sys(`insert into public.chat_members (conversation_id, user_id, added_by) values ($1, $2, $3)`, [g1, ID[k], ID.dispatch]);
  team = (await sys<{ id: string }>(`insert into public.chat_conversations (kind, title, created_by) values ('team', 'Todo el equipo', $1) returning id`, [ID.boss]))[0].id;
  await sys(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, 'Ya subí las tomas (prueba).'), ($3, $4, 'La ficha espera (prueba).'), ($5, $6, 'Bienvenidos (prueba).')`,
    [d1, ID.camera, g1, ID.dispatch, team, ID.boss]);
  // R5 review 2, point 2: under the old rule a relative word from whoever knows the agenda, where neither Redes nor
  // política were, left agenda_clear true. One from the despacho in a direct with the boss, one from Grabación with
  // Redes (Redes read it then), and, in a group of Grabación and the despacho, one from Grabación with a relative day
  // and one with only a video time code.
  await sys(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, 'Mañana salimos temprano para la plaza (prueba).'),
             ($3, $4, 'Mañana paso las tomas (prueba).')`,
    [d2, ID.dispatch, d1, ID.camera]);
  g2 = (await sys<{ id: string }>(`insert into public.chat_conversations (kind, title, created_by) values ('group', 'Tomas y fotos', $1) returning id`, [ID.camera]))[0].id;
  for (const k of ['camera', 'dispatch'] as const) await sys(`insert into public.chat_members (conversation_id, user_id, added_by) values ($1, $2, $3)`, [g2, ID[k], ID.camera]);
  await sys(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, $2, 'El lunes en la tarde grabamos (prueba).'), ($1, $2, 'La toma del 2:15 quedó bien (prueba).')`, [g2, ID.camera]);
  expect(await sys(`select count(*)::int as n from public.chat_messages where not agenda_clear`)).toEqual([{ n: 0 }]);
  await sys(`insert into public.chat_notice_ack (user_id) values ($1), ($2)`, [ID.social, ID.camera]);
  await sys(`insert into public.chat_rules (role_a, role_b, allowed) values ('politics', 'social', false)`);
  await sys(`insert into public.notifications (user_id, kind, title, body, link) values ($1, 'team_role_granted', 'Un rol nuevo en el equipo', 'Prueba.', '/mensajes/permisos')`, [ID.boss]);
  for (const m of migrations.filter((x) => x.name >= FIRST_NEW)) await f.exec(m.sql);
}, 180_000);

afterAll(async () => {
  await f?.close();
});

describe('lo que había se vuelve canales archivados (D-87)', () => {
  it('directas y grupos son canales archivados con los mismos miembros más el jefe; «Todo el equipo» sigue igual', async () => {
    const rows = await sys<{ id: string; kind: string; title: string; archived: boolean }>(`select id, kind, title, archived_at is not null as archived from public.chat_conversations order by created_at`);
    expect(rows.map((r) => [r.id, r.kind, r.title, r.archived])).toEqual([
      [d1, 'channel', 'Conversación de Daniela y Kevin', true],
      [d2, 'channel', 'Conversación de Jefe y Rubén', true],
      [g1, 'channel', 'Obras y comunidad', true],
      [team, 'team', 'Todo el equipo', false],
      [g2, 'channel', 'Tomas y fotos', true],
    ]);
    const members = await sys<{ conversation_id: string; user_id: string; via: string }>(`select conversation_id, user_id, via from public.chat_members where removed_at is null order by conversation_id, user_id`);
    const of = (c: string) => members.filter((m) => m.conversation_id === c).map((m) => [m.user_id, m.via]).sort();
    expect(of(d1)).toEqual([[ID.boss, 'boss'], [ID.camera, 'picked'], [ID.social, 'picked']].sort());
    // The boss was already in that one: he stays «picked».
    expect(of(d2)).toEqual([[ID.boss, 'picked'], [ID.dispatch, 'picked']].sort());
    expect(of(g1)).toEqual([[ID.boss, 'boss'], [ID.camera, 'picked'], [ID.dispatch, 'picked'], [ID.politics, 'picked']].sort());
  });

  it('los mensajes siguen ahí y los leen sus miembros (y el jefe); nadie escribe en los archivados', async () => {
    expect(await sys(`select count(*)::int as n from public.chat_messages`)).toEqual([{ n: 7 }]);
    expect(await as('social', (sql) => sql.query<{ body: string }>(`select body from public.chat_messages where conversation_id = $1 order by created_at`, [d1]))).toEqual([{ body: 'Ya subí las tomas (prueba).' }, { body: 'Mañana paso las tomas (prueba).' }]);
    expect(await as('boss', (sql) => sql.query(`select 1 from public.chat_messages where conversation_id = $1`, [d1]))).toHaveLength(2);
    expect(await as('politics', (sql) => sql.query(`select 1 from public.chat_messages where conversation_id = $1`, [d1]))).toHaveLength(0);
    await expect(as('social', (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), 'Hola (prueba)')`, [d1]))).rejects.toThrow(/Ya no puedes escribir en este canal/);
    // Without a notice to accept: whoever never accepted it writes in «Todo el equipo».
    await as('politics', (sql) => sql.query(`insert into public.chat_messages (conversation_id, author_id, body) values ($1, auth.uid(), 'Recibido (prueba).')`, [team]));
  });

  it('el aviso y las reglas ya no existen; el aviso al jefe abre /mensajes; el registro de los canales sigue sin contenido', async () => {
    expect(await sys(`select to_regclass('public.chat_notice_ack') as a, to_regclass('public.chat_rules') as b`)).toEqual([{ a: null, b: null }]);
    expect(await sys(`select proname from pg_proc where proname in ('chat_start', 'chat_pair_allowed', 'chat_stamp_rule')`)).toEqual([]);
    expect(await sys(`select link from public.notifications where kind = 'team_role_granted'`)).toEqual([{ link: '/mensajes' }]);
    // (chat_rules kept the standard trail of a role pair, never a person: those old rows stay, as the migration says.)
    expect(await sys(`select 1 from public.audit_log where table_name like 'chat\\_%' and table_name <> 'chat_rules' and (old_data is not null or new_data is not null)`)).toEqual([]);
  });
});

describe('lo escrito antes con la regla vieja no llega a Redes ni a política por un canal convertido (R5 review 2, punto 2)', () => {
  it('la regla estricta se aplica una vez a lo de las directas y grupos sin Redes ni política: «mañana» de quien sabe la agenda queda oculto', async () => {
    const clear = async (c: string) => Object.fromEntries((await sys<{ body: string; agenda_clear: boolean }>(`select body, agenda_clear from public.chat_messages where conversation_id = $1`, [c])).map((r) => [r.body, r.agenda_clear]));
    expect(await clear(d2)).toEqual({ 'Mañana salimos temprano para la plaza (prueba).': false });
    // Grabación alone: a bare video time code is not an hour; with «el lunes en la tarde» it is.
    expect(await clear(g2)).toEqual({ 'El lunes en la tarde grabamos (prueba).': false, 'La toma del 2:15 quedó bien (prueba).': true });
    // Where Redes already read (d1), E1 stays as it was; whoever does not know the agenda is never touched.
    expect(await clear(d1)).toEqual({ 'Ya subí las tomas (prueba).': true, 'Mañana paso las tomas (prueba).': true });
    // Still append-only after the migration.
    await expect(sys(`update public.chat_messages set agenda_clear = true where conversation_id = $1`, [d2])).rejects.toThrow(/append-only/);
  });

  it('el jefe saca del archivo «Conversación de Jefe y Rubén» y mete a Redes: ve «Mensaje oculto», nunca el «mañana»', async () => {
    await as('boss', (sql) => sql.query(`select public.chat_channel_archive($1, false)`, [d2]));
    await as('boss', (sql) => sql.query(`select public.chat_channel_set_members($1, $2::uuid[])`, [d2, [ID.dispatch, ID.social]]));
    const bodies = await as('social', (sql) => sql.query<{ body: string }>(`select body from public.chat_messages where conversation_id = $1`, [d2]));
    expect(bodies).toEqual([]);
    expect(await as('social', (sql) => sql.query(`select id from public.chat_hidden_marks($1)`, [d2]))).toHaveLength(1);
    // The despacho, who knows the agenda, still reads it.
    expect(await as('dispatch', (sql) => sql.query(`select 1 from public.chat_messages where conversation_id = $1`, [d2]))).toHaveLength(1);
  });
});
