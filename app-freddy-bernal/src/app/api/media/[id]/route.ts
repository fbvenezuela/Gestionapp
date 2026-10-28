import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { mediaDownloadRow } from '@/lib/data/media';
import { isDemo } from '@/lib/env';
import { demoFilePath } from '@/lib/storage/demo-store';

// Drive files stream through here (ranged, 4 MiB at most per answer): allow the longest run.
export const maxDuration = 300;

// Downloads a private file. RLS decides whether the person may read the row; the file
// is then served through a short-lived signed URL (5 minutes). File names never carry
// a date: <event, obra or report code>-<label>.<ext>. Drive rows (bucket 'drive') are streamed from Google
// with Range support, only after that same check (src/lib/storage/drive/serve.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || !s.mfaOk) return new NextResponse('Entra de nuevo.', { status: 401 });
  const row = await withUser(s.claims, (sql) => mediaDownloadRow(sql, id));
  if (!row) return new NextResponse('No encontrado', { status: 404 });
  const ext = row.storage_path.split('.').pop();
  const name = `${row.code ?? 'pieza'}-${row.label}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-') + `.${ext}`;
  const inline = req.nextUrl.searchParams.get('ver') === '1';

  if (row.bucket === 'drive') {
    const { serveDriveMedia } = await import('@/lib/storage/drive/serve');
    return serveDriveMedia(req, { id, label: row.label, mime: row.mime, code: row.code, storage_path: row.storage_path }, inline, {
      userId: s.userId,
      admin: s.roles.includes('admin'),
    });
  }

  if (isDemo()) {
    const file = demoFilePath(row.storage_path);
    if (!fs.existsSync(file)) return new NextResponse('Archivo de demostración: no hay un archivo real detrás.', { status: 404 });
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new NextResponse(stream, {
      headers: { 'Content-Type': row.mime || 'application/octet-stream', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`, 'Cache-Control': 'private, no-store' },
    });
  }
  const { supabaseServer } = await import('@/lib/supabase/server');
  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage.from(row.bucket).createSignedUrl(row.storage_path, 300, inline ? undefined : { download: name });
  if (error || !data) return new NextResponse('No se pudo preparar la descarga.', { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
