// Google Drive end to end, against the in-memory database (same migrations, RLS on) and the
// in-memory fake Drive (src/lib/storage/drive/fake.ts): no network, no real account or key.
// Connect (OAuth), upload (server session + browser chunks), finish, play and download with
// Range, thumbnails, «Elegir de Drive», the transfer cap, an expired grant and the permission
// rule: whoever cannot see a file cannot get it from Drive, and Drive is not even called.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';
import { resetFakeDrive, type FakeDrive } from '@/lib/storage/drive/fake';
import { driveTiming } from '@/lib/storage/drive/http';
import { forgetAccessToken } from '@/lib/storage/drive/connection';
import { DRIVE_MESSAGE, TOO_BIG_MESSAGE, UPLOAD_SHARE_MESSAGE } from '@/lib/storage/drive/errors';
import { looksLikeDateTime } from '@/lib/push/text';
import { SECRET, contains, jpegWithGps, heicHead } from './fixtures/photos';

const h = vi.hoisted(() => ({
  session: null as unknown,
  notices: [] as unknown[],
  origin: 'http://localhost:3000' as string | null,
  cookies: new Map<string, string>(),
  provider: 'drive',
  fake: true,
  uploadMode: 'direct' as 'direct' | 'proxy',
  capGb: 7,
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
      cronSecret: 'cron-de-prueba',
      storage: { get provider() { return h.provider; } },
      drive: { tokenKey: '', get fake() { return h.fake; }, get uploadMode() { return h.uploadMode; }, get transferCapGb() { return h.capGb; } },
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
let mediaRoute: typeof import('@/app/api/media/[id]/route');
let thumbRoute: typeof import('@/app/api/media/[id]/thumb/route');
let callback: typeof import('@/app/api/drive/callback/route');
let proxyRoute: typeof import('@/app/api/drive/upload/[id]/route');
let ev: { id: string; code: string };
const logs: string[] = [];

const MB = 1024 * 1024;

function as(key: DemoUserKey, mfaOk = true) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: t.ids[key], aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

const notices = (kind?: string) => (h.notices as Notice[]).filter((n) => !kind || n.kind === kind);
const sys = <T>(q: string, p: unknown[] = []) => t.system((sql) => sql.one<T>(q, p));
const conn = () => sys<{ status: string; account_email: string | null; token_enc: string | null; last_error: string | null }>(`select status, account_email, token_enc, last_error from public.drive_connection`);
const used = async () => Number((await sys<{ bytes: string }>(`select bytes from public.drive_transfer`))?.bytes ?? 0);
const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);

async function connect(): Promise<Response> {
  as('admin');
  const r = await drive.startDriveConnect({});
  expect(r).toMatchObject({ ok: true });
  const url = new URL((r as { data: { url: string } }).data.url);
  return callback.GET(new NextRequest(url));
}

async function get(id: string, o: { range?: string; ver?: boolean } = {}) {
  const req = new NextRequest(`http://localhost:3000/api/media/${id}${o.ver ? '?ver=1' : ''}`, { headers: o.range ? { range: o.range } : {} });
  return mediaRoute.GET(req, { params: Promise.resolve({ id }) });
}

// With the fake Drive the browser gets the demo route (/api/drive/fake-upload), which hands the
// chunks to the fake at Google's own session URL.
function toGoogle(u: string): string {
  if (!u.startsWith('/api/drive/fake-upload?')) return u;
  return `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${new URL(u, 'http://x').searchParams.get('upload_id')}`;
}

// What the browser does with the ticket: PUT the chunks straight to the session URL.
async function sendChunks(endpoint: string, data: Uint8Array<ArrayBuffer>, chunk: number, upTo = data.length) {
  for (let at = 0; at < upTo; at += chunk) {
    const end = Math.min(at + chunk, data.length) - 1;
    const r = await fake.fetch(toGoogle(endpoint), { method: 'PUT', headers: { 'Content-Range': `bytes ${at}-${end}/${data.length}`, Origin: h.origin ?? '' }, body: data.subarray(at, end + 1) });
    expect([200, 308]).toContain(r.status);
  }
}

type Ticket = { id: string; endpoint: string; chunkSize: number; mode: string; bucket: string; token: string | null };

async function upload(who: DemoUserKey, data: Uint8Array<ArrayBuffer>, o: { kind?: string; mime?: string; ext?: string; eventId?: string | null } = {}): Promise<Ticket> {
  as(who);
  const r = await media.createUpload({ eventId: o.eventId === undefined ? ev.id : o.eventId, kind: o.kind ?? 'boss', mime: o.mime ?? 'video/mp4', sizeBytes: data.length, ext: o.ext ?? 'mp4', probe: {} });
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  return (r as { data: Ticket }).data;
}

async function uploadAndFinish(who: DemoUserKey, data: Uint8Array<ArrayBuffer>, o: Parameters<typeof upload>[2] = {}) {
  const tk = await upload(who, data, o);
  await sendChunks(tk.endpoint, data, tk.chunkSize);
  const f = await media.finishUpload({ id: tk.id });
  expect(f, JSON.stringify(f)).toMatchObject({ ok: true });
  return tk;
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
  mediaRoute = await import('@/app/api/media/[id]/route');
  thumbRoute = await import('@/app/api/media/[id]/thumb/route');
  callback = await import('@/app/api/drive/callback/route');
  proxyRoute = await import('@/app/api/drive/upload/[id]/route');
  // An event where «camera» is assigned and «camera2» is not.
  ev = (await sys<{ id: string; code: string }>(
    `select e.id, e.code from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = $1
      where not exists (select 1 from public.event_assignments b where b.event_id = e.id and b.user_id = $2) order by e.code limit 1`,
    [t.ids.camera, t.ids.camera2],
  ))!;
});

function resetKnobs() {
  h.origin = 'http://localhost:3000';
  h.uploadMode = 'direct';
  h.capGb = 7;
}

beforeEach(() => {
  h.notices.length = 0;
  resetKnobs();
});
// Also after: a describe's beforeAll runs before the next test's beforeEach.
afterEach(resetKnobs);

afterAll(() => {
  vi.restoreAllMocks();
  // Nothing token-like or bearer-URL-like ever reaches a log.
  const all = logs.join('\n');
  expect(all).not.toMatch(/fake-refresh-|fake-access-|upload_id=|Bearer /);
});

describe('conectar Drive (Administración con doble factor)', () => {
  it('nadie más puede empezar, y Google ni se entera', async () => {
    for (const who of ['social', 'supervisor', 'camera', 'secretary', 'boss', 'dispatch'] as DemoUserKey[]) {
      as(who);
      expect(await drive.startDriveConnect({}), who).toMatchObject({ ok: false });
    }
    as('admin', false);
    expect(await drive.startDriveConnect({})).toMatchObject({ ok: false });
    expect(fake.log).toHaveLength(0);
    expect(h.cookies.size).toBe(0);
  });

  it('el regreso de Google sin el intento de esta sesión no guarda nada', async () => {
    as('admin');
    const r = await drive.startDriveConnect({});
    const url = new URL((r as { data: { url: string } }).data.url);
    const wrong = new URL(url);
    wrong.searchParams.set('state', 'otro-estado');
    const bad = await callback.GET(new NextRequest(wrong));
    expect(bad.headers.get('location')).toMatch(/\/ajustes\/drive\?error=estado$/);
    // Someone else's session with the admin's cookie: refused.
    const r2 = await drive.startDriveConnect({});
    const url2 = new URL((r2 as { data: { url: string } }).data.url);
    as('social');
    expect((await callback.GET(new NextRequest(url2))).headers.get('location')).toMatch(/error=permiso$/);
    // A tampered cookie.
    as('admin');
    const r3 = await drive.startDriveConnect({});
    h.cookies.set('fb_drive_oauth', `${h.cookies.get('fb_drive_oauth')}x`);
    expect((await callback.GET(new NextRequest(new URL((r3 as { data: { url: string } }).data.url)))).headers.get('location')).toMatch(/error=estado$/);
    expect(await conn()).toBeNull();
    expect(fake.calls('token')).toHaveLength(0);
  });

  it('sin la casilla de Drive marcada: lo dice y no guarda nada', async () => {
    fake.grantedScope = 'openid';
    const res = await connect();
    expect(res.headers.get('location')).toMatch(/error=alcance$/);
    expect(await conn()).toBeNull();
    fake.grantedScope = 'https://www.googleapis.com/auth/drive.file';
  });

  it('conecta: guarda el permiso cifrado, la cuenta y crea la carpeta raíz una sola vez', async () => {
    const res = await connect();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/ajustes/drive?ok=1');
    const c = await conn();
    expect(c).toMatchObject({ status: 'ok', account_email: 'cuenta@demo.test' });
    expect(c!.token_enc).toMatch(/^v1\./);
    expect(c!.token_enc).not.toContain('fake-refresh');
    const roots = () => [...fake.files.values()].filter((f) => f.appProperties.fb360 === 'root');
    expect(roots()).toHaveLength(1);
    expect(roots()[0].name).toBe('FB Operaciones 360');
    // Again: the same root is reused. The one-time cookie is cleared on the way back.
    const again = await connect();
    expect(roots()).toHaveLength(1);
    expect(again.headers.get('set-cookie')).toMatch(/fb_drive_oauth=;.*Max-Age=0/i);
    expect(again.headers.get('set-cookie')).toMatch(/Path=\/api\/drive/);
  });

  it('con otra cuenta de Google: no la acepta y la conexión queda como estaba', async () => {
    fake.email = 'otra-cuenta@demo.test';
    const res = await connect();
    expect(res.headers.get('location')).toMatch(/error=cuenta$/);
    expect(await conn()).toMatchObject({ status: 'ok', account_email: 'cuenta@demo.test' });
    fake.email = 'cuenta@demo.test';
  });

  it('«Probar conexión»: una subida mínima desde el navegador de Administración, que luego va a la papelera', async () => {
    as('social');
    const before = fake.log.length;
    expect(await drive.startDriveProbe({})).toMatchObject({ ok: false });
    expect(fake.log.length).toBe(before);
    as('admin');
    const r = await drive.startDriveProbe({});
    expect(r).toMatchObject({ ok: true, data: { size: 256 * 1024 } });
    const { sessionUrl } = (r as { data: { sessionUrl: string } }).data;
    expect(fake.calls('createSession').at(-1)!.origin).toBe('http://localhost:3000');
    expect(sessionUrl).toMatch(/^\/api\/drive\/fake-upload\?upload_id=/);
    const put = await fake.fetch(toGoogle(sessionUrl), { method: 'PUT', headers: { 'Content-Range': `bytes 0-${256 * 1024 - 1}/${256 * 1024}`, Origin: 'http://localhost:3000' }, body: new Uint8Array(256 * 1024) });
    expect(put.status).toBe(200);
    expect(put.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(await drive.finishDriveProbe({ direct: true })).toEqual({ ok: true, data: { direct: true, message: 'Todo bien: los videos van del teléfono directo a Drive.' } });
    const probes = [...fake.files.values()].filter((f) => f.appProperties.fb360 === 'probe');
    expect(probes).toHaveLength(1);
    expect(probes[0].trashed).toBe(true);
    expect(await drive.finishDriveProbe({ direct: false })).toMatchObject({ data: { message: expect.stringContaining('OK de Juan') } });
  });

  it('el Picker: un token corto solo para Administración; a los demás se les niega sin llamar a Google', async () => {
    as('admin');
    const r = await drive.drivePickerConfig({});
    expect(r).toMatchObject({ ok: true, data: { apiKey: 'fake-picker-key', appId: '0' } });
    expect((r as { data: { accessToken: string } }).data.accessToken).toMatch(/^fake-access-/);
    const before = fake.log.length;
    for (const who of ['social', 'supervisor', 'camera', 'secretary', 'boss'] as DemoUserKey[]) {
      as(who);
      expect(await drive.drivePickerConfig({}), who).toMatchObject({ ok: false });
      expect(await drive.registerDriveFile({ fileId: 'cualquierArchivo01', eventId: null, kind: 'other' }), who).toMatchObject({ ok: false });
    }
    expect(fake.log.length).toBe(before);
  });
});

describe('subir a Drive', () => {
  it('el servidor abre la subida en la carpeta del evento y le da al navegador solo esa URL', async () => {
    const data = bytes(600 * 1024);
    const tk = await upload('camera', data);
    expect(tk).toMatchObject({ mode: 'drive', bucket: 'drive', token: null, chunkSize: 4 * MB });
    // The fake's session, through the demo-only route (a real Drive hands over Google's URL).
    expect(tk.endpoint).toMatch(/^\/api\/drive\/fake-upload\?upload_id=[A-Za-z0-9_-]+$/);
    expect(fake.sessions.has(new URL(tk.endpoint, 'http://x').searchParams.get('upload_id')!)).toBe(true);
    const start = fake.calls('createSession').at(-1)!;
    expect(start.origin).toBe('http://localhost:3000');
    const s = [...fake.sessions.values()].at(-1)!;
    expect(s.meta.name).toBe(`${ev.code}-Jefe-hablando-${await labelNumber(tk.id)}.mp4`);
    expect(looksLikeDateTime(s.meta.name!)).toBe(false);
    expect(s.meta.appProperties).toEqual({ fb360: 'media', mediaId: tk.id });
    const folder = fake.files.get(s.meta.parents![0])!;
    expect(folder.name).toBe(ev.code);
    expect(fake.files.get(folder.parents[0])!.name).toBe('Videos');
    // The session URL is kept sealed, never in clear.
    const link = await sys<{ file_id: string; upload_url_enc: string }>(`select file_id, upload_url_enc from public.media_drive where media_id = $1`, [tk.id]);
    expect(link!.upload_url_enc).toMatch(/^v1\./);
    expect(link!.upload_url_enc).not.toContain('upload_id');
    expect(link!.file_id).toBe(s.meta.id);

    // Not finished: «Ya terminé» too early is refused and the row fails.
    await sendChunks(tk.endpoint, data, 256 * 1024, 256 * 1024);
    expect(await media.finishUpload({ id: tk.id })).toEqual({ ok: false, error: 'El archivo no llegó completo. Súbelo otra vez.' });
    expect((await sys<{ status: string }>(`select status from public.media_assets where id = $1`, [tk.id]))!.status).toBe('failed');
  });

  it('terminada: queda lista, se olvida la URL y se llenan los datos que faltaban', async () => {
    const data = bytes(300 * 1024, 2);
    const tk = await upload('camera', data);
    await sendChunks(tk.endpoint, data, tk.chunkSize);
    const link = await sys<{ file_id: string }>(`select file_id from public.media_drive where media_id = $1`, [tk.id]);
    fake.files.get(link!.file_id)!.video = { durationMillis: '12500', width: 1080, height: 1920 };
    expect(await media.finishUpload({ id: tk.id })).toMatchObject({ ok: true, data: { kind: 'boss', event_id: ev.id } });
    const row = await sys<{ status: string; duration_s: string; width: number; height: number }>(`select status, duration_s, width, height from public.media_assets where id = $1`, [tk.id]);
    expect(row).toMatchObject({ status: 'ready', width: 1080, height: 1920 });
    expect(Number(row!.duration_s)).toBe(12.5);
    expect((await sys<{ upload_url_enc: string | null }>(`select upload_url_enc from public.media_drive where media_id = $1`, [tk.id]))!.upload_url_enc).toBeNull();
    expect(notices('material_ready')).toHaveLength(1);
    // Again (the phone retried): still fine.
    expect(await media.finishUpload({ id: tk.id })).toMatchObject({ ok: true });
  });

  it('nunca guarda una página, un SVG o un script, aunque el navegador diga otra cosa', async () => {
    const before = fake.log.length;
    for (const [mime, ext] of [['image/svg+xml', 'svg'], ['text/html', 'jpg'], ['image/svg+xml', 'png'], ['application/xhtml+xml', 'png']]) {
      as('social');
      const r = await media.createUpload({ eventId: null, kind: 'evidence', mime, sizeBytes: 1000, ext, probe: {} });
      expect(r, `${mime} ${ext}`).toEqual({ ok: false, error: 'Ese tipo de archivo no se puede guardar aquí.' });
    }
    expect(fake.log.length).toBe(before);
    expect((await sys<{ n: number }>(`select count(*)::int as n from public.media_assets where kind = 'evidence' and bucket = 'drive'`))!.n).toBe(0);
  });

  it('un Origin que no es nuestro no se le pasa a Google', async () => {
    h.origin = 'https://sitio-ajeno.example';
    await upload('camera', bytes(1000));
    expect(fake.calls('createSession').at(-1)!.origin).toBe('http://localhost:3000');
  });

  it('Drive lleno: la fila queda fallida, mensaje claro y aviso a Administración', async () => {
    fake.quotaLimit = 10;
    as('camera');
    const r = await media.createUpload({ eventId: ev.id, kind: 'boss', mime: 'video/mp4', sizeBytes: 5000, ext: 'mp4', probe: {} });
    expect(r).toEqual({ ok: false, error: DRIVE_MESSAGE.full });
    expect(notices('drive_quota')).toHaveLength(1);
    expect((await sys<{ n: number }>(`select count(*)::int as n from public.media_assets where size_bytes = 5000 and status = 'failed'`))!.n).toBe(1);
    fake.quotaLimit = 15 * 1024 ** 3;
  });

  it('por la plataforma (DRIVE_UPLOAD_MODE=proxy): partes de 1 MiB, solo el dueño de la subida, y cuenta la transferencia', async () => {
    h.uploadMode = 'proxy';
    const data = bytes(1.5 * MB, 3);
    const tk = await upload('camera', data);
    expect(tk.endpoint).toBe(`/api/drive/upload/${tk.id}`);
    expect(tk.chunkSize).toBe(MB);
    const put = (body: Uint8Array<ArrayBuffer> | null, range: string) =>
      proxyRoute.PUT(new NextRequest(`http://localhost:3000${tk.endpoint}`, { method: 'PUT', headers: { 'content-range': range }, body: body ?? undefined }), { params: Promise.resolve({ id: tk.id }) });
    as('camera2');
    expect((await put(data.subarray(0, MB), `bytes 0-${MB - 1}/${data.length}`)).status).toBe(404);
    as('camera');
    const before = await used();
    expect(await (await put(data.subarray(0, MB), `bytes 0-${MB - 1}/${data.length}`)).json()).toEqual({ done: false, received: MB });
    expect(await (await put(null, `bytes */${data.length}`)).json()).toEqual({ done: false, received: MB });
    expect((await put(new Uint8Array(2 * MB), `bytes ${MB}-${3 * MB - 1}/${data.length}`)).status).toBe(413);
    expect((await put(data.subarray(MB), `bytes ${MB}-${data.length - 1}/${data.length + 1}`)).status).toBe(400);
    expect(await (await put(data.subarray(MB), `bytes ${MB}-${data.length - 1}/${data.length}`)).json()).toEqual({ done: true, received: data.length });
    expect(await used()).toBe(before + data.length);
    expect(await media.finishUpload({ id: tk.id })).toMatchObject({ ok: true });
  });

  it('por la plataforma: una parte incompleta, una subida vencida o Google caído no gastan el tope', async () => {
    h.uploadMode = 'proxy';
    const data = bytes(2 * MB, 11);
    const tk = await upload('camera', data);
    const put = (body: Uint8Array<ArrayBuffer> | null, range: string, headers: Record<string, string> = {}) =>
      proxyRoute.PUT(new NextRequest(`http://localhost:3000${tk.endpoint}`, { method: 'PUT', headers: { 'content-range': range, ...headers }, body: body ?? undefined }), { params: Promise.resolve({ id: tk.id }) });
    const first = `bytes 0-${MB - 1}/${data.length}`;
    const second = `bytes ${MB}-${2 * MB - 1}/${data.length}`;
    const before = await used();
    const calls = fake.calls('uploadChunk').length;
    // Says 1 MiB, sends 1 byte (or says so up front): refused, nothing counted, Google not called.
    for (let i = 0; i < 5; i++) {
      const r = await put(new Uint8Array([1]), first);
      expect(r.status).toBe(400);
      expect(await r.text()).toBe('Parte incompleta.');
    }
    expect((await put(new Uint8Array([1]), first, { 'content-length': '1' })).status).toBe(400);
    expect(await used()).toBe(before);
    expect(fake.calls('uploadChunk').length).toBe(calls);
    // Google slow or unreachable: the part is given back.
    fake.fail('uploadChunk', 503, 'backendError');
    expect((await put(data.subarray(0, MB), first)).status).toBe(503);
    fake.fail('uploadChunk', 0);
    expect((await put(data.subarray(0, MB), first)).status).toBe(503);
    expect(await used()).toBe(before);
    // Taken: counted.
    expect(await (await put(data.subarray(0, MB), first)).json()).toEqual({ done: false, received: MB });
    expect(await used()).toBe(before + MB);
    // Google forgot the session: given back.
    const sid = [...fake.sessions.values()].find((x) => x.meta.appProperties?.mediaId === tk.id)!.sid;
    fake.sessions.delete(sid);
    const gone = await put(data.subarray(MB), second);
    expect(gone.status).toBe(410);
    expect(await gone.text()).toBe('La subida venció; vuelve a elegir el archivo.');
    expect(await used()).toBe(before + MB);
    // The sealed URL is gone: refused before anything is counted.
    await t.system((sql) => sql.query(`update public.media_drive set upload_url_enc = null where media_id = $1`, [tk.id]));
    const chunks = fake.calls('uploadChunk').length;
    for (let i = 0; i < 3; i++) expect((await put(data.subarray(MB), second)).status).toBe(410);
    expect(await used()).toBe(before + MB);
    expect(fake.calls('uploadChunk').length).toBe(chunks);
  });

  it('por la plataforma: al subir también cuenta la parte del día de cada persona (Administración no tiene)', async () => {
    await t.system(async (sql) => {
      await sql.query(`update public.drive_transfer set bytes = 0`);
      await sql.query(`delete from public.drive_transfer_person`);
    });
    h.uploadMode = 'proxy';
    // A quarter of the cap a day: one 1 MiB part and 100 bytes more.
    h.capGb = (4 * (MB + 100)) / 1024 ** 3;
    const send = (tk: Ticket, body: Uint8Array<ArrayBuffer>, range: string) =>
      proxyRoute.PUT(new NextRequest(`http://localhost:3000${tk.endpoint}`, { method: 'PUT', headers: { 'content-range': range }, body }), { params: Promise.resolve({ id: tk.id }) });
    const data = bytes(MB + 512 * 1024, 13);
    const tk = await upload('camera', data);
    const rest = `bytes ${MB}-${data.length - 1}/${data.length}`;
    expect(await (await send(tk, data.subarray(0, MB), `bytes 0-${MB - 1}/${data.length}`)).json()).toEqual({ done: false, received: MB });
    const no = await send(tk, data.subarray(MB), rest);
    expect(no.status).toBe(429);
    expect(await no.text()).toBe(UPLOAD_SHARE_MESSAGE);
    expect(await used()).toBe(MB);
    expect(Number((await sys<{ bytes: string }>(`select bytes from public.drive_transfer_person where user_id = $1`, [t.ids.camera]))!.bytes)).toBe(MB);
    const [n] = notices('drive_share');
    expect(n.userIds).toEqual([t.ids.admin]);
    expect(n.body).toContain(DEMO_USERS.find((u) => u.key === 'camera')!.name);
    expect(n.body).toContain('subida');
    expect(notices('drive_quota')).toHaveLength(0);
    // Administración goes on (only the month's cap counts for it).
    const own = bytes(MB + 512 * 1024, 14);
    const at = await upload('admin', own);
    expect(await (await send(at, own.subarray(0, MB), `bytes 0-${MB - 1}/${own.length}`)).json()).toEqual({ done: false, received: MB });
    expect(await (await send(at, own.subarray(MB), `bytes ${MB}-${own.length - 1}/${own.length}`)).json()).toEqual({ done: true, received: own.length });
    expect(await used()).toBe(MB + own.length);
    expect(await sys(`select 1 from public.drive_transfer_person where user_id = $1`, [t.ids.admin])).toBeNull();
  });
});

describe('ver y descargar desde Drive (/api/media/[id])', () => {
  let id: string;
  let size: number;
  let big: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    big = bytes(5 * MB + 123, 9);
    size = big.length;
    id = (await uploadAndFinish('camera', big)).id;
  });

  it('por tramos de 4 MiB como mucho, con el tamaño exacto', async () => {
    const r = await get(id, { range: 'bytes=0-', ver: true });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 0-${4 * MB - 1}/${size}`);
    expect(r.headers.get('content-length')).toBe(String(4 * MB));
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('content-disposition')).toBe(`inline; filename="${ev.code}-Jefe-hablando-${await labelNumber(id)}.mp4"`);
    const body = new Uint8Array(await r.arrayBuffer());
    expect(body.length).toBe(4 * MB);
    expect(Buffer.from(body).equals(Buffer.from(big.subarray(0, 4 * MB)))).toBe(true);

    const tail = await get(id, { range: `bytes=${4 * MB}-` });
    expect(tail.status).toBe(206);
    expect(tail.headers.get('content-range')).toBe(`bytes ${4 * MB}-${size - 1}/${size}`);
    expect(Buffer.from(await tail.arrayBuffer()).equals(Buffer.from(big.subarray(4 * MB)))).toBe(true);
    // A download (no ?ver=1) is always an attachment.
    expect(tail.headers.get('content-disposition')).toMatch(/^attachment; filename="E-\d{4}-Jefe-hablando-\d+\.mp4"$/);
    expect(tail.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('el sondeo de Safari (bytes=0-1), sin tramo (200 completo) y tramos imposibles (416)', async () => {
    const probe = await get(id, { range: 'bytes=0-1', ver: true });
    expect(probe.status).toBe(206);
    expect(probe.headers.get('content-range')).toBe(`bytes 0-1/${size}`);
    expect(new Uint8Array(await probe.arrayBuffer())).toEqual(big.subarray(0, 2));
    const full = await get(id);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-length')).toBe(String(size));
    expect((await full.arrayBuffer()).byteLength).toBe(size);
    for (const range of ['bytes=0-1,5-9', `bytes=${size}-`, 'bytes=-0', 'algo raro']) {
      const r = await get(id, { range });
      expect(r.status, range).toBe(416);
      expect(r.headers.get('content-range'), range).toBe(`bytes */${size}`);
    }
  });

  it('cada respuesta va aislada: sin scripts, solo para nuestro sitio y sin guardar en caché', async () => {
    const r = await get(id, { range: 'bytes=0-1', ver: true });
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(r.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    await r.arrayBuffer();
  });

  it('un archivo que no es un medio simple nunca se muestra en línea', async () => {
    // A row whose type slipped past the upload rules (or a future kind): served as a download.
    const svgId = await insertDriveRow('image/svg+xml', 'svg', bytes(100));
    for (const ver of [true, false]) {
      const r = await get(svgId, { ver });
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('application/octet-stream');
      expect(r.headers.get('content-disposition')).toMatch(/^attachment;/);
      expect(r.headers.get('content-security-policy')).toContain('sandbox');
      await r.arrayBuffer();
    }
  });

  it('cuenta los bytes servidos este mes, y al llegar al tope frena y avisa una vez', async () => {
    const before = await used();
    const r = await get(id, { range: 'bytes=0-99' });
    await r.arrayBuffer();
    await vi.waitFor(async () => expect(await used()).toBe(before + 100));
    h.capGb = (before + 100) / 1024 ** 3;
    const stop = await get(id, { range: 'bytes=0-99' });
    expect(stop.status).toBe(503);
    expect(await stop.text()).toBe(DRIVE_MESSAGE.budget);
    expect(notices('drive_quota')).toHaveLength(1);
    expect(notices('drive_quota')[0].userIds).toEqual([t.ids.admin]);
  });

  it('si el navegador se va a mitad, se deja de pedir a Google y se cuenta solo lo enviado', async () => {
    const before = await used();
    const cancelledBefore = fake.mediaCancelled;
    const r = await get(id, { range: 'bytes=0-' });
    const reader = r.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    await vi.waitFor(async () => expect(await used()).toBe(before + first.value!.length));
    expect(fake.mediaCancelled).toBe(cancelledBefore + 1);
  });

  it('reserva antes de mandar: un archivo entero que no cabe en lo que queda del tope no sale ni se cuenta', async () => {
    as('admin');
    const before = await used();
    h.capGb = (before + 1) / 1024 ** 3;
    const calls = fake.log.length;
    const r = await get(id);
    expect(r.status).toBe(503);
    expect(await r.text()).toBe(DRIVE_MESSAGE.budget);
    expect(await used()).toBe(before);
    expect(fake.log.length).toBe(calls);
  });

  it('dos pedidos a la vez no pasan juntos el tope', async () => {
    as('admin');
    const before = await used();
    h.capGb = (before + 4 * MB + 10) / 1024 ** 3;
    const both = await Promise.all([get(id, { range: 'bytes=0-' }), get(id, { range: 'bytes=0-' })]);
    expect(both.map((r) => r.status).sort()).toEqual([206, 503]);
    for (const r of both) await r.arrayBuffer();
    await vi.waitFor(async () => expect(await used()).toBe(before + 4 * MB));
  });

  it('si Drive falla, lo reservado se devuelve', async () => {
    const goneId = (await uploadAndFinish('camera', bytes(3000, 7))).id;
    const link = await sys<{ file_id: string }>(`select file_id from public.media_drive where media_id = $1`, [goneId]);
    fake.files.delete(link!.file_id);
    as('social');
    const before = await used();
    expect((await get(goneId, { range: 'bytes=0-' })).status).toBe(410);
    await vi.waitFor(async () => expect(await used()).toBe(before));
  });

  it('cada persona tiene su parte del día: pasada, se le niega solo a ella, con aviso a Administración', async () => {
    await t.system(async (sql) => {
      await sql.query(`update public.drive_transfer set bytes = 0`);
      await sql.query(`delete from public.drive_transfer_person`);
    });
    // A quarter of the cap a day: one 4 MiB piece and 100 bytes more.
    h.capGb = (4 * (4 * MB + 100)) / 1024 ** 3;
    as('supervisor');
    const a = await get(id, { range: 'bytes=0-' });
    expect(a.status).toBe(206);
    await a.arrayBuffer();
    const b = await get(id, { range: 'bytes=0-99' });
    expect(b.status).toBe(206);
    await b.arrayBuffer();
    const no = await get(id, { range: 'bytes=0-0' });
    expect(no.status).toBe(429);
    expect(await no.text()).toBe(DRIVE_MESSAGE.share);
    const [n] = notices('drive_share');
    expect(n.userIds).toEqual([t.ids.admin]);
    expect(n.body).toContain(DEMO_USERS.find((u) => u.key === 'supervisor')!.name);
    expect(notices('drive_quota')).toHaveLength(0);
    // Somebody else, and Administración, still get it.
    for (const who of ['social', 'admin'] as DemoUserKey[]) {
      as(who);
      const r = await get(id, { range: 'bytes=0-99' });
      expect(r.status, who).toBe(206);
      await r.arrayBuffer();
    }
    const day = await sys<{ bytes: string }>(`select bytes from public.drive_transfer_person where user_id = $1`, [t.ids.supervisor]);
    expect(Number(day!.bytes)).toBe(4 * MB + 100);
    expect(await sys(`select 1 from public.drive_transfer_person where user_id = $1`, [t.ids.admin])).toBeNull();
  });

  it('un archivo grande nunca sale entero en una sola respuesta: se baja por partes', async () => {
    const bigId = await insertDriveRow('video/mp4', 'mp4', bytes(1000));
    await t.system((sql) => sql.query(`update public.media_assets set size_bytes = $2 where id = $1`, [bigId, 40 * MB]));
    as('social');
    const calls = fake.log.length;
    const before = await used();
    const r = await get(bigId);
    expect(r.status).toBe(400);
    expect(await r.text()).toBe(TOO_BIG_MESSAGE);
    expect(fake.log.length).toBe(calls);
    expect(await used()).toBe(before);
  });

  it('si Drive manda el archivo entero a un pedido por tramos, recorta (solo al principio)', async () => {
    fake.rangeIgnored = true;
    try {
      const r = await get(id, { range: 'bytes=10-19' });
      expect(r.status).toBe(206);
      expect(r.headers.get('content-range')).toBe(`bytes 10-19/${size}`);
      expect(new Uint8Array(await r.arrayBuffer())).toEqual(big.subarray(10, 20));
      const far = bytes(9 * MB, 4);
      const farId = (await uploadAndFinish('camera', far)).id;
      const no = await get(farId, { range: `bytes=${8 * MB + 1}-` });
      expect(no.status).toBe(503);
      expect(await no.text()).toBe('No se pudo leer ese tramo. Intenta otra vez.');
    } finally {
      fake.rangeIgnored = false;
    }
  });

  it('quien no ve el material recibe 404 y Drive ni se entera (grabación sin asignar, secretaría, sin doble factor)', async () => {
    const before = fake.log.length;
    for (const who of ['camera2', 'secretary'] as DemoUserKey[]) {
      as(who);
      expect((await get(id, { range: 'bytes=0-1' })).status, who).toBe(404);
      const th = await thumbRoute.GET(new NextRequest(`http://localhost:3000/api/media/${id}/thumb`), { params: Promise.resolve({ id }) });
      expect(th.status, who).toBe(404);
    }
    as('supervisor', false);
    expect((await get(id)).status).toBe(401);
    h.session = null;
    expect((await get(id)).status).toBe(401);
    expect(fake.log.length).toBe(before);
    // Redes and supervision do see it.
    for (const who of ['social', 'supervisor'] as DemoUserKey[]) {
      as(who);
      const r = await get(id, { range: 'bytes=0-1' });
      expect(r.status, who).toBe(206);
      await r.arrayBuffer();
    }
  });

  it('miniatura: se copia de Drive la primera vez y luego sale de la base', async () => {
    as('social');
    const th = () => thumbRoute.GET(new NextRequest(`http://localhost:3000/api/media/${id}/thumb`), { params: Promise.resolve({ id }) });
    const a = await th();
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('image/png');
    expect(a.headers.get('cache-control')).toBe('private, max-age=86400');
    const calls = fake.calls('thumb').length;
    expect(calls).toBe(1);
    expect(fake.calls('thumb')[0].auth).toBe(true);
    const b = await th();
    expect(b.status).toBe(200);
    expect(fake.calls('thumb').length).toBe(calls);
  });

  it('miniatura: cuenta para el tope del mes y la parte de la persona; si no alcanza, sale el ícono', async () => {
    await t.system(async (sql) => {
      await sql.query(`update public.drive_transfer set bytes = 0`);
      await sql.query(`delete from public.drive_transfer_person`);
    });
    const th = (mid: string) => thumbRoute.GET(new NextRequest(`http://localhost:3000/api/media/${mid}/thumb`), { params: Promise.resolve({ id: mid }) });
    const mine = async (key: DemoUserKey) => Number((await sys<{ bytes: string }>(`select bytes from public.drive_transfer_person where user_id = $1`, [t.ids[key]]))?.bytes ?? 0);
    const statuses = async (mid: string, times: number) => {
      const out: number[] = [];
      for (let i = 0; i < times; i++) {
        const r = await th(mid);
        out.push(r.status);
        await r.arrayBuffer();
      }
      return out;
    };
    as('social');
    const a = await th(id);
    expect(a.status).toBe(200);
    const len = (await a.arrayBuffer()).byteLength;
    expect(len).toBeGreaterThan(0);
    expect(await used()).toBe(len);
    expect(await mine('social')).toBe(len);

    // A quarter of the cap a day: three thumbnails. The rest of the loop gets the icon, uncounted.
    h.capGb = (12 * len) / 1024 ** 3;
    expect(await statuses(id, 10)).toEqual([200, 200, ...Array(8).fill(404)]);
    expect(await used()).toBe(3 * len);
    expect(await mine('social')).toBe(3 * len);

    // A thumbnail not saved yet: copied from Drive once and kept, but this answer is refused too.
    const photoId = await insertDriveRow('image/jpeg', 'jpg', bytes(500, 3));
    const calls = fake.calls('thumb').length;
    expect(await statuses(photoId, 1)).toEqual([404]);
    expect(fake.calls('thumb').length).toBe(calls + 1);
    expect(await sys(`select 1 from public.media_thumbs where media_id = $1`, [photoId])).not.toBeNull();
    expect(await used()).toBe(3 * len);

    // Administración has no daily share; it comes from the database without asking Drive again.
    as('admin');
    expect(await statuses(photoId, 1)).toEqual([200]);
    expect(fake.calls('thumb').length).toBe(calls + 1);
    expect(await used()).toBe(4 * len);
    expect(await sys(`select 1 from public.drive_transfer_person where user_id = $1`, [t.ids.admin])).toBeNull();

    // The month's cap: thumbnails never push the count past it, for anyone.
    h.capGb = (5 * len) / 1024 ** 3;
    as('supervisor');
    expect(await statuses(id, 5)).toEqual([200, 404, 404, 404, 404]);
    as('admin');
    expect(await statuses(id, 3)).toEqual([404, 404, 404]);
    expect(await used()).toBe(5 * len);
    // The icon is enough: no notices for a thumbnail.
    expect(notices('drive_share')).toHaveLength(0);
    expect(notices('drive_quota')).toHaveLength(0);
  });

  it('archivo borrado en Drive: 410 con mensaje claro y un aviso a Administración (sin nombres de Drive)', async () => {
    const goneId = (await uploadAndFinish('camera', bytes(2000, 5))).id;
    const link = await sys<{ file_id: string }>(`select file_id from public.media_drive where media_id = $1`, [goneId]);
    fake.files.delete(link!.file_id);
    as('social');
    const r = await get(goneId, { range: 'bytes=0-1' });
    expect(r.status).toBe(410);
    expect(await r.text()).toBe(DRIVE_MESSAGE.not_found);
    const [n] = notices('drive_missing');
    expect(n.userIds).toEqual([t.ids.admin]);
    expect(n.body).toMatch(new RegExp(`^${ev.code} · Jefe hablando \\d+\\.`));
    expect(looksLikeDateTime(`${n.title} ${n.body}`)).toBe(false);
  });
});

