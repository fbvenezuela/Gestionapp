import 'server-only';
import { env } from '../../env';
import { withSystem } from '../../db';
import { driveIsFake } from '../provider';
import { createUploadSession, generateId, getFile, listFiles, qv, trashFile, type DriveFile } from './client';
import { driveKey, loadConnection, noticeAdmins, withDrive } from './connection';
import { AAD, seal } from './crypto';
import { DriveError } from './errors';
import { ensureFolder, forgetFolders } from './folders';
import { cleanMime } from './mime';
import { driveFolderPath, mediaFileName, type MediaKind } from './names';

// «Subir» with Drive: the server starts a resumable upload in the platform's folder and hands the
// browser ONLY that session's URL; the browser sends the file to Google in chunks (never through
// Vercel). Nothing here runs inside a person's transaction.

// 16 × 256 KiB: Google wants chunks in multiples of 256 KiB (the last one can be shorter).
export const DRIVE_CHUNK = 4 * 1024 * 1024;
// Through the platform each request stays far below Vercel's 4.5 MB body limit.
export const PROXY_CHUNK = 1024 * 1024;

/**
 * The page that will send the chunks. Google only answers a browser's cross-origin PUTs for a
 * session the server started when the start carried that page's Origin. Only our own addresses
 * are accepted; anything else falls back to APP_URL.
 */
export function pageOrigin(h: string | null): string {
  const allowed = new Set<string>();
  const add = (u: string | undefined) => {
    if (!u) return;
    try {
      allowed.add(new URL(u.startsWith('http') ? u : `https://${u}`).origin);
    } catch {}
  };
  add(env.appUrl);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const fallback = [...allowed][0] ?? 'http://localhost:3000';
  if (!h) return fallback;
  if (allowed.has(h)) return h;
  if (env.dataMode === 'demo' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(h)) return h;
  return fallback;
}

/**
 * The address the browser sends the chunks to: Google's session URL. With the in-memory fake Drive
 * (demo database + DRIVE_FAKE=1 only) that address would reach the real Google, so the demo gets
 * a route of its own that hands the chunks to the fake (/api/drive/fake-upload).
 */
export function browserSessionUrl(sessionUrl: string): string {
  if (!driveIsFake()) return sessionUrl;
  const id = new URL(sessionUrl).searchParams.get('upload_id') ?? '';
  return `/api/drive/fake-upload?upload_id=${encodeURIComponent(id)}`;
}

export type DriveTicket = { id: string; bucket: 'drive'; path: string; endpoint: string; chunkSize: number; token: null; mode: 'drive' };

async function failRow(mediaId: string) {
  await withSystem((sql) => sql.query(`update public.media_assets set status = 'failed' where id = $1 and status = 'uploading'`, [mediaId]));
}

export type StartUpload = { mediaId: string; path: string; kind: MediaKind; eventCode: string | null; label: string; ext: string; mime: string; size: number; origin: string };

