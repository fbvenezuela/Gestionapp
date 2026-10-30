import 'server-only';
import { DriveError, mapDriveFailure, retryable } from './errors';
import { driveFetch, driveTiming, pause } from './http';

// A small Drive v3 client over fetch (no SDK). Every function takes the access token; refreshing
// it is the connection's job (connection.ts). Rate limits and 5xx are retried with backoff; any
// other failure becomes a DriveError. Google bodies are never logged or passed on.

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

const ID = /^[A-Za-z0-9_-]{10,200}$/;
export const isDriveId = (s: unknown): s is string => typeof s === 'string' && ID.test(s);

// `pass`: statuses handed back to the caller instead of thrown (416 for a range past the end).
async function call(token: string, url: string, init: RequestInit = {}, pass: number[] = []): Promise<Response> {
  const delays = driveTiming.retryMs;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await driveFetch(url, { ...init, cache: 'no-store', headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (attempt < delays.length) {
        await pause(delays[attempt]);
        continue;
      }
      throw new DriveError('busy', 'network');
    }
    if (res.ok || res.status === 308 || pass.includes(res.status)) return res;
    const body = await res.json().catch(() => null);
    if (attempt < delays.length && retryable(res.status, body)) {
      await pause(delays[attempt]);
      continue;
    }
    throw mapDriveFailure(res.status, body);
  }
}

const json = async <T>(res: Response) => (await res.json()) as T;
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
// Drive query strings: single quotes and backslashes escaped.
export const qv = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export type DriveAbout = { email: string; limit: number | null; usage: number };

export async function about(token: string): Promise<DriveAbout> {
  const j = await json<{ user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } }>(
    await call(token, `${DRIVE_API}/about?${qs({ fields: 'user(emailAddress),storageQuota(limit,usage)' })}`),
  );
  return { email: j.user?.emailAddress ?? '', limit: j.storageQuota?.limit ? Number(j.storageQuota.limit) : null, usage: Number(j.storageQuota?.usage ?? 0) };
}

export async function generateId(token: string): Promise<string> {
  const j = await json<{ ids?: string[] }>(await call(token, `${DRIVE_API}/files/generateIds?${qs({ count: '1', space: 'drive', type: 'files' })}`));
  const id = j.ids?.[0];
  if (!isDriveId(id)) throw new DriveError('refused', 'bad_generated_id');
  return id;
}

export type DriveFile = {
  id: string;
  size?: string;
  mimeType?: string;
  trashed?: boolean;
  md5Checksum?: string;
  hasThumbnail?: boolean;
  thumbnailLink?: string;
  videoMediaMetadata?: { durationMillis?: string; width?: number; height?: number };
  imageMediaMetadata?: { width?: number; height?: number };
  appProperties?: Record<string, string>;
};

// The only metadata the platform ever asks for. Never name, originalFilename, the photo's EXIF
// time or location (imageMediaMetadata.time / .location), owners or sharing.
export const FILE_FIELDS = 'id,size,mimeType,trashed,md5Checksum,videoMediaMetadata,imageMediaMetadata(width,height),appProperties';

export async function getFile(token: string, fileId: string, fields = FILE_FIELDS): Promise<DriveFile> {
  if (!isDriveId(fileId)) throw new DriveError('not_found', 'bad_id');
  return json<DriveFile>(await call(token, `${DRIVE_API}/files/${fileId}?${qs({ fields })}`));
}

export async function listFiles(token: string, q: string, pageToken?: string): Promise<{ files: DriveFile[]; next: string | null }> {
  const params: Record<string, string> = { q, spaces: 'drive', pageSize: '100', fields: `nextPageToken,files(${FILE_FIELDS})` };
  if (pageToken) params.pageToken = pageToken;
  const j = await json<{ files?: DriveFile[]; nextPageToken?: string }>(await call(token, `${DRIVE_API}/files?${qs(params)}`));
  return { files: (j.files ?? []).filter((f) => isDriveId(f.id)), next: j.nextPageToken ?? null };
}

