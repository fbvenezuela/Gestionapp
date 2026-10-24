import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { demoShortcuts, env } from '../env';
import { withSystem, withUser, type Claims, type Sql } from '../db';
import { DEMO_COOKIE, readSession } from './cookie';
import { revokedSession } from './revoke';
import { ROLES, homeFor, type Role } from '../roles';
import { noPermissionUrl } from '../../components/shell/no-permission';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (revokedSession(revoked.revoked, p.iat, null)) return null;
    // Testing shortcuts (demo data only): every demo session counts as 2FA-verified.
    return { sub: p.uid, aal: demoShortcuts() ? 'aal2' : p.aal, session_id: p.sid, role: 'authenticated' };
  }
  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims as (Claims & { iat?: number }) | undefined;
  if (!c?.sub) return null;
  // One query: the person's state and when this token's Auth session began, so a token renewed
  // after «Cerrar sus sesiones» (fresh iat, same old session) stays out.
  const sid = c.session_id && UUID.test(c.session_id) ? c.session_id : null;
  const st = await withSystem((sql) =>
    sql.one<{ revoked: Date | string | null; active: boolean; started: Date | string | null }>(
      `select p.sessions_revoked_at as revoked, p.active and p.deleted_at is null as active,
              (select s.created_at from auth.sessions s where s.id = $2::uuid) as started
         from public.profiles p where p.id = $1`,
      [c.sub, sid],
    ),
  );
  if (!st || !st.active) return null;
  if (revokedSession(st.revoked, c.iat, st.started)) return null;
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

// A screen that is not for the person's role sends them to their own home (the boss has no
// Hoy) with a polite note: ?sin-permiso=1 (see components/shell/no-permission-banner.tsx).
export async function requireRole(...allowed: Role[]): Promise<Session> {
  const s = await requireSession();
  if (!s.roles.some((r) => allowed.includes(r))) redirect(noPermissionUrl(homeFor(s.roles)));
  return s;
}

// Menus follow "Ver como…" for admins; permissions never do.
export function menuRoles(s: Session): Role[] {
  return s.viewAs ? [s.viewAs] : s.roles;
}

export async function db<T>(s: Session, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return withUser(s.claims, fn);
}
