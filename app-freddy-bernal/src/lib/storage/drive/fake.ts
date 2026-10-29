// In-memory stand-in for Google's OAuth and Drive v3 endpoints, with Google's semantics where the
// platform depends on them: bearer tokens, refresh/invalid_grant, drive.file visibility,
// resumable sessions (256 KiB multiples, 308 + Range, «bytes */total»), alt=media with Range,
// private appProperties and short-lived thumbnail links that need the token. Used by the tests
// and by the demo only with DRIVE_FAKE=1 (no DATABASE_URL). Invented data only.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'application/vnd.google-apps.folder';
const KIB256 = 256 * 1024;
const UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files';

export type FakeOp =
  | 'token' | 'revoke' | 'about' | 'generateIds' | 'list' | 'createFolder' | 'createSession'
  | 'uploadChunk' | 'multipart' | 'get' | 'media' | 'trash' | 'thumb';

type FakeFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  trashed: boolean;
  bytes: Uint8Array;
  granted: boolean; // false = in the account but never created by the app nor picked (drive.file hides it)
  video?: { durationMillis: string; width: number; height: number };
  image?: { width: number; height: number };
};

type UploadSession = {
  sid: string;
  meta: { id?: string; name?: string; parents?: string[]; mimeType?: string; appProperties?: Record<string, string> };
  size: number;
  mime: string;
  origin: string | null;
  parts: Uint8Array[];
  offset: number;
  fileId: string | null;
};

export type FakeCall = { op: FakeOp; method: string; url: string; fields?: string; range?: string | null; origin?: string | null; auth: boolean };

type Failure = { op: FakeOp; status: number; reason: string; times: number };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', ...headers } });
const apiError = (status: number, reason: string) => json(status, { error: { code: status, errors: [{ reason }], message: reason } });

function header(init: RequestInit | undefined, name: string): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  const found = Object.entries(h as Record<string, string>).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return found ? found[1] : null;
}

