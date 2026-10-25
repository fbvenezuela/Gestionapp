// The Drive screens' server side, against the in-memory database (RLS on) and the fake Drive:
// «Probar» says what is missing, the browser's uploader goes all the way through the real
// actions and routes, «Traer lo nuevo de Drive» registers what the import script uploaded, the
// video facts read in the admin's browser fill only what was empty, and none of it is open to
// anyone but Administración (refused before Drive is even called).
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';
import { resetFakeDrive, type FakeDrive } from '@/lib/storage/drive/fake';
import { driveTiming } from '@/lib/storage/drive/http';
import { forgetAccessToken } from '@/lib/storage/drive/connection';
import { DriveUpload, type Transport } from '@/lib/media/drive-upload';
import { checkSummary, type DriveCheckStep } from '@/lib/domain/drive-check';
import { emptyState, planImport, type LocalFile } from '../../scripts/drive-import/plan';
import { DriveRest, runUploads } from '../../scripts/drive-import/run';

const h = vi.hoisted(() => ({
  session: null as unknown,
  notices: [] as unknown[],
  origin: 'http://localhost:3000' as string | null,
  cookies: new Map<string, string>(),
  provider: 'drive',
  fake: true,
  uploadMode: 'direct' as 'direct' | 'proxy',
  clientId: '',
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(h.origin ? { origin: h.origin } : {}),
  cookies: async () => ({
    get: (n: string) => (h.cookies.has(n) ? { name: n, value: h.cookies.get(n)! } : undefined),
    set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 ? h.cookies.delete(n) : h.cookies.set(n, v)),
    delete: (n: string) => h.cookies.delete(n),
  }),
}));
vi.mock('@/lib/env', async (orig) => {
  const m = await orig<typeof import('@/lib/env')>();
  return {
    ...m,
    env: {
      ...m.env,
      storage: { get provider() { return h.provider; } },
      drive: { tokenKey: '', get fake() { return h.fake; }, get uploadMode() { return h.uploadMode; }, transferCapGb: 7 },
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

let t: TestDb;
let fake: FakeDrive;
let media: typeof import('@/lib/actions/media');
let drive: typeof import('@/lib/actions/drive');
let data: typeof import('@/lib/data/drive');
let callback: typeof import('@/app/api/drive/callback/route');
let fakeUpload: typeof import('@/app/api/drive/fake-upload/route');
let proxyRoute: typeof import('@/app/api/drive/upload/[id]/route');
let ev: { id: string; code: string };
let dir: string;
const logs: string[] = [];
const KIB = 1024;
const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);

function as(key: DemoUserKey, mfaOk = true) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: t.ids[key], aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.one<T>(q, p));

async function connect() {
  as('admin');
  const r = await drive.startDriveConnect({});
  expect(r).toMatchObject({ ok: true });
  const res = await callback.GET(new NextRequest(new URL((r as { data: { url: string } }).data.url)));
  expect(res.headers.get('location')).toMatch(/ok=1$/);
}

// The browser's PUTs, as XMLHttpRequest would send them, to our own routes.
const toRoutes: Transport = async (url, { contentRange, body }) => {
  const init = { method: 'PUT', headers: { 'content-range': contentRange, origin: 'http://localhost:3000' }, body: body ? new Uint8Array(await body.arrayBuffer()) : undefined };
  const res = url.startsWith('/api/drive/fake-upload')
    ? await fakeUpload.PUT(new NextRequest(`http://localhost:3000${url}`, init))
    : await proxyRoute.PUT(new NextRequest(`http://localhost:3000${url}`, init), { params: Promise.resolve({ id: url.split('/').pop()! }) });
  return { status: res.status, range: res.headers.get('range'), body: res.status === 308 ? '' : await res.text() };
};

function send(file: Blob, endpoint: string, chunkSize: number) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    new DriveUpload(file, {
      endpoint, chunkSize, transport: toRoutes, retryDelays: [0], reachable: async () => true,
      onSuccess: () => resolve({ ok: true }),
      onError: (e) => resolve({ ok: false, error: e.message }),
    }).start();
  });
}

