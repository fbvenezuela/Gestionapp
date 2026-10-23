import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '../env';
import { withSystem, withUser, type Claims, type Sql } from '../db';
import { DEMO_COOKIE, readSession } from './cookie';
import { ROLES, type Role } from '../roles';

export type Session = {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  aal: 'aal1' | 'aal2';
  mfaRequired: boolean;
  mfaOk: boolean;
  claims: Claims;
  // Admin-only preview of another role's menus. Never grants permissions.
  viewAs: Role | null;
};

async function readClaims(): Promise<Claims | null> {
  if (env.dataMode === 'demo') {
    const store = await cookies();
    const p = readSession(store.get(DEMO_COOKIE)?.value);
    if (!p) return null;
    const revoked = await withSystem((sql) =>
      sql.one<{ revoked: string | null; active: boolean }>(
        `select sessions_revoked_at as revoked, active and deleted_at is null as active from public.profiles where id = $1`,
        [p.uid],
      ),
    );
    if (!revoked || !revoked.active) return null;
    if (revoked.revoked && new Date(revoked.revoked).getTime() > p.iat * 1000) return null;
    return { sub: p.uid, aal: p.aal, session_id: p.sid, role: 'authenticated' };
  }
  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims as (Claims & { iat?: number }) | undefined;
  if (!c?.sub) return null;
  const st = await withSystem((sql) =>
    sql.one<{ revoked: string | null; active: boolean }>(
      `select sessions_revoked_at as revoked, active and deleted_at is null as active from public.profiles where id = $1`,
      [c.sub],
    ),
  );
  if (!st || !st.active) return null;
  if (st.revoked && c.iat && new Date(st.revoked).getTime() > c.iat * 1000) return null;
  return { sub: c.sub, email: c.email, aal: (c.aal as 'aal1' | 'aal2') ?? 'aal1', session_id: c.session_id, role: 'authenticated' };
}

export const getSession = cache(async (): Promise<Session | null> => {
  const claims = await readClaims();
  if (!claims) return null;
  const info = await withUser(claims, async (sql) => {
    const p = await sql.one<{ email: string; full_name: string }>(`select email, full_name from public.profiles where id = auth.uid()`);
    const roles = await sql.query<{ role: Role }>(`select role from public.user_roles where user_id = auth.uid()`);
    // Never nest withSystem inside withUser: the demo database runs one transaction at a time.
    const mfaRoles = await sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'security.mfa_roles'`);
    return { p, roles: roles.map((r) => r.role), mfaRoles: mfaRoles?.value ?? [] };
  });
  if (!info.p) return null;
  const mfaRequired = info.roles.some((r) => info.mfaRoles.includes(r));
  const store = await cookies();
  const va = store.get('fb_view_as')?.value as Role | undefined;
  const viewAs = info.roles.includes('admin') && va && (ROLES as readonly string[]).includes(va) ? va : null;
  return {
    userId: claims.sub,
    email: info.p.email,
    name: info.p.full_name || info.p.email,
    roles: info.roles,
    aal: claims.aal ?? 'aal1',
    mfaRequired,
    mfaOk: !mfaRequired || claims.aal === 'aal2',
    claims,
    viewAs,
  };
});

// For pages: signed in, with a role, and with 2FA when the role requires it.
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (s.roles.length === 0) redirect('/sin-acceso');
  if (!s.mfaOk) redirect('/doble-factor');
  return s;
}

export async function requireRole(...allowed: Role[]): Promise<Session> {
  const s = await requireSession();
  if (!s.roles.some((r) => allowed.includes(r))) redirect('/hoy');
  return s;
}

// Menus follow "Ver como…" for admins; permissions never do.
export function menuRoles(s: Session): Role[] {
  return s.viewAs ? [s.viewAs] : s.roles;
}

export async function db<T>(s: Session, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return withUser(s.claims, fn);
}
