// «Descargar» for files kept in Google Drive. They come through the platform (/api/media/<id>,
// which checks permissions first), and a server function on Vercel is cut after 300 s, while a
// 180 MB video on a slow line takes much longer. So the browser asks for 4 MiB pieces one after
// another, keeps what arrived, waits when the signal drops and goes on by itself. With OPFS (the
// browser's private disk) it even goes on after the page is closed and opened again.

export const DOWNLOAD_CHUNK = 4 * 1024 * 1024;

export type DownloadState = {
  phase: 'starting' | 'downloading' | 'waiting' | 'saving' | 'done' | 'error';
  received: number;
  total: number | null;
  error?: string;
};

/** Where the pieces are kept until the whole file is there. */
export interface ChunkSink {
  size(): Promise<number>;
  append(bytes: Uint8Array): Promise<void>;
  file(name: string, type: string): Promise<File>;
  clear(): Promise<void>;
}

export class DownloadError extends Error {
  readonly fatal: boolean;
  constructor(message: string, fatal: boolean) {
    super(message);
    this.fatal = fatal;
  }
}

const RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;

/** «bytes a-b/total» → numbers, or null. */
export function parseContentRange(v: string | null): { start: number; end: number; total: number } | null {
  const m = RANGE.exec((v ?? '').trim());
  if (!m) return null;
  const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return start <= end && end < total ? { start, end, total } : null;
}

/** The name the server gave (attachment; filename="E-0042-Jefe-hablando-1.mp4"), or null. */
export function fileNameFrom(disposition: string | null): string | null {
  const m = /filename="([^"]{1,120})"/.exec(disposition ?? '');
  if (!m) return null;
  const name = m[1].replace(/[^A-Za-z0-9._-]/g, '-');
  return /^[A-Za-z0-9]/.test(name) ? name : null;
}

/** The next piece to ask for. */
export function nextRange(received: number, total: number | null, chunk = DOWNLOAD_CHUNK): string {
  const end = total == null ? received + chunk - 1 : Math.min(received + chunk, total) - 1;
  return `bytes=${received}-${end}`;
}

/** Only short plain sentences from our own server are shown to the person. */
function plain(body: string, fallback: string): string {
  const t = body.trim();
  return t && t.length <= 160 && !/[<>{}]/.test(t) ? t : fallback;
}

export function memorySink(): ChunkSink {
  let parts: Uint8Array<ArrayBuffer>[] = [];
  let n = 0;
  return {
    size: async () => n,
    append: async (b) => {
      parts.push(new Uint8Array(b));
      n += b.length;
    },
    file: async (name, type) => new File(parts, name, { type }),
    clear: async () => {
      parts = [];
      n = 0;
    },
  };
}

type Writable = { write(d: Uint8Array): Promise<void>; close(): Promise<void> };
type OpfsFile = { kind: 'file'; getFile(): Promise<File>; createWritable(): Promise<Writable> };
type OpfsDir = {
  getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<OpfsDir>;
  getFileHandle(n: string, o?: { create?: boolean }): Promise<OpfsFile>;
  removeEntry(n: string, o?: { recursive?: boolean }): Promise<void>;
  keys(): AsyncIterable<string>;
};

/**
 * The browser's private disk (OPFS), when it can write there; null otherwise. Each piece is its
 * own small file (appending to one big file would copy it whole on every piece), and the finished
 * download is those files joined, without copying them again.
 */