beforeAll(async () => {
  for (const k of ['error', 'warn', 'log', 'info'] as const) {
    vi.spyOn(console, k).mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    });
  }
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  fake = resetFakeDrive();
  forgetAccessToken();
  driveTiming.retryMs = [0, 0, 0];
  media = await import('@/lib/actions/media');
  drive = await import('@/lib/actions/drive');
  data = await import('@/lib/data/drive');
  callback = await import('@/app/api/drive/callback/route');
  fakeUpload = await import('@/app/api/drive/fake-upload/route');
  proxyRoute = await import('@/app/api/drive/upload/[id]/route');
  ev = (await sys<{ id: string; code: string }>(
    `select e.id, e.code from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1 order by e.code limit 1`,
    [t.ids.camera],
  ))!;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-import-ui-'));
});

beforeEach(() => {
  h.notices.length = 0;
  h.origin = 'http://localhost:3000';
  h.uploadMode = 'direct';
  h.fake = true;
  h.provider = 'drive';
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
  expect(logs.join('\n')).not.toMatch(/fake-refresh-|fake-access-|upload_id=|Bearer /);
});

describe('«Probar» (Ajustes → Google Drive)', () => {
  it('sin conectar: lo dice, y Google ni se entera', async () => {
    as('admin');
    const r = await drive.testDrive({});
    expect(r).toMatchObject({ ok: true });
    const steps = (r as { data: DriveCheckStep[] }).data;
    expect(steps.map((s) => [s.key, s.level, s.code])).toEqual([['config', 'ok', undefined], ['connection', 'fail', 'not_connected']]);
    expect(checkSummary(steps, 'FB Operaciones 360').todo).toBe('Drive no está conectado. Toca «Conectar Drive».');
    expect(fake.log).toHaveLength(0);
  });

  it('nadie más puede probar ni traer nada (ni administración sin doble factor), y Drive no se llama', async () => {
    await connect();
    const before = fake.log.length;
    for (const who of ['social', 'supervisor', 'camera', 'secretary', 'boss', 'dispatch'] as DemoUserKey[]) {
      as(who);
      expect(await drive.testDrive({}), who).toMatchObject({ ok: false });
      expect(await drive.scanDriveImports({}), who).toMatchObject({ ok: false });
      expect(await drive.saveDriveProbe({ id: ev.id, probe: { durationS: 1, width: 1, height: 1, fps: 30, videoCodec: 'avc', audioCodec: 'aac' } }), who).toMatchObject({ ok: false });
    }
    as('admin', false);
    expect(await drive.testDrive({})).toMatchObject({ ok: false });
    expect(fake.log.length).toBe(before);
  });

  it('conectado: revisa permiso, espacio y carpeta, sube un archivo mínimo, lo lee igualito y lo manda a la papelera', async () => {
    as('admin');
    const r = await drive.testDrive({});
    const steps = (r as { data: DriveCheckStep[] }).data;
    expect(steps.map((s) => [s.key, s.level])).toEqual([['config', 'ok'], ['connection', 'ok'], ['space', 'ok'], ['folder', 'ok'], ['write', 'ok'], ['read', 'ok']]);
    expect(steps[1].account).toBe('cuenta@demo.test');
    const probe = [...fake.files.values()].find((f) => f.name === 'prueba-de-lectura.bin')!;
    expect(probe.trashed).toBe(true);
    expect(probe.appProperties).toEqual({ fb360: 'probe' });
    expect(fake.files.get(probe.parents[0])!.name).toBe('Pruebas');
    // Then the browser's own test: a session for this page, sent through the demo route.
    const st = await drive.startDriveProbe({});
    const { sessionUrl, size } = (st as { data: { sessionUrl: string; size: number } }).data;
    expect(sessionUrl).toMatch(/^\/api\/drive\/fake-upload\?upload_id=/);
    const put = await toRoutes(sessionUrl, { contentRange: `bytes 0-${size - 1}/${size}`, body: new Blob([new Uint8Array(size)]), signal: new AbortController().signal });
    expect(put.status).toBe(200);
    expect(await drive.finishDriveProbe({ direct: true })).toMatchObject({ ok: true, data: { direct: true } });
  });

  it('Drive casi lleno: avisa; permiso vencido: lo dice y no se cae', async () => {
    as('admin');
    fake.quotaLimit = Math.ceil([...fake.files.values()].reduce((n, f) => n + f.bytes.length, 0) / 0.9);
    let steps = ((await drive.testDrive({})) as { data: DriveCheckStep[] }).data;
    expect(steps.find((s) => s.key === 'space')?.level).toBe('warn');
    fake.quotaLimit = 15 * 1024 ** 3;
    fake.expireGrant();
    forgetAccessToken();
    steps = ((await drive.testDrive({})) as { data: DriveCheckStep[] }).data;
    expect(steps.at(-1)).toMatchObject({ key: 'connection', level: 'fail', code: 'auth' });
    steps = ((await drive.testDrive({})) as { data: DriveCheckStep[] }).data;
    expect(steps.at(-1)).toMatchObject({ key: 'connection', level: 'fail', code: 'expired' });
    await connect();
  });

  it('lo que ven las pantallas: «Elegir de Drive» solo para Administración conectada', async () => {
    as('admin');
    expect(await data.driveUi(h.session as Session)).toEqual({ enabled: true, picker: true, problem: null });
    as('social');
    expect(await data.driveUi(h.session as Session)).toEqual({ enabled: true, picker: false, problem: null });
    await t.system((sql) => sql.query(`update public.drive_connection set status = 'expired', last_error = 'invalid_grant'`));
    as('admin');
    expect(await data.driveUi(h.session as Session)).toEqual({ enabled: true, picker: false, problem: 'expired' });
    await connect();
    h.provider = '';
    expect(await data.driveUi(h.session as Session)).toEqual({ enabled: false, picker: false, problem: null });
  });
});

