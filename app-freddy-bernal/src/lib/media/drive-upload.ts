// Browser side of «Subir» with Google Drive (STORAGE_PROVIDER=drive). The server opened a
// resumable upload and handed over ONLY its session URL (no token); the file goes there in
// chunks, straight from the phone to Google, never through Vercel. Same surface the Uploader uses
// from tus-js-client: start() also resumes, abort() pauses.
//
// Two protocols:
// - Google's (the session URL, or the demo's /api/drive/fake-upload): PUT with
//   «Content-Range: bytes a-b/total» → 308 + «Range: bytes=0-N» (not done) or 200/201 (done);
//   «bytes */total» with no body asks how far it got.
// - Through the platform (/api/drive/upload/<id>, only with DRIVE_UPLOAD_MODE=proxy): the same
//   PUTs, answered 200 {done, received}.

export type PutResult = { status: number; range: string | null; body: string };
export type PutInit = { contentRange: string; body: Blob | null; signal: AbortSignal; onProgress?: (sentInChunk: number) => void };
export type Transport = (url: string, init: PutInit) => Promise<PutResult>;

export type DriveUploadErrorCode = 'expired' | 'refused' | 'blocked' | 'auth' | 'network' | 'busy';

export const DRIVE_UPLOAD_MESSAGE: Record<DriveUploadErrorCode, string> = {
  expired: 'La subida venció; vuelve a elegir el archivo.',
  refused: 'Google no aceptó una parte del archivo. Vuelve a elegirlo.',
  blocked: 'Google no deja subir directo desde este teléfono. Avísale a Administración.',
  auth: 'Entra de nuevo.',
  network: 'Se cortó la subida. Toca «Seguir» para continuar.',
  busy: 'Drive está lento; intenta en un momento.',
};

export class DriveUploadError extends Error {
  readonly code: DriveUploadErrorCode;
  // Codes that repeating will not fix: the person has to do something.
  readonly fatal: boolean;
  constructor(code: DriveUploadErrorCode, message = DRIVE_UPLOAD_MESSAGE[code]) {
    super(message);
    this.code = code;
    this.fatal = code === 'expired' || code === 'refused' || code === 'blocked' || code === 'auth';
  }
}

export type DriveUploadOptions = {
  endpoint: string;
  chunkSize: number;
  // Waits between attempts after a cut or a slow answer (the same as the tus uploads).
  retryDelays?: number[];
  transport?: Transport;
  // True when our own site answers (used to tell «no signal» from «Google refuses this browser»).
  reachable?: () => Promise<boolean>;
  onProgress?: (sent: number, total: number) => void;
  // Called before each new attempt; the Uploader shows «Sin señal» from here.
  onShouldRetry?: (e: DriveUploadError) => void;
  onError?: (e: DriveUploadError) => void;
  onSuccess?: () => void;
};

export const RETRY_DELAYS = [0, 2000, 5000, 10000, 20000, 30000, 60000, 60000, 120000, 120000, 300000];
// The same failure this many times in a row: waiting will not fix it.
const STUCK_LIMIT = 3;
const FAST_FAIL_MS = 3000;

export function isProxyEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('/api/drive/upload/');
}

/** «bytes=0-N» → N + 1 bytes received; nothing → 0. */
export function receivedFromRange(range: string | null): number {
  const m = /^bytes=0-(\d+)$/.exec((range ?? '').trim());
  return m ? Number(m[1]) + 1 : 0;
}

type Step = { done: boolean; received: number };

/** What a PUT answer means. Throws DriveUploadError for anything that is not progress. */
export function readAnswer(proxy: boolean, r: PutResult, total: number): Step {
  if (proxy) {
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body) as { done?: unknown; received?: unknown };
        const received = Number(j.received);
        if (typeof j.done === 'boolean' && Number.isFinite(received) && received >= 0 && received <= total) return { done: j.done, received: j.done ? total : received };
      } catch {}
      throw new DriveUploadError('busy');
    }
    if (r.status === 410 || r.status === 404) throw new DriveUploadError('expired');
    if (r.status === 401) throw new DriveUploadError('auth');
    if (r.status === 400 || r.status === 413) throw new DriveUploadError('refused');
    // 503 (Drive slow, or this month's transfer cap): the platform's own short text.
    throw new DriveUploadError('busy', short(r.body) || DRIVE_UPLOAD_MESSAGE.busy);
  }
  if (r.status === 200 || r.status === 201) return { done: true, received: total };
  if (r.status === 308) return { done: false, received: Math.min(receivedFromRange(r.range), total) };
  if (r.status === 404 || r.status === 410) throw new DriveUploadError('expired');
  if (r.status === 408 || r.status === 429 || r.status >= 500) throw new DriveUploadError('busy');
  throw new DriveUploadError('refused');
}

// Only short plain sentences from our own server are shown; never a page or a Google body.
function short(body: string): string {
  const t = body.trim();
  return t.length > 0 && t.length <= 160 && !/[<>{}]/.test(t) ? t : '';
}

export class DriveUpload {
  private readonly file: Blob;
  private readonly o: DriveUploadOptions;
  private readonly proxy: boolean;
  private ctrl: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stuck = 0;
  private cuts = 0;
  private failedFast = false;

  constructor(file: Blob, o: DriveUploadOptions) {
    this.file = file;
    this.o = o;
    this.proxy = isProxyEndpoint(o.endpoint);
  }

