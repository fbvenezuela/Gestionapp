// With STORAGE_PROVIDER empty (the default) everything works exactly as before Drive existed:
// uploads get today's demo ticket, downloads today's headers, no Drive module is even loaded and
// Google is never called. And STORAGE_PROVIDER=drive cannot switch the demo (no DATABASE_URL)
// by accident: only together with DRIVE_FAKE=1.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';
import { demoAppend, demoCreate } from '@/lib/storage/demo-store';

const h = vi.hoisted(() => ({
  session: null as unknown,
  notices: [] as unknown[],
  provider: '',
  fake: false,
  dataMode: 'demo' as 'demo' | 'supabase',
  loaded: new Set<string>(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ origin: 'http://localhost:3000' }), cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('@/lib/env', async (orig) => {
  const m = await orig<typeof import('@/lib/env')>();
  return {
    ...m,
    env: {
      ...m.env,
      get dataMode() { return h.dataMode; },
      cronSecret: 'cron-de-prueba',
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
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));
// Record whether any Drive module with behaviour is ever loaded.
for (const name of ['upload', 'serve', 'connection', 'client', 'oauth', 'register', 'fake', 'token', 'folders', 'transfer', 'check', 'imports'] as const) {
  vi.doMock(`@/lib/storage/drive/${name}`, async (orig: () => Promise<unknown>) => {
    h.loaded.add(name);
    return orig();
  });
}

let t: TestDb;
let media: typeof import('@/lib/actions/media');
let drive: typeof import('@/lib/actions/drive');
let provider: typeof import('@/lib/storage/provider');
let ev: { id: string };
const fetchSpy = vi.fn(async () => new Response('no', { status: 599 }));

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: true, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  vi.stubGlobal('fetch', fetchSpy);
  media = await import('@/lib/actions/media');
  drive = await import('@/lib/actions/drive');
  provider = await import('@/lib/storage/provider');
  ev = (await t.system((sql) =>
    sql.one<{ id: string }>(`select e.id from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1 order by e.code limit 1`, [t.ids.camera]),
  ))!;
});

beforeEach(() => {
  h.notices.length = 0;
  h.provider = '';
  h.fake = false;
  h.dataMode = 'demo';
});

describe('STORAGE_PROVIDER: quién decide si se usa Drive', () => {
  it('vacío o cualquier otra cosa: como hoy; drive en la demo solo con DRIVE_FAKE=1', () => {
    const cases: [string, 'demo' | 'supabase', boolean, 'default' | 'drive'][] = [
      ['', 'demo', false, 'default'],
      ['', 'supabase', false, 'default'],
      ['', 'demo', true, 'default'],
      ['supabase', 'supabase', false, 'default'],
      ['DRIVE', 'supabase', false, 'default'],
      ['drive', 'demo', false, 'default'], // a Vercel preview (the demo) with the variable by mistake
      ['drive', 'demo', true, 'drive'],
      ['drive', 'supabase', false, 'drive'],
      ['drive', 'supabase', true, 'drive'],
    ];
    for (const [p, mode, fake, want] of cases) {
      h.provider = p;
      h.dataMode = mode;
      h.fake = fake;
      expect(provider.storageProvider(), `${p}/${mode}/${fake}`).toBe(want);
      // The fake only ever answers with the demo database.
      expect(provider.driveIsFake(), `${p}/${mode}/${fake}`).toBe(mode === 'demo' && fake);
    }
  });
});

describe('con STORAGE_PROVIDER vacío todo sigue igual', () => {
  it('subir: el mismo boleto de la demo de siempre, en los mismos buckets', async () => {
    as('camera');
    const r = await media.createUpload({ eventId: ev.id, kind: 'boss', mime: 'video/mp4', sizeBytes: 2048, ext: 'mp4', probe: { durationS: 4 } });
    expect(r).toMatchObject({ ok: true });
    const tk = (r as { data: Record<string, unknown> }).data;
    // mime: the type the row was stored with, sent as the upload's content type (20261027001900, media handoff).
    expect(Object.keys(tk).sort()).toEqual(['bucket', 'chunkSize', 'endpoint', 'id', 'mime', 'mode', 'path', 'token']);
    expect(tk).toMatchObject({ bucket: 'material', endpoint: '/api/demo-upload', chunkSize: 4 * 1024 * 1024, token: null, mode: 'demo', mime: 'video/mp4' });
    expect(tk.path).toMatch(new RegExp(`^${ev.id}/[0-9a-f-]{36}\\.mp4$`));
    as('social');
    const cover = await media.createUpload({ eventId: null, kind: 'cover', mime: 'image/jpeg', sizeBytes: 100, ext: 'jpg', probe: {} });
    expect(cover).toMatchObject({ ok: true, data: { bucket: 'covers', mode: 'demo' } });

    as('camera');
    expect(await media.finishUpload({ id: tk.id as string })).toMatchObject({ ok: true, data: { event_id: ev.id, kind: 'boss' } });
    expect((h.notices as Notice[]).filter((n) => n.kind === 'material_ready')).toHaveLength(1);
    const row = await t.system((sql) => sql.one(`select bucket, status from public.media_assets where id = $1`, [tk.id]));
    expect(row).toEqual({ bucket: 'material', status: 'ready' });
  });

  it('con STORAGE_PROVIDER=drive en la demo sin DRIVE_FAKE: también como hoy', async () => {
    h.provider = 'drive';
    as('camera');
    const r = await media.createUpload({ eventId: ev.id, kind: 'drone', mime: 'video/mp4', sizeBytes: 10, ext: 'mp4', probe: {} });
    expect(r).toMatchObject({ ok: true, data: { mode: 'demo', bucket: 'material', endpoint: '/api/demo-upload' } });
  });

  it('descargar: mismas cabeceras de siempre (sin las de Drive)', async () => {
    as('camera');
    const r = await media.createUpload({ eventId: ev.id, kind: 'broll', mime: 'video/mp4', sizeBytes: 4, ext: 'mp4', probe: {} });
    const tk = (r as { data: { id: string; path: string } }).data;
    demoCreate(tk.path, 4);
    demoAppend(tk.path, Buffer.from([1, 2, 3, 4]));
    await media.finishUpload({ id: tk.id });
    const { GET } = await import('@/app/api/media/[id]/route');
    for (const ver of [true, false]) {
      const res = await GET(new NextRequest(`http://localhost:3000/api/media/${tk.id}${ver ? '?ver=1' : ''}`), { params: Promise.resolve({ id: tk.id }) });
      expect(res.status).toBe(200);
      const headers = Object.fromEntries(res.headers.entries());
      expect(headers).toEqual({
        'cache-control': 'private, no-store',
        'content-disposition': expect.stringMatching(new RegExp(`^${ver ? 'inline' : 'attachment'}; filename="E-\\d{4}-Tomas-de-apoyo-\\d+\\.mp4"$`)),
        'content-type': 'video/mp4',
      });
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    }
    const thumb = await (await import('@/app/api/media/[id]/thumb/route')).GET(new NextRequest(`http://localhost:3000/api/media/${tk.id}/thumb`), { params: Promise.resolve({ id: tk.id }) });
    expect(thumb.status).toBe(404);
  });

  it('las acciones y rutas de Drive dicen que no está activado; la tarea programada no cambia', async () => {
    as('admin');
    for (const r of [
      await drive.startDriveConnect({}), await drive.drivePickerConfig({}), await drive.disconnectDrive({}), await drive.registerDriveFile({ fileId: 'algunArchivo0001', eventId: null, kind: 'other' }),
      await drive.testDrive({}), await drive.scanDriveImports({}), await drive.startDriveProbe({}),
      await drive.saveDriveProbe({ id: ev.id, probe: { durationS: 1, width: 1, height: 1, fps: 30, videoCodec: 'avc', audioCodec: 'aac' } }),
    ]) {
      expect(r).toEqual({ ok: false, error: 'Drive no está activado en esta versión.' });
    }
    // «Descargar todo» asks for the person's Drive cap: without Drive there is none (and no Drive module loads).
    for (const who of ['social', 'admin'] as const) {
      as(who);
      expect(await drive.myDriveBudget({}), who).toEqual({ ok: true, data: { monthLeft: null, todayLeft: null } });
    }
    as('admin');
    // The demo's route for the fake Drive does not exist either.
    const fakeUpload = await (await import('@/app/api/drive/fake-upload/route')).PUT(new NextRequest('http://localhost:3000/api/drive/fake-upload?upload_id=abcdefgh', { method: 'PUT', headers: { 'content-range': 'bytes */10' } }));
    expect(fakeUpload.status).toBe(404);
    // What the material screens get: nothing about Drive.
    const { driveUi } = await import('@/lib/data/drive');
    expect(await driveUi(h.session as Session)).toEqual({ enabled: false, picker: false, problem: null });
    const cb = await (await import('@/app/api/drive/callback/route')).GET(new NextRequest('http://localhost:3000/api/drive/callback?code=x&state=y'));
    expect(cb.status).toBe(404);
    const { GET } = await import('@/app/api/cron/tick/route');
    const body = await (await GET(new NextRequest('http://localhost:3000/api/cron/tick', { headers: { authorization: 'Bearer cron-de-prueba' } }))).json();
    expect(body).not.toHaveProperty('driveStaleUploads');
  });

  it('ningún módulo de Drive se cargó y nunca se llamó a Google', () => {
    expect([...h.loaded]).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((globalThis as { __fbFakeDrive?: unknown }).__fbFakeDrive).toBeUndefined();
  });
});
