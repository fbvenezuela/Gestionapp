// Uploading to an event, an obra ficha or a report, and the thumbnail the browser makes, end to end against the
// in-memory database (same migrations, RLS on) with the demo storage: the action picks the type the file is stored
// with, keeps the thumbnail only for the person's own finished file and never over one already kept, and
// /api/media/<id>/thumb serves it after the person's own RLS check, for any bucket. Session and notify are mocked.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';
import { JPEG, png } from './fixtures/photos';
import { b64, jpegOf, jpegWithComment } from './fixtures/thumbs';

const h = vi.hoisted(() => ({ session: null as unknown, notices: [] as unknown[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  requireSession: vi.fn(async () => h.session),
  getSession: vi.fn(async () => h.session),
}));
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));

let t: TestDb;
let media: typeof import('@/lib/actions/media');
let thumbs: typeof import('@/lib/storage/thumbs');
let thumbRoute: typeof import('@/app/api/media/[id]/thumb/route');
let camEvent: string;
let obra: string;
let report: string;

function as(key: DemoUserKey, mfaOk = true) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: t.ids[key], aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

type Ticket = { id: string; path: string; mode: string; bucket: string; mime?: string };
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.one<T>(q, p));
const thumbRow = (id: string) => sys<{ mime: string; bytes: Uint8Array }>(`select mime, bytes from public.media_thumbs where media_id = $1`, [id]);

async function start(who: DemoUserKey, input: Record<string, unknown>) {
  as(who);
  return media.createUpload({ mime: 'video/mp4', sizeBytes: 1000, ext: 'mp4', probe: {}, ...input });
}
async function upload(who: DemoUserKey, input: Record<string, unknown>, thumb?: string): Promise<Ticket> {
  const r = await start(who, input);
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  const tk = (r as { data: Ticket }).data;
  const f = await media.finishUpload({ id: tk.id, thumb });
  expect(f, JSON.stringify(f)).toMatchObject({ ok: true });
  return tk;
}
const getThumb = (id: string) => thumbRoute.GET(new NextRequest(`http://localhost:3000/api/media/${id}/thumb`), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  media = await import('@/lib/actions/media');
  thumbs = await import('@/lib/storage/thumbs');
  thumbRoute = await import('@/app/api/media/[id]/thumb/route');
  // An event where «camera» is assigned and «camera2» is not.
  camEvent = (await sys<{ id: string }>(
    `select e.id from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1
      where not exists (select 1 from public.event_assignments b where b.event_id = e.id and b.user_id = $2) order by e.code limit 1`,
    [t.ids.camera, t.ids.camera2],
  ))!.id;
  obra = (await t.as('ivt', (sql) => sql.one<{ id: string }>(`insert into public.obra_fichas (name, municipality) values ('Obra con fotos (demo)', 'Junín') returning id`)))!.id;
  report = (await t.as('politics', (sql) =>
    sql.one<{ id: string }>(`insert into public.community_reports (title, municipality, type) values ('Reporte con fotos (demo)', 'Torbes', 'repair') returning id`),
  ))!.id;
});

beforeEach(() => {
  h.notices.length = 0;
});