export async function opfsSink(key: string): Promise<ChunkSink | null> {
  try {
    const storage = (navigator as unknown as { storage?: { getDirectory?: () => Promise<OpfsDir> } }).storage;
    if (!storage?.getDirectory) return null;
    const root = await storage.getDirectory();
    const name = `descarga-${key.replace(/[^A-Za-z0-9-]/g, '')}`;
    const dir = await root.getDirectoryHandle(name, { create: true });
    const probe = await dir.getFileHandle('.prueba', { create: true });
    if (typeof probe.createWritable !== 'function') return null;
    const parts = async (): Promise<File[]> => {
      const names: string[] = [];
      for await (const n of dir.keys()) if (/^p\d{6}$/.test(n)) names.push(n);
      names.sort();
      return Promise.all(names.map(async (n) => (await dir.getFileHandle(n)).getFile()));
    };
    return {
      size: async () => (await parts()).reduce((n, f) => n + f.size, 0),
      append: async (b) => {
        const next = `p${String((await parts()).length + 1).padStart(6, '0')}`;
        const w = await (await dir.getFileHandle(next, { create: true })).createWritable();
        await w.write(b);
        await w.close();
      },
      file: async (fileName, type) => new File(await parts(), fileName, { type }),
      clear: async () => {
        await root.removeEntry(name, { recursive: true }).catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

export type DownloadOptions = {
  sink: ChunkSink;
  chunk?: number;
  signal?: AbortSignal;
  retryDelays?: number[];
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  // Resolves when it is worth trying again (the signal came back, or the wait ended).
  waitForRetry?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onState?: (s: DownloadState) => void;
};

const RETRY = [1000, 3000, 5000, 10000, 20000, 30000, 60000, 60000, 120000, 120000, 300000];

function defaultWait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      if (typeof window !== 'undefined') window.removeEventListener('online', done);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const t = setTimeout(done, ms);
    if (typeof window !== 'undefined') window.addEventListener('online', done, { once: true });
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Downloads `url` piece by piece into `sink`, continuing from what the sink already holds.
 * Returns the file name and type the server gave. Throws DownloadError.
 */
export async function downloadInChunks(url: string, o: DownloadOptions): Promise<{ name: string; type: string; total: number }> {
  const chunk = o.chunk ?? DOWNLOAD_CHUNK;
  const fetcher = o.fetcher ?? ((u: string, init: RequestInit) => fetch(u, init));
  const wait = o.waitForRetry ?? defaultWait;
  const delays = o.retryDelays ?? RETRY;
  let received = await o.sink.size();
  let total: number | null = null;
  let name = 'archivo';
  let type = 'application/octet-stream';
  let attempt = 0;
  o.onState?.({ phase: received ? 'downloading' : 'starting', received, total });

  while (total == null || received < total) {
    if (o.signal?.aborted) throw new DownloadError('Descarga cancelada.', true);
    let res: Response;
    try {
      res = await fetcher(url, { headers: { Range: nextRange(received, total, chunk) }, cache: 'no-store', signal: o.signal });
    } catch {
      if (o.signal?.aborted) throw new DownloadError('Descarga cancelada.', true);
      if (attempt >= delays.length) throw new DownloadError('Se cortó la descarga. Vuelve a tocar «Descargar» para seguir.', false);
      o.onState?.({ phase: 'waiting', received, total });
      await wait(delays[attempt++], o.signal);
      continue;
    }
    if (res.status === 416) {
      await res.body?.cancel().catch(() => {});
      if (total != null && received >= total) break;
      // What was kept is longer than the file: start over, once.
      if (received > 0 && attempt < delays.length) {
        await o.sink.clear();
        received = 0;
        total = null;
        attempt++;
        continue;
      }
      throw new DownloadError('No se pudo descargar ese archivo. Intenta otra vez.', true);
    }
    if (res.status === 206) {
      const cr = parseContentRange(res.headers.get('content-range'));
      if (!cr || cr.start !== received) {
        await res.body?.cancel().catch(() => {});
        // Our piece count went out of step (the file changed?): start over once.
        if (received > 0 && attempt < delays.length) {
          await o.sink.clear();
          received = 0;
          total = null;
          attempt++;
          continue;
        }
        throw new DownloadError('No se pudo descargar ese archivo. Intenta otra vez.', true);
      }
      name = fileNameFrom(res.headers.get('content-disposition')) ?? name;
      type = (res.headers.get('content-type') ?? type).split(';')[0];
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await res.arrayBuffer());
      } catch {
        // Cut in the middle of a piece: that piece is asked for again.
        if (o.signal?.aborted) throw new DownloadError('Descarga cancelada.', true);
        if (attempt >= delays.length) throw new DownloadError('Se cortó la descarga. Vuelve a tocar «Descargar» para seguir.', false);
        o.onState?.({ phase: 'waiting', received, total: cr.total });
        await wait(delays[attempt++], o.signal);
        continue;
      }
      if (bytes.length !== cr.end - cr.start + 1) throw new DownloadError('No se pudo descargar ese archivo. Intenta otra vez.', true);
      await o.sink.append(bytes);
      received += bytes.length;
      total = cr.total;
      attempt = 0;
      o.onState?.({ phase: 'downloading', received, total });
      continue;
    }
    if (res.status === 200) {
      // The whole file in one answer (a small file, or a server without pieces).
      if (received > 0) await o.sink.clear();
      const bytes = new Uint8Array(await res.arrayBuffer());
      await o.sink.append(bytes);
      name = fileNameFrom(res.headers.get('content-disposition')) ?? name;
      type = (res.headers.get('content-type') ?? type).split(';')[0];
      received = bytes.length;
      total = received;
      break;
    }
    const body = await res.text().catch(() => '');
    // 503: Drive slow or this month's cap; 5xx: try again later. 4xx: nothing to wait for.
    if (res.status >= 500 && attempt < delays.length) {
      o.onState?.({ phase: 'waiting', received, total, error: plain(body, '') || undefined });
      await wait(delays[attempt++], o.signal);
      if (res.status === 503 && attempt >= 3) throw new DownloadError(plain(body, 'Drive está lento; intenta en un momento.'), false);
      continue;
    }
    throw new DownloadError(res.status === 401 ? 'Entra de nuevo.' : plain(body, 'No se pudo descargar ese archivo.'), true);
  }
  o.onState?.({ phase: 'saving', received, total });
  return { name, type, total: total ?? received };
}

/** Hands the finished file to the browser as a normal download, then frees the space. */
export async function saveToDevice(sink: ChunkSink, name: string, type: string): Promise<void> {
  const file = await sink.file(name, type);
  const href = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start writing it before the memory or disk copy goes.
  setTimeout(() => {
    URL.revokeObjectURL(href);
    void sink.clear();
  }, 60_000);
}

export function pct(s: DownloadState): number {
  return s.total ? Math.min(100, Math.floor((s.received / s.total) * 100)) : 0;
}

export function sizeText(b: number): string {
  return b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

/** One short line for the progress card. */
export function downloadText(s: DownloadState): string {
  switch (s.phase) {
    case 'starting':
      return 'Empezando la descarga…';
    case 'downloading':
      return s.total ? `Descargando ${pct(s)} % de ${sizeText(s.total)}` : 'Descargando…';
    case 'waiting':
      return s.error ?? 'Sin señal: sigue sola cuando vuelva.';
    case 'saving':
      return 'Guardando en el teléfono…';
    case 'done':
      return 'Listo: está en tus descargas.';
    case 'error':
      return s.error ?? 'No se pudo descargar.';
  }
}
