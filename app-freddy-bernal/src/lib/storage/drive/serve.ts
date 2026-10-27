import 'server-only';
import { after } from 'next/server';
import { withSystem } from '../../db';
import { fetchThumbnail, getFile, openMedia } from './client';
import { noticeAdmins, withDrive } from './connection';
import { DRIVE_MESSAGE, DRIVE_STATUS, DriveError, TOO_BIG_MESSAGE } from './errors';
import { servedAs } from './mime';
import { extOf, mediaFileName } from './names';
import { FULL_MAX, parseContentRange, parseRange, planRange, sliceStream, SKIP_LIMIT } from './range';
import { budgetReached, personShareReached, reserveTransfer, settleTransfer, transferCapBytes, transferMonth } from './transfer';
import { noThumb, SANDBOX_HEADERS, storedThumb, thumbResponse } from '../thumbs';

// The Drive branch of /api/media/[id]. The caller has ALREADY run the person's own query (RLS)
// and got the row back: nothing here runs, and Google is never called, for a row the person
// cannot see. Files come from the platform's own origin, so every answer is sandboxed: no script
// runs even if a file claims to be a page, and only plain media types are shown inline.

export const MEDIA_HEADERS: Record<string, string> = { 'Cache-Control': 'private, no-store', ...SANDBOX_HEADERS };

export type MediaRow = { id: string; label: string; mime: string; code: string | null; storage_path: string };

const text = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...MEDIA_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra } });

// Work that must finish after the response (the transfer count). Outside a request (tests) the
// promise simply runs on its own.
function afterResponse(p: Promise<unknown>) {
  const safe = p.catch((e) => console.error('[drive] transfer count failed:', (e as Error).message));
  try {
    after(() => safe);
  } catch {
    // Not inside a Next request.
  }
}

async function failure(e: unknown, row: MediaRow): Promise<Response> {
  if (e instanceof DriveError) {
    if (e.code === 'not_found') {
      await noticeAdmins({
        kind: 'drive_missing',
        title: 'Un archivo ya no está en Drive',
        body: `${row.code ?? 'Sin evento'} · ${row.label}. Alguien lo borró o lo movió en Drive.`,
        key: `drive_missing:${row.id}`,
        link: '/biblioteca',
      });
    }
    return text(DRIVE_STATUS[e.code], DRIVE_MESSAGE[e.code]);
  }
  if ((e as Error)?.name !== 'AbortError') console.error('[drive] media:', (e as Error)?.message);
  return text(503, DRIVE_MESSAGE.busy);
}

export type Viewer = { userId: string; admin: boolean };

export async function serveDriveMedia(req: Request, row: MediaRow, wantInline: boolean, viewer: Viewer): Promise<Response> {
  const info = await withSystem((sql) =>
    sql.one<{ file_id: string; size_bytes: string | number }>(
      `select d.file_id, m.size_bytes from public.media_drive d join public.media_assets m on m.id = d.media_id
        where d.media_id = $1 and d.upload_url_enc is null`,
      [row.id],
    ),
  );
  if (!info) return text(404, 'No encontrado');
  const size = Number(info.size_bytes);
  const plan = planRange(parseRange(req.headers.get('range')), size);
  if (plan.kind === 'unsatisfiable') return text(416, 'Ese tramo del archivo no existe.', { 'Content-Range': `bytes */${size}` });
  if (plan.kind === 'full' && size > FULL_MAX) return text(400, TOO_BIG_MESSAGE);

  // Reserve what this answer may send before anything goes out; the unsent part comes back below.
  const held = await reserveTransfer(plan.kind === 'full' ? size : plan.end - plan.start + 1, viewer.admin ? null : viewer.userId);
  if (!held.ok) {
    if (held.why === 'month') {
      await budgetReached();
      return text(503, DRIVE_MESSAGE.budget);
    }
    await personShareReached(viewer.userId);
    return text(DRIVE_STATUS.share, DRIVE_MESSAGE.share);
  }
  let settle!: (sent: number) => void;
  const done = new Promise<number>((r) => (settle = r));
  afterResponse(done.then((sent) => settleTransfer(held.r, sent)));

  const served = servedAs(row.mime, wantInline);
  const headers: Record<string, string> = {
    ...MEDIA_HEADERS,
    'Accept-Ranges': 'bytes',
    'Content-Type': served.type,
    'Content-Disposition': `${served.disposition}; filename="${mediaFileName(row.code, row.label, extOf(row.storage_path))}"`,
  };

  let res: Response;
  try {
    res = await withDrive((t) => openMedia(t, info.file_id, plan.kind === 'part' ? `bytes=${plan.start}-${plan.end}` : null, req.signal));
  } catch (e) {
    settle(0);
    return failure(e, row);
  }

  const drop = () => {
    settle(0);
    void res.body?.cancel().catch(() => {});
  };

  if (res.status === 416) {
    drop();
    return text(416, 'Ese tramo del archivo no existe.', { 'Content-Range': res.headers.get('content-range') ?? `bytes */${size}` });
  }

  if (plan.kind === 'full') {
    const len = Number(res.headers.get('content-length'));
    if (!res.body) {
      settle(0);
      return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } });
    }
    if (Number.isFinite(len) && len >= 0 && res.headers.get('content-length') !== null) headers['Content-Length'] = String(len);
    return new Response(sliceStream(res.body, { onEnd: settle }), { status: 200, headers });
  }

  // A part was asked for.
  let start: number;
  let take: number;
  let total: number;
  let skip = 0;
  if (res.status === 206) {
    const cr = parseContentRange(res.headers.get('content-range'));
    if (!cr || cr.start !== plan.start) {
      drop();
      return text(503, 'No se pudo leer ese tramo. Intenta otra vez.');
    }
    start = cr.start;
    total = cr.size;
    take = Math.min(cr.end, plan.end) - cr.start + 1;
  } else {
    // Drive sent the whole file: drop the bytes before the part, if that is cheap.
    total = Number(res.headers.get('content-length')) || size;
    if (plan.start > SKIP_LIMIT || plan.start >= total) {
      drop();
      return text(503, 'No se pudo leer ese tramo. Intenta otra vez.');
    }
    start = plan.start;
    skip = plan.start;
    take = Math.min(plan.end, total - 1) - plan.start + 1;
  }
  if (!res.body) {
    settle(0);
    return text(503, 'No se pudo leer ese tramo. Intenta otra vez.');
  }
  headers['Content-Range'] = `bytes ${start}-${start + take - 1}/${total}`;
  headers['Content-Length'] = String(take);
  return new Response(sliceStream(res.body, { skip, take, onEnd: settle }), { status: 206, headers });
}