describe('miniatura al subir', () => {
  it('Grabación sube su video con miniatura: se guarda y la ven quienes ven el archivo; Grabación sin asignar recibe 404', async () => {
    const pic = jpegWithComment('cuadro del video (demo)');
    const tk = await upload('camera', { eventId: camEvent, kind: 'boss' }, b64(pic));
    expect(tk).toMatchObject({ mode: 'demo', bucket: 'material', mime: 'video/mp4' });
    const kept = await thumbRow(tk.id);
    expect(kept!.mime).toBe('image/jpeg');
    expect(new Uint8Array(kept!.bytes)).toEqual(pic);
    for (const who of ['camera', 'social', 'boss', 'admin', 'dispatch'] as DemoUserKey[]) {
      as(who);
      const r = await getThumb(tk.id);
      expect(r.status, who).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/jpeg');
      expect(r.headers.get('cache-control')).toBe('private, max-age=86400');
      expect(r.headers.get('content-security-policy')).toMatch(/sandbox/);
      expect(new Uint8Array(await r.arrayBuffer())).toEqual(pic);
    }
    for (const who of ['camera2', 'ivt', 'politics'] as DemoUserKey[]) {
      as(who);
      expect((await getThumb(tk.id)).status, who).toBe(404);
    }
    as('social', false);
    expect((await getThumb(tk.id)).status).toBe(401);
    h.session = null;
    expect((await getThumb(tk.id)).status).toBe(401);
  });

  it('sin miniatura, o con una que no sirve, el archivo igual termina; la página muestra el ícono', async () => {
    const none = await upload('camera', { eventId: camEvent, kind: 'drone' });
    for (const bad of [b64(png()), b64(jpegOf(640, 480)), b64(jpegOf(320, 240, 262_145)), 'no es base64', '<svg onload=alert(1)>']) {
      const tk = await upload('camera', { eventId: camEvent, kind: 'broll' }, bad);
      expect(await thumbRow(tk.id)).toBeNull();
      expect(await sys<{ status: string }>(`select status from public.media_assets where id = $1`, [tk.id])).toEqual({ status: 'ready' });
    }
    as('camera');
    expect((await getThumb(none.id)).status).toBe(404);
    // Not even text: dropped, the finish still answers.
    expect(await media.finishUpload({ id: none.id, thumb: 12345 })).toMatchObject({ ok: true });
    expect(await thumbRow(none.id)).toBeNull();
  });

  it('storeThumb: nunca para el archivo de otro, ni uno sin terminar, ni un PDF; y nunca cambia una ya guardada', async () => {
    as('camera');
    const tk = (await media.createUpload({ eventId: camEvent, kind: 'other', mime: 'video/mp4', sizeBytes: 10, ext: 'mp4', probe: {} })) as { data: Ticket };
    // Still uploading: nothing kept.
    expect(await thumbs.storeThumb(tk.data.id, t.ids.camera, b64(JPEG))).toBe(false);
    expect((await media.finishUpload({ id: tk.data.id })).ok).toBe(true);
    // Someone else's file: nothing kept, whoever asks.
    for (const who of ['camera2', 'social', 'admin', 'boss'] as DemoUserKey[]) expect(await thumbs.storeThumb(tk.data.id, t.ids[who], b64(JPEG)), who).toBe(false);
    expect(await thumbRow(tk.data.id)).toBeNull();
    // Its owner: kept once; a second picture never replaces it.
    const first = jpegWithComment('primera (demo)');
    expect(await thumbs.storeThumb(tk.data.id, t.ids.camera, b64(first))).toBe(true);
    expect(await thumbs.storeThumb(tk.data.id, t.ids.camera, b64(jpegWithComment('segunda (demo)')))).toBe(false);
    expect(new Uint8Array((await thumbRow(tk.data.id))!.bytes)).toEqual(first);
    // Finishing again with another picture changes nothing either.
    expect((await media.finishUpload({ id: tk.data.id, thumb: b64(jpegWithComment('tercera (demo)')) })).ok).toBe(true);
    expect(new Uint8Array((await thumbRow(tk.data.id))!.bytes)).toEqual(first);
    // A PDF storyboard has no picture of its own.
    const pdf = await upload('camera', { eventId: camEvent, kind: 'storyboard', mime: '', ext: 'pdf' });
    expect(await thumbs.storeThumb(pdf.id, t.ids.camera, b64(JPEG))).toBe(false);
  });

  it('otra persona no puede terminar la subida ajena ni ponerle miniatura', async () => {
    as('camera');
    const tk = (await media.createUpload({ eventId: camEvent, kind: 'boss', mime: 'video/mp4', sizeBytes: 10, ext: 'mp4', probe: {} })) as { data: Ticket };
    for (const who of ['camera2', 'social', 'boss'] as DemoUserKey[]) {
      as(who);
      expect(await media.finishUpload({ id: tk.data.id, thumb: b64(JPEG) }), who).toMatchObject({ ok: false });
    }
    expect(await thumbRow(tk.data.id)).toBeNull();
    expect(await sys<{ status: string }>(`select status from public.media_assets where id = $1`, [tk.data.id])).toEqual({ status: 'uploading' });
  });
});

