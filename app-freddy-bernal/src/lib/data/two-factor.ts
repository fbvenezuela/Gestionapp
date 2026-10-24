import 'server-only';
import { env } from '@/lib/env';
import { withSystem } from '@/lib/db';

// Who has two-factor active (a verified TOTP factor). Sign-in factors live outside the API
// tables (demo: demo_auth, Supabase: Auth), so this reads them as the system. Only call it
// from an admin-only page, and never inside db()/withUser (the demo database would lock).
// Returns null when it cannot be read (e.g. Supabase keys missing): the page then says nothing.
export async function twoFactorUsers(userIds: string[]): Promise<Set<string> | null> {
  if (!userIds.length) return new Set();
  try {
    if (env.dataMode === 'demo') {
      const rows = await withSystem((sql) =>
        sql.query<{ user_id: string }>(`select user_id from demo_auth.totp_factors where verified and user_id = any($1::uuid[])`, [userIds]),
      );
      return new Set(rows.map((r) => r.user_id));
    }
    const { supabaseAdmin } = await import('@/lib/supabase/server');
    const mfa = supabaseAdmin().auth.admin.mfa;
    const out = new Set<string>();
    await Promise.all(
      userIds.map(async (userId) => {
        const { data, error } = await mfa.listFactors({ userId });
        if (error) throw error;
        if (data?.factors.some((f) => f.status === 'verified')) out.add(userId);
      }),
    );
    return out;
  } catch (e) {
    console.warn('[mfa status]', (e as Error).message);
    return null;
  }
}