describe('el subidor del navegador, de punta a punta', () => {
  it('quien graba sube un video: partes directo a Drive (en la demo, por su ruta), «Ya terminé» y queda listo', async () => {
    const file = bytes(700 * KIB, 5);
    as('camera');
    const r = await media.createUpload({ eventId: ev.id, kind: 'boss', mime: 'video/mp4', sizeBytes: file.length, ext: 'mp4', probe: { durationS: 4, width: 1080, height: 1920, fps: 30, videoCodec: 'avc', audioCodec: 'aac' } });
    const tk = (r as { data: { id: string; endpoint: string; chunkSize: number; mode: string } }).data;
    expect(tk.mode).toBe('drive');
    // Small chunks so the test sends several; a real ticket says 4 MiB.
    expect(await send(new Blob([file]), tk.endpoint, 256 * KIB)).toEqual({ ok: true });
    expect(await media.finishUpload({ id: tk.id })).toMatchObject({ ok: true });
    expect(await sys(`select status, bucket, fps from public.media_assets where id = $1`, [tk.id])).toMatchObject({ status: 'ready', bucket: 'drive' });
    const f = [...fake.files.values()].find((x) => x.appProperties.mediaId === tk.id)!;
    expect(Buffer.from(f.bytes).equals(Buffer.from(file))).toBe(true);
  });

  it('por la plataforma (DRIVE_UPLOAD_MODE=proxy): el mismo subidor habla el otro protocolo', async () => {
    h.uploadMode = 'proxy';
    const file = bytes(1536 * KIB, 6);
    as('camera');
    const r = await media.createUpload({ eventId: ev.id, kind: 'drone', mime: 'video/mp4', sizeBytes: file.length, ext: 'mp4', probe: {} });
    const tk = (r as { data: { id: string; endpoint: string; chunkSize: number } }).data;
    expect(tk.endpoint).toBe(`/api/drive/upload/${tk.id}`);
    expect(await send(new Blob([file]), tk.endpoint, tk.chunkSize)).toEqual({ ok: true });
    expect(await media.finishUpload({ id: tk.id })).toMatchObject({ ok: true });
  });

  it('la ruta de la demo para el Drive falso no existe fuera de la demo con DRIVE_FAKE', async () => {
    h.fake = false;
    const res = await fakeUpload.PUT(new NextRequest('http://localhost:3000/api/drive/fake-upload?upload_id=abcdefgh', { method: 'PUT', headers: { 'content-range': 'bytes */10' } }));
    expect(res.status).toBe(404);
  });
});

