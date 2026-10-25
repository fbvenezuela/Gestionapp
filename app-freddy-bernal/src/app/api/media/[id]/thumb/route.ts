import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Small picture of a Drive file for Biblioteca. Same check as the download (RLS on the row),
// then a copy kept in the database, counted like the download (month's cap and the person's
// share). 404 = no thumbnail: the page shows the icon.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || !s.mfaOk) return new NextResponse('Entra de nuevo.', { status: 401 });
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const row = await withUser(s.claims, (sql) =>
    sql.one<{ bucket: string }>(`select m.bucket from public.media_assets m where m.id = $1 and m.deleted_at is null and m.status = 'ready'`, [id]),
  );
  if (!row || row.bucket !== 'drive') return new NextResponse(null, { status: 404 });
  const { serveDriveThumb } = await import('@/lib/storage/drive/serve');
  return serveDriveThumb(id, { userId: s.userId, admin: s.roles.includes('admin') });
}