async function bodyBytes(init: RequestInit | undefined): Promise<Uint8Array> {
  const b = init?.body;
  if (b == null) return new Uint8Array();
  if (typeof b === 'string') return new TextEncoder().encode(b);
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  return new Uint8Array(await new Response(b as BodyInit).arrayBuffer());
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export class FakeDrive {
  email = 'cuenta@demo.test';
  quotaLimit: number | null = 15 * 1024 ** 3;
  grantedScope = SCOPE;
  // Answer 200 (the whole file) to ranged requests, as some servers do.
  rangeIgnored = false;
  files = new Map<string, FakeFile>();
  sessions = new Map<string, UploadSession>();
  log: FakeCall[] = [];
  refreshTokens = new Set<string>();
  accessTokens = new Set<string>();
  generated = new Set<string>();
  // Bytes handed out by alt=media bodies, and how many of those bodies were cancelled early.
  mediaBytesSent = 0;
  mediaCancelled = 0;
  private failures: Failure[] = [];
  private seq = 0;

  newId(): string {
    this.seq++;
    const rnd = Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
    return `fk${String(this.seq).padStart(6, '0')}${rnd}`;
  }

  /** The next `times` calls to `op` fail with `status` and Google `reason` (status 0 = network error). */
  fail(op: FakeOp, status: number, reason = '', times = 1) {
    this.failures.push({ op, status, reason, times });
  }

  calls(op?: FakeOp): FakeCall[] {
    return op ? this.log.filter((c) => c.op === op) : this.log;
  }

  /** A file already in the account (as if the owner dragged it in). granted = picked with the Picker. */
  addUserFile(o: { mimeType: string; bytes: Uint8Array; granted?: boolean; video?: FakeFile['video']; image?: FakeFile['image']; name?: string }): string {
    const id = this.newId();
    this.files.set(id, {
      id, name: o.name ?? 'archivo-del-usuario', mimeType: o.mimeType, parents: [], appProperties: {}, trashed: false, bytes: o.bytes,
      granted: o.granted ?? true, video: o.video, image: o.image,
    });
    return id;
  }

  /** Simulates the grant being removed or expiring: refresh answers invalid_grant. */
  expireGrant() {
    this.refreshTokens.clear();
    this.accessTokens.clear();
  }

  /** A connection made outside the OAuth dance (demo seeding). Returns the refresh token. */
  issueRefreshToken(): string {
    const r = `fake-refresh-${this.newId()}`;
    this.refreshTokens.add(r);
    return r;
  }

  private takeFailure(op: FakeOp): Failure | null {
    const f = this.failures.find((x) => x.op === op && x.times > 0);
    if (!f) return null;
    f.times--;
    return f;
  }

  private authed(init: RequestInit | undefined): boolean {
    const a = header(init, 'authorization') ?? '';
    return a.startsWith('Bearer ') && this.accessTokens.has(a.slice(7));
  }

  private visible(id: string): FakeFile | null {
    const f = this.files.get(id);
    return f && f.granted ? f : null;
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    const op = this.route(url, method);
    const call: FakeCall = { op, method, url: url.toString(), fields: url.searchParams.get('fields') ?? undefined, range: header(init, 'range'), origin: header(init, 'origin'), auth: this.authed(init) };
    this.log.push(call);
    const f = this.takeFailure(op);
    if (f) {
      if (f.status === 0) throw new TypeError('fetch failed');
      return op === 'token' ? json(f.status, { error: f.reason || 'server_error' }) : apiError(f.status, f.reason || 'backendError');
    }
    switch (op) {
      case 'token': return this.token(init);
      case 'revoke': return this.revoke(init);
      case 'thumb': return this.thumb(url, init);
      case 'uploadChunk': return this.chunk(url, init);
      default: break;
    }
    if (!call.auth) return apiError(401, 'authError');
    switch (op) {
      case 'about': return json(200, { user: { emailAddress: this.email }, storageQuota: { limit: this.quotaLimit == null ? undefined : String(this.quotaLimit), usage: String(this.usage()) } });
      case 'generateIds': {
        const n = Math.min(Number(url.searchParams.get('count') ?? 10), 1000);
        const ids = Array.from({ length: n }, () => this.newId());
        ids.forEach((i) => this.generated.add(i));
        return json(200, { kind: 'drive#generatedIds', space: 'drive', ids });
      }
      case 'list': return this.list(url);
      case 'createFolder': return this.createFolder(init);
      case 'createSession': return this.createSession(init);
      case 'multipart': return this.multipart(init);
      case 'get': return this.get(url);
      case 'media': return this.media(url, init);
      case 'trash': return this.trash(url, init);
    }
    return apiError(404, 'notFound');
  };

  private route(url: URL, method: string): FakeOp {
    if (url.host === 'oauth2.googleapis.com') return url.pathname === '/revoke' ? 'revoke' : 'token';
    if (url.host.endsWith('googleusercontent.com')) return 'thumb';
    if (url.pathname === '/upload/drive/v3/files') {
      if (url.searchParams.get('upload_id')) return 'uploadChunk';
      return url.searchParams.get('uploadType') === 'multipart' ? 'multipart' : 'createSession';
    }
    if (url.pathname === '/drive/v3/about') return 'about';
    if (url.pathname === '/drive/v3/files/generateIds') return 'generateIds';
    if (url.pathname === '/drive/v3/files') return method === 'POST' ? 'createFolder' : 'list';
    if (url.pathname.startsWith('/drive/v3/files/')) {
      if (method === 'PATCH') return 'trash';
      return url.searchParams.get('alt') === 'media' ? 'media' : 'get';
    }
    return 'get';
  }

  private usage(): number {
    let n = 0;
    for (const f of this.files.values()) n += f.bytes.length;
    return n;
  }

  private async token(init?: RequestInit): Promise<Response> {
    const p = new URLSearchParams(new TextDecoder().decode(await bodyBytes(init)));
    if (p.get('grant_type') === 'authorization_code') {
      if (!(p.get('code') ?? '').startsWith('fake-code')) return json(400, { error: 'invalid_grant' });
      if (!p.get('code_verifier')) return json(400, { error: 'invalid_request' });
      const refresh = this.issueRefreshToken();
      const access = `fake-access-${this.newId()}`;
      this.accessTokens.add(access);
      return json(200, { access_token: access, refresh_token: refresh, expires_in: 3599, scope: this.grantedScope, token_type: 'Bearer' });
    }
    if (p.get('grant_type') === 'refresh_token') {
      if (!this.refreshTokens.has(p.get('refresh_token') ?? '')) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      const access = `fake-access-${this.newId()}`;
      this.accessTokens.add(access);
      return json(200, { access_token: access, expires_in: 3599, scope: this.grantedScope, token_type: 'Bearer' });
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  private async revoke(init?: RequestInit): Promise<Response> {
    const t = new URLSearchParams(new TextDecoder().decode(await bodyBytes(init))).get('token') ?? '';
    // Like Google: revoking any token of the grant ends the whole grant.
    if (this.refreshTokens.has(t) || this.accessTokens.has(t)) this.expireGrant();
    return json(200, {});
  }

  private list(url: URL): Response {
    const q = url.searchParams.get('q') ?? '';
    const props = [...q.matchAll(/appProperties has \{ key='([^']*)' and value='([^']*)' \}/g)].map((m) => [m[1], m[2]] as const);
    const parent = /'([A-Za-z0-9_-]+)' in parents/.exec(q)?.[1];
    const mime = /mimeType\s*=\s*'([^']+)'/.exec(q)?.[1];
    const notTrashed = /trashed\s*=\s*false/.test(q);
    const files = [...this.files.values()].filter(
      (f) => f.granted && (!notTrashed || !f.trashed) && (!parent || f.parents.includes(parent)) && (!mime || f.mimeType === mime) && props.every(([k, v]) => f.appProperties[k] === v),
    );
    return json(200, { files: files.map((f) => this.view(f, 'id,size,mimeType,trashed,appProperties')) });
  }

  private async createFolder(init?: RequestInit): Promise<Response> {
    const meta = JSON.parse(new TextDecoder().decode(await bodyBytes(init)) || '{}');
    if (meta.mimeType !== FOLDER) return apiError(400, 'badRequest');
    for (const p of meta.parents ?? []) if (!this.visible(p) || this.files.get(p)!.trashed) return apiError(404, 'notFound');
    const id = this.newId();
    this.files.set(id, { id, name: meta.name ?? '', mimeType: FOLDER, parents: meta.parents ?? [], appProperties: meta.appProperties ?? {}, trashed: false, bytes: new Uint8Array(), granted: true });
    return json(200, { id });
  }

  private async createSession(init?: RequestInit): Promise<Response> {
    const meta = JSON.parse(new TextDecoder().decode(await bodyBytes(init)) || '{}');
    const size = Number(header(init, 'x-upload-content-length') ?? NaN);
    if (!Number.isFinite(size) || size < 0) return apiError(400, 'badContentLength');
    if (meta.id && !this.generated.has(meta.id)) return apiError(400, 'invalidId');
    for (const p of meta.parents ?? []) {
      const parent = this.visible(p);
      if (!parent || parent.trashed) return apiError(404, 'notFound');
    }
    if (this.quotaLimit != null && this.usage() + size > this.quotaLimit) return apiError(403, 'storageQuotaExceeded');
    const sid = this.newId();
    this.sessions.set(sid, { sid, meta, size, mime: header(init, 'x-upload-content-type') ?? meta.mimeType ?? 'application/octet-stream', origin: header(init, 'origin'), parts: [], offset: 0, fileId: null });
    return new Response(null, { status: 200, headers: { Location: `${UPLOAD_PREFIX}?uploadType=resumable&upload_id=${sid}` } });
  }

  private cors(s: UploadSession, init?: RequestInit): Record<string, string> {
    const o = header(init, 'origin');
    return o && o === s.origin ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Expose-Headers': 'Range' } : {};
  }

  private async chunk(url: URL, init?: RequestInit): Promise<Response> {
    const s = this.sessions.get(url.searchParams.get('upload_id') ?? '');
    if (!s) return apiError(404, 'notFound');
    const cors = this.cors(s, init);
    const cr = header(init, 'content-range') ?? '';
    const range = (): Record<string, string> => (s.offset > 0 ? { Range: `bytes=0-${s.offset - 1}` } : {});
    if (s.fileId) return json(200, this.view(this.files.get(s.fileId)!, 'id,size,mimeType'), cors);
    const status = /^bytes \*\/(\d+)$/.exec(cr);
    if (status) {
      if (Number(status[1]) !== s.size) return apiError(400, 'badContentRange');
      return new Response(null, { status: 308, headers: { ...range(), ...cors } });
    }
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
    const bytes = await bodyBytes(init);
    if (!m || Number(m[3]) !== s.size) return apiError(400, 'badContentRange');
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (b - a + 1 !== bytes.length || b >= s.size) return apiError(400, 'badContentLength');
    if (a !== s.offset) return new Response(null, { status: 308, headers: { ...range(), ...cors } });
    const last = b === s.size - 1;
    if (!last && bytes.length % KIB256 !== 0) return apiError(400, 'chunkNotMultipleOf256KiB');
    s.parts.push(bytes);
    s.offset += bytes.length;
    if (!last) return new Response(null, { status: 308, headers: { ...range(), ...cors } });
    const id = s.meta.id ?? this.newId();
    this.files.set(id, {
      id, name: s.meta.name ?? '', mimeType: s.meta.mimeType ?? s.mime, parents: s.meta.parents ?? [], appProperties: s.meta.appProperties ?? {},
      trashed: false, bytes: concat(s.parts), granted: true,
    });
    s.fileId = id;
    return json(200, this.view(this.files.get(id)!, 'id,size,mimeType'), cors);
  }

  private async multipart(init?: RequestInit): Promise<Response> {
    const ct = header(init, 'content-type') ?? '';
    const boundary = /boundary=([^;]+)/.exec(ct)?.[1];
    if (!boundary) return apiError(400, 'badRequest');
    const buf = Buffer.from(await bodyBytes(init));
    const sep = Buffer.from(`--${boundary}`);
    const first = buf.indexOf(sep);
    const h1 = buf.indexOf('\r\n\r\n', first);
    const second = buf.indexOf(sep, h1);
    const meta = JSON.parse(buf.subarray(h1 + 4, second - 2).toString('utf8'));
    const h2 = buf.indexOf('\r\n\r\n', second);
    const end = buf.lastIndexOf(Buffer.from(`\r\n--${boundary}--`));
    const bytes = new Uint8Array(buf.subarray(h2 + 4, end));
    for (const p of meta.parents ?? []) if (!this.visible(p)) return apiError(404, 'notFound');
    const id = this.newId();
    this.files.set(id, { id, name: meta.name ?? '', mimeType: meta.mimeType, parents: meta.parents ?? [], appProperties: meta.appProperties ?? {}, trashed: false, bytes, granted: true });
    return json(200, this.view(this.files.get(id)!, 'id,size,mimeType,trashed,appProperties'));
  }

  private view(f: FakeFile, fields: string): Record<string, unknown> {
    const want = (k: string) => fields.split(/[,()]/).map((x) => x.trim()).includes(k);
    const out: Record<string, unknown> = { id: f.id };
    if (want('size') && f.mimeType !== FOLDER) out.size = String(f.bytes.length);
    if (want('mimeType')) out.mimeType = f.mimeType;
    if (want('trashed')) out.trashed = f.trashed;
    if (want('name')) out.name = f.name;
    if (want('parents')) out.parents = f.parents;
    if (want('appProperties')) out.appProperties = f.appProperties;
    if (want('md5Checksum') && f.mimeType !== FOLDER) out.md5Checksum = 'fake';
    if (want('videoMediaMetadata') && f.video) out.videoMediaMetadata = f.video;
    if (want('imageMediaMetadata') && f.image) out.imageMediaMetadata = f.image;
    const thumb = f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/');
    if (want('hasThumbnail')) out.hasThumbnail = thumb;
    if (want('thumbnailLink') && thumb) out.thumbnailLink = `https://lh3.googleusercontent.com/fake-thumb/${f.id}=s220`;
    return out;
  }

  private get(url: URL): Response {
    const id = url.pathname.split('/').pop() ?? '';
    const f = this.visible(id);
    if (!f) return apiError(404, 'notFound');
    return json(200, this.view(f, url.searchParams.get('fields') ?? 'id,mimeType'));
  }

  private media(url: URL, init?: RequestInit): Response {
    const id = url.pathname.split('/').pop() ?? '';
    const f = this.visible(id);
    if (!f || f.mimeType === FOLDER) return apiError(404, 'notFound');
    const size = f.bytes.length;
    const r = header(init, 'range');
    let start = 0;
    let end = size - 1;
    let partial = false;
    if (r && !this.rangeIgnored) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(r);
      if (!m) return apiError(416, 'requestedRangeNotSatisfiable');
      if (m[1] === '') start = Math.max(0, size - Number(m[2]));
      else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
      }
      if (start >= size) return new Response(JSON.stringify({ error: { code: 416, errors: [{ reason: 'requestedRangeNotSatisfiable' }] } }), { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      partial = true;
    }
    const slice = f.bytes.subarray(start, end + 1);
    const signal = init?.signal;
    let at = 0;
    const body = new ReadableStream<Uint8Array>({
      pull: (ctrl) => {
        if (signal?.aborted) {
          ctrl.error(new DOMException('aborted', 'AbortError'));
          return;
        }
        if (at >= slice.length) {
          ctrl.close();
          return;
        }
        const piece = slice.subarray(at, at + 64 * 1024);
        at += piece.length;
        this.mediaBytesSent += piece.length;
        ctrl.enqueue(piece);
      },
      cancel: () => {
        this.mediaCancelled++;
      },
    });
    const headers: Record<string, string> = { 'Content-Type': f.mimeType, 'Content-Length': String(slice.length) };
    if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: partial ? 206 : 200, headers });
  }

  private async trash(url: URL, init?: RequestInit): Promise<Response> {
    const id = url.pathname.split('/').pop() ?? '';
    const f = this.visible(id);
    if (!f) return apiError(404, 'notFound');
    const body = JSON.parse(new TextDecoder().decode(await bodyBytes(init)) || '{}');
    if (body.trashed === true) f.trashed = true;
    // Rename and move (moveFile): name in the body, addParents/removeParents in the query, like Google.
    if (typeof body.name === 'string') f.name = body.name;
    const add = url.searchParams.get('addParents');
    const remove = (url.searchParams.get('removeParents') ?? '').split(',').filter(Boolean);
    if (add && !this.visible(add)) return apiError(404, 'notFound');
    if (add || remove.length) f.parents = [...f.parents.filter((p) => !remove.includes(p)), ...(add && !f.parents.includes(add) ? [add] : [])];
    return json(200, { id });
  }

  private thumb(url: URL, init?: RequestInit): Response {
    if (!this.authed(init)) return new Response('forbidden', { status: 403 });
    const id = /fake-thumb\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1] ?? '';
    if (!this.visible(id)) return new Response('not found', { status: 404 });
    // A 1x1 PNG.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    return new Response(new Uint8Array(png), { status: 200, headers: { 'Content-Type': 'image/png', 'Content-Length': String(png.length) } });
  }
}

type G = { __fbFakeDrive?: FakeDrive };

/** The process-wide fake (route handlers and actions share it). */
export function fakeDrive(): FakeDrive {
  const g = globalThis as G;
  return (g.__fbFakeDrive ??= new FakeDrive());
}

export function resetFakeDrive(): FakeDrive {
  const g = globalThis as G;
  g.__fbFakeDrive = new FakeDrive();
  return g.__fbFakeDrive;
}
