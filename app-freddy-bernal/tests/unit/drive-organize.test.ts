// «Organizar por orden del feed» (R4, D-74): the names (no title, ever: titles carry places) and the folders it plans,
// the four keys checked inside the action (nobody else, and Drive is not even called), and one run against the fake
// Drive: the placed post's picture ends up as «01 - Post.jpg» in Feed/Mes-<position>. Invented data only.
// The last block needs the R4 migration (content_months, feed_slots): it runs once WP-A is merged.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';
import { resetFakeDrive, type FakeDrive } from '@/lib/storage/drive/fake';
import { driveTiming } from '@/lib/storage/drive/http';
import { forgetAccessToken } from '@/lib/storage/drive/connection';
import { feedFileName, feedFolderPath, planFeedOrganize, type OrganizeSlot } from '@/lib/storage/drive/organize';

const h = vi.hoisted(() => ({ session: null as unknown, provider: 'drive', fake: true, organize: true }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => {
  const jar = new Map<string, string>();
  return {
    headers: async () => new Headers({ origin: 'http://localhost:3000' }),
    cookies: async () => ({
      get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
      set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 ? jar.delete(n) : jar.set(n, v)),
      delete: (n: string) => jar.delete(n),
    }),
  };
});
vi.mock('@/lib/env', async (orig) => {
  const m = await orig<typeof import('@/lib/env')>();
  return {
    ...m,
    env: {
      ...m.env,
      get redesDriveOrganize() { return h.organize; },
      storage: { get provider() { return h.provider; } },
      drive: { tokenKey: '', get fake() { return h.fake; }, uploadMode: 'direct', transferCapGb: 7 },
    },
  };
});
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  requireSession: vi.fn(async () => h.session),
  getSession: vi.fn(async () => h.session),
}));
vi.mock('@/lib/notify', async (orig) => ({ ...(await orig<typeof import('@/lib/notify')>()), notify: vi.fn(async () => {}) }));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('los nombres y las carpetas (sin el título)', () => {
  it('«NN - Formato.ext» y Feed/Mes-<posición>', () => {
    expect(feedFileName(1, 'post')).toBe('01 - Post.jpg');
    expect(feedFileName(7, 'reel', 'image/png')).toBe('07 - Reel.png');
    expect(feedFileName(24, 'carousel', 'image/webp')).toBe('24 - Carrusel.webp');
    expect(feedFolderPath(1)).toBe('Feed/Mes-1');
    // drive_folders.path allows two levels of letters, digits and dashes.
    expect(feedFolderPath(3)).toMatch(/^[A-Za-z]{3,12}(\/[A-Za-z0-9-]{1,20})?$/);
  });

  it('planea mes por mes y número por número; salta lo que no tiene portada o no está en Drive', () => {
    const months = [{ id: ID(2), ordinal: 5 }, { id: ID(1), ordinal: 2 }];
    const slot = (x: Partial<OrganizeSlot> & Pick<OrganizeSlot, 'monthId' | 'num'>): OrganizeSlot => ({
      format: 'post', pictureId: ID(100 + x.num), pictureMime: 'image/jpeg', fileId: `fk-file-${x.monthId.slice(-1)}-${x.num}-abcdefgh`, ...x,
    });
    const plan = planFeedOrganize(months, [
      slot({ monthId: ID(2), num: 1 }),
      slot({ monthId: ID(1), num: 3, format: 'reel' }),
      slot({ monthId: ID(1), num: 1 }),
      slot({ monthId: ID(1), num: 2, pictureId: null, fileId: null }),
      slot({ monthId: ID(2), num: 2, fileId: null }),
      slot({ monthId: ID(9), num: 4 }), // a month that is gone
      slot({ monthId: ID(2), num: 3, fileId: 'fk-file-1-1-abcdefgh' }), // the same file placed twice: moved once
    ]);
    expect(plan.steps.map((s) => [s.folderPath, s.name])).toEqual([
      ['Feed/Mes-1', '01 - Post.jpg'],
      ['Feed/Mes-1', '03 - Reel.jpg'],
      ['Feed/Mes-2', '01 - Post.jpg'],
    ]);
    expect(plan.noPicture).toBe(1);
    expect(plan.outsideDrive).toBe(1);
    expect(plan.summary).toEqual(['3 portadas para ordenar.', '1 sin portada todavía.', '1 guardada fuera de Drive.']);
  });
});

let t: TestDb;
let fake: FakeDrive;
let organize: typeof import('@/lib/actions/drive-organize');
let drive: typeof import('@/lib/actions/drive');
let callback: typeof import('@/app/api/drive/callback/route');

