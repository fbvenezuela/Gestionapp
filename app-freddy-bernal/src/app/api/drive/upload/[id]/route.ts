import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withSystem, withUser } from '@/lib/db';
import { env } from '@/lib/env';
import type { Reservation } from '@/lib/storage/drive/transfer';

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHUNK = 1024 * 1024;
const plain = (status: number, body: string) => new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

// Upload chunks THROUGH the platform, only with DRIVE_UPLOAD_MODE=proxy (Juan's OK: these bytes
// count against Vercel's monthly transfer). Same protocol as Google's, answered as JSON:
//   PUT, Content-Range «bytes a-b/total», body ≤ 1 MiB  → { done, received }
//   PUT, Content-Range «bytes */total», no body         → { done, received }  (where it stands)
// The person's own row first (RLS: theirs, still uploading), then the sealed session URL and the
// whole chunk; only then are its bytes counted.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (env.drive.uploadMode !== 'proxy') return plain(404, 'No encontrado');
  const { id } = await params;
  const s = await getSession();
  if (!s || !s.mfaOk) return plain(401, 'Entra de nuevo.');
  if (!UUID.test(id)) return plain(404, 'No encontrado');
  const row = await withUser(s.claims, (sql) =>
    sql.one<{ size_bytes: string | number }>(
      `select size_bytes from public.media_assets where id = $1 and uploaded_by = auth.uid() and bucket = 'drive' and status = 'uploading' and deleted_at is null`,
      [id],
    ),
  );
  if (!row) return plain(404, 'No se encontró la subida.');
  const total = Number(row.size_bytes);
  const cr = req.headers.get('content-range') ?? '';
  const part = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
  const ask = /^bytes \*\/(\d+)$/.exec(cr);
  if ((!part && !ask) || Number((part ?? ask)![part ? 3 : 1]) !== total) return plain(400, 'Parte no válida.');
  const len = part ? Number(part[2]) - Number(part[1]) + 1 : 0;
  if (len < 0 || len > MAX_CHUNK) return plain(413, 'Parte demasiado grande.');

  // A body that says it is longer than the part is refused before it is read.
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) !== len) return plain(400, 'Parte incompleta.');

  const { DRIVE_MESSAGE, DRIVE_STATUS, UPLOAD_SHARE_MESSAGE } = await import('@/lib/storage/drive/errors');
  const { AAD, open } = await import('@/lib/storage/drive/crypto');
  const { driveKey } = await import('@/lib/storage/drive/connection');
  const { driveFetch } = await import('@/lib/storage/drive/http');
  const { budgetReached, personShareReached, reserveTransfer, settleTransfer } = await import('@/lib/storage/drive/transfer');

  // The sealed session and the whole chunk first: nothing is counted for a part Google never gets.
  const sealed = await withSystem((sql) => sql.one<{ upload_url_enc: string | null }>(`select upload_url_enc from public.media_drive where media_id = $1`, [id]));
  const key = driveKey();
  const opened = sealed?.upload_url_enc && key ? open(sealed.upload_url_enc, AAD.upload(id), key) : null;
  if (!opened?.ok) return plain(410, 'La subida venció; vuelve a elegir el archivo.');

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (len > 0) {
    let buf: Uint8Array<ArrayBuffer>;
    try {
      buf = new Uint8Array(await req.arrayBuffer());
    } catch {
      return plain(400, 'Parte incompleta.');
    }
    if (buf.length !== len) return plain(400, 'Parte incompleta.');
    body = buf;
  }

  // Counted before it goes on to Google, in one conditional step (chunks running at the same time
  // cannot pass the cap together): this month's cap and, Administración aside, the person's share
  // for today, like playback. Given back below when Google does not take the part.
  let held: Reservation | null = null;
  if (len > 0) {
    const r = await reserveTransfer(len, s.roles.includes('admin') ? null : s.userId);
    if (!r.ok) {
      if (r.why === 'month') {
        await budgetReached();
        return plain(503, DRIVE_MESSAGE.budget);
      }
      await personShareReached(s.userId, 'upload');
      return plain(DRIVE_STATUS.share, UPLOAD_SHARE_MESSAGE);
    }
    held = r.r;
  }

  let res: Response | null;
  try {
    res = await driveFetch(opened.value, { method: 'PUT', headers: { 'Content-Range': cr }, body, redirect: 'manual', cache: 'no-store' });
  } catch {
    res = null;
  }
  await res?.body?.cancel().catch(() => {});
  const taken = res !== null && (res.status === 200 || res.status === 201 || res.status === 308);
  if (held && !taken) await settleTransfer(held, 0);

  if (!res) return plain(503, DRIVE_MESSAGE.busy);
  if (res.status === 200 || res.status === 201) return NextResponse.json({ done: true, received: total }, { headers: { 'Cache-Control': 'no-store' } });
  if (res.status === 308) {
    const m = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '');
    return NextResponse.json({ done: false, received: m ? Number(m[1]) + 1 : 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (res.status === 404 || res.status === 410) return plain(410, 'La subida venció; vuelve a elegir el archivo.');
  return plain(503, DRIVE_MESSAGE.busy);
}
