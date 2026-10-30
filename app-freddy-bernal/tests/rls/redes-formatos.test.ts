// Redes por formato in the database (20261029000100_redes_formatos.sql; design R4 §3.2, rows 1 to 58). Every probe
// goes straight to SQL as a person (RLS on), as an API client would, on the demo seed (src/lib/db/seed-parts/redes.ts):
//   * months and the feed: one list of months, 24 places per month born with it, a piece in one place at most and only
//     in its own month, nothing deleted when a month or the feed is emptied, a live piece always in a live month;
//   * what goes out stays frozen or goes back to the boss (slides in the version, copies, the title of a reel or a
//     YouTube video, a story's on-screen text and sticker, a new or edited notice); the rest is free;
//   * design marks and rating (Redes and the boss; the boss's disapproval only the boss lifts, and it holds back a
//     publication after the approval), notices, delete (only the boss) and restore (only administración);
//   * the agenda: nothing new reads it, and who knows it writes no concrete date or time where Redes reads; phones never;
//   * who reads and who calls (the catalogue): the content team, the boss everything, anon nothing.
// Rows run in a fixed order: the feed and month rows that change the seeded Mes 1 and Mes 2 come after the rows that
// read them. All data here is invented.
import { describe, expect, it, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';
import { asUser, friendlyDbError, type Sql } from '@/lib/db/core';
import type { DemoUserKey } from '@/lib/db/seed-demo';
import { MEDIA_LOCK, mediaLockSql } from '@/lib/domain/media-lock';
import { FORMAT, type Format } from '@/lib/domain/redes';

let t: TestDb;
type Aal = 'aal1' | 'aal2';
type Err = Error & { code?: string };
type Who = DemoUserKey | 'nobody';
type Row = Record<string, unknown>;
const NOBODY = '00000000-0000-4000-8000-0000000000f1';

const as = <T>(who: Who, fn: (sql: Sql) => Promise<T>, aal: Aal = 'aal2') =>
  who === 'nobody' ? asUser(t.backend, { sub: NOBODY, aal }, fn) : t.as(who, fn, aal);
const q = <T = Row>(who: Who, text: string, p: unknown[] = [], aal: Aal = 'aal2') => as(who, (sql) => sql.query<T>(text, p), aal);
const one = async <T = Row>(who: Who, text: string, p: unknown[] = [], aal: Aal = 'aal2') => (await q<T>(who, text, p, aal))[0] ?? null;
const sys = <T = Row>(text: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(text, p));
const sysOne = async <T = Row>(text: string, p: unknown[] = []) => (await sys<T>(text, p))[0] ?? null;
const count = async (who: Who, text: string, p: unknown[] = []) => (await one<{ n: number }>(who, `select count(*)::int as n from (${text}) x`, p))!.n;
const sysCount = async (text: string, p: unknown[] = []) => (await sysOne<{ n: number }>(`select count(*)::int as n from (${text}) x`, p))!.n;
const errorOf = async (p: Promise<unknown>): Promise<Err> => {
  try {
    await p;
  } catch (e) {
    return e as Err;
  }
  throw new Error('expected an error');
};
const refused = async (p: Promise<unknown>, code: string, text?: RegExp) => {
  const e = await errorOf(p);
  expect(e.code, e.message).toBe(code);
  if (text) expect(e.message).toMatch(text);
  return e;
};

// ---------------------------------------------------------------------------------------------------------------
// The demo's months and helpers to make pieces the way the screens do (as Redes, through RLS)
// ---------------------------------------------------------------------------------------------------------------
let M1: string; // Mes 1: the seeded pieces, 21 of 24 places taken
let M2: string; // Mes 2: two drafts
let M3: string; // Mes 3: empty (the feed rows play here)
let fileN = 0;

const piece = async (format: Format, title: string, month: string | null = M3, who: Who = 'social') =>
  (await one<{ id: string }>(who, `insert into public.pieces (kind, format, title, content_month_id) values ($1, $2, $3, $4) returning id`, [
    FORMAT[format].kind, format, title, month,
  ]))!.id;
const file = async (mime = 'image/jpeg', status = 'ready') =>
  (await one<{ id: string }>(
    'social',
    `insert into public.media_assets (kind, storage_path, label, mime, size_bytes, status, uploaded_by) values ('final', $1, 'Archivo (prueba)', $2, 1000, $3, auth.uid()) returning id`,
    [`final/prueba-redes-${++fileN}.${mime.startsWith('video/') ? 'mp4' : 'jpg'}`, mime, status],
  ))!.id;
const version = (p: string, v: number, media: string | null, o: { cover?: string | null; slides?: (string | null)[] } = {}) =>
  as('social', async (sql) => {
    await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids) values ($1, $2, $3, $4, $5::uuid[])`, [
      p, v, media, o.cover ?? null, o.slides ?? [],
    ]);
    await sql.query(`update public.pieces set current_version = $2 where id = $1`, [p, v]);
  });
const LONG = 'Copy largo de prueba para Instagram.';
const copies = (p: string) =>
  q('social', `insert into public.copies (piece_id, length_group, body) values ($1, 'long', $2), ($1, 'medium', 'Copy medio de prueba.'), ($1, 'short', 'Copy corto.')`, [p, LONG]);
const send = (p: string) => q('social', `update public.pieces set status = 'in_review' where id = $1`, [p]);
const approve = (p: string) => q('boss', `select public.review_piece($1, 'approved', 'Bien.')`, [p]);
type State = { status: string; revision: number; deleted_at: Date | null; content_month_id: string | null; design_status: string | null; design_by: string | null; rating: number | null };
const stateOf = async (p: string) =>
  (await sysOne<State>(`select status, revision, deleted_at, content_month_id, design_status, design_by, rating from public.pieces where id = $1`, [p]))!;
const slotsOf = (p: string) => sys<{ month_id: string; num: number }>(`select month_id, num from public.feed_slots where piece_id = $1`, [p]);
const at = async (m: string, num: number) => (await sysOne<{ piece_id: string | null }>(`select piece_id from public.feed_slots where month_id = $1 and num = $2`, [m, num]))!.piece_id;
type Placed = { was: string | null; replaced: string | null; moved_from: string | null };
const place = async (who: Who, m: string, num: number, p: string, allowMove = false) =>
  (await one<{ r: Placed }>(who, `select public.feed_place($1, $2::smallint, $3, $4) as r`, [m, num, p, allowMove]))!.r;
const newMonth = async (label: string, who: Who = 'social') =>
  (await one<{ id: string }>(who, `insert into public.content_months (label, ordinal) values ($1, (select coalesce(max(ordinal), 0) + 1 from public.content_months)) returning id`, [label]))!.id;
const livePieces = (m: string) => sysCount(`select 1 from public.pieces where content_month_id = $1 and deleted_at is null`, [m]);

// A file, its three copies, sent and approved: the full way of a post (and of a reel or a YouTube video with a video).
async function approved(format: Format, title: string, month = M3) {
  const p = await piece(format, title, month);
  const isVideo = format === 'reel' || format === 'youtube';
  const media = await file(isVideo ? 'video/mp4' : 'image/jpeg');
  const cover = isVideo ? await file() : media;
  await version(p, 1, media, { cover: format === 'story' ? null : cover });
  if (format !== 'story') await copies(p);
  await send(p);
  await approve(p);
  return { id: p, media, cover };
}
const publish = (who: Who, p: string, cover: string | null, network = 'instagram', format = 'photo', copy = LONG) =>
  one<{ id: string }>(
    who,
    `insert into public.publications (piece_id, network, format, status, mode, url, copy_body, cover_asset_id, published_at)
     values ($1, $2, $3, 'published', 'manual', 'https://example.org/demo/prueba', $4, $5, now()) returning id`,
    [p, network, format, copy, cover],
  );
const schedule = (p: string, cover: string | null, network = 'instagram', format = 'photo', copy = LONG) =>
  one<{ id: string }>(
    'social',
    `insert into public.publications (piece_id, network, format, status, mode, scheduled_at, copy_body, cover_asset_id)
     values ($1, $2, $3, 'scheduled', 'manual', now() + interval '2 days', $4, $5) returning id`,
    [p, network, format, copy, cover],
  );
const pubStatus = async (id: string) => (await sysOne<{ status: string }>(`select status from public.publications where id = $1`, [id]))!.status;

const NEW_TABLES = ['content_months', 'feed_slots', 'piece_details', 'piece_notices'] as const;
// The functions a person calls (the API) and the rest (internal helpers and triggers: nobody calls them).
const API = ['feed_place_of', 'feed_put', 'feed_place', 'feed_swap', 'feed_clear', 'move_piece_to_month', 'delete_content_month', 'remove_piece'];
const INTERNAL = ['check_feed_slot', 'check_piece_feed', 'guard_version_slides', 'guard_piece_details', 'guard_piece_notice', 'notices_reopen_review',
  'redes_piece_rules', 'guard_piece_soft_delete', 'guard_redes_settings', 'guard_content_month', 'content_month_slots', 'guard_feed_slot',
  'guard_piece_month', 'guard_piece_title', 'story_details_reopen_review', 'guard_publication_design'];

beforeAll(async () => {
  t = await makeTestDb();
  const months = await sys<{ id: string; label: string }>(`select id, label from public.content_months where deleted_at is null order by ordinal`);
  expect(months.map((m) => m.label)).toEqual(['Mes 1', 'Mes 2', 'Mes 3']);
  [M1, M2, M3] = months.map((m) => m.id);
  // A person without a role (invented): no invitation, so no roles.
  await sys(`insert into auth.users (id, email) values ($1, 'sinrol-redes@demo.test')`, [NOBODY]);
}, 120_000);

// ---------------------------------------------------------------------------------------------------------------
describe('quién lee, el catálogo y la agenda', () => {
  it('2 ★ Redes lee meses, feed, campos y avisos, y sus piezas con su evento, sin fecha ni hora del evento', async () => {
    for (const table of NEW_TABLES) {
      const live = table === 'content_months' ? ' where deleted_at is null' : '';
      const all = await sysCount(`select 1 from public.${table}${live}`);
      expect(all, table).toBeGreaterThan(0);
      expect(await count('social', `select 1 from public.${table}`), table).toBe(all);
    }
    expect(await count('social', `select p.id, e.title from public.pieces p join public.events e on e.id = p.event_id where p.deleted_at is null`)).toBeGreaterThan(0);
    const cols = await sys<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = any ($1::text[])`,
      [[...NEW_TABLES]],
    );
    expect(cols.map((c) => c.column_name).filter((c) => ['starts_at', 'ends_at', 'done_on', 'exact_address', 'directions', 'site_contacts'].includes(c))).toEqual([]);
    expect(await q('social', `select starts_at from public.event_schedule`)).toEqual([]);
    await refused(q('social', `select done_on from public.events`), '42501');
  });

  it('3 ★ ninguna función nueva nombra la agenda (event_schedule, event_calendar, done_on ni events)', async () => {
    const defs = await sys<{ f: string; def: string }>(
      `select p.proname as f, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1::text[])`,
      [[...API, ...INTERNAL]],
    );
    expect(defs).toHaveLength(API.length + INTERNAL.length);
    for (const d of defs) expect(d.def, d.f).not.toMatch(/\b(event_schedule|event_calendar|done_on|events)\b/);
  });

  it('38 despacho, política, IVT, Grabación y alguien sin rol no leen las cuatro tablas', async () => {
    for (const who of ['dispatch', 'politics', 'ivt', 'camera', 'camera2', 'nobody'] as const) {
      for (const table of NEW_TABLES) expect(await count(who, `select 1 from public.${table}`), `${who} ${table}`).toBe(0);
    }
  });

  it('39 anon no toca ninguna tabla ni función nueva', async () => {
    const asAnon = (text: string, p: unknown[] = []) =>
      t.backend.transaction(async (sql) => {
        await sql.query('set local role anon');
        return sql.query(text, p);
      });
    for (const table of NEW_TABLES) await refused(asAnon(`select 1 from public.${table}`), '42501');
    await refused(asAnon(`select public.feed_place_of($1)`, [M1]), '42501');
    await refused(asAnon(`select public.feed_place($1, 1::smallint, $1)`, [M1]), '42501');
    await refused(asAnon(`select public.feed_swap($1, 1::smallint)`, [M1]), '42501');
    await refused(asAnon(`select public.feed_clear($1)`, [M1]), '42501');
    await refused(asAnon(`select public.feed_put($1, 1::smallint, $1)`, [M1]), '42501');
    await refused(asAnon(`select public.move_piece_to_month($1, $1)`, [M1]), '42501');
    await refused(asAnon(`select public.delete_content_month($1, 0)`, [M1]), '42501');
    await refused(asAnon(`select public.remove_piece($1)`, [M1]), '42501');
  });

  it('40 el jefe ve todas las filas vivas de las cuatro tablas', async () => {
    for (const table of NEW_TABLES) {
      const live = table === 'content_months' ? ' where deleted_at is null' : '';
      expect(await count('boss', `select 1 from public.${table}`), table).toBe(await sysCount(`select 1 from public.${table}${live}`));
    }
  });

  it('43 las funciones nuevas: cerradas a anon; a authenticated, solo las 8 de la API', async () => {
    const rows = await sys<{ f: string; anon: boolean; auth: boolean }>(
      `select p.proname as f, has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any ($1::text[]) order by 1`,
      [[...API, ...INTERNAL]],
    );
    expect(rows).toHaveLength(API.length + INTERNAL.length);
    for (const r of rows) expect(r, r.f).toMatchObject({ anon: false, auth: API.includes(r.f) });
    // Nothing new in the Realtime publication (the feed lives on pieces and publications).
    expect(await sys(`select 1 from pg_publication_tables where tablename = any ($1::text[])`, [[...NEW_TABLES]])).toEqual([]);
  });

  it('56 cada mes nace con sus 24 espacios vacíos', async () => {
    const m = (await sysOne<{ id: string }>(`insert into public.content_months (label, ordinal) values ('Mes de sistema', 90) returning id`))!.id;
    expect(await sys(`select num from public.feed_slots where month_id = $1 and piece_id is null order by num`, [m])).toHaveLength(24);
    for (const month of [M1, M2, M3]) expect(await sysCount(`select 1 from public.feed_slots where month_id = $1`, [month])).toBe(24);
    await sys(`update public.content_months set deleted_at = now() where id = $1`, [m]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('aprobación: nada sale sin el jefe', () => {
  const inReview = async () => (await sysOne<{ id: string; cover: string }>(
    `select p.id, v.cover_asset_id as cover from public.pieces p join public.piece_versions v on v.piece_id = p.id and v.version = p.current_version
      where p.title = 'La vecina que volvió a tener agua'`,
  ))!;

  it('4 ★ Redes no aprueba un post (ni por la función ni a mano)', async () => {
    const p = (await inReview()).id;
    await refused(q('social', `select public.review_piece($1, 'approved')`, [p]), '42501');
    await refused(q('social', `update public.pieces set status = 'approved' where id = $1`, [p]), '42501');
    expect((await stateOf(p)).status).toBe('in_review');
  });

  it('5 ★ el jefe sin doble factor no aprueba; con doble factor sí', async () => {
    const p = await piece('post', 'Post para el doble factor');
    await version(p, 1, await file());
    await copies(p);
    await send(p);
    await refused(q('boss', `select public.review_piece($1, 'approved')`, [p], 'aal1'), '42501');
    await q('boss', `select public.review_piece($1, 'approved')`, [p]);
    expect((await stateOf(p)).status).toBe('approved');
  });

  it('6 ★ no se marca publicado un post sin aprobar, aunque el copy y la portada sean los suyos', async () => {
    const r = await inReview();
    const long = (await sysOne<{ body: string }>(`select body from public.copies where piece_id = $1 and length_group = 'long'`, [r.id]))!.body;
    await refused(publish('social', r.id, r.cover, 'instagram', 'photo', long), '42501', /La pieza no está aprobada por el jefe\./);
  });

  it('7 ★ «Ya lo publiqué» de un post aprobado pasa; con otro copy, no', async () => {
    const p = await approved('post', 'Post para Ya lo publiqué');
    await refused(publish('social', p.id, p.cover, 'instagram', 'photo', 'Otro copy que el jefe no vio.'), '42501', /copy no es el aprobado/);
    expect(await publish('social', p.id, p.cover)).toMatchObject({ id: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('el feed: 24 espacios por mes, una pieza en un solo lugar', () => {
  it('1 ★ Redes crea un reel, un post y un carrusel en Mes 1, llena sus campos y láminas, sube versión y coloca en el feed', async () => {
    const reel = await piece('reel', 'Reel de prueba del feed', M1);
    const post = await piece('post', 'Post de prueba del feed', M1);
    const car = await piece('carousel', 'Carrusel de prueba del feed', M1);
    await q('social', `insert into public.piece_details (piece_id, shots) values ($1, $2::text::jsonb)`, [
      reel, JSON.stringify([{ says: 'Hola', action: 'Camina', on_screen: 'Hola' }]),
    ]);
    await q('social', `insert into public.piece_details (piece_id, art_headline, links, post_ratio) values ($1, 'Titular', 'https://example.org/x', '1:1')`, [post]);
    const [a, b] = [await file(), await file()];
    await version(car, 1, a, { cover: a, slides: [a, b, null] });
    await q('social', `insert into public.piece_details (piece_id, slides) values ($1, $2::text::jsonb)`, [
      car, JSON.stringify([{ role: 'cover', title: 'Portada', text: '' }, { role: 'body', title: 'Dos', text: 'Texto' }, { role: 'cta', title: 'Fin', text: '' }]),
    ]);
    // Read as JSON: postgres.js turns a null element of a uuid[] into the text 'NULL' (the database keeps a real null).
    const v = await sysOne<{ slides: (string | null)[]; third_empty: boolean }>(
      `select to_jsonb(slide_asset_ids) as slides, slide_asset_ids[3] is null as third_empty from public.piece_versions where piece_id = $1`,
      [car],
    );
    expect(v).toEqual({ slides: [a, b, null], third_empty: true });
    // Mes 1's own feed stays as seeded (row 16 counts it); the piece moves to Mes 3 with its place.
    expect(await place('social', M3, 1, reel, true)).toMatchObject({ was: null, replaced: null, moved_from: 'Mes 1' });
    expect(await slotsOf(reel)).toEqual([{ month_id: M3, num: 1 }]);
    expect((await stateOf(reel)).content_month_id).toBe(M3);
    await q('social', `select public.feed_clear($1, 1::smallint)`, [M3]);
  });

  it('8 ★ una pieza ya puesta no se pone en otro espacio sin «¿La mueves aquí?» («Ya en Mes 1 · #4»)', async () => {
    const p = (await sysOne<{ id: string }>(`select id from public.pieces where title = 'Tips para comprar en el mercado'`))!.id;
    expect(await slotsOf(p)).toEqual([{ month_id: M1, num: 4 }]);
    await refused(place('social', M1, 22, p), 'P0001', /^Ya en Mes 1 · #4$/);
    await refused(place('social', M3, 2, p), 'P0001', /^Ya en Mes 1 · #4$/);
    expect(await slotsOf(p)).toEqual([{ month_id: M1, num: 4 }]);
  });

  it('9 ★ a mano, la misma pieza en un espacio de otro mes choca al confirmar (feed_slots_one_place) y se dice en palabras', async () => {
    const p = (await sysOne<{ id: string }>(`select id from public.pieces where title = 'Tips para comprar en el mercado'`))!.id;
    const e = await refused(q('social', `update public.feed_slots set piece_id = $2 where month_id = $1 and num = 5`, [M3, p]), '23505', /feed_slots_one_place/);
    expect(friendlyDbError(e)).toBe('Esa pieza acaba de quedar en otro espacio. Mira el feed y vuelve a intentarlo.');
    expect(await at(M3, 5)).toBeNull();
  });

  it('10 ★ nadie agrega espacios ni cambia su número; un número lleno queda con una sola pieza', async () => {
    const p = await piece('post', 'Post del número lleno');
    await refused(q('social', `insert into public.feed_slots (month_id, num, piece_id) values ($1, 3, $2)`, [M3, p]), '42501');
    await refused(q('social', `update public.feed_slots set num = 4 where month_id = $1 and num = 3`, [M3]), '42501', /no cambia de mes ni de número/);
    const other = await piece('post', 'Post que estaba en el #3');
    await place('social', M3, 3, other);
    expect(await place('social', M3, 3, p)).toMatchObject({ replaced: other });
    expect(await at(M3, 3)).toBe(p);
    expect(await slotsOf(other)).toEqual([]);
    await q('social', `select public.feed_clear($1, 3::smallint)`, [M3]);
  });

  it('11 «¿La mueves aquí?» (allow_move): la pieza queda en un solo espacio y el anterior vacío', async () => {
    const p = await piece('reel', 'Reel que se muda');
    await place('social', M3, 6, p);
    expect(await place('social', M3, 8, p, true)).toMatchObject({ was: 'Mes 3 · #6' });
    expect(await slotsOf(p)).toEqual([{ month_id: M3, num: 8 }]);
    expect(await at(M3, 6)).toBeNull();
    await q('social', `select public.feed_clear($1, 8::smallint)`, [M3]);
  });

  it('12 intercambiar dos piezas puestas, y mover a un número vacío', async () => {
    const a = await piece('post', 'Post A del intercambio');
    const b = await piece('post', 'Post B del intercambio');
    await place('social', M3, 10, a);
    await place('social', M3, 11, b);
    await q('social', `select public.feed_swap($1, 11::smallint)`, [a]);
    expect([await at(M3, 10), await at(M3, 11)]).toEqual([b, a]);
    await q('social', `select public.feed_swap($1, 15::smallint)`, [a]);
    expect([await at(M3, 11), await at(M3, 15)]).toEqual([null, a]);
    await q('social', `select public.feed_clear($1)`, [M3]);
  });

  it('13 en el feed no van historias, videos de YouTube ni piezas de fin de mes', async () => {
    for (const format of ['story', 'youtube', 'month_end'] as const) {
      const p = await piece(format, `Pieza de ${FORMAT[format].label}`);
      await refused(place('social', M3, 12, p), 'P0001', /^En el feed van posts, reels y carruseles\.$/);
      await refused(q('social', `update public.feed_slots set piece_id = $2 where month_id = $1 and num = 12`, [M3, p]), 'P0001', /En el feed van posts, reels y carruseles/);
    }
    expect(await at(M3, 12)).toBeNull();
  });

  it('14 cambiar a mano el mes de una pieza puesta se rechaza al confirmar', async () => {
    const p = await piece('post', 'Post puesto en Mes 3');
    await place('social', M3, 13, p);
    await refused(q('social', `update public.pieces set content_month_id = $2 where id = $1`, [p, M1]), 'P0001', /feed de otro mes/);
    expect((await stateOf(p)).content_month_id).toBe(M3);
    await q('social', `select public.feed_clear($1, 13::smallint)`, [M3]);
  });

  it('15 «Mover a otro mes» lleva su espacio al primer número libre, o queda «Sin programar» si está lleno; nunca en dos', async () => {
    const roomy = await newMonth('Mes con espacio');
    const full = await newMonth('Mes lleno');
    for (let i = 1; i <= 24; i++) {
      const f = (await sysOne<{ id: string }>(`insert into public.pieces (kind, format, title, content_month_id) values ('photo', 'post', $1, $2) returning id`, [`Relleno ${i}`, full]))!.id;
      await sys(`update public.feed_slots set piece_id = $3 where month_id = $1 and num = $2`, [full, i, f]);
    }
    await place('social', roomy, 1, await piece('post', 'Post que ya estaba', roomy));
    const p = await piece('reel', 'Reel que cambia de mes');
    await place('social', M3, 14, p);
    expect(await one('social', `select public.move_piece_to_month($1, $2) as r`, [p, roomy])).toEqual({ r: { num: 2, released: false } });
    expect(await slotsOf(p)).toEqual([{ month_id: roomy, num: 2 }]);
    expect(await one('social', `select public.move_piece_to_month($1, $2) as r`, [p, full])).toEqual({ r: { num: null, released: true } });
    expect(await slotsOf(p)).toEqual([]);
    expect((await stateOf(p)).content_month_id).toBe(full);
  });

  it('57 poner una pieza en el #7 ocupado: queda la nueva y la anterior «Sin programar» (las dos lo saben)', async () => {
    const p = await piece('post', 'Post P del #7');
    const qq = await piece('post', 'Post Q del #7');
    await place('social', M3, 7, p);
    expect(await place('social2', M3, 7, qq)).toEqual({ was: null, replaced: p, moved_from: null });
    expect(await at(M3, 7)).toBe(qq);
    expect(await slotsOf(p)).toEqual([]);
    await q('social', `select public.feed_clear($1, 7::smallint)`, [M3]);
  });

  it('58 intercambiar una pieza que ya cambió de número en el mismo momento: intercambio correcto, nunca en dos', async () => {
    const a = await piece('post', 'Post A que se mueve');
    const b = await piece('post', 'Post B que se queda');
    await place('social', M3, 3, a);
    await place('social', M3, 4, b);
    await as('social', async (sql) => {
      await sql.query(`select public.feed_place($1, 6::smallint, $2, true)`, [M3, a]);
      await sql.query(`select public.feed_swap($1, 4::smallint)`, [a]);
    });
    expect([await at(M3, 3), await at(M3, 4), await at(M3, 6)]).toEqual([null, a, b]);
    expect(await sysCount(`select piece_id from public.feed_slots where piece_id is not null group by piece_id having count(*) > 1`)).toBe(0);
    await q('social', `select public.feed_clear($1)`, [M3]);
  });

  // Two sessions at once (only on a real Postgres: the in-memory one runs one transaction at a time).
  it.runIf(!!process.env.TEST_DATABASE_URL)('dos personas llenan el #9 a la vez: la segunda espera y recibe la verdad («el #9 anterior»)', async () => {
    const p = await piece('post', 'Post de la primera persona');
    const qq = await piece('post', 'Post de la segunda persona');
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let placed!: () => void;
    const first = new Promise<void>((r) => (placed = r));
    const a = as('social', async (sql) => {
      const r = await sql.one<{ r: Placed }>(`select public.feed_place($1, 9::smallint, $2) as r`, [M3, p]);
      placed();
      await hold;
      return r!.r;
    });
    await first;
    const b = as('social2', async (sql) => (await sql.one<{ r: Placed }>(`select public.feed_place($1, 9::smallint, $2) as r`, [M3, qq]))!.r);
    await new Promise((r) => setTimeout(r, 300));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.replaced).toBeNull();
    expect(rb.replaced).toBe(p);
    expect(await at(M3, 9)).toBe(qq);
    await q('social', `select public.feed_clear($1)`, [M3]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('meses: una sola lista, borrar no borra piezas', () => {
  it('16 ★ «Vaciar este mes» deja los 21 espacios de Mes 1 vacíos y no borra ninguna pieza', async () => {
    const before = await sysCount(`select 1 from public.pieces`);
    expect(await sysCount(`select 1 from public.feed_slots where month_id = $1 and piece_id is not null`, [M1])).toBe(21);
    expect(await one('social', `select public.feed_clear($1) as n`, [M1])).toEqual({ n: 21 });
    expect(await sysCount(`select 1 from public.feed_slots where month_id = $1 and piece_id is not null`, [M1])).toBe(0);
    expect(await sysCount(`select 1 from public.pieces`)).toBe(before);
  });

  it('17 ★ borrar Mes 2: sus piezas pasan a Mes 1, sus espacios quedan vacíos y no se borra ninguna', async () => {
    const mine = await sys<{ id: string }>(`select id from public.pieces where content_month_id = $1 and deleted_at is null order by title`, [M2]);
    expect(mine).toHaveLength(2);
    const post = (await sysOne<{ id: string }>(`select id from public.pieces where title = 'Saludo a los productores (demo)'`))!.id;
    await place('social', M2, 1, post);
    const before = await sysCount(`select 1 from public.pieces`);
    expect(await one('social', `select public.delete_content_month($1, 2) as n`, [M2])).toEqual({ n: 2 });
    expect(await sysCount(`select 1 from public.pieces`)).toBe(before);
    for (const p of mine) expect((await stateOf(p.id)).content_month_id).toBe(M1);
    expect(await slotsOf(post)).toEqual([]);
    expect((await sysOne<{ gone: boolean }>(`select deleted_at is not null as gone from public.content_months where id = $1`, [M2]))!.gone).toBe(true);
  });

  it('18 no se borra el último mes, ni con un número viejo de piezas', async () => {
    const n = await livePieces(M3);
    await refused(q('social', `select public.delete_content_month($1, $2)`, [M3, n + 5]), 'P0001', new RegExp(`^El mes cambió: ahora tiene ${n} pieza\\(s\\)`));
    // Every other month deleted in the same transaction, then the last one: refused, and nothing of it stays.
    const e = await errorOf(
      as('social', async (sql) => {
        const others = await sql.query<{ id: string }>(`select id from public.content_months where deleted_at is null and id <> $1 order by ordinal`, [M1]);
        for (const m of others) {
          const k = (await sql.one<{ n: number }>(`select count(*)::int as n from public.pieces where content_month_id = $1 and deleted_at is null`, [m.id]))!.n;
          await sql.query(`select public.delete_content_month($1, $2)`, [m.id, k]);
        }
        const k1 = (await sql.one<{ n: number }>(`select count(*)::int as n from public.pieces where content_month_id = $1 and deleted_at is null`, [M1]))!.n;
        await sql.query(`select public.delete_content_month($1, $2)`, [M1, k1]);
      }),
    );
    expect([e.code, e.message]).toEqual(['P0001', 'Debe quedar al menos un mes.']);
    expect(await sysCount(`select 1 from public.content_months where deleted_at is null`)).toBeGreaterThan(2);
  });

  it('19 Redes no borra un mes a mano (update deleted_at)', async () => {
    await refused(q('social', `update public.content_months set deleted_at = now() where id = $1`, [M3]), '42501');
  });

  it('20 administración, despacho, política, IVT y Grabación no borran un mes', async () => {
    for (const who of ['admin', 'dispatch', 'politics', 'ivt', 'camera'] as const) {
      await refused(q(who, `select public.delete_content_month($1, 0)`, [M3]), '42501', /Solo Redes y el jefe borran un mes/);
    }
  });

  it('52 una pieza no nace ni se muda a un mes borrado; sin mes, va al primero', async () => {
    const gone = await newMonth('Mes que se borra');
    await q('social', `select public.delete_content_month($1, 0)`, [gone]);
    await refused(piece('post', 'Post en un mes borrado', gone), 'P0001', /^Ese mes ya no está: recarga la página\.$/);
    const p = await piece('post', 'Post que intenta mudarse');
    await refused(q('social', `select public.move_piece_to_month($1, $2)`, [p, gone]), 'P0001', /^Ese mes ya no está/);
    await refused(q('social', `update public.pieces set content_month_id = $2 where id = $1`, [p, gone]), 'P0001', /^Ese mes ya no está: recarga la página\.$/);
    const loose = await piece('post', 'Post sin mes', null);
    expect((await stateOf(loose)).content_month_id).toBe(M1);
  });

  it('53 el jefe y administración no ponen fecha en el nombre del mes; Redes sí puede (no conoce la agenda)', async () => {
    await refused(newMonth('Gira 14 nov', 'boss'), 'P0001', /^Todo Redes lee el nombre del mes/);
    await refused(newMonth('Gira 14 nov', 'admin'), 'P0001', /^Todo Redes lee el nombre del mes/);
    await refused(q('boss', `update public.content_months set label = 'Gira 14 nov' where id = $1`, [M3]), 'P0001', /^Todo Redes lee el nombre del mes/);
    const m = await newMonth('Gira 14 nov', 'social');
    expect((await sysOne<{ label: string }>(`select label from public.content_months where id = $1`, [m]))!.label).toBe('Gira 14 nov');
    await q('social', `select public.delete_content_month($1, 0)`, [m]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('lo que sale queda congelado o vuelve al jefe; lo demás es libre', () => {
  it('21 en un post aprobado, campos, tomas, láminas, mes, espacio, orden, pilar, receptividad y diseño no lo devuelven', async () => {
    const p = await approved('post', 'Post aprobado que se edita libre');
    const before = await stateOf(p.id);
    await q('social', `insert into public.piece_details (piece_id, art_headline, hook, cta, hashtags, shots, slides) values ($1, 'Titular', 'Gancho', 'Comenta', '#Tachira', $2::text::jsonb, $3::text::jsonb)`, [
      p.id, JSON.stringify([{ says: 'Hola', action: 'Saluda', on_screen: '' }]), JSON.stringify([{ role: 'cover', title: 'Uno', text: '' }]),
    ]);
    await q('social', `update public.piece_details set visual_concept = 'Otro concepto', publication_notes = 'Notas' where piece_id = $1`, [p.id]);
    const other = await newMonth('Mes del post libre');
    await q('social', `select public.move_piece_to_month($1, $2)`, [p.id, other]);
    await place('social', other, 1, p.id);
    await q('social', `update public.pieces set sort_order = 9, pillar = 'obras', rating = 8, design_status = 'approved' where id = $1`, [p.id]);
    const after = await stateOf(p.id);
    expect([after.status, after.revision]).toEqual(['approved', before.revision]);
    expect([after.content_month_id, after.rating, after.design_status]).toEqual([other, 8, 'approved']);
  });

  it('22 una versión nueva con otra lámina (u otro orden) vuelve a revisión, y la aprobación vieja ya no vale', async () => {
    const p = await piece('carousel', 'Carrusel que cambia de orden');
    const [a, b] = [await file(), await file()];
    await version(p, 1, a, { cover: a, slides: [a, b] });
    await copies(p);
    await send(p);
    await approve(p);
    const rev = (await stateOf(p)).revision;
    await version(p, 2, b, { cover: b, slides: [b, a] });
    expect(await stateOf(p)).toMatchObject({ status: 'in_review', revision: rev + 1 });
    await refused(q('boss', `select public.review_piece($1, 'approved', '', $2)`, [p, rev]), 'P0001', /La pieza cambió/);
  });

  it('23 cambiar un copy de una pieza aprobada la devuelve a revisión', async () => {
    const p = await approved('post', 'Post con copy cambiado');
    await q('social', `update public.copies set body = 'Otro copy largo.' where piece_id = $1 and length_group = 'long'`, [p.id]);
    expect((await stateOf(p.id)).status).toBe('in_review');
  });

  it('24 el título de un YouTube o de un reel aprobados sale con el video: vuelve; el de un post, no', async () => {
    for (const format of ['youtube', 'reel'] as const) {
      const p = await approved(format, `Título de ${FORMAT[format].label}`);
      const rev = (await stateOf(p.id)).revision;
      await q('social', `update public.pieces set title = $2 where id = $1`, [p.id, `Otro título de ${FORMAT[format].label}`]);
      expect(await stateOf(p.id), format).toMatchObject({ status: 'in_review', revision: rev + 1 });
    }
    const post = await approved('post', 'Título del post');
    const rev = (await stateOf(post.id)).revision;
    await q('social', `update public.pieces set title = 'Otro título del post' where id = $1`, [post.id]);
    expect(await stateOf(post.id)).toMatchObject({ status: 'approved', revision: rev });
  });

  it('25 un aviso nuevo o cambiado devuelve la pieza; resolverlo no; cambiarlo y resolverlo a la vez, no se puede', async () => {
    const p = await approved('post', 'Post con avisos');
    let rev = (await stateOf(p.id)).revision;
    const n = (await one<{ id: string }>('social', `insert into public.piece_notices (piece_id, kind, body) values ($1, 'verify_source', 'Verificar la fuente del dato.') returning id`, [p.id]))!.id;
    expect(await stateOf(p.id)).toMatchObject({ status: 'in_review', revision: ++rev });
    await approve(p.id);
    await q('social', `update public.piece_notices set body = 'Verificar la fuente y la cifra del dato.' where id = $1`, [n]);
    expect(await stateOf(p.id)).toMatchObject({ status: 'in_review', revision: ++rev });
    await approve(p.id);
    await q('boss', `update public.piece_notices set resolved_at = now() where id = $1`, [n]);
    expect(await stateOf(p.id)).toMatchObject({ status: 'approved', revision: rev });
    const resolved = await sysOne<{ resolved_by: string }>(`select resolved_by from public.piece_notices where id = $1`, [n]);
    expect(resolved!.resolved_by).toBe(t.ids.boss);
    const n2 = (await one<{ id: string }>('boss', `insert into public.piece_notices (piece_id, kind, body) values ($1, 'other', 'Revisar el tono.') returning id`, [p.id]))!.id;
    await refused(q('social', `update public.piece_notices set body = 'Otro texto.', resolved_at = now() where id = $1`, [n2]), '42501', /^Guarda el cambio del aviso y después márcalo «Resuelto»\.$/);
  });

  it('31 el formato no cambia cuando la pieza ya tiene archivo', async () => {
    const p = await piece('story', 'Historia que quiere ser reel');
    await q('social', `update public.pieces set format = 'reel' where id = $1`, [p]);
    await version(p, 1, await file('video/mp4'));
    await refused(q('social', `update public.pieces set format = 'post' where id = $1`, [p]), '42501', /El formato no cambia/);
  });

  it('32 una lámina tiene que ser una imagen terminada y viva', async () => {
    const p = await piece('carousel', 'Carrusel con láminas malas');
    const img = await file();
    const video = await file('video/mp4');
    const uploading = await file('image/jpeg', 'uploading');
    const removed = await file();
    await q('admin', `update public.media_assets set deleted_at = now() where id = $1`, [removed]);
    for (const bad of [video, uploading, removed]) {
      await refused(version(p, 1, img, { slides: [img, bad] }), '42501', /Cada lámina tiene que ser una imagen ya subida/);
    }
  });

  it('33 una versión no se cambia (ni sus láminas)', async () => {
    const p = await approved('post', 'Post con versión fija');
    expect(await q('social', `update public.piece_versions set slide_asset_ids = '{}' where piece_id = $1 returning id`, [p.id])).toEqual([]);
  });

  it('34 la imagen de una lámina de la versión aprobada no se quita', async () => {
    const p = await piece('carousel', 'Carrusel aprobado con láminas');
    const [a, b] = [await file(), await file()];
    await version(p, 1, a, { cover: a, slides: [a, b] });
    await copies(p);
    await send(p);
    expect((await one<{ lock: string }>('admin', `select ${mediaLockSql('$1::uuid')} as lock`, [b]))!.lock).toBe('in_review');
    await approve(p);
    expect((await one<{ lock: string }>('admin', `select ${mediaLockSql('$1::uuid')} as lock`, [b]))!.lock).toBe('approved');
    expect(MEDIA_LOCK.approved.error).toMatch(/es parte de una pieza aprobada/);
  });

  it('45 ★ en una historia aprobada, el texto en pantalla y el sticker vuelven al jefe (y lo programado vuelve a borrador)', async () => {
    const p = await approved('story', 'Historia que cambia lo que sale');
    const steps: [string, string, unknown[]][] = [
      ['primer guardado', `insert into public.piece_details (piece_id, on_screen, sticker, sticker_text) values ($1, 'Vota', 'poll', '¿Cuál obra?')`, [p.id]],
      ['enlace', `update public.piece_details set sticker_url = 'https://example.org/demo/x' where piece_id = $1`, [p.id]],
      ['texto del sticker', `update public.piece_details set sticker_text = '¿Vialidad o canchas?' where piece_id = $1`, [p.id]],
      ['tipo de sticker', `update public.piece_details set sticker = 'quiz' where piece_id = $1`, [p.id]],
      ['texto en pantalla', `update public.piece_details set on_screen = 'Juega' where piece_id = $1`, [p.id]],
    ];
    for (const [what, text, params] of steps) {
      if ((await stateOf(p.id)).status !== 'approved') await approve(p.id);
      const pub = (await schedule(p.id, null, 'instagram', 'story', ''))!.id;
      const rev = (await stateOf(p.id)).revision;
      await q('social', text, params);
      expect(await stateOf(p.id), what).toMatchObject({ status: 'in_review', revision: rev + 1 });
      expect(await pubStatus(pub), what).toBe('draft');
    }
  });

  it('46 idea y seguimiento son libres; en una historia sin archivo, el texto en pantalla no cambia el estado', async () => {
    const p = await approved('story', 'Historia con idea libre');
    await sys(`insert into public.piece_details (piece_id, on_screen) values ($1, 'Mira')`, [p.id]);
    const rev = (await stateOf(p.id)).revision;
    await q('social', `update public.piece_details set idea = 'Otra idea', follow_up = 'Responder' where piece_id = $1`, [p.id]);
    expect(await stateOf(p.id)).toMatchObject({ status: 'approved', revision: rev });
    const bare = await piece('story', 'Historia sin archivo');
    await q('social', `insert into public.piece_details (piece_id, on_screen) values ($1, 'Hola')`, [bare]);
    await q('social', `update public.piece_details set on_screen = 'Chao' where piece_id = $1`, [bare]);
    expect(await stateOf(bare)).toMatchObject({ status: 'draft', revision: 0 });
  });

  it('47 el enlace del sticker es solo https://', async () => {
    const p = await piece('story', 'Historia con enlace malo');
    for (const url of ['javascript:alert(1)', 'http://example.org/x', 'https://example.org/con espacio']) {
      const e = await refused(q('social', `insert into public.piece_details (piece_id, sticker_url) values ($1, $2)`, [p, url]), '23514', /piece_details_sticker_url/);
      expect(friendlyDbError(e)).toMatch(/https:\/\//);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('marcas de diseño, receptividad y avisos', () => {
  it('26 Redes marca «Diseño desaprobado» con nota, y la marca queda a su nombre', async () => {
    const p = await piece('post', 'Post con diseño desaprobado');
    await q('social', `update public.pieces set design_status = 'disapproved', design_note = 'Muy oscura', design_by = $2 where id = $1`, [p, t.ids.boss]);
    expect(await stateOf(p)).toMatchObject({ design_status: 'disapproved', design_by: t.ids.social });
  });

  it('27 administración no califica la receptividad ni el diseño', async () => {
    const p = await piece('post', 'Post que administración no califica');
    await refused(q('admin', `update public.pieces set rating = 7 where id = $1`, [p]), '42501', /^Solo Redes y el jefe/);
    await refused(q('admin', `update public.pieces set design_status = 'approved' where id = $1`, [p]), '42501', /^Solo Redes y el jefe/);
  });

  it('28 la receptividad va de 1 a 10 y solo en posts, reels y carruseles', async () => {
    const p = await piece('post', 'Post con receptividad');
    await refused(q('social', `update public.pieces set rating = 11 where id = $1`, [p]), '23514', /pieces_rating_range/);
    const story = await piece('story', 'Historia con receptividad');
    await refused(q('social', `update public.pieces set rating = 7 where id = $1`, [story]), '23514', /pieces_rating_formats/);
    await q('social', `update public.pieces set rating = 10 where id = $1`, [p]);
    expect((await stateOf(p)).rating).toBe(10);
  });

  it('29 el jefe no escribe hora ni fecha en la nota del diseño ni en un aviso; Redes sí puede citar la fecha de un dato', async () => {
    const p = await piece('post', 'Post con nota del jefe');
    await refused(q('boss', `update public.pieces set design_status = 'disapproved', design_note = 'Lo vemos a las 10:30' where id = $1`, [p]), 'P0001', /sin fecha ni hora/);
    await refused(q('boss', `insert into public.piece_notices (piece_id, kind, body) values ($1, 'other', 'Revisar a las 10:30')`, [p]), 'P0001', /sin fecha ni hora/);
    await q('social', `insert into public.piece_notices (piece_id, kind, body) values ($1, 'verify_source', 'Verificar el dato del 12 de marzo.')`, [p]);
  });

  it('30 nunca un teléfono: en la nota, el aviso, los campos o el nombre del mes', async () => {
    const p = await piece('post', 'Post con teléfono');
    const phone = 'Llama al 0414-555-0199';
    const cases: [() => Promise<unknown>, string][] = [
      [() => q('social', `update public.pieces set design_status = 'disapproved', design_note = $2 where id = $1`, [p, phone]), 'pieces_design_note_no_phone'],
      [() => q('social', `insert into public.piece_notices (piece_id, kind, body) values ($1, 'other', $2)`, [p, phone]), 'piece_notices_no_phone'],
      [() => q('social', `insert into public.piece_details (piece_id, cta) values ($1, $2)`, [p, phone]), 'piece_details_no_phone'],
      [() => q('social', `insert into public.piece_details (piece_id, shots) values ($1, $2::text::jsonb)`, [p, JSON.stringify([{ says: phone, action: '', on_screen: '' }])]), 'piece_details_no_phone'],
      [() => newMonth(phone), 'content_months_label_no_phone'],
    ];
    for (const [attempt, constraint] of cases) {
      const e = await refused(attempt(), '23514', new RegExp(constraint));
      expect(friendlyDbError(e), constraint).toMatch(/parece un teléfono/);
    }
  });

  it('48 ★ un diseño desaprobado por el jefe después de aprobar no sale, hasta que vuelva a aprobar', async () => {
    const p = await approved('post', 'Post retenido por el diseño');
    const scheduled = (await schedule(p.id, p.cover))!.id;
    await q('boss', `update public.pieces set design_status = 'disapproved', design_note = 'La foto está oscura' where id = $1`, [p.id]);
    await refused(publish('social', p.id, p.cover), '42501', /^El diseño quedó desaprobado después de la aprobación/);
    await refused(q('social', `update public.publications set status = 'published', published_at = now(), url = 'https://example.org/demo/y' where id = $1`, [scheduled]), '42501', /^El diseño quedó desaprobado/);
    await q('boss', `select public.review_piece($1, 'changes_requested', 'Cambia la foto.')`, [p.id]);
    expect(await pubStatus(scheduled)).toBe('draft');
    await send(p.id);
    await approve(p.id);
    expect(await publish('social', p.id, p.cover)).toMatchObject({ id: expect.any(String) });
  });

  it('49 la desaprobación del jefe solo la quita o cambia el jefe; la de Redes, Redes', async () => {
    const p = await piece('post', 'Post desaprobado por el jefe');
    await q('boss', `update public.pieces set design_status = 'disapproved', design_note = 'El titular se lee pequeño.' where id = $1`, [p]);
    await refused(q('social', `update public.pieces set design_status = null where id = $1`, [p]), '42501', /^El jefe desaprobó este diseño/);
    await refused(q('social', `update public.pieces set design_note = 'Ya está bien.' where id = $1`, [p]), '42501', /^El jefe desaprobó este diseño/);
    await q('boss', `update public.pieces set design_status = 'approved', design_note = '' where id = $1`, [p]);
    const own = await piece('post', 'Post desaprobado por Redes');
    await q('social2', `update public.pieces set design_status = 'disapproved', design_note = 'Probar otra foto.' where id = $1`, [own]);
    await q('social', `update public.pieces set design_status = null, design_note = '' where id = $1`, [own]);
    expect((await stateOf(own)).design_status).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('eliminar es del jefe; recuperar, de administración', () => {
  it('35 ★ Redes no elimina (ni por la función ni a mano)', async () => {
    const p = await piece('post', 'Post que Redes no elimina');
    await refused(q('social', `select public.remove_piece($1)`, [p]), '42501', /^Solo el jefe elimina una pieza\.$/);
    await refused(q('social', `update public.pieces set deleted_at = now() where id = $1`, [p]), '42501', /^Eliminar una pieza es del jefe/);
  });

  it('36 el jefe elimina una pieza puesta y programada: sale del feed, lo programado vuelve a borrador, lo demás sigue', async () => {
    const p = await approved('reel', 'Reel que el jefe elimina');
    await place('social', M3, 20, p.id);
    const pub = (await schedule(p.id, p.cover, 'facebook', 'reel'))!.id;
    const others = await sysCount(`select 1 from public.pieces where deleted_at is null and id <> $1`, [p.id]);
    expect(await one('boss', `select public.remove_piece($1) as t`, [p.id])).toEqual({ t: 'Reel que el jefe elimina' });
    expect((await stateOf(p.id)).deleted_at).not.toBeNull();
    expect(await slotsOf(p.id)).toEqual([]);
    expect(await pubStatus(pub)).toBe('draft');
    expect(await sysCount(`select 1 from public.pieces where deleted_at is null`)).toBe(others);
  });

  it('37 el jefe no recupera (ya no la ve; el disparador no se llama a mano); administración sí, sin espacio en el feed', async () => {
    const p = await piece('post', 'Post que se recupera');
    await place('social', M3, 21, p);
    await q('boss', `select public.remove_piece($1)`, [p]);
    expect(await q('boss', `update public.pieces set deleted_at = null where id = $1 returning id`, [p])).toEqual([]);
    await refused(q('boss', `select public.guard_piece_soft_delete()`), '42501');
    expect(await q('admin', `update public.pieces set deleted_at = null where id = $1 returning id`, [p])).toHaveLength(1);
    expect((await stateOf(p)).deleted_at).toBeNull();
    expect(await slotsOf(p)).toEqual([]);
  });

  it('50 ★ administración no elimina (ni a mano ni por la función)', async () => {
    const p = await piece('post', 'Post que administración no elimina');
    await refused(q('admin', `update public.pieces set deleted_at = now() where id = $1`, [p]), '42501', /^Eliminar una pieza es del jefe/);
    await refused(q('admin', `select public.remove_piece($1)`, [p]), '42501');
  });

  it('51 al recuperar una pieza cuyo mes se borró, queda en el primer mes vivo', async () => {
    const m = await newMonth('Mes de la pieza recuperada');
    const p = await piece('post', 'Post de un mes que se borra', m);
    await q('boss', `select public.remove_piece($1)`, [p]);
    await q('social', `select public.delete_content_month($1, 0)`, [m]);
    await q('admin', `update public.pieces set deleted_at = null where id = $1`, [p]);
    expect(await stateOf(p)).toMatchObject({ deleted_at: null, content_month_id: M1 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('textos que lee Redes: sin fecha ni hora de quien conoce la agenda', () => {
  it('54 el jefe y administración no ponen fecha en el título de una pieza', async () => {
    await refused(piece('post', 'Visita del 14 de noviembre', M3, 'admin'), 'P0001', /^Redes lee el título/);
    await refused(piece('post', 'Visita del 14 de noviembre', M3, 'boss'), 'P0001', /^Redes lee el título/);
    const p = await piece('post', 'Post con título limpio');
    await refused(q('boss', `update public.pieces set title = 'Visita del 14 de noviembre' where id = $1`, [p]), 'P0001', /^Redes lee el título/);
    await refused(q('admin', `update public.pieces set title = 'Recorrido a las 3 pm' where id = $1`, [p]), 'P0001', /^Redes lee el título/);
  });

  it('55 el jefe no pone hora en los hashtags, la idea, los enlaces ni el texto del sticker', async () => {
    const p = await piece('story', 'Historia que edita el jefe');
    await q('boss', `insert into public.piece_details (piece_id, idea) values ($1, 'Una idea')`, [p]);
    for (const col of ['hashtags', 'idea', 'links', 'sticker_text']) {
      await refused(q('boss', `update public.piece_details set ${col} = 'Nos vemos a las 10:30' where piece_id = $1`, [p]), 'P0001', /^Redes lee esta tarjeta/);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('cupo y pilares en Ajustes', () => {
  it('41 Redes no cambia el cupo', async () => {
    const r = await q('social', `update public.app_settings set value = '{"reel": 1}'::jsonb where key = 'redes.quotas' returning key`).catch((e: Err) => e);
    if (r instanceof Error) expect(r.code).toBe('42501');
    else expect(r).toEqual([]);
    expect((await sysOne<{ value: Record<string, number> }>(`select value from public.app_settings where key = 'redes.quotas'`))!.value.reel).toBe(12);
  });

  it('42 administración con doble factor: un cupo o unos pilares mal formados no se guardan; bien formados, sí', async () => {
    const set = (key: string, value: unknown) => q('admin', `update public.app_settings set value = $2::text::jsonb where key = $1 returning key`, [key, JSON.stringify(value)]);
    await refused(set('redes.quotas', { reel: -1 }), 'P0001', /cupo/);
    await refused(set('redes.quotas', { tweet: 3 }), 'P0001', /cupo/);
    await refused(set('redes.quotas', { reel: 2.5 }), 'P0001', /cupo/);
    await refused(set('redes.pillars', [{ key: 'obras', name: 'Obras' }, { key: 'obras', name: 'Otra' }]), 'P0001', /pilar/);
    await refused(set('redes.pillars', [{ key: 'Con Mayúsculas', name: 'Obras' }]), 'P0001', /pilar/);
    expect(await set('redes.quotas', { reel: 10, post: 8, carousel: 4, story: 30, youtube: 2 })).toHaveLength(1);
    expect(await set('redes.pillars', [{ key: 'obras', name: 'Obras que se ven', tone: 'accent' }])).toHaveLength(1);
  });
});
