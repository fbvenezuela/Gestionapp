// The Drive client and the OAuth calls over the real fetch path (globalThis.fetch replaced by the
// fake's HTTP surface): headers sent, retries with backoff, error mapping, the thumbnail host
// allowlist, and the access token cache (one refresh at a time, never stored in the database).
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { FakeDrive } from '@/lib/storage/drive/fake';
import { makeTestDb, type TestDb } from '../rls/setup';

vi.mock('@/lib/env', async (orig) => {
  const m = await orig<typeof import('@/lib/env')>();
  return {
    ...m,
    env: {
      ...m.env,
      sessionSecret: 'secreto-de-sesion-de-prueba',
      storage: { provider: 'drive' },
      google: { clientId: '123456789-prueba.apps.googleusercontent.com', clientSecret: 'secreto-de-prueba', projectNumber: '', pickerApiKey: '' },
      drive: { tokenKey: '', fake: false, uploadMode: 'direct', transferCapGb: 7 },
    },
  };
});
vi.mock('@/lib/notify', async (orig) => ({ ...(await orig<typeof import('@/lib/notify')>()), notify: vi.fn(async () => {}) }));

let f: FakeDrive;
let token: string;
let client: typeof import('@/lib/storage/drive/client');
let oauth: typeof import('@/lib/storage/drive/token');
let errors: typeof import('@/lib/storage/drive/errors');
let fetchSpy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const { driveTiming } = await import('@/lib/storage/drive/http');
  driveTiming.retryMs = [0, 0, 0];
  client = await import('@/lib/storage/drive/client');
  oauth = await import('@/lib/storage/drive/token');
  errors = await import('@/lib/storage/drive/errors');
});

beforeEach(async () => {
  f = new FakeDrive();
  fetchSpy = vi.fn((input: string, init?: RequestInit) => f.fetch(input, init));
  vi.stubGlobal('fetch', fetchSpy);
  const r = await f.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', code: 'fake-code-1', code_verifier: 'v' }).toString(),
  });
  token = ((await r.json()) as { access_token: string }).access_token;
  f.log.length = 0;
});

afterAll(() => vi.unstubAllGlobals());

const headerOf = (init: RequestInit | undefined, name: string) => new Headers(init?.headers as HeadersInit).get(name);

describe('cliente de Drive sobre fetch', () => {
  it('reintenta los límites de velocidad y los 5xx, y luego responde', async () => {
    f.fail('about', 429, 'rateLimitExceeded', 2);
    expect((await client.about(token)).email).toBe('cuenta@demo.test');
    expect(f.calls('about')).toHaveLength(3);
    f.fail('about', 503, 'backendError', 4);
    await expect(client.about(token)).rejects.toMatchObject({ code: 'busy' });
    f.log.length = 0;
    f.fail('about', 0, '', 9);
    await expect(client.about(token)).rejects.toMatchObject({ code: 'busy', reason: 'network' });
    expect(f.calls('about')).toHaveLength(4);
  });

  it('lo que no se arregla repitiendo no se repite: lleno, sin permiso, no existe', async () => {
    const root = await client.createFolder(token, 'Raíz', null, { fb360: 'root' });
    f.fail('createSession', 403, 'storageQuotaExceeded');
    await expect(client.createUploadSession(token, { name: 'x.mp4', parents: [root], mimeType: 'video/mp4', appProperties: {} }, 10, 'http://localhost:3000')).rejects.toMatchObject({ code: 'full' });
    expect(f.calls('createSession')).toHaveLength(1);
    await expect(client.about('token-que-no-sirve')).rejects.toMatchObject({ code: 'auth' });
    await expect(client.getFile(token, 'noExisteEsteArchivo')).rejects.toMatchObject({ code: 'not_found' });
    const n = fetchSpy.mock.calls.length;
    await expect(client.getFile(token, '../x')).rejects.toMatchObject({ code: 'not_found' });
    expect(fetchSpy.mock.calls.length).toBe(n);
  });

  it('la subida reanudable lleva el tamaño, el tipo y el Origin de la página', async () => {
    const root = await client.createFolder(token, 'Raíz', null, { fb360: 'root' });
    const id = await client.generateId(token);
    const url = await client.createUploadSession(token, { id, name: 'E-0001-Dron-1.mp4', parents: [root], mimeType: 'video/mp4', appProperties: { fb360: 'media' } }, 1234, 'https://app.example');
    expect(url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=resumable&upload_id=/);
    const [u, init] = fetchSpy.mock.calls.find(([x]) => String(x).includes('uploadType=resumable'))!;
    expect(String(u)).toContain('/upload/drive/v3/files');
    expect(headerOf(init, 'x-upload-content-length')).toBe('1234');
    expect(headerOf(init, 'x-upload-content-type')).toBe('video/mp4');
    expect(headerOf(init, 'origin')).toBe('https://app.example');
    expect(headerOf(init, 'authorization')).toBe(`Bearer ${token}`);
    expect(await client.uploadStatus(url, 1234)).toEqual({ done: false, received: 0, gone: false });
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Range': 'bytes 0-262143/1234' }, body: new Uint8Array(262144) });
    expect(put.status).toBe(400); // more bytes than declared
    expect(await client.uploadStatus(`${url}x`, 1234)).toMatchObject({ gone: true });
  });

  it('el contenido por tramos: 206, y 416 se le pasa a quien llama', async () => {
    const id = f.addUserFile({ mimeType: 'video/mp4', bytes: new Uint8Array(100).fill(3) });
    const part = await client.openMedia(token, id, 'bytes=10-19');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 10-19/100');
    expect((await part.arrayBuffer()).byteLength).toBe(10);
    const past = await client.openMedia(token, id, 'bytes=200-');
    expect(past.status).toBe(416);
  });

  it('miniaturas: solo de servidores de Google, por https, pequeñas y de tipo imagen', async () => {
    const id = f.addUserFile({ mimeType: 'image/png', bytes: new Uint8Array(10) });
    expect(await client.fetchThumbnail(token, `https://lh3.googleusercontent.com/fake-thumb/${id}=s220`)).toMatchObject({ mime: 'image/png' });
    const n = fetchSpy.mock.calls.length;
    for (const link of ['https://evil.example/thumb.png', 'http://lh3.googleusercontent.com/x', 'https://googleusercontent.com.evil.example/x', 'javascript:alert(1)', 'nada']) {
      expect(await client.fetchThumbnail(token, link), link).toBeNull();
    }
    expect(fetchSpy.mock.calls.length).toBe(n);
    expect(await client.fetchThumbnail('token-malo', `https://lh3.googleusercontent.com/fake-thumb/${id}`)).toBeNull();
  });
});