  /** Starts, or continues from wherever Google says it got (after a cut, a pause or a reload). */
  start() {
    if (this.ctrl) {
      // Waiting between attempts (the signal came back, or «Seguir»): try now.
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        void this.run(this.ctrl);
      }
      return;
    }
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.cuts = 0;
    this.stuck = 0;
    void this.run(ctrl);
  }

  /** Pauses: the chunk on the way is dropped; Google keeps what it already has. */
  abort() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ctrl?.abort();
    this.ctrl = null;
    this.attempt = 0;
  }

  private get transport(): Transport {
    return this.o.transport ?? defaultTransport();
  }

  private async put(contentRange: string, body: Blob | null, signal: AbortSignal, onProgress?: (n: number) => void): Promise<Step> {
    let r: PutResult;
    const t0 = Date.now();
    try {
      r = await this.transport(this.o.endpoint, { contentRange, body, signal, onProgress });
    } catch (e) {
      if (signal.aborted || (e as Error)?.name === 'AbortError') throw e;
      // A browser that may not send to Google fails at once; a dropped line usually takes longer.
      this.failedFast = Date.now() - t0 < FAST_FAIL_MS;
      throw new DriveUploadError('network');
    }
    return readAnswer(this.proxy, r, this.file.size);
  }

  private async run(ctrl: AbortController) {
    const { signal } = ctrl;
    const total = this.file.size;
    const chunk = Math.max(256 * 1024, Math.floor(this.o.chunkSize / (256 * 1024)) * 256 * 1024);
    try {
      // Where Google stands: 0 for a new upload, more after a cut or a reload.
      let st = await this.put(`bytes */${total}`, null, signal);
      while (!st.done) {
        const at = st.received;
        this.o.onProgress?.(at, total);
        const end = Math.min(at + chunk, total);
        if (end <= at) throw new DriveUploadError('refused');
        const next = await this.put(`bytes ${at}-${end - 1}/${total}`, this.file.slice(at, end), signal, (n) => this.o.onProgress?.(Math.min(at + n, total), total));
        // Google answered but kept nothing, again and again: it is not taking this file.
        if (!next.done && next.received <= at) {
          if (++this.stuck >= STUCK_LIMIT) throw new DriveUploadError('refused');
        } else this.stuck = 0;
        // An answer came back: the next cut starts counting again.
        this.attempt = 0;
        this.cuts = 0;
        st = next;
      }
      if (this.ctrl === ctrl) this.ctrl = null;
      this.o.onProgress?.(total, total);
      this.o.onSuccess?.();
    } catch (raw) {
      if (signal.aborted || this.ctrl !== ctrl) return;
      const e = raw instanceof DriveUploadError ? raw : new DriveUploadError('network');
      if (!e.fatal && e.code === 'network' && !this.proxy) {
        // Google failing while our own site answers, chunk after chunk: this browser cannot send
        // to Google directly (the CORS rule), and waiting will not fix it.
        const online = await (this.o.reachable ?? defaultReachable)().catch(() => false);
        if (signal.aborted || this.ctrl !== ctrl) return;
        if (online && this.failedFast) {
          if (++this.cuts >= STUCK_LIMIT) return this.fail(ctrl, new DriveUploadError('blocked'));
        } else this.cuts = 0;
      }
      if (e.fatal) return this.fail(ctrl, e);
      const delays = this.o.retryDelays ?? RETRY_DELAYS;
      if (this.attempt >= delays.length) return this.fail(ctrl, e);
      this.o.onShouldRetry?.(e);
      const wait = delays[this.attempt++];
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.ctrl === ctrl) void this.run(ctrl);
      }, wait);
    }
  }

  private fail(ctrl: AbortController, e: DriveUploadError) {
    if (this.ctrl === ctrl) this.ctrl = null;
    this.attempt = 0;
    this.o.onError?.(e);
  }
}

// XMLHttpRequest in the browser: it reports progress inside a chunk (a 4 MiB chunk can take two
// minutes on a slow line), which fetch cannot do for uploads.
function defaultTransport(): Transport {
  if (typeof XMLHttpRequest === 'undefined') return fetchTransport(fetch);
  return (url, { contentRange, body, signal, onProgress }) =>
    new Promise<PutResult>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('PUT', url);
      x.setRequestHeader('Content-Range', contentRange);
      if (onProgress) x.upload.onprogress = (ev) => onProgress(ev.loaded);
      x.onload = () => resolve({ status: x.status, range: x.getResponseHeader('Range'), body: typeof x.responseText === 'string' ? x.responseText.slice(0, 2000) : '' });
      x.onerror = () => reject(new TypeError('network'));
      x.ontimeout = () => reject(new TypeError('timeout'));
      x.onabort = () => reject(new DOMException('aborted', 'AbortError'));
      if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', () => x.abort(), { once: true });
      // A Blob is sent as is; an empty status request has no body.
      x.send(body ?? null);
    });
}

/** Transport over fetch (tests, and browsers without XMLHttpRequest). */
export function fetchTransport(f: (url: string, init: RequestInit) => Promise<Response>): Transport {
  return async (url, { contentRange, body, signal }) => {
    const res = await f(url, {
      method: 'PUT',
      headers: { 'Content-Range': contentRange },
      body: body ? new Uint8Array(await body.arrayBuffer()) : undefined,
      signal,
      redirect: 'manual',
    });
    const text = res.status === 308 ? '' : (await res.text().catch(() => '')).slice(0, 2000);
    return { status: res.status, range: res.headers.get('range'), body: text };
  };
}

async function defaultReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const r = await fetch('/offline.html', { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}