describe('elegir de Drive (Picker, Administración)', () => {
  it('un video: se registra con lo que Drive sabe, sin pedir nunca su nombre ni datos de la foto', async () => {
    const fileId = fake.addUserFile({ mimeType: 'video/mp4', bytes: bytes(4000), video: { durationMillis: '61000', width: 1920, height: 1080 } });
    as('admin');
    const r = await drive.registerDriveFile({ fileId, eventId: ev.id, kind: 'broll' });
    expect(r).toMatchObject({ ok: true });
    const id = (r as { data: { id: string } }).data.id;
    const row = await sys<Record<string, unknown>>(`select bucket, status, mime, size_bytes, duration_s, width, height, label, storage_path from public.media_assets where id = $1`, [id]);
    expect(row).toMatchObject({ bucket: 'drive', status: 'ready', mime: 'video/mp4', width: 1920, height: 1080 });
    expect(Number(row!.duration_s)).toBe(61);
    expect(Number(row!.size_bytes)).toBe(4000);
    expect(row!.label).toMatch(/^Tomas de apoyo \d+$/);
    expect(row!.storage_path).toMatch(new RegExp(`^${ev.id}/[0-9a-f-]{36}\\.mp4$`));
    expect(await sys(`select source, origin_file_id from public.media_drive where media_id = $1`, [id])).toEqual({ source: 'picker', origin_file_id: null });
    for (const c of fake.calls('get')) expect(c.fields ?? '').not.toMatch(/\bname\b|originalFilename|\btime\b|location/);
    // The picked file was not touched.
    expect(fake.files.get(fileId)!.parents).toEqual([]);
    expect(await drive.registerDriveFile({ fileId, eventId: ev.id, kind: 'broll' })).toEqual({ ok: false, error: 'Ese archivo ya está en la plataforma.' });
  });

  it('una foto con GPS: se registra una copia limpia en la carpeta de la plataforma; la original queda igual', async () => {
    const photo = jpegWithGps();
    expect(contains(photo, SECRET)).toBe(true);
    const fileId = fake.addUserFile({ mimeType: 'image/jpeg', bytes: photo, image: { width: 4, height: 3 } });
    as('admin');
    const r = await drive.registerDriveFile({ fileId, eventId: null, kind: 'evidence' });
    expect(r).toMatchObject({ ok: true });
    const link = await sys<{ file_id: string; origin_file_id: string }>(`select file_id, origin_file_id from public.media_drive where media_id = $1`, [(r as { data: { id: string } }).data.id]);
    expect(link!.origin_file_id).toBe(fileId);
    expect(link!.file_id).not.toBe(fileId);
    const copy = fake.files.get(link!.file_id)!;
    expect(contains(copy.bytes, SECRET)).toBe(false);
    expect(copy.name).toMatch(/^pieza-Captura-\d+\.jpg$/);
    expect(fake.files.get(copy.parents[0])!.name).toBe('Capturas');
    expect(contains(fake.files.get(fileId)!.bytes, SECRET)).toBe(true);
    expect(await drive.registerDriveFile({ fileId, eventId: null, kind: 'evidence' })).toEqual({ ok: false, error: 'Ese archivo ya está en la plataforma.' });
  });

  it('HEIC, SVG o un tipo que no va con lo pedido: no se registra', async () => {
    as('admin');
    const heic = fake.addUserFile({ mimeType: 'image/heic', bytes: heicHead() });
    expect(await drive.registerDriveFile({ fileId: heic, eventId: null, kind: 'evidence' })).toEqual({ ok: false, error: 'Esta foto no se puede limpiar. Pásala a JPG y súbela con «Subir».' });
    const fakeJpeg = fake.addUserFile({ mimeType: 'image/jpeg', bytes: heicHead() });
    expect(await drive.registerDriveFile({ fileId: fakeJpeg, eventId: null, kind: 'evidence' })).toEqual({ ok: false, error: 'Esta foto no se puede limpiar. Pásala a JPG y súbela con «Subir».' });
    const svg = fake.addUserFile({ mimeType: 'image/svg+xml', bytes: new TextEncoder().encode('<svg onload="x()"/>') });
    expect(await drive.registerDriveFile({ fileId: svg, eventId: null, kind: 'evidence' })).toMatchObject({ ok: false });
    const video = fake.addUserFile({ mimeType: 'video/mp4', bytes: bytes(10) });
    expect(await drive.registerDriveFile({ fileId: video, eventId: null, kind: 'cover' })).toMatchObject({ ok: false });
    const hidden = fake.addUserFile({ mimeType: 'video/mp4', bytes: bytes(10), granted: false });
    expect(await drive.registerDriveFile({ fileId: hidden, eventId: ev.id, kind: 'boss' })).toEqual({ ok: false, error: DRIVE_MESSAGE.not_found });
    expect((await sys<{ n: number }>(`select count(*)::int as n from public.media_drive where file_id = any($1::text[])`, [[heic, fakeJpeg, svg, video, hidden]]))!.n).toBe(0);
  });
});

