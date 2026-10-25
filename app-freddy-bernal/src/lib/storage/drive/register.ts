import 'server-only';
import { db, type Session } from '../../auth/session';
import { withSystem } from '../../db';
import { MEDIA_KIND } from '../../data/labels';
import { UserError } from '../../actions/run';
import { PHOTO_MIME, sniffPhoto, stripPhotoMetadata } from '../../media/photo-meta';
import { getFile, openMedia, trashFile, uploadSmall } from './client';
import { withDrive } from './connection';
import { DriveError } from './errors';
import { ensureFolder } from './folders';
import { driveMime, extForMime } from './mime';
import { driveFolderPath, mediaFileName, type MediaKind } from './names';

// «Elegir de Drive» (Administración only): registers a file the admin picked with the Google
// Picker. Only the id comes from the browser; everything else is read from Drive by the server.
// The picked file is never moved, renamed or copied, except a photo: phones clean photos before
// uploading (no GPS, camera or date), so a picked photo is cleaned here and the clean copy is
// saved in the platform's folder and registered instead. Its name is never asked for.

export const PICK_PHOTO_MAX = 30 * 1024 * 1024;
const CANT_CLEAN = 'Esta foto no se puede limpiar. Pásala a JPG y súbela con «Subir».';
const DUPLICATE = 'Ese archivo ya está en la plataforma.';

async function readAll(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel().catch(() => {});
      throw new UserError('La foto pesa más de 30 MB. Súbela con «Subir».');
    }
    parts.push(value);
  }
  return new Uint8Array(Buffer.concat(parts));
}

export type Registered = { id: string; mime: string; size: number };

/**
 * `source`: 'picker' (the admin picked it) or 'import' (the import script uploaded it, found by
 * «Traer lo nuevo de Drive»). `label`: an import's own «Archivo 007», matching its manifest.
 */