describe('«Traer lo nuevo de Drive» después del script de importación', () => {
  it('registra lo que subió el script, como «Archivo 001», sin evento, una sola vez', async () => {
    fs.writeFileSync(path.join(dir, 'a.mp4'), Buffer.from(bytes(300 * KIB, 7)));
    fs.writeFileSync(path.join(dir, 'b.mov'), Buffer.from(bytes(200 * KIB, 8)));
    fs.writeFileSync(path.join(dir, 'Sábados Felices.mp4'), Buffer.from(bytes(10 * KIB, 9)));
    const files: LocalFile[] = [{ rel: 'a.mp4', size: 300 * KIB }, { rel: 'b.mov', size: 200 * KIB }, { rel: 'Sábados Felices.mp4', size: 10 * KIB }];
    const plan = planImport(files, emptyState(), ['*sabados felices*']);
    fake.accessTokens.add('tok-script');
    const rest = new DriveRest((u, i) => fake.fetch(u, i), async () => 'tok-script', { pause: async () => {} });
    const { importId } = await rest.folders('FB Operaciones 360');
    // The script reuses the platform's own root folder (made when Administración connected).
    const roots = [...fake.files.values()].filter((f) => f.appProperties.fb360 === 'root');
    expect(roots).toHaveLength(1);
    expect(await runUploads({ drive: rest, fetcher: (u, i) => fake.fetch(u, i), folder: dir, plan, state: plan.state, importId, chunk: 256 * KIB, save: async () => {}, timing: { pause: async () => {} } })).toEqual({ sent: 2, already: 0 });

    as('admin');
    const r = await drive.scanDriveImports({});
    expect(r).toMatchObject({ ok: true, data: { added: 2, failed: 0, left: 0, error: null } });
    const items = (r as { data: { items: { id: string; mime: string; size: number }[] } }).data.items;
    expect(items.map((i) => i.mime).sort()).toEqual(['video/mp4', 'video/quicktime']);
    const rows = await t.system((sql) =>
      sql.query<{ label: string; event_id: string | null; kind: string; status: string; source: string }>(
        `select m.label, m.event_id, m.kind, m.status, d.source from public.media_assets m join public.media_drive d on d.media_id = m.id where d.source = 'import' order by m.label`,
      ),
    );
    expect(rows).toEqual([
      { label: 'Archivo 001', event_id: null, kind: 'other', status: 'ready', source: 'import' },
      { label: 'Archivo 002', event_id: null, kind: 'other', status: 'ready', source: 'import' },
    ]);
    // Nothing of the original names reached the platform.
    expect(JSON.stringify(rows)).not.toMatch(/a\.mp4|b\.mov|felices/i);
    // Again: nothing new.
    expect(await drive.scanDriveImports({})).toMatchObject({ ok: true, data: { added: 0, failed: 0, left: 0 } });
    // The content team sees «Archivo» (no event); dispatch does not (RLS as always).
    const archive = `select id from public.media_assets where label like 'Archivo %' and deleted_at is null`;
    expect(await t.as('social', (sql) => sql.query(archive))).toHaveLength(2);
    expect(await t.as('dispatch', (sql) => sql.query(archive))).toHaveLength(0);
    expect(await t.as('camera', (sql) => sql.query(archive))).toHaveLength(0);
  });

  it('lo que leyó el navegador de Administración llena solo lo vacío, y solo en lo que vino de Drive', async () => {
    as('admin');
    const row = (await sys<{ id: string }>(`select m.id from public.media_assets m join public.media_drive d on d.media_id = m.id where d.source = 'import' and m.label = 'Archivo 001'`))!;
    await t.system((sql) => sql.query(`update public.media_assets set width = 1080 where id = $1`, [row.id]));
    const probe = { durationS: 58.2, width: 640, height: 1920, fps: 29.97, videoCodec: 'AVC', audioCodec: 'aac' };
    expect(await drive.saveDriveProbe({ id: row.id, probe })).toEqual({ ok: true });
    expect(await sys(`select width, height, fps::float8 as fps, video_codec, audio_codec from public.media_assets where id = $1`, [row.id])).toEqual({ width: 1080, height: 1920, fps: 29.97, video_codec: 'avc', audio_codec: 'aac' });
    // A file someone uploaded keeps what their phone measured.
    const up = (await sys<{ id: string; fps: number | null }>(`select m.id, m.fps from public.media_assets m join public.media_drive d on d.media_id = m.id where d.source = 'upload' and m.status = 'ready' limit 1`))!;
    expect(await drive.saveDriveProbe({ id: up.id, probe: { ...probe, fps: 12 } })).toEqual({ ok: true });
    expect((await sys<{ fps: number | null }>(`select fps from public.media_assets where id = $1`, [up.id]))!.fps).toBe(up.fps);
    // Bad values never pass.
    expect(await drive.saveDriveProbe({ id: row.id, probe: { ...probe, videoCodec: '<script>' } })).toMatchObject({ ok: false });
  });
});