describe('cuando el permiso de Google se vence', () => {
  it('estado «vencido», un solo aviso a Administración y un mensaje entendible para quien usa la plataforma', async () => {
    const id = (await uploadAndFinish('camera', bytes(3000, 6))).id;
    fake.expireGrant();
    forgetAccessToken();
    as('social');
    const r = await get(id, { range: 'bytes=0-1' });
    expect(r.status).toBe(503);
    expect(await r.text()).toBe(DRIVE_MESSAGE.auth);
    expect(await conn()).toMatchObject({ status: 'expired', last_error: 'invalid_grant' });
    expect(notices('drive_down')).toHaveLength(1);
    expect(notices('drive_down')[0].userIds).toEqual([t.ids.admin]);
    // From now on nobody asks Google again until Administración reconnects.
    const tokenCalls = fake.calls('token').length;
    expect((await get(id, { range: 'bytes=0-1' })).status).toBe(503);
    as('camera');
    expect(await media.createUpload({ eventId: ev.id, kind: 'boss', mime: 'video/mp4', sizeBytes: 10, ext: 'mp4', probe: {} })).toEqual({ ok: false, error: DRIVE_MESSAGE.auth });
    expect(fake.calls('token').length).toBe(tokenCalls);
    expect(notices('drive_down')).toHaveLength(1);
    // Reconnecting the same account brings everything back.
    expect((await connect()).headers.get('location')).toMatch(/ok=1$/);
    as('social');
    const back = await get(id, { range: 'bytes=0-1' });
    expect(back.status).toBe(206);
    await back.arrayBuffer();
  });
});

