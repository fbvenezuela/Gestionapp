// The actions of Redes por formato (R4, D-60 to D-78) themselves, against the in-memory database with the same
// migrations, AS EACH PERSON (RLS). The session and notify() are mocked: we check the messages (with the real numbers
// the database answers), who is told, and what ends up stored. Invented data only. Needs the R4 migration
// (20261029000100_redes_formatos.sql): runs once WP-A is merged.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';
import type { CardData } from '@/lib/data/redes';
import type { Format } from '@/lib/domain/redes';

const h = vi.hoisted(() => ({ session: null as unknown, notices: [] as unknown[], cookies: new Map<string, string>() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (n: string) => (h.cookies.has(n) ? { name: n, value: h.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => h.cookies.set(n, v),
    delete: (n: string) => h.cookies.delete(n),
  }),
}));
vi.mock('@/lib/auth/session', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/session')>()), requireSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));

let t: TestDb;
let redes: typeof import('@/lib/actions/redes');
let pieces: typeof import('@/lib/actions/pieces');
let pubs: typeof import('@/lib/actions/publications');
let data: typeof import('@/lib/data/redes');

function as(key: DemoUserKey, mfaOk = true) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: t.ids[key], aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

const sent = (kind: string) => (h.notices as Notice[]).filter((n) => n.kind === kind);
const ok = <T>(r: { ok: boolean; data?: unknown }) => {
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  return r.data as T;
};

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  redes = await import('@/lib/actions/redes');
  pieces = await import('@/lib/actions/pieces');
  pubs = await import('@/lib/actions/publications');
  data = await import('@/lib/data/redes');
});

beforeEach(() => {
  h.notices.length = 0;
});

// ---------------------------------------------------------------------------------------------------------------
// Helpers: a month, a piece, its files and copies, the boss's approval (all invented)
// ---------------------------------------------------------------------------------------------------------------
let fileSeq = 0;
async function asset(mime = 'image/jpeg', kind = 'final', w = 1080, hh = 1350) {
  const n = ++fileSeq;
  return (await t.system((sql) =>
    sql.one<{ id: string }>(
      `insert into public.media_assets (kind, storage_path, label, mime, status, width, height, size_bytes)
       values ($1, $2, $3, $4, 'ready', $5, $6, 1000) returning id`,
      [kind, `pieces/redes-acciones-${n}.${mime.split('/')[1]}`, `Archivo ${n}`, mime, w, hh],
    ),
  ))!.id;
}

async function newMonth(who: DemoUserKey = 'social') {
  as(who);
  return ok<{ month: { id: string; label: string } }>(await redes.createMonth({})).month;
}

async function newPiece(format: Format, monthId: string, o: { title?: string; file?: boolean; copy?: boolean } = {}) {
  as('social');
  const card = ok<{ card: CardData }>(await redes.quickCreate({ format, monthId, ...(o.title ? { title: o.title } : {}) })).card;
  if (o.file) {
    const mime = format === 'reel' || format === 'youtube' ? 'video/mp4' : 'image/jpeg';
    const m = await asset(mime);
    const cover = format === 'post' || format === 'story' ? null : await asset('image/jpeg', 'cover');
    const slides = format === 'carousel' || format === 'month_end' ? [await asset(), await asset()] : [];
    await t.as('social', async (sql) => {
      await sql.query(
        `insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids) values ($1, 1, $2, $3, $4::uuid[])`,
        [card.id, slides[0] ?? m, slides[0] ?? cover, slides],
      );
      await sql.query(`update public.pieces set current_version = 1 where id = $1`, [card.id]);
    });
  }
  if (o.copy) {
    await t.as('social', (sql) =>
      sql.query(
        `insert into public.copies (piece_id, length_group, body) values ($1, 'long', '¡Saludos, Táchira! Copy largo de prueba. Por amor al Táchira.'),
                ($1, 'medium', 'Copy medio de prueba.'), ($1, 'short', 'Copy corto de prueba.')`,
        [card.id],
      ),
    );
  }
  return card.id;
}

async function approve(id: string) {
  await t.as('social', (sql) => sql.query(`update public.pieces set status = 'in_review' where id = $1 and status <> 'in_review'`, [id]));
  const rev = (await t.system((sql) => sql.one<{ revision: number }>(`select revision from public.pieces where id = $1`, [id])))!.revision;
  await t.as('boss', (sql) => sql.query(`select public.review_piece($1, 'approved', '', $2)`, [id, rev]));
}