// A Drive file's thumbnail counts like any other Drive answer: its bytes are reserved first, against the month's cap
// and the person's share for today (Administración aside). Refused = the icon.
async function sendThumb(mime: string, b: Uint8Array<ArrayBuffer>, viewer: Viewer): Promise<Response> {
  if (!(await reserveTransfer(b.length, viewer.admin ? null : viewer.userId)).ok) return noThumb();
  return thumbResponse(mime, b);
}

/**
 * The thumbnail kept for a Drive row (made by the uploader's browser, or copied from Drive before), counted against
 * the cap. The caller has ALREADY read the row with the person's RLS. null = none kept. Rows in other buckets are
 * served by the route straight from src/lib/storage/thumbs.ts (no Drive module, nothing counted).
 */
export async function serveStoredThumb(mediaId: string, viewer: Viewer): Promise<Response | null> {
  const t = await storedThumb(mediaId);
  return t ? sendThumb(t.mime, t.bytes, viewer) : null;
}

/**
 * /api/media/[id]/thumb for a Drive row (already checked with RLS by the caller): the kept copy, or the one Drive
 * makes (copied once into media_thumbs). 404 = show the icon.
 */
export async function serveDriveThumb(mediaId: string, viewer: Viewer): Promise<Response> {
  const none = noThumb;
  const send = (mime: string, b: Uint8Array<ArrayBuffer>) => sendThumb(mime, b, viewer);
  const stored = await serveStoredThumb(mediaId, viewer);
  if (stored) return stored;
  const info = await withSystem((sql) =>
    sql.one<{ file_id: string; used: string | number }>(
      `select d.file_id, coalesce((select x.bytes from public.drive_transfer x where x.month = $2), 0) as used
         from public.media_drive d
        where d.media_id = $1 and d.upload_url_enc is null`,
      [mediaId, transferMonth()],
    ),
  );
  if (!info) return none();
  if (Number(info.used) >= transferCapBytes()) return none();
  try {
    const th = await withDrive(async (t) => {
      const f = await getFile(t, info.file_id, 'id,hasThumbnail,thumbnailLink');
      return f.thumbnailLink ? fetchThumbnail(t, f.thumbnailLink) : null;
    });
    // Video thumbnails can take a while to exist: a miss is not stored, the next view tries again.
    if (!th) return none();
    // Kept even when this answer is refused below: the next view needs no call to Google. Insert only: one kept
    // meanwhile (the uploader's own, or a view at the same time) stays.
    await withSystem((sql) =>
      sql.query(
        `insert into public.media_thumbs (media_id, mime, bytes) values ($1, $2, $3)
         on conflict (media_id) do nothing`,
        [mediaId, th.mime, Buffer.from(th.bytes)],
      ),
    );
    return await send(th.mime, new Uint8Array(th.bytes));
  } catch {
    return none();
  }
}
