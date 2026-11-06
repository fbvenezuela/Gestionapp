import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { goneWhenMissing, legacyPlan, safeTarget, redirectStatus, type RedirectStatus } from '@/lib/web/redirects';
import { isPublicPath } from '@/lib/web/routes';

// Runs before every page. Three jobs, cheapest first:
//   1. Old addresses of the WordPress site (docs/diagnostico.md §5, D-91): ONLY an address that no route answers (it
//      would be a 404) or a WordPress query on «/» («/?p=123», «/?s=agua») is looked up — the redirects live in
//      web_redirects, read by /api/web/redireccion (kept in memory a minute there), and each answer is remembered here a
//      minute too, so a crawler going through old links does not hit the database. A hit answers 301; a miss falls
//      through to the 404 page, except an old file (/wp-content/…) the importer did not bring: 410, gone for good. No
//      ordinary request pays for any of this.
//   2. The public website (the home and its sections) needs no session: nothing else is done for it.
//   3. Keeps the Supabase session cookies of the panel fresh. Authorization itself happens in the pages (requireSession)
//      and in the database (RLS), never here.

type Hit = { to: string; status: RedirectStatus } | null;
const MEMO_MS = 60_000;
const MEMO_MAX = 1000;
const memo = new Map<string, { at: number; hit: Hit }>();

async function lookupRedirect(request: NextRequest, path: string): Promise<Hit> {
  const known = memo.get(path);
  if (known && Date.now() - known.at < MEMO_MS) return known.hit;
  let hit: Hit = null;
  try {
    const url = new URL('/api/web/redireccion', request.nextUrl.origin);
    url.searchParams.set('ruta', path);
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const body = (await res.json()) as { to?: unknown; status?: unknown };
      const to = safeTarget(body.to);
      hit = to ? { to, status: redirectStatus(body.status) } : null;
    }
  } catch {
    hit = null; // the lookup failed: the address is a 404, as it would have been
  }
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(path, { at: Date.now(), hit });
  return hit;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const plan = legacyPlan(pathname, searchParams);
  if (plan.kind === 'search') return NextResponse.redirect(new URL(plan.to, request.url), 301);
  if (plan.kind === 'lookup') {
    const hit = await lookupRedirect(request, plan.path);
    if (hit) return NextResponse.redirect(new URL(hit.to, request.url), hit.status);
    // A file of the old site that was not brought (docs/PLAN-MIGRACION-Y-PRODUCCION.md): gone for good, not «not found».
    if (goneWhenMissing(plan.path)) {
      return new NextResponse('Este archivo de la web anterior ya no está disponible.', {
        status: 410,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex' },
      });
    }
    return NextResponse.next();
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.DATABASE_URL || !url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) {
          request.cookies.set(c.name, c.value);
          response.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

// Not for the framework's files, the icons, the public media library or the redirect lookup itself. The old site's
// uploads (/wp-content/…) are matched on purpose: an imported photo has a redirect to its new address.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|sw.js|offline.html|manifest.webmanifest|icon|apple-icon|api/archivos/web/|api/web/|.*\\.(?:png|jpg|webp|svg|ico)$).*)',
    '/wp-content/:path*',
  ],
};