function as(key: DemoUserKey, mfaOk = true) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: t.ids[key], aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

async function connect() {
  as('admin');
  const r = await drive.startDriveConnect({});
  expect(r).toMatchObject({ ok: true });
  const res = await callback.GET(new NextRequest(new URL((r as { data: { url: string } }).data.url)));
  expect(res.headers.get('location')).toMatch(/ok=1$/);
}

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  fake = resetFakeDrive();
  forgetAccessToken();
  driveTiming.retryMs = [0, 0, 0];
  organize = await import('@/lib/actions/drive-organize');
  drive = await import('@/lib/actions/drive');
  callback = await import('@/app/api/drive/callback/route');
});

beforeEach(() => {
  h.provider = 'drive';
  h.fake = true;
  h.organize = true;
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('las cuatro llaves, adentro de la acción', () => {
  it('apagado, sin Drive, sin conectar, sin doble factor o sin ser administración: no, y Drive ni se entera', async () => {
    const calls = () => fake.log.length;
    const before = calls();
    h.organize = false;
    as('admin');
    expect(await organize.organizeFeed({})).toEqual({ ok: false, error: '«Organizar por orden del feed» está apagado.' });
    h.organize = true;
    h.provider = '';
    expect(await organize.organizeFeed({})).toEqual({ ok: false, error: 'Drive no está activado en esta versión.' });
    h.provider = 'drive';
    for (const who of ['social', 'boss', 'dispatch', 'camera'] as DemoUserKey[]) {
      as(who);
      expect(await organize.organizeFeed({}), who).toEqual({ ok: false, error: 'Solo Administración, con doble factor, puede hacer esto.' });
    }
    as('admin', false);
    expect(await organize.organizeFeed({})).toEqual({ ok: false, error: 'Solo Administración, con doble factor, puede hacer esto.' });
    as('admin');
    expect(await organize.organizeFeed({})).toEqual({ ok: false, error: 'Drive no está conectado: conéctalo primero en Ajustes → Google Drive.' });
    expect(calls()).toBe(before);
  });
});

describe('con Drive conectado (necesita la migración de R4)', () => {
  it('la portada del post en el #1 queda «01 - Post.jpg» en Feed/Mes-<posición>, sin el título', async () => {
    await connect();
    const fileId = fake.addUserFile({ mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]), name: 'E-0001-Portada-1.jpg' });
    const asset = await t.system(async (sql) => {
      const id = (await sql.one<{ id: string }>(
        `insert into public.media_assets (kind, bucket, storage_path, label, mime, status, width, height)
         values ('cover', 'drive', 'drive/organizar-prueba.jpg', 'Portada 1', 'image/jpeg', 'ready', 1080, 1350) returning id`,
      ))!.id;
      await sql.query(`insert into public.media_drive (media_id, file_id, source) values ($1, $2, 'upload')`, [id, fileId]);
      return id;
    });
    const redes = await import('@/lib/actions/redes');
    as('social');
    const month = (await redes.createMonth({})) as { ok: true; data: { month: { id: string } } };
    const created = (await redes.quickCreate({ format: 'post', monthId: month.data.month.id, title: 'Cancha techada del sector (demo)' })) as { ok: true; data: { card: { id: string } } };
    const pieceId = created.data.card.id;
    await t.as('social', async (sql) => {
      await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id) values ($1, 1, $2, $2)`, [pieceId, asset]);
      await sql.query(`update public.pieces set current_version = 1 where id = $1`, [pieceId]);
    });
    expect(await redes.feedPlace({ monthId: month.data.month.id, num: 1, pieceId })).toMatchObject({ ok: true });
    const position = (await t.system((sql) => sql.query<{ id: string }>(`select id from public.content_months where deleted_at is null order by ordinal`))).findIndex((m) => m.id === month.data.month.id) + 1;

    as('admin');
    const r = await organize.organizeFeed({});
    expect(r).toMatchObject({ ok: true, data: { moved: 1 } });
    const file = fake.files.get(fileId)!;
    expect(file.name).toBe('01 - Post.jpg');
    expect(file.name).not.toMatch(/Cancha|sector/);
    const folder = fake.files.get(file.parents[0])!;
    expect(folder.name).toBe(`Mes-${position}`);
    expect(fake.files.get(folder.parents[0])!.name).toBe('Feed');
    // Never a permission or a public link.
    expect(fake.log.some((c) => /permissions/.test(c.url))).toBe(false);
  });
});