describe('desconectar', () => {
  it('«Desconectar» no llama a Google: borra el permiso guardado y recuerda la cuenta', async () => {
    as('admin');
    expect(await drive.disconnectDrive({})).toEqual({ ok: true });
    expect(fake.calls('revoke')).toHaveLength(0);
    expect(await conn()).toMatchObject({ status: 'disconnected', account_email: 'cuenta@demo.test', token_enc: null });
    as('camera');
    expect(await media.createUpload({ eventId: ev.id, kind: 'boss', mime: 'video/mp4', sizeBytes: 10, ext: 'mp4', probe: {} })).toEqual({ ok: false, error: DRIVE_MESSAGE.not_connected });
    expect(notices('drive_down')).toHaveLength(1);
    // Another account is still refused after a disconnect.
    fake.email = 'otra-cuenta@demo.test';
    expect((await connect()).headers.get('location')).toMatch(/error=cuenta$/);
    fake.email = 'cuenta@demo.test';
    expect((await connect()).headers.get('location')).toMatch(/ok=1$/);
  });

  it('«Quitar el permiso en Google» sí avisa a Google, aparte y solo para Administración', async () => {
    as('social');
    expect(await drive.removeDriveGrant({})).toMatchObject({ ok: false });
    expect(fake.calls('revoke')).toHaveLength(0);
    as('admin');
    expect(await drive.removeDriveGrant({})).toEqual({ ok: true });
    expect(fake.calls('revoke')).toHaveLength(1);
    expect(fake.refreshTokens.size).toBe(0);
    expect(await conn()).toMatchObject({ status: 'disconnected', token_enc: null });
    expect((await connect()).headers.get('location')).toMatch(/ok=1$/);
  });

  it('si otro servidor desconecta, este deja de usar el token que tenía en memoria', async () => {
    const id = (await uploadAndFinish('camera', bytes(500, 8))).id;
    await t.system((sql) => sql.query(`update public.drive_connection set token_enc = null, status = 'disconnected'`));
    as('social');
    const before = fake.calls('media').length;
    const r = await get(id, { range: 'bytes=0-1' });
    expect(r.status).toBe(503);
    expect(await r.text()).toBe(DRIVE_MESSAGE.not_connected);
    expect(fake.calls('media').length).toBe(before);
    expect((await connect()).headers.get('location')).toMatch(/ok=1$/);
  });

  it('cambiar de cuenta, a propósito: olvida la cuenta y las carpetas', async () => {
    as('admin');
    expect(await drive.disconnectDrive({ changeAccount: true })).toEqual({ ok: true });
    expect(await conn()).toMatchObject({ status: 'disconnected', account_email: null });
    expect((await sys<{ n: number }>(`select count(*)::int as n from public.drive_folders`))!.n).toBe(0);
    fake.email = 'otra-cuenta@demo.test';
    expect((await connect()).headers.get('location')).toMatch(/ok=1$/);
    expect(await conn()).toMatchObject({ status: 'ok', account_email: 'otra-cuenta@demo.test' });
  });
});