export async function registerPicked(
  s: Session,
  i: { fileId: string; eventId: string | null; kind: MediaKind },
  opts: { source?: 'picker' | 'import'; label?: string } = {},
): Promise<Registered> {
  const source = opts.source ?? 'picker';
  const taken = await withSystem((sql) => sql.one(`select 1 from public.media_drive where file_id = $1 or origin_file_id = $1`, [i.fileId]));
  if (taken) throw new UserError(DUPLICATE);

  // The event as the admin sees it (RLS), and the next number for the label.
  const pre = await db(s, async (sql) => {
    const ev = i.eventId ? await sql.one<{ code: string }>(`select code from public.events where id = $1 and deleted_at is null`, [i.eventId]) : null;
    if (i.eventId && !ev) return null;
    const n = await sql.one<{ n: number }>(
      `select count(*)::int + 1 as n from public.media_assets where event_id is not distinct from $1::uuid and kind = $2`,
      [i.eventId, i.kind],
    );
    const own = opts.label && /^Archivo \d{1,4}$/.test(opts.label) ? opts.label : null;
    return { code: ev?.code ?? null, label: own ?? `${MEDIA_KIND[i.kind]} ${n?.n ?? 1}` };
  });
  if (!pre) throw new UserError('No se encontró el evento.');

  const picked = await withDrive(async (t) => {
    const f = await getFile(t, i.fileId);
    if (f.trashed) throw new DriveError('not_found', 'trashed');
    if (/^image\/hei[cf]/i.test(f.mimeType ?? '')) throw new UserError(CANT_CLEAN);
    const ext = extForMime(f.mimeType ?? '');
    const check = ext ? driveMime(i.kind, f.mimeType ?? '', ext) : null;
    if (!ext || !check?.ok) throw new UserError(check && !check.ok ? check.error : 'Ese tipo de archivo no se puede guardar aquí.');
    const base = {
      fileId: f.id,
      origin: null as string | null,
      ext,
      mime: check.mime,
      size: Number(f.size ?? 0),
      durationS: f.videoMediaMetadata?.durationMillis ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 100) / 10 : null,
      width: f.videoMediaMetadata?.width ?? f.imageMediaMetadata?.width ?? null,
      height: f.videoMediaMetadata?.height ?? f.imageMediaMetadata?.height ?? null,
    };
    if (check.group !== 'image') return base;

    if (base.size > PICK_PHOTO_MAX) throw new UserError('La foto pesa más de 30 MB. Súbela con «Subir».');
    const bytes = await readAll(await openMedia(t, f.id, null), PICK_PHOTO_MAX);
    const kind = sniffPhoto(bytes);
    if (!kind || kind === 'heif' || PHOTO_MIME[kind] !== check.mime) throw new UserError(CANT_CLEAN);
    const clean = stripPhotoMetadata(kind, bytes);
    if (!clean) throw new UserError(CANT_CLEAN);
    const out = { ...base, width: clean.width, height: clean.height };
    if (!clean.changed) return out;
    const folder = await ensureFolder(t, driveFolderPath(i.kind, pre.code));
    const copy = await uploadSmall(t, { name: mediaFileName(pre.code, pre.label, ext), parents: [folder], mimeType: check.mime, appProperties: { fb360: 'media', from: 'picker' } }, clean.bytes);
    return { ...out, fileId: copy.id, origin: f.id, size: clean.bytes.length };
  });

  const path = `${i.eventId ?? i.kind}/${crypto.randomUUID()}.${picked.ext}`;
  const row = await db(s, (sql) =>
    sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, kind, bucket, storage_path, label, mime, size_bytes, duration_s, width, height, status, uploaded_by)
       values ($1, $2, 'drive', $3, $4, $5, $6, $7, $8, $9, 'uploading', auth.uid()) returning id`,
      [i.eventId, i.kind, path, pre.label, picked.mime, picked.size, picked.durationS, picked.width, picked.height],
    ),
  );
  const dropCopy = async () => {
    if (picked.origin) await withDrive((t) => trashFile(t, picked.fileId)).catch(() => {});
  };
  if (!row) {
    await dropCopy();
    throw new UserError('No puedes agregar material aquí.');
  }
  try {
    await withSystem((sql) =>
      sql.query(`insert into public.media_drive (media_id, file_id, source, origin_file_id) values ($1, $2, $3, $4)`, [row.id, picked.fileId, source, picked.origin]),
    );
  } catch (e) {
    await withSystem((sql) => sql.query(`update public.media_assets set status = 'failed' where id = $1`, [row.id]));
    await dropCopy();
    if ((e as { code?: string }).code === '23505') throw new UserError(DUPLICATE);
    throw e;
  }
  await db(s, (sql) => sql.query(`update public.media_assets set status = 'ready' where id = $1 and uploaded_by = auth.uid()`, [row.id]));
  return { id: row.id, mime: picked.mime, size: picked.size };
}

export type RemoteProbe = { durationS: number | null; width: number | null; height: number | null; fps: number | null; videoCodec: string | null; audioCodec: string | null };

/**
 * What the admin's browser read (MediaInfo over ranged reads of /api/media/<id>) from a video
 * picked or imported from Drive: Drive itself only knows duration and size, never fps or codecs.
 * Fills only what is still empty, only for those rows, never for a file someone uploaded.
 */
export async function saveRemoteProbe(s: Session, mediaId: string, p: RemoteProbe): Promise<void> {
  const row = await db(s, (sql) =>
    sql.one<{ mime: string }>(`select mime from public.media_assets where id = $1 and bucket = 'drive' and status = 'ready' and deleted_at is null`, [mediaId]),
  );
  if (!row || !row.mime.startsWith('video/')) throw new UserError('No se encontró ese video.');
  await withSystem((sql) =>
    sql.query(
      `update public.media_assets m
          set duration_s = coalesce(m.duration_s, $2), width = coalesce(m.width, $3), height = coalesce(m.height, $4),
              fps = coalesce(m.fps, $5), video_codec = coalesce(m.video_codec, $6), audio_codec = coalesce(m.audio_codec, $7)
         from public.media_drive d
        where d.media_id = m.id and m.id = $1 and d.source in ('picker', 'import')`,
      [mediaId, p.durationS, p.width, p.height, p.fps, p.videoCodec, p.audioCodec],
    ),
  );
}