describe('OAuth con Google', () => {
  it('pide solo drive.file, sin conexión perdida (offline), con PKCE y sin el secreto en la URL', () => {
    const u = new URL(oauth.authUrl({ redirectUri: 'https://app.example/api/drive/callback', state: 'estado', challenge: 'reto' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe('estado');
    expect(u.toString()).not.toContain('secreto-de-prueba');
    const p = oauth.pkce();
    expect(p.verifier.length).toBeGreaterThanOrEqual(43);
    expect(p.challenge).not.toBe(p.verifier);
    expect(oauth.hasDriveScope('openid https://www.googleapis.com/auth/drive.file')).toBe(true);
    expect(oauth.hasDriveScope('https://www.googleapis.com/auth/drive.file.extra')).toBe(false);
  });

  it('el canje y la renovación van en el cuerpo; un permiso vencido es «auth»', async () => {
    const t = await oauth.exchangeCode({ code: 'fake-code-2', verifier: 'verificador', redirectUri: 'https://app.example/api/drive/callback' });
    expect(t.refreshToken).toMatch(/^fake-refresh-/);
    const [u, init] = fetchSpy.mock.calls.at(-1)!;
    expect(String(u)).toBe('https://oauth2.googleapis.com/token');
    expect(String(init.body)).toContain('code_verifier=verificador');
    expect(String(init.body)).toContain('client_secret=secreto-de-prueba');
    expect((await oauth.refreshAccess(t.refreshToken!)).accessToken).toMatch(/^fake-access-/);
    f.expireGrant();
    await expect(oauth.refreshAccess(t.refreshToken!)).rejects.toMatchObject({ code: 'auth', reason: 'invalid_grant' });
    f.fail('token', 401, 'invalid_client');
    await expect(oauth.refreshAccess('x')).rejects.toMatchObject({ code: 'not_configured' });
    expect(errors.driveMessage(new errors.DriveError('not_configured'))).toBe(errors.DRIVE_MESSAGE.not_configured);
  });
});

describe('token de acceso: en memoria, uno a la vez', () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await makeTestDb();
    (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  });

  it('dos pedidos a la vez comparten una sola renovación; el token no se guarda en la base', async () => {
    const { driveKey, accessToken, forgetAccessToken } = await import('@/lib/storage/drive/connection');
    const { seal, AAD } = await import('@/lib/storage/drive/crypto');
    const refresh = f.issueRefreshToken();
    await t.system((sql) =>
      sql.query(`insert into public.drive_connection (account_email, token_enc, scope, status, connected_at) values ('cuenta@demo.test', $1, '', 'ok', now())`, [seal(refresh, AAD.connection, driveKey()!)]),
    );
    forgetAccessToken();
    const [a, b] = await Promise.all([accessToken(), accessToken()]);
    expect(a).toBe(b);
    expect(f.calls('token')).toHaveLength(1);
    expect(await accessToken()).toBe(a);
    expect(f.calls('token')).toHaveLength(1);
    const dump = JSON.stringify(await t.system((sql) => sql.query(`select * from public.drive_connection`)));
    expect(dump).not.toContain(a);
    expect(dump).not.toContain(refresh);
    forgetAccessToken();
  });
});
