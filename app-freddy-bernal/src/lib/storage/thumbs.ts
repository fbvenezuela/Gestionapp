import 'server-only';
import { withSystem } from '../db';
import { checkUploadThumb, thumbFromBase64 } from '../domain/thumb';

// Thumbnails kept in media_thumbs, whatever the file's storage. That table has no API grants: everything here runs
// with the system connection, and only AFTER the person's own query (RLS) has answered for the media row, never
// inside it. No Google Drive module is loaded here (with STORAGE_PROVIDER empty nothing of Drive runs).

// Files come from the platform's own origin: sandboxed, never sniffed, never embedded elsewhere.
export const SANDBOX_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};
export const THUMB_HEADERS: Record<string, string> = { ...SANDBOX_HEADERS, 'Cache-Control': 'private, max-age=86400' };

/** 404 = no thumbnail: the page shows the icon. */
export const noThumb = () => new Response(null, { status: 404, headers: { ...SANDBOX_HEADERS, 'Cache-Control': 'private, no-store' } });

export function thumbResponse(mime: string, bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, { status: 200, headers: { ...THUMB_HEADERS, 'Content-Type': mime, 'Content-Length': String(bytes.length) } });
}

/** The kept thumbnail of a media row the caller has ALREADY read with the person's RLS, or null. */
export async function storedThumb(mediaId: string): Promise<{ mime: string; bytes: Uint8Array<ArrayBuffer> } | null> {
  const t = await withSystem((sql) =>
    sql.one<{ mime: string; bytes: Uint8Array }>(`select mime, bytes from public.media_thumbs where media_id = $1`, [mediaId]),
  );
  return t ? { mime: t.mime, bytes: new Uint8Array(t.bytes) } : null;
}

/**
 * Keeps the thumbnail the uploader's browser made (finishUpload, after the person's step). Only for a file this same
 * person uploaded, that is finished and is a picture or a video; and never over a thumbnail already kept (insert
 * only: a later call cannot swap the picture someone else will see). Returns whether one was kept.
 */
export async function storeThumb(mediaId: string, userId: string, base64: string): Promise<boolean> {
  const bytes = thumbFromBase64(base64);
  if (!bytes) return false;
  const check = checkUploadThumb(bytes);
  if (!check.ok) return false;
  const row = await withSystem((sql) =>
    sql.one<{ media_id: string }>(
      `insert into public.media_thumbs (media_id, mime, bytes)
       select m.id, $2, $3 from public.media_assets m
        where m.id = $1 and m.uploaded_by = $4 and m.status = 'ready' and m.deleted_at is null
          and (m.mime like 'image/%' or m.mime like 'video/%')
       on conflict (media_id) do nothing
       returning media_id`,
      [mediaId, check.mime, Buffer.from(bytes), userId],
    ),
  );
  return !!row;
}