export async function createFolder(token: string, name: string, parentId: string | null, appProperties: Record<string, string>): Promise<string> {
  const body = { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}), appProperties };
  const j = await json<{ id?: string }>(
    await call(token, `${DRIVE_API}/files?${qs({ fields: 'id' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) }),
  );
  if (!isDriveId(j.id)) throw new DriveError('refused', 'bad_folder_id');
  return j.id;
}

export type NewFile = { id?: string; name: string; parents: string[]; mimeType: string; appProperties: Record<string, string> };

/**
 * Starts a resumable upload and returns its session URL (valid one week, a bearer URL for this one
 * file and size). `origin` is the page that will send the chunks: Google answers the browser's
 * cross-origin PUTs for a server-started session only when the start carried that Origin.
 */
export async function createUploadSession(token: string, meta: NewFile, size: number, origin: string): Promise<string> {
  const res = await call(token, `${DRIVE_UPLOAD}?${qs({ uploadType: 'resumable', fields: 'id,size,mimeType' })}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': meta.mimeType,
      'X-Upload-Content-Length': String(size),
      Origin: origin,
    },
    body: JSON.stringify(meta),
  });
  const loc = res.headers.get('location') ?? '';
  if (!loc.startsWith(`${DRIVE_UPLOAD}?`) && !loc.startsWith('https://www.googleapis.com/upload/')) throw new DriveError('refused', 'no_session');
  return loc;
}

/** Small files in one request (a cleaned photo copy). */
export async function uploadSmall(token: string, meta: NewFile, bytes: Uint8Array): Promise<DriveFile> {
  const boundary = `fb360-${crypto.randomUUID()}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`;
  const body = new Uint8Array(Buffer.concat([Buffer.from(head), Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`)]));
  return json<DriveFile>(
    await call(token, `${DRIVE_UPLOAD}?${qs({ uploadType: 'multipart', fields: FILE_FIELDS })}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }),
  );
}

export async function trashFile(token: string, fileId: string): Promise<void> {
  if (!isDriveId(fileId)) return;
  await call(token, `${DRIVE_API}/files/${fileId}?${qs({ fields: 'id' })}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ trashed: true }),
  });
}

/**
 * Renames a file and leaves it in one folder (R4, «Organizar por orden del feed»). Only works on files the app made
 * or was given (drive.file). It never shares anything: no permission is touched.
 */
export async function moveFile(token: string, fileId: string, name: string, folderId: string): Promise<void> {
  if (!isDriveId(fileId) || !isDriveId(folderId)) throw new DriveError('not_found', 'bad_id');
  const f = await json<{ parents?: string[] }>(await call(token, `${DRIVE_API}/files/${fileId}?${qs({ fields: 'id,parents' })}`));
  const parents = (f.parents ?? []).filter(isDriveId);
  const params: Record<string, string> = { fields: 'id' };
  if (!parents.includes(folderId)) params.addParents = folderId;
  const away = parents.filter((p) => p !== folderId);
  if (away.length) params.removeParents = away.join(',');
  await call(token, `${DRIVE_API}/files/${fileId}?${qs(params)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name }),
  });
}

/**
 * The file's bytes (alt=media). `range` is a single «bytes=a-b» or null for the whole file. The
 * body is NOT read here: the caller streams it. Aborting `signal` stops the transfer from Google.
 */
export async function openMedia(token: string, fileId: string, range: string | null, signal?: AbortSignal): Promise<Response> {
  if (!isDriveId(fileId)) throw new DriveError('not_found', 'bad_id');
  return call(token, `${DRIVE_API}/files/${fileId}?${qs({ alt: 'media' })}`, { headers: range ? { Range: range } : {}, signal }, [416]);
}

const THUMB_HOSTS = /^(?:[a-z0-9-]+\.)*googleusercontent\.com$|^drive\.google\.com$/;
const THUMB_MAX = 256 * 1024;
const THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Copies a thumbnail (≤ 256 KiB, jpeg/png/webp) from an allowlisted Google host, or null. */
export async function fetchThumbnail(token: string, link: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !THUMB_HOSTS.test(u.hostname)) return null;
  let res: Response;
  try {
    res = await driveFetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', cache: 'no-store' });
  } catch {
    return null;
  }
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (res.status !== 200 || !THUMB_TYPES.has(mime) || Number(res.headers.get('content-length') ?? 0) > THUMB_MAX || !res.body) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > THUMB_MAX) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return n ? { mime, bytes: new Uint8Array(Buffer.concat(parts)) } : null;
}

/**
 * Where a resumable upload stands: Google keeps the bytes it received. Needs no token (the session
 * URL is the credential). done = Google created the file.
 */
export async function uploadStatus(sessionUrl: string, total: number): Promise<{ done: boolean; received: number; gone: boolean }> {
  const res = await driveFetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` }, redirect: 'manual', cache: 'no-store' });
  await res.body?.cancel().catch(() => {});
  if (res.status === 200 || res.status === 201) return { done: true, received: total, gone: false };
  if (res.status === 308) {
    const m = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '');
    return { done: false, received: m ? Number(m[1]) + 1 : 0, gone: false };
  }
  return { done: false, received: 0, gone: res.status === 404 || res.status === 410 };
}
