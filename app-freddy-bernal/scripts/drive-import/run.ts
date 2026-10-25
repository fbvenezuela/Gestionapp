// The import script's talk with Google Drive (REST over fetch, no SDK): the platform's folders,
// the «already there» check, resumable uploads that continue after a cut. No process exits and no
// global state, so a test runs it against the fake Drive (src/lib/storage/drive/fake.ts).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { bytesText, nextChunk, receivedFrom, type ImportPlan, type ImportState, type Planned } from './plan';

export const API = 'https://www.googleapis.com/drive/v3';
export const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER = 'application/vnd.google-apps.folder';
export const IMPORT_FOLDER = 'Importado';

/** Something the person has to act on; the message is printed as is. */
export class ImportStop extends Error {}
class SessionGone extends Error {}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Timing = { pause: (ms: number) => Promise<void> };
const realTiming: Timing = { pause: (ms) => new Promise((r) => setTimeout(r, ms)) };

export const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function reasonOf(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[]; status?: string } | string } | null;
  if (!j) return '';
  if (typeof j.error === 'string') return j.error.slice(0, 40);
  return String(j.error?.errors?.[0]?.reason ?? j.error?.status ?? '').slice(0, 40);
}

export class DriveRest {
  constructor(
    private readonly fetcher: Fetch,
    // A valid access token; force = the last one was refused.
    private readonly token: (force: boolean) => Promise<string>,
    private readonly timing: Timing = realTiming,
  ) {}

  /** A Drive API call with the token, retrying slow answers. Never passes on a Google body. */
  async call(url: string, init: RequestInit = {}): Promise<Response> {
    const delays = [1000, 2000, 4000, 8000, 16000, 32000];
    let refreshed = false;
    for (let i = 0; ; i++) {
      let res: Response;
      try {
        res = await this.fetcher(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await this.token(false)}` } });
      } catch (e) {
        if (e instanceof ImportStop) throw e;
        if (i >= delays.length) throw new ImportStop('Sin conexión con Google. Vuelve a correr el script cuando haya señal: sigue donde quedó.');
        await this.timing.pause(delays[i]);
        continue;
      }
      if (res.ok) return res;
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await res.body?.cancel().catch(() => {});
        await this.token(true);
        continue;
      }
      const reason = await reasonOf(res);
      if ((res.status === 429 || res.status >= 500 || (res.status === 403 && /rateLimit/i.test(reason))) && i < delays.length) {
        await this.timing.pause(delays[i]);
        continue;
      }
      if (res.status === 403 && /storageQuota/i.test(reason)) throw new ImportStop('Drive está lleno. Libera espacio en la cuenta (Drive, Gmail y Fotos comparten los 15 GB) y vuelve a correr el script.');
      throw new ImportStop(`Google dijo que no (${res.status}${reason ? `, ${reason}` : ''}). Vuelve a intentar más tarde.`);
    }
  }

  async about(): Promise<{ email: string; usage: number; limit: number | null }> {
    const j = (await (await this.call(`${API}/about?fields=${encodeURIComponent('user(emailAddress),storageQuota(limit,usage)')}`)).json()) as {
      user?: { emailAddress?: string };
      storageQuota?: { limit?: string; usage?: string };
    };
    return { email: (j.user?.emailAddress ?? '').toLowerCase(), usage: Number(j.storageQuota?.usage ?? 0), limit: j.storageQuota?.limit ? Number(j.storageQuota.limit) : null };
  }

  async findOne(query: string): Promise<string | null> {
    const res = await this.call(`${API}/files?${new URLSearchParams({ q: query, spaces: 'drive', pageSize: '10', fields: 'files(id)' })}`);
    const j = (await res.json()) as { files?: { id: string }[] };
    return j.files?.[0]?.id ?? null;
  }

  async createFolder(name: string, parent: string | null, appProperties: Record<string, string>): Promise<string> {
    const res = await this.call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}), appProperties }),
    });
    return ((await res.json()) as { id: string }).id;
  }

  /** The platform's root folder (found by its private mark, as the platform does) and «Importado» in it. */
  async folders(rootName: string): Promise<{ rootId: string; importId: string }> {
    const rootId =
      (await this.findOne(`appProperties has { key='fb360' and value='root' } and mimeType = ${q(FOLDER)} and trashed = false`)) ??
      (await this.createFolder(rootName, null, { fb360: 'root' }));
    const importId =
      (await this.findOne(`appProperties has { key='fb360path' and value=${q(IMPORT_FOLDER)} } and ${q(rootId)} in parents and mimeType = ${q(FOLDER)} and trashed = false`)) ??
      (await this.createFolder(IMPORT_FOLDER, rootId, { fb360: 'folder', fb360path: IMPORT_FOLDER }));
    return { rootId, importId };
  }

  /** The file this source file already became in Drive (its private key), or null. */
  findImported(key: string): Promise<string | null> {
    return this.findOne(`appProperties has { key='sourceKey' and value=${q(key)} } and trashed = false`);
  }

  async startSession(p: Planned, parent: string): Promise<string> {
    const res = await this.call(`${UPLOAD}?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': p.mime, 'X-Upload-Content-Length': String(p.size) },
      // Private marks: the number (the platform labels it «Archivo 007») and the key that prevents repeats.
      body: JSON.stringify({ name: p.name, parents: [parent], mimeType: p.mime, appProperties: { fb360: 'import', sourceKey: p.key, seq: p.seq } }),
    });
    const loc = res.headers.get('location');
    if (!loc?.startsWith('https://www.googleapis.com/upload/')) throw new ImportStop('Google no abrió la subida. Vuelve a intentar más tarde.');
    return loc;
  }
}

type Status = { done: boolean; received: number; gone: boolean; fileId: string | null };

