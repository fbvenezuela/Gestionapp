import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '../env';

// Supabase client bound to the visitor's cookies (Auth only; data goes through withUser()).
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
}

// Service-role client. Server only, never imported by client code. Used to create
// invited users and to sign them out.
export function supabaseAdmin() {
  if (!env.supabaseServiceKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