describe('subidas abandonadas', () => {
  it('la tarea programada marca como fallidas las de más de 8 días y borra su URL', async () => {
    const tk = await upload('camera', bytes(1000, 7));
    await t.system((sql) => sql.query(`update public.media_assets set created_at = now() - interval '9 days' where id = $1`, [tk.id]));
    const { GET } = await import('@/app/api/cron/tick/route');
    const res = await GET(new NextRequest('http://localhost:3000/api/cron/tick', { headers: { authorization: 'Bearer cron-de-prueba' } }));
    const body = await res.json();
    expect(body.driveStaleUploads).toBeGreaterThanOrEqual(1);
    expect(await sys(`select m.status, d.upload_url_enc from public.media_assets m join public.media_drive d on d.media_id = m.id where m.id = $1`, [tk.id])).toEqual({ status: 'failed', upload_url_enc: null });
  });
});

async function labelNumber(id: string): Promise<number> {
  const r = await sys<{ label: string }>(`select label from public.media_assets where id = $1`, [id]);
  return Number(/(\d+)$/.exec(r!.label)![1]);
}

// A ready Drive row inserted directly (system), with its file in the fake.
async function insertDriveRow(mime: string, ext: string, data: Uint8Array): Promise<string> {
  const fileId = fake.addUserFile({ mimeType: mime, bytes: data });
  return t.system(async (sql) => {
    const r = await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, kind, bucket, storage_path, label, mime, size_bytes, status, uploaded_by)
       values ($1, 'other', 'drive', $2, 'Otros 99', $3, $4, 'ready', $5) returning id`,
      [ev.id, `${ev.id}/${crypto.randomUUID()}.${ext}`, mime, data.length, t.ids.admin],
    );
    await sql.query(`insert into public.media_drive (media_id, file_id, source) values ($1, $2, 'picker')`, [r!.id, fileId]);
    return r!.id;
  });
}
