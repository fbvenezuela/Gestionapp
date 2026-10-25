import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { storageProvider } from '@/lib/storage/provider';

// Google sends the admin back here after «Conectar Drive». The code, the state and the token
// never reach a log; the page shown afterwards only gets ?ok=1 or ?error=<code>.
export async function GET(req: NextRequest) {
  if (storageProvider() !== 'drive') return new NextResponse('No encontrado', { status: 404 });
  const { finishConnect, OAUTH_COOKIE, OAUTH_COOKIE_PATH } = await import('@/lib/storage/drive/oauth');
  const s = await getSession();
  const store = await cookies();
  const r = await finishConnect(s, req.nextUrl.searchParams, store.get(OAUTH_COOKIE)?.value);
  const to = new URL(r.ok ? '/ajustes/drive?ok=1' : `/ajustes/drive?error=${r.code}`, req.nextUrl.origin);
  const res = NextResponse.redirect(to, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  res.cookies.set(OAUTH_COOKIE, '', { path: OAUTH_COOKIE_PATH, maxAge: 0, httpOnly: true, sameSite: 'lax' });
  return res;
}