describe('subir a un evento, a una ficha de obra o a un reporte', () => {
  it('el storyboard de Grabación: foto o PDF (aunque el teléfono no diga el tipo), en su evento', async () => {
    const pdf = await upload('camera', { eventId: camEvent, kind: 'storyboard', mime: 'application/octet-stream', ext: 'pdf' });
    expect(pdf.mime).toBe('application/pdf');
    const first = await sys<{ mime: string; label: string }>(`select mime, label from public.media_assets where id = $1`, [pdf.id]);
    expect(first!.mime).toBe('application/pdf');
    const n = Number(/^Storyboard (\d+)$/.exec(first!.label)![1]);
    const photo = await upload('camera', { eventId: camEvent, kind: 'storyboard', mime: 'image/jpeg', ext: 'jpg' }, b64(JPEG));
    expect(await sys(`select label from public.media_assets where id = $1`, [photo.id])).toEqual({ label: `Storyboard ${n + 1}` });
    expect(await thumbRow(photo.id)).not.toBeNull();
    expect(await start('camera', { eventId: camEvent, kind: 'storyboard', mime: 'video/mp4', ext: 'mp4' })).toEqual({ ok: false, error: 'Aquí va una foto o un PDF.' });
    expect(await start('camera', { eventId: null, kind: 'storyboard', mime: 'image/jpeg', ext: 'jpg' })).toEqual({ ok: false, error: 'El storyboard va en su evento.' });
    expect(await start('camera2', { eventId: camEvent, kind: 'storyboard', mime: 'image/jpeg', ext: 'jpg' })).toMatchObject({ ok: false });
  });

  it('el IVT sube fotos a su obra: nombre por obra, ruta sin fecha; lo que no va en una obra se explica', async () => {
    const a = await upload('ivt', { obraFichaId: obra, kind: 'before', mime: 'image/jpeg', ext: 'jpg' }, b64(JPEG));
    const b = await upload('ivt', { obraFichaId: obra, kind: 'before', mime: 'image/jpeg', ext: 'jpg' });
    const c = await upload('ivt', { obraFichaId: obra, kind: 'progress', mime: '', ext: 'mov' });
    const rows = await t.system((sql) =>
      sql.query<{ id: string; label: string; mime: string; storage_path: string; obra_ficha_id: string; event_id: string | null }>(
        `select id, label, mime, storage_path, obra_ficha_id, event_id from public.media_assets where id = any($1::uuid[]) order by label`, [[a.id, b.id, c.id]],
      ),
    );
    expect(rows.map((r) => [r.label, r.mime])).toEqual([['Antes 1', 'image/jpeg'], ['Antes 2', 'image/jpeg'], ['Avance 1', 'video/quicktime']]);
    for (const r of rows) {
      expect(r.obra_ficha_id).toBe(obra);
      expect(r.event_id).toBeNull();
      expect(r.storage_path).toMatch(new RegExp(`^${obra}/[0-9a-f-]{36}\\.(jpg|mov)$`));
    }
    // The IVT and the boss see its thumbnail; Redes does not (no visit on the agenda yet).
    for (const who of ['ivt', 'boss'] as DemoUserKey[]) {
      as(who);
      expect((await getThumb(a.id)).status, who).toBe(200);
    }
    as('social');
    expect((await getThumb(a.id)).status).toBe(404);
    expect(await start('ivt', { obraFichaId: obra, kind: 'after', mime: 'image/jpeg', ext: 'jpg' })).toMatchObject({ ok: false, error: expect.stringMatching(/ficha de obra/) });
    expect(await start('ivt', { obraFichaId: obra, kind: 'document', mime: 'application/zip', ext: 'zip' })).toEqual({ ok: false, error: 'Aquí va una foto o un PDF.' });
    expect(await start('ivt', { reportId: report, kind: 'before', mime: 'image/jpeg', ext: 'jpg' })).toMatchObject({ ok: false });
    expect(await start('ivt', { obraFichaId: obra, eventId: camEvent, kind: 'before', mime: 'image/jpeg', ext: 'jpg' })).toMatchObject({ ok: false, error: expect.stringMatching(/un solo lugar/) });
  });

  it('el director de política sube la evidencia de su reporte; el IVT y Redes no la ven', async () => {
    const e = await upload('politics', { reportId: report, kind: 'after', mime: 'image/png', ext: 'png' }, b64(JPEG));
    expect(await sys(`select label, community_report_id from public.media_assets where id = $1`, [e.id])).toEqual({ label: 'Después 1', community_report_id: report });
    for (const who of ['politics', 'boss', 'dispatch'] as DemoUserKey[]) {
      as(who);
      expect((await getThumb(e.id)).status, who).toBe(200);
    }
    for (const who of ['ivt', 'social', 'camera'] as DemoUserKey[]) {
      as(who);
      expect((await getThumb(e.id)).status, who).toBe(404);
    }
    expect(await start('politics', { obraFichaId: obra, kind: 'before', mime: 'image/jpeg', ext: 'jpg' })).toMatchObject({ ok: false });
  });

  it('el jefe sube la captura de lo publicado, el video final y la portada (lo que hace Redes)', async () => {
    for (const [kind, mime, ext] of [['evidence', 'image/png', 'png'], ['final', 'video/mp4', 'mp4'], ['cover', 'image/jpeg', 'jpg'], ['tweet_image', 'image/jpeg', 'jpg']]) {
      const tk = await upload('boss', { eventId: null, kind, mime, ext });
      expect(tk.bucket, kind).toBe(kind === 'cover' ? 'covers' : 'material');
    }
  });

  it('un archivo que el navegador ejecutaría se guarda como descarga, nunca como página', async () => {
    const tk = await upload('social', { eventId: null, kind: 'editable', mime: 'text/html', ext: 'html' });
    expect(tk.mime).toBe('application/octet-stream');
    expect(await sys(`select mime from public.media_assets where id = $1`, [tk.id])).toEqual({ mime: 'application/octet-stream' });
  });
});
