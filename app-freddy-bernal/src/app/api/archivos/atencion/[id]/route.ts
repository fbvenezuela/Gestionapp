import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { servePrivateFile } from '@/lib/storage/serve-files';
import type { ScanStatus } from '@/lib/storage/scanner';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' };

// A file of a citizen request (theirs or the team's evidence) for the attention desk. The person's session with its
// second factor, then RLS: the row comes back only if they may read that request (a denuncia only for the denuncias
// operator and the coordinator; a responsible, their area's). A file withheld by moderation is never served again. Then
// the scan rule and the bytes (src/lib/storage/serve-files.ts). ?ver=1 shows a photo instead of downloading it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('No encontrado', { status: 404, headers });
  const s = await getSession();
  if (!s || !s.mfaOk) return new Response('Entra de nuevo.', { status: 401, headers });
  const row = await withUser(s.claims, (sql) =>
    sql.one<{ storage_key: string; scan_status: ScanStatus; withheld: boolean; reference: string; n: number }>(
      `select a.storage_key, a.scan_status, a.withheld_at is not null as withheld, r.reference,
              (select count(*)::int from public.request_attachments b where b.request_id = a.request_id and b.created_at <= a.created_at) as n
         from public.request_attachments a join public.requests r on r.id = a.request_id
        where a.id = $1`,
      [id],
    ),
  );
  if (!row) return new Response('No encontrado', { status: 404, headers });
  if (row.withheld) return new Response('Este archivo se retiró por moderación.', { status: 410, headers });
  return servePrivateFile({ storageKey: row.storage_key, scanStatus: row.scan_status, name: `${row.reference}-${row.n}`, inline: req.nextUrl.searchParams.get('ver') === '1' });
}