/** After the media row exists (inserted with the person's RLS): opens the Drive session. */
export async function startDriveUpload(o: StartUpload): Promise<DriveTicket> {
  try {
    const conn = await loadConnection();
    if (!conn || conn.status === 'disconnected' || !conn.token_enc) {
      await noticeAdmins({
        kind: 'drive_down',
        title: 'Alguien quiso subir material y Drive no está conectado',
        body: 'Entra a Ajustes → Google Drive y toca «Conectar Drive».',
        key: `drive_off:${new Date().toISOString().slice(0, 10)}`,
      });
      throw new DriveError('not_connected');
    }
    const key = driveKey();
    if (!key) throw new DriveError('not_configured', 'no_key');
    const meta = (folder: string, id: string) => ({
      id,
      name: mediaFileName(o.eventCode, o.label, o.ext),
      parents: [folder],
      mimeType: o.mime,
      // Private to the app: only uuids and fixed words.
      appProperties: { fb360: 'media', mediaId: o.mediaId },
    });
    const { fileId, sessionUrl } = await withDrive(async (t) => {
      const folderPath = driveFolderPath(o.kind, o.eventCode);
      const open = async () => {
        const folder = await ensureFolder(t, folderPath);
        const id = await generateId(t);
        return { fileId: id, sessionUrl: await createUploadSession(t, meta(folder, id), o.size, o.origin) };
      };
      try {
        return await open();
      } catch (e) {
        // A cached folder was deleted in Drive: look the folders up again, once.
        if (!(e instanceof DriveError) || e.code !== 'not_found') throw e;
        await forgetFolders();
        return open();
      }
    });
    await withSystem((sql) =>
      sql.query(`insert into public.media_drive (media_id, file_id, source, upload_url_enc) values ($1, $2, 'upload', $3)`, [
        o.mediaId,
        fileId,
        seal(sessionUrl, AAD.upload(o.mediaId), key),
      ]),
    );
    const proxy = env.drive.uploadMode === 'proxy';
    return {
      id: o.mediaId,
      bucket: 'drive',
      path: o.path,
      endpoint: proxy ? `/api/drive/upload/${o.mediaId}` : browserSessionUrl(sessionUrl),
      chunkSize: proxy ? PROXY_CHUNK : DRIVE_CHUNK,
      token: null,
      mode: 'drive',
    };
  } catch (e) {
    await failRow(o.mediaId);
    if (e instanceof DriveError && e.code === 'full') {
      await noticeAdmins({
        kind: 'drive_quota',
        title: 'Google Drive está lleno',
        body: 'No entran más archivos. Libera espacio en la cuenta de Google (Drive, Gmail y Fotos comparten los 15 GB).',
        key: `drive_full:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    throw e;
  }
}

export type DriveFacts = { durationS: number | null; width: number | null; height: number | null };

const INCOMPLETE = 'El archivo no llegó completo. Súbelo otra vez.';

/**
 * «Ya terminé»: Google must have the whole file, with the declared size and type. Returns the
 * facts Drive knows (duration and size of a video may come later; then they stay as the phone
 * measured them). Throws a Spanish message (string) when the file is not right.
 */
export async function checkDriveUpload(o: { mediaId: string; sizeBytes: number; mime: string }): Promise<DriveFacts> {
  const link = await withSystem((sql) => sql.one<{ file_id: string }>(`select file_id from public.media_drive where media_id = $1`, [o.mediaId]));
  if (!link) throw new DriveError('not_found', 'no_link');
  const f = await withDrive(async (t): Promise<DriveFile | null> => {
    try {
      return await getFile(t, link.file_id);
    } catch (e) {
      if (!(e instanceof DriveError) || e.code !== 'not_found') throw e;
      // Google did not keep the generated id: find the file by its private mark.
      const found = (await listFiles(t, `appProperties has { key='mediaId' and value=${qv(o.mediaId)} } and trashed = false`)).files[0];
      if (!found) return null;
      await withSystem((sql) => sql.query(`update public.media_drive set file_id = $2 where media_id = $1`, [o.mediaId, found.id]));
      return found;
    }
  });
  const ok = f && !f.trashed && Number(f.size) === o.sizeBytes && cleanMime(f.mimeType ?? '') === cleanMime(o.mime) && f.appProperties?.mediaId === o.mediaId;
  if (!ok) {
    await failRow(o.mediaId);
    throw new UploadIncomplete(INCOMPLETE);
  }
  const v = f.videoMediaMetadata;
  return {
    durationS: v?.durationMillis ? Math.round(Number(v.durationMillis) / 100) / 10 : null,
    width: v?.width ?? f.imageMediaMetadata?.width ?? null,
    height: v?.height ?? f.imageMediaMetadata?.height ?? null,
  };
}

export class UploadIncomplete extends Error {}

/** The upload is done: forget the session URL and fill only the facts the phone could not read. */
export async function settleDriveUpload(mediaId: string, facts: DriveFacts) {
  await withSystem(async (sql) => {
    await sql.query(`update public.media_drive set upload_url_enc = null where media_id = $1`, [mediaId]);
    await sql.query(
      `update public.media_assets set duration_s = coalesce(duration_s, $2), width = coalesce(width, $3), height = coalesce(height, $4) where id = $1`,
      [mediaId, facts.durationS, facts.width, facts.height],
    );
  });
}

// «Probar conexión» (Administración): a 256 KiB session the admin's browser fills straight from
// the page. It shows, with the real account and browser, whether Google answers direct chunks for
// a session the server started (the CORS rule is documented for Cloud Storage, not for Drive).
export const PROBE_SIZE = 256 * 1024;

export async function startProbe(origin: string): Promise<{ sessionUrl: string; size: number }> {
  return withDrive(async (t) => {
    const folder = await ensureFolder(t, 'Pruebas');
    const sessionUrl = await createUploadSession(
      t,
      { name: 'prueba-de-conexion.bin', parents: [folder], mimeType: 'application/octet-stream', appProperties: { fb360: 'probe' } },
      PROBE_SIZE,
      origin,
    );
    return { sessionUrl: browserSessionUrl(sessionUrl), size: PROBE_SIZE };
  });
}

/** Sends every probe file to the trash. Returns how many there were. */
export async function cleanProbes(): Promise<number> {
  return withDrive(async (t) => {
    const { files } = await listFiles(t, `appProperties has { key='fb360' and value='probe' } and trashed = false`);
    for (const f of files) await trashFile(t, f.id);
    return files.length;
  });
}
