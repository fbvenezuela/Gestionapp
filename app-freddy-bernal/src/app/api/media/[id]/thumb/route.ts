import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Small picture of a file (Biblioteca, Resultados, the material list). Same check as the download (RLS on the
// row): whoever cannot see the file gets 404, and nothing else is even read. Then the thumbnail kept in the
// database, for any bucket (made by the uploader's browser). A Drive file goes through the Drive branch: the kept
// copy or the one Drive makes (copied once), counted like a download (month's cap and the person's share).
// 404 = the page shows the icon.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || !s.mfaOk) return new NextResponse('Entra de nuevo.', { status: 401 });
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const row = await withUser(s.claims, (sql) =>
    sql.one<{ bucket: string }>(`select m.bucket from public.media_assets m where m.id = $1 and m.deleted_at is null and m.status = 'ready'`, [id]),
  );
  if (!row) return new NextResponse(null, { status: 404 });
  if (row.bucket === 'drive') {
    const { serveDriveThumb } = await import('@/lib/storage/drive/serve');
    return serveDriveThumb(id, { userId: s.userId, admin: s.roles.includes('admin') });
  }
  // Not Drive: no Drive module is loaded (with STORAGE_PROVIDER empty nothing of Drive runs).
  const { noThumb, storedThumb, thumbResponse } = await import('@/lib/storage/thumbs');
  const t = await storedThumb(id);
  return t ? thumbResponse(t.mime, t.bytes) : noThumb();
}
