import type { NextRequest } from 'next/server';
import { findRedirectOrNull } from '@/lib/web/redirect-map';

// Where an old address of the WordPress site goes now (web_redirects, read as anon and kept in memory a minute:
// redirect-map.ts). The proxy (src/proxy.ts) asks here only for addresses no route answers, which would otherwise be a
// 404; it answers the visitor with the 301. Public data (anyone who opens the old address gets the same redirect), and
// only paths of this site come back (no open redirect).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('ruta') ?? '';
  const hit = path.length <= 600 ? await findRedirectOrNull(path) : null;
  return Response.json(hit ? { to: hit.to, status: hit.status } : { to: null }, {
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