/** Where an upload session stands. The session URL is its own key: no token is sent. */
export async function sessionStatus(fetcher: Fetch, url: string, size: number, timing: Timing = realTiming): Promise<Status> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetcher(url, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` }, redirect: 'manual' });
      if (res.status === 200 || res.status === 201) return { done: true, received: size, gone: false, fileId: ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null };
      await res.body?.cancel().catch(() => {});
      if (res.status === 308) return { done: false, received: receivedFrom(res.headers.get('range')), gone: false, fileId: null };
      if (res.status === 404 || res.status === 410) return { done: false, received: 0, gone: true, fileId: null };
    } catch {}
    await timing.pause(1000 * 2 ** i);
  }
  throw new ImportStop('Sin conexión con Google. Vuelve a correr el script cuando haya señal: sigue donde quedó.');
}

/** Sends a file from `offset` in chunks; returns the Drive file id. */
export async function sendFile(
  fetcher: Fetch,
  abs: string,
  p: Planned,
  url: string,
  offset: number,
  o: { chunk?: number; timing?: Timing; onProgress?: (sent: number, size: number) => void } = {},
): Promise<string> {
  const timing = o.timing ?? realTiming;
  const fd = await fsp.open(abs, 'r');
  try {
    let at = offset;
    let tries = 0;
    const resync = async () => {
      if (++tries > 8) throw new ImportStop('Sin conexión con Google, o Google está lento. Vuelve a correr el script más tarde: sigue donde quedó.');
      await timing.pause(Math.min(60_000, 1000 * 2 ** tries));
      const st = await sessionStatus(fetcher, url, p.size, timing);
      if (st.gone) throw new SessionGone();
      return st;
    };
    for (;;) {
      o.onProgress?.(at, p.size);
      const [a, b] = at < p.size ? nextChunk(at, p.size, o.chunk) : [p.size, p.size];
      const buf = Buffer.alloc(b - a);
      if (b > a) await fd.read(buf, 0, b - a, a);
      let res: Response;
      try {
        res = await fetcher(url, {
          method: 'PUT',
          headers: { 'Content-Range': b > a ? `bytes ${a}-${b - 1}/${p.size}` : `bytes */${p.size}` },
          body: b > a ? new Uint8Array(buf) : undefined,
          redirect: 'manual',
        });
      } catch {
        const st = await resync();
        if (st.done && st.fileId) return st.fileId;
        at = st.received;
        continue;
      }
      if (res.status === 200 || res.status === 201) {
        o.onProgress?.(p.size, p.size);
        const id = ((await res.json().catch(() => ({}))) as { id?: string }).id;
        if (!id) throw new ImportStop('Google terminó la subida pero no dio el archivo. Vuelve a correr el script.');
        return id;
      }
      await res.body?.cancel().catch(() => {});
      if (res.status === 308) {
        at = receivedFrom(res.headers.get('range'));
        tries = 0;
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new SessionGone();
      if (res.status === 429 || res.status >= 500) {
        const st = await resync();
        if (st.done && st.fileId) return st.fileId;
        at = st.received;
        continue;
      }
      throw new ImportStop(`Google no aceptó una parte de ${p.name} (${res.status}).`);
    }
  } finally {
    await fd.close();
  }
}

export type RunResult = { sent: number; already: number };

/**
 * Uploads what the plan says, file by file, saving the state after every step that matters (a
 * session opened, a file finished), so a run cut at any point continues where it stopped.
 */
export async function runUploads(o: {
  drive: DriveRest;
  fetcher: Fetch;
  folder: string;
  plan: ImportPlan;
  state: ImportState;
  importId: string;
  save: (s: ImportState) => Promise<void>;
  log?: (line: string) => void;
  chunk?: number;
  timing?: Timing;
  onProgress?: (name: string, sent: number, size: number) => void;
  now?: () => number;
}): Promise<RunResult> {
  const log = o.log ?? (() => {});
  const now = o.now ?? Date.now;
  let sent = 0;
  let already = 0;
  for (const p of o.plan.upload) {
    const s = o.state.files[p.rel];
    const there = await o.drive.findImported(p.key);
    if (there) {
      Object.assign(s, { done: true, fileId: there, session: null });
      already++;
      await o.save(o.state);
      log(`  ${p.name}: ya estaba en Drive.`);
      continue;
    }
    let url = p.resume?.url ?? null;
    let offset = 0;
    if (url) {
      const st = await sessionStatus(o.fetcher, url, p.size, o.timing);
      if (st.done && st.fileId) {
        Object.assign(s, { done: true, fileId: st.fileId, session: null });
        await o.save(o.state);
        sent++;
        log(`  ${p.name}: subido.`);
        continue;
      }
      if (st.gone) url = null;
      else offset = st.received;
    }
    for (let attempt = 0; ; attempt++) {
      if (!url) {
        url = await o.drive.startSession(p, o.importId);
        s.session = { url, at: now() };
        await o.save(o.state);
        offset = 0;
      }
      try {
        const id = await sendFile(o.fetcher, path.join(o.folder, p.rel), p, url, offset, { chunk: o.chunk, timing: o.timing, onProgress: (a, b) => o.onProgress?.(p.name, a, b) });
        Object.assign(s, { done: true, fileId: id, session: null });
        await o.save(o.state);
        sent++;
        log(`  ${p.name}: subido (${bytesText(p.size)}).`);
        break;
      } catch (e) {
        // The session expired (a week) or was dropped: this file starts again, once.
        if (!(e instanceof SessionGone) || attempt >= 1) throw e instanceof SessionGone ? new ImportStop(`Google cerró la subida de ${p.name}. Vuelve a correr el script.`) : e;
        url = null;
      }
    }
  }
  return { sent, already };
}
