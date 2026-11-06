import type { NextRequest } from 'next/server';
import { failureOf, isUuid, lookupGrant, rateKeys } from '@/lib/actions/participation-core';
import { withAnon } from '@/lib/db';
import { citizenAttachment } from '@/lib/web/participation';
import { servePrivateFile } from '@/lib/storage/serve-files';

const HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const plain = (status: number, body: string) => new Response(body, { status, headers: HEADERS });

// A file of the person's own request (theirs, or evidence the team shared), only while the consultation cookie is valid:
// the database decides with the receipt inside the cookie (citizen.request_attachment, as anon), then the scan rule and
// the bytes (servePrivateFile). Anything else, the same 404. ?ver=1 shows a photo instead of downloading it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return plain(404, 'No encontrado');
  const grant = await lookupGrant();
  if (!grant) return plain(404, 'No encontrado');
  try {
    const keys = await rateKeys();
    const r = await withAnon((sql) => citizenAttachment(sql, grant, keys, id));
    if (r.status !== 'ok') return plain(404, 'No encontrado');
    return servePrivateFile({ storageKey: r.storageKey, scanStatus: r.scanStatus, name: `${grant.reference}-adjunto`, inline: req.nextUrl.searchParams.get('ver') === '1' });
  } catch (e) {
    const f = failureOf(e, 'descarga');
    return plain(f.code === 'rate' ? 429 : 500, f.error);
  }
}