const piece = (id: string) =>
  t.system((sql) =>
    sql.one<{ status: string; revision: number; content_month_id: string | null; deleted_at: Date | null; review_level: string; sort_order: number; design_status: string | null }>(
      `select status, revision, content_month_id, deleted_at, review_level, sort_order, design_status from public.pieces where id = $1`,
      [id],
    ),
  );
const slotOf = (id: string) => t.system((sql) => sql.one<{ num: number; month_id: string }>(`select num, month_id from public.feed_slots where piece_id = $1`, [id]));
const card = (who: DemoUserKey, id: string) => t.as(who, (sql) => data.getCard(sql, id));

// ---------------------------------------------------------------------------------------------------------------

describe('meses', () => {
  it('«+ Nuevo mes» va después del último, con su nombre y sus 24 espacios, y queda abierto', async () => {
    const before = (await t.system((sql) => sql.one<{ n: number }>(`select coalesce(max(ordinal), 0)::int as n from public.content_months where deleted_at is null`)))!.n;
    const m = await newMonth();
    expect(m.label).toBe(`Mes ${before + 1}`);
    expect((await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.feed_slots where month_id = $1`, [m.id])))!.n).toBe(24);
    expect(h.cookies.get('fb-redes-mes')).toBe(m.id);
  });

  it('el nombre del mes: el jefe no pone fecha ni hora; Redes sí puede; teléfonos nadie', async () => {
    const m = await newMonth();
    as('boss');
    expect(await redes.renameMonth({ monthId: m.id, label: 'Gira 14 nov' })).toEqual({ ok: false, error: 'Todo Redes lee el nombre del mes: sin fecha ni hora («Mes 2», «Cierre de año»).' });
    as('social');
    expect(await redes.renameMonth({ monthId: m.id, label: 'Llama al 0414-555-0199' })).toMatchObject({ ok: false, error: expect.stringContaining('teléfono') });
    expect(await redes.renameMonth({ monthId: m.id, label: 'Cierre de año' })).toMatchObject({ ok: true, message: 'Nombre guardado' });
  });

  it('borrar un mes: sus piezas pasan al primero (con el número real) y nadie las borra', async () => {
    const m = await newMonth();
    const a = await newPiece('post', m.id);
    const b = await newPiece('reel', m.id);
    as('social');
    expect(await redes.deleteMonth({ monthId: m.id, expected: 1 })).toEqual({ ok: false, error: 'El mes cambió: ahora tiene 2 pieza(s). Míralo y vuelve a intentarlo.' });
    const first = (await t.system((sql) => sql.one<{ id: string; label: string }>(`select id, label from public.content_months where deleted_at is null order by ordinal limit 1`)))!;
    expect(await redes.deleteMonth({ monthId: m.id, expected: 2 })).toMatchObject({ ok: true, message: `Mes borrado: 2 piezas pasaron a «${first.label}»` });
    for (const id of [a, b]) expect(await piece(id)).toMatchObject({ content_month_id: first.id, deleted_at: null });
    // Administración does not delete months.
    const m2 = await newMonth();
    as('admin');
    expect((await redes.deleteMonth({ monthId: m2.id, expected: 0 })).ok).toBe(false);
  });
});

describe('crear desde la sección', () => {
  it('devuelve la tarjeta abierta arriba, con el título del formato; una historia nace en verde', async () => {
    const m = await newMonth();
    const old = await newPiece('reel', m.id);
    as('social');
    const r = await redes.quickCreate({ format: 'reel', monthId: m.id });
    const d = ok<{ card: CardData; href: string }>(r);
    expect(r).toMatchObject({ message: 'Reel creado' });
    expect(d.card).toMatchObject({ format: 'reel', title: 'Reel nuevo', status: 'draft', chip: { label: 'Borrador' }, monthId: m.id, reviewLevel: 'amarillo' });
    expect(d.href).toBe(`/redes/reels?mes=${m.id}#pieza-${d.card.id}`);
    expect(d.card.createdDay).toMatch(/^\d{1,2} [a-z]{3,4} \d{4}$/);
    expect((await piece(d.card.id))!.sort_order).toBeLessThan((await piece(old))!.sort_order);
    const s = await redes.quickCreate({ format: 'story', monthId: m.id });
    expect(s).toMatchObject({ ok: true, message: 'Historia creada', data: { card: { reviewLevel: 'verde', title: 'Historia nueva' } } });
  });

  it('en un mes borrado: lo dice la base', async () => {
    const m = await newMonth();
    as('social');
    ok(await redes.deleteMonth({ monthId: m.id, expected: 0 }));
    expect(await redes.quickCreate({ format: 'post', monthId: m.id })).toEqual({ ok: false, error: 'Ese mes ya no está: recarga la página.' });
  });

  it('el título: el jefe no escribe fecha ni hora; Redes nunca un teléfono', async () => {
    const m = await newMonth();
    as('boss');
    expect(await redes.quickCreate({ format: 'post', monthId: m.id, title: 'Visita del 14 de noviembre' })).toEqual({ ok: false, error: 'Redes lee el título: escríbelo sin fecha ni hora.' });
    as('social');
    expect((await redes.quickCreate({ format: 'post', monthId: m.id, title: 'Llama al 0414 555 0199' })).ok).toBe(false);
  });
});

describe('los campos de la tarjeta', () => {
  it('el primer guardado crea la fila; un rev viejo no pisa lo de otra persona', async () => {
    const m = await newMonth();
    const id = await newPiece('post', m.id);
    as('social');
    const r1 = ok<{ rev: number }>(await redes.saveDetails({ pieceId: id, rev: 0, patch: { art_headline: 'Titular de prueba', post_ratio: '1:1' } }));
    expect(r1.rev).toBe(1);
    const r2 = ok<{ rev: number }>(await redes.saveDetails({ pieceId: id, rev: 1, patch: { hashtags: '#Táchira' } }));
    expect(r2.rev).toBe(2);
    expect(await redes.saveDetails({ pieceId: id, rev: 1, patch: { cta: 'Comenta' } })).toEqual({ ok: false, error: 'Otra persona cambió esta tarjeta. Recarga para ver lo último.' });
    expect(await redes.saveDetails({ pieceId: id, rev: 0, patch: { cta: 'Comenta' } })).toEqual({ ok: false, error: 'Otra persona cambió esta tarjeta. Recarga para ver lo último.' });
    expect(await redes.saveDetails({ pieceId: id, rev: 2, patch: { sticker_url: 'http://x.org' } })).toEqual({ ok: false, error: 'El enlace del sticker empieza con https://' });
    const c = (await card('social', id))!;
    expect(c.details).toMatchObject({ rev: 2, art_headline: 'Titular de prueba', post_ratio: '1:1', hashtags: '#Táchira' });
    expect(c.blockers).toEqual(['Sube la imagen 1:1.', 'Falta el copy largo.']);
  });

  it('tomas y láminas: listas, con su rev; el jefe no escribe una hora en ellas', async () => {
    const m = await newMonth();
    const id = await newPiece('reel', m.id);
    as('social');
    const r = ok<{ rev: number }>(await redes.saveShots({ pieceId: id, rev: 0, shots: [{ says: 'Buenos días', action: 'Plano general', on_screen: 'Así quedó' }] }));
    as('boss');
    expect(await redes.saveShots({ pieceId: id, rev: r.rev, shots: [{ says: 'Nos vemos a las 10:30', action: '', on_screen: '' }] })).toEqual({ ok: false, error: 'Redes lee esta tarjeta: escríbela sin fecha ni hora.' });
    const c = await newPiece('carousel', m.id);
    as('social');
    ok(await redes.saveSlideTexts({ pieceId: c, rev: 0, slides: [{ role: 'cover', title: 'Portada', text: 'Cinco obras' }, { role: 'cta', title: '', text: 'Comenta' }] }));
    expect((await card('social', c))!.details.slides.map((s) => s.role)).toEqual(['cover', 'cta']);
  });

  it('en una historia aprobada, el texto en pantalla vuelve al jefe (y se le avisa); la idea no', async () => {
    const m = await newMonth();
    const id = await newPiece('story', m.id, { file: true });
    as('social');
    ok(await redes.saveDetails({ pieceId: id, rev: 0, patch: { idea: 'Encuesta del día', on_screen: '¿Qué obra quieres ver?' } }));
    await approve(id);
    as('social');
    const idea = await redes.saveDetails({ pieceId: id, rev: 1, patch: { idea: 'Otra idea' } });
    expect(idea).toMatchObject({ ok: true, data: { reopened: null } });
    expect((await piece(id))!.status).toBe('approved');
    h.notices.length = 0;
    const r = await redes.saveDetails({ pieceId: id, rev: 2, patch: { on_screen: '¿Cuál obra te gusta más?' } });
    expect(r).toMatchObject({ ok: true, message: 'Volvió al jefe' });
    expect((await piece(id))!.status).toBe('in_review');
    expect(sent('review_pending')[0]?.userIds).toEqual([t.ids.boss]);
  });
});

describe('el título y el storyboard', () => {
  it('el título de un reel aprobado sale como el del Short: cambiarlo vuelve al jefe; el de un post no', async () => {
    const m = await newMonth();
    const reel = await newPiece('reel', m.id, { file: true, copy: true });
    const post = await newPiece('post', m.id, { file: true, copy: true });
    await approve(reel);
    await approve(post);
    as('social');
    expect(await redes.saveTitle({ pieceId: reel, title: 'Así quedó la cancha (versión corta)' })).toMatchObject({ ok: true, message: 'Volvió al jefe' });
    expect((await piece(reel))!.status).toBe('in_review');
    expect(sent('review_pending')[0]?.body).toContain('Cambió el título');
    expect(await redes.saveTitle({ pieceId: post, title: 'Tips para comprar en el mercado' })).toMatchObject({ ok: true, data: { reopened: null } });
    expect((await piece(post))!.status).toBe('approved');
  });

  it('«Traer del storyboard» copia las tomas del evento después de las que hay; sin evento, lo dice', async () => {
    const ev = (await t.system((sql) =>
      sql.one<{ event_id: string; n: number }>(
        `select sb.event_id, count(*)::int as n from public.storyboard_blocks b join public.storyboards sb on sb.id = b.storyboard_id
          where b.deleted_at is null group by sb.event_id order by 2 desc, 1 limit 1`,
      ),
    ))!;
    const m = await newMonth();
    as('social');
    const created = ok<{ id: string; format: string }>(await pieces.createPiece({ eventId: ev.event_id, format: 'reel', monthId: m.id, title: 'Reel del evento (demo)', categoryId: '' }));
    expect(created.format).toBe('reel');
    expect(await t.system((sql) => sql.one(`select kind, format, content_month_id, review_level from public.pieces where id = $1`, [created.id]))).toEqual({
      kind: 'video', format: 'reel', content_month_id: m.id, review_level: 'amarillo',
    });
    ok(await redes.saveShots({ pieceId: created.id, rev: 0, shots: [{ says: 'Primera toma', action: '', on_screen: '' }] }));
    const r = await redes.shotsFromStoryboard({ pieceId: created.id });
    expect(r).toMatchObject({ ok: true, message: 'Tomas traídas del storyboard', data: { n: ev.n } });
    const c = (await card('social', created.id))!;
    expect(c.details.shots).toHaveLength(ev.n + 1);
    expect(c.details.shots[0].says).toBe('Primera toma');
    expect(c.event).toEqual({ id: ev.event_id, title: expect.any(String) });
    const alone = await newPiece('reel', m.id);
    as('social');
    expect(await redes.shotsFromStoryboard({ pieceId: alone })).toEqual({ ok: false, error: 'Esta pieza no nació de un evento: no tiene storyboard.' });
  });
});

describe('marcas que no aprueban nada', () => {
  it('«¿Pedir cambios también?» solo cuando el jefe desaprueba una aprobada; desaprobar avisa a Redes (menos a quien marcó)', async () => {
    const m = await newMonth();
    const id = await newPiece('post', m.id, { file: true, copy: true });
    as('social');
    const own = await redes.setDesign({ pieceId: id, status: 'disapproved', note: 'El titular se lee pequeño.' });
    expect(own).toMatchObject({ ok: true, message: 'Diseño marcado como desaprobado', data: { askChanges: false } });
    expect(sent('design_disapproved')[0].userIds).not.toContain(t.ids.social);
    expect(sent('design_disapproved')[0].userIds).toContain(t.ids.social2);
    ok(await redes.setDesign({ pieceId: id, status: null, note: '' }));
    await approve(id);
    as('boss');
    expect(await redes.setDesign({ pieceId: id, status: 'disapproved', note: 'La foto está oscura.' })).toMatchObject({ ok: true, data: { askChanges: true } });
    // Redes cannot lift the boss's mark (the database says so).
    as('social');
    expect(await redes.setDesign({ pieceId: id, status: null, note: '' })).toEqual({ ok: false, error: 'El jefe desaprobó este diseño: solo él quita o cambia esa marca.' });
    expect((await card('social', id))!.design).toMatchObject({ status: 'disapproved', byBoss: true, note: 'La foto está oscura.' });
    // A piece in draft disapproved by the boss: no question (nothing to ask changes on).
    const draft = await newPiece('post', m.id);
    as('boss');
    expect(await redes.setDesign({ pieceId: draft, status: 'disapproved', note: '' })).toMatchObject({ ok: true, data: { askChanges: false } });
  });

  it('receptividad y pilar', async () => {
    const m = await newMonth();
    const id = await newPiece('reel', m.id);
    as('social');
    ok(await redes.setRating({ pieceId: id, rating: 7 }));
    expect((await card('social', id))!.rating).toBe(7);
    expect((await redes.setRating({ pieceId: id, rating: 11 })).ok).toBe(false);
    const story = await newPiece('story', m.id);
    as('social');
    expect((await redes.setRating({ pieceId: story, rating: 5 })).ok).toBe(false);
    as('admin');
    expect(await redes.setRating({ pieceId: id, rating: 3 })).toEqual({ ok: false, error: 'Solo Redes y el jefe califican el diseño y la receptividad.' });
    await t.system((sql) => sql.query(`insert into public.app_settings (key, value) values ('redes.pillars', '[{"key":"obras","name":"Obras","tone":"accent"}]') on conflict (key) do update set value = excluded.value`));
    as('social');
    ok(await redes.setPillar({ pieceId: id, pillar: 'obras' }));
    expect(await redes.setPillar({ pieceId: id, pillar: 'otro' })).toEqual({ ok: false, error: 'Ese pilar ya no está: recarga la página.' });
  });
});

describe('avisos de cumplimiento', () => {
  it('un aviso nuevo en una aprobada la devuelve y avisa al jefe; editar y resolver son dos pasos', async () => {
    const m = await newMonth();
    const id = await newPiece('post', m.id, { file: true, copy: true });
    await approve(id);
    as('social');
    const r = await redes.addNotice({ pieceId: id, kind: 'testimonial', body: 'Testimonio: falta la autorización escrita.' });
    expect(r).toMatchObject({ ok: true, message: 'Aviso guardado' });
    expect((await piece(id))!.status).toBe('in_review');
    expect(sent('compliance_notice')[0]).toMatchObject({ userIds: [t.ids.boss], title: 'Aviso antes de publicar' });
    expect(sent('review_pending')).toHaveLength(1);
    const noticeId = (r as { data: { id: string } }).data.id;
    ok(await redes.editNotice({ noticeId, body: 'Testimonio: falta la autorización escrita de la vecina.' }));
    expect(await redes.resolveNotice({ noticeId })).toMatchObject({ ok: true, message: 'Resuelto' });
    expect(await redes.resolveNotice({ noticeId })).toEqual({ ok: false, error: 'Ese aviso ya estaba resuelto.' });
    expect(await redes.editNotice({ noticeId, body: 'Otro texto del aviso.' })).toEqual({ ok: false, error: 'Ese aviso ya está resuelto: pon otro si hace falta.' });
    as('admin');
    expect((await redes.addNotice({ pieceId: id, kind: 'other', body: 'Administración no pone avisos.' })).ok).toBe(false);
    as('boss');
    expect(await redes.addNotice({ pieceId: id, kind: 'verify_source', body: 'Verificar el dato antes de las 10:30' })).toEqual({ ok: false, error: 'Redes lee este aviso: escríbelo sin fecha ni hora.' });
  });

  it('«Aprobar todas las verdes» se salta las que tienen avisos abiertos y lo dice', async () => {
    const m = await newMonth();
    const a = await newPiece('story', m.id, { file: true });
    const b = await newPiece('story', m.id, { file: true });
    as('social');
    ok(await redes.addNotice({ pieceId: b, kind: 'written_consent', body: 'Necesita la autorización escrita.' }));
    for (const id of [a, b]) ok(await pieces.sendToReview({ pieceId: id }));
    expect((await piece(a))!.review_level).toBe('verde');
    const revs = await t.system((sql) => sql.query<{ id: string; revision: number }>(`select id, revision from public.pieces where id = any($1::uuid[])`, [[a, b]]));
    as('boss');
    const r = await pieces.approveGreen({ pieces: revs });
    expect(r).toMatchObject({ ok: true, data: { n: 1, skipped: 0, withNotices: 1, noticeText: '1 tiene avisos: ábrela' } });
    expect((await piece(a))!.status).toBe('approved');
    expect((await piece(b))!.status).toBe('in_review');
  });
});

describe('«Enviar a aprobación» dice lo que falta', () => {
  it('un post sin imagen no se envía; con imagen y copy sí', async () => {
    const m = await newMonth();
    const id = await newPiece('post', m.id);
    as('social');
    expect(await pieces.sendToReview({ pieceId: id })).toEqual({ ok: false, error: 'Sube la imagen 4:5.' });
    const full = await newPiece('post', m.id, { file: true, copy: true });
    as('social');
    expect(await pieces.sendToReview({ pieceId: full })).toMatchObject({ ok: true, data: { level: 'amarillo' } });
  });
});

describe('el feed', () => {
  it('colocar, «el #7 anterior quedó sin programar», «Ya en …», mover, intercambiar y vaciar', async () => {
    const m = await newMonth();
    const [a, b, c] = [await newPiece('post', m.id), await newPiece('reel', m.id), await newPiece('carousel', m.id)];
    as('social');
    expect(await redes.feedPlace({ monthId: m.id, num: 7, pieceId: a })).toMatchObject({ ok: true, message: 'Colocada en el #7', data: { num: 7, replaced: null } });
    const r = await redes.feedPlace({ monthId: m.id, num: 7, pieceId: b });
    expect(r).toMatchObject({ ok: true, message: 'Colocada en el #7 · el #7 anterior quedó sin programar', data: { replaced: a } });
    expect(await slotOf(a)).toBeNull();
    expect(await slotOf(b)).toMatchObject({ num: 7 });
    expect(await redes.feedPlace({ monthId: m.id, num: 3, pieceId: b })).toEqual({ ok: false, error: `Ya en ${m.label} · #7` });
    expect(await redes.feedPlace({ monthId: m.id, num: 3, pieceId: b, allowMove: true })).toMatchObject({ ok: true, message: 'Colocada en el #3 · antes en el #7' });
    ok(await redes.feedPlace({ monthId: m.id, num: 4, pieceId: c }));
    expect(await redes.feedSwap({ pieceId: b, num: 4 })).toMatchObject({ ok: true, message: 'Movida al #4' });
    expect(await slotOf(c)).toMatchObject({ num: 3 });
    const story = await newPiece('story', m.id);
    as('social');
    expect(await redes.feedPlace({ monthId: m.id, num: 1, pieceId: story })).toEqual({ ok: false, error: 'En el feed van posts, reels y carruseles.' });
    expect(await redes.feedClear({ monthId: m.id, num: 4 })).toMatchObject({ ok: true, message: 'Espacio vaciado' });
    ok(await redes.feedPlace({ monthId: m.id, num: 5, pieceId: a }));
    expect(await redes.feedClear({ monthId: m.id })).toMatchObject({ ok: true, message: 'Mes vaciado: 2 piezas quedaron sin programar', data: { n: 2 } });
    for (const id of [a, b, c]) expect((await piece(id))!.deleted_at).toBeNull();
  });

  it('una pieza de otro mes se mueve con su espacio; «Mover a otro mes» se lleva el espacio al primer número libre', async () => {
    const m1 = await newMonth();
    const m2 = await newMonth();
    const a = await newPiece('post', m1.id);
    as('social');
    ok(await redes.feedPlace({ monthId: m1.id, num: 9, pieceId: a }));
    expect(await redes.movePieceToMonth({ pieceId: a, monthId: m2.id })).toMatchObject({ ok: true, message: `Movida a ${m2.label} · en el feed pasó al #1` });
    expect(await slotOf(a)).toMatchObject({ month_id: m2.id, num: 1 });
    expect(await redes.movePieceToMonth({ pieceId: a, monthId: m2.id })).toMatchObject({ ok: true, message: `Ya está en ${m2.label}` });
    const b = await newPiece('reel', m1.id);
    as('social');
    expect(await redes.feedPlace({ monthId: m2.id, num: 2, pieceId: b })).toMatchObject({ ok: true, message: `Colocada en el #2 · venía de ${m1.label}` });
    expect((await piece(b))!.content_month_id).toBe(m2.id);
  });

  it('las lecturas del feed: 24 celdas, el #1 abajo a la derecha, y el selector dice dónde está cada una', async () => {
    const m = await newMonth();
    const a = await newPiece('post', m.id, { title: 'Post del feed (demo)' });
    as('social');
    ok(await redes.feedPlace({ monthId: m.id, num: 1, pieceId: a }));
    ok(await redes.setRating({ pieceId: a, rating: 8 }));
    const feed = await t.as('social', (sql) => data.getFeed(sql, m.id));
    expect(feed.cells).toHaveLength(24);
    expect(feed.cells[0].num).toBe(24);
    expect(feed.cells[23]).toMatchObject({ num: 1, piece: { pieceId: a, title: 'Post del feed (demo)', format: 'post', state: 'draft' } });
    expect(feed.filled).toBe(1);
    expect(feed.receptivity).toEqual({ avg: 8, count: 1 });
    const picker = await t.as('social', (sql) => data.getFeedPicker(sql, m.id));
    expect(picker.post.find((p) => p.id === a)).toMatchObject({ place: { month: m.label, num: 1 }, otherMonth: false, hasMedia: false });
    expect((await card('social', a))!.feed).toEqual({ monthId: m.id, month: m.label, num: 1 });
  });
});

describe('orden, duplicar, eliminar y recuperar', () => {
  it('«Subir» y «Bajar» cambian el orden a mano de la sección', async () => {
    const m = await newMonth();
    const [a, b, c] = [await newPiece('post', m.id), await newPiece('post', m.id), await newPiece('post', m.id)];
    // Newest on top: c, b, a.
    const order = async () => (await t.as('social', (sql) => data.getSection(sql, 'post', m.id, null))).cards.map((x) => x.id);
    expect(await order()).toEqual([c, b, a]);
    as('social');
    expect(await redes.reorderPiece({ pieceId: a, dir: 'up' })).toMatchObject({ ok: true, data: { moved: true, position: 2 } });
    expect(await order()).toEqual([c, a, b]);
    expect(await redes.reorderPiece({ pieceId: c, dir: 'up' })).toMatchObject({ ok: true, data: { moved: false } });
  });

  it('duplicar copia campos, copies, archivo y avisos abiertos; nunca el espacio, las marcas ni la aprobación', async () => {
    const m = await newMonth();
    const id = await newPiece('post', m.id, { file: true, copy: true, title: 'Tips para ahorrar agua (demo)' });
    as('social');
    ok(await redes.saveDetails({ pieceId: id, rev: 0, patch: { art_headline: 'Ahorra agua' } }));
    ok(await redes.addNotice({ pieceId: id, kind: 'verify_source', body: 'Verificar la fuente del dato.' }));
    ok(await redes.setDesign({ pieceId: id, status: 'approved', note: '' }));
    ok(await redes.feedPlace({ monthId: m.id, num: 2, pieceId: id }));
    await approve(id);
    as('social');
    const r = await redes.duplicatePiece({ pieceId: id });
    const copy = ok<{ card: CardData; href: string }>(r).card;
    expect(r).toMatchObject({ message: 'Duplicada' });
    expect(copy).toMatchObject({ title: 'Tips para ahorrar agua (demo) (copia)', status: 'draft', monthId: m.id, feed: null, rating: null, design: { status: null } });
    expect(copy.details.art_headline).toBe('Ahorra agua');
    expect(copy.copies.long).toContain('¡Saludos, Táchira!');
    expect(copy.version?.n).toBe(1);
    expect(copy.notices.map((n) => n.body)).toEqual(['Verificar la fuente del dato.']);
  });

  it('eliminar es del jefe (sale del feed); recuperar, de administración', async () => {
    const m = await newMonth();
    const id = await newPiece('reel', m.id);
    as('social');
    ok(await redes.feedPlace({ monthId: m.id, num: 1, pieceId: id }));
    expect((await redes.removePiece({ pieceId: id })).ok).toBe(false);
    as('admin');
    expect((await redes.removePiece({ pieceId: id })).ok).toBe(false);
    as('boss', false);
    expect((await redes.removePiece({ pieceId: id })).ok).toBe(false);
    as('boss');
    expect(await redes.removePiece({ pieceId: id })).toMatchObject({ ok: true, message: 'Pieza eliminada' });
    expect(await slotOf(id)).toBeNull();
    expect((await t.as('admin', (sql) => data.getDeletedPieces(sql))).map((p) => p.id)).toContain(id);
    expect(await t.as('social', (sql) => data.getDeletedPieces(sql))).toEqual([]);
    for (const who of ['social', 'boss'] as const) {
      as(who);
      expect(await redes.restorePiece({ pieceId: id }), who).toEqual({ ok: false, error: 'Recuperar una pieza es de administración.' });
    }
    as('admin');
    expect(await redes.restorePiece({ pieceId: id })).toMatchObject({ ok: true, message: `Pieza recuperada en ${m.label}` });
    expect(await piece(id)).toMatchObject({ deleted_at: null, content_month_id: m.id });
    expect(await slotOf(id)).toBeNull();
  });
});

describe('«Ya lo publiqué» desde la tarjeta', () => {
  it('sin aprobación, apagado; con el diseño desaprobado después, también; aprobada: queda publicada con lo aprobado', async () => {
    const m = await newMonth();
    const id = await newPiece('post', m.id, { file: true, copy: true });
    as('social');
    const items = [{ network: 'instagram', url: 'https://example.org/demo/post/1' }];
    expect(await pubs.markPublishedNow({ pieceId: id, items })).toEqual({ ok: false, error: 'Falta la aprobación del jefe.' });
    await approve(id);
    as('boss');
    ok(await redes.setDesign({ pieceId: id, status: 'disapproved', note: 'La foto está oscura.' }));
    as('social');
    expect(await pubs.markPublishedNow({ pieceId: id, items })).toEqual({ ok: false, error: 'El diseño quedó desaprobado: el jefe tiene que volver a verla.' });
    expect((await card('social', id))!.designHold).toBe(true);
    // The boss approves again: it goes out.
    await t.as('boss', async (sql) => {
      const rev = (await sql.one<{ revision: number }>(`select revision from public.pieces where id = $1`, [id]))!.revision;
      await sql.query(`select public.review_piece($1, 'approved', '', $2)`, [id, rev]);
    });
    as('social');
    const r = await pubs.markPublishedNow({ pieceId: id, items: [...items, { network: 'facebook', url: 'https://example.org/demo/post/2' }] });
    expect(r).toMatchObject({ ok: true, message: '¡Listo! Quedó publicada en 2 redes.' });
    const rows = await t.system((sql) => sql.query<{ network: string; format: string; status: string; copy_body: string }>(`select network, format, status, copy_body from public.publications where piece_id = $1 order by network`, [id]));
    expect(rows.map((x) => [x.network, x.format, x.status])).toEqual([['facebook', 'photo', 'published'], ['instagram', 'photo', 'published']]);
    expect(rows[0].copy_body).toContain('¡Saludos, Táchira!');
    const c = (await card('social', id))!;
    expect(c).toMatchObject({ displayState: 'published', chip: { label: 'Publicado', tone: 'ok' } });
  });
});

describe('las lecturas del tablero', () => {
  it('cuentan como la matriz y nunca leen la agenda', async () => {
    const m = await newMonth();
    await newPiece('post', m.id, { file: true, copy: true });
    await newPiece('post', m.id);
    const { rows } = await t.as('social', (sql) => data.getDashboard(sql, [m.id]));
    expect(rows).toHaveLength(2);
    const nav = await t.as('social', (sql) => data.getNavCounts(sql, m.id, { post: 8 }));
    expect(nav.post).toEqual({ reviewed: 0, quota: 8, copyMissing: 1, imageMissing: 1 });
    const summary = await t.as('boss', (sql) => data.getMonthSummary(sql, m.id, { post: 8 }));
    expect(summary.formats.find((f) => f.format === 'post')).toEqual({ format: 'post', made: 2, quota: 8, approved: 0, published: 0 });
    const act = await t.as('social', (sql) => data.getActivity(sql));
    expect(act.length).toBeGreaterThan(0);
    expect(act.length).toBeLessThanOrEqual(12);
    const found = await t.as('social', (sql) => data.searchRedes(sql, 'Saludos'));
    expect(found.groups.find((g) => g.key === 'post')?.items[0]).toMatchObject({ where: 'Copy' });
    expect((await t.as('social', (sql) => data.searchRedes(sql, 'a'))).total).toBe(0);
    // politics and the IVT read nothing of Redes (RLS).
    expect(await t.as('politics', (sql) => data.getMonths(sql))).toEqual([]);
  });

  it('ningún archivo nuevo de Redes lee la fecha, la hora ni el lugar de un evento', () => {
    const files = ['src/lib/data/redes.ts', 'src/lib/actions/redes.ts', 'src/lib/domain/redes-dashboard.ts', 'src/lib/domain/format-rules.ts', 'src/lib/storage/drive/organize.ts', 'src/lib/actions/drive-organize.ts'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(src, f).not.toMatch(/event_schedule|event_calendar|done_on|\be\.\*|place_name|exact_address|starts_at/);
    }
  });
});
