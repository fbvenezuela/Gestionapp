import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Keeps the Supabase session cookies fresh. Authorization itself happens in the
// pages (requireSession) and in the database (RLS), never here.
export async function proxy(request: NextRequest) {
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|sw.js|offline.html|manifest.webmanifest|icon|apple-icon|.*\\.(?:png|jpg|svg|ico)$).*)'],
};
