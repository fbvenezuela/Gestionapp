import 'server-only';
import { withSystem, type Sql } from '../db';

// Closing someone's sessions (also «Reiniciar doble factor» and turning them off) must kill
// their refresh tokens too. With Supabase Auth the access token is renewed from the
// refresh-token cookie, and a renewed token has a fresh iat that would pass the
// sessions_revoked_at check again. Deleting auth.sessions cascades to auth.refresh_tokens.
// The demo/test auth shim has no auth.sessions (the demo cookie is never renewed): no-op there.
export async function deleteAuthSessions(sql: Sql, userId: string): Promise<number> {
  const has = await sql.one<{ ok: boolean }>(`select to_regclass('auth.sessions') is not null as ok`);
  if (!has?.ok) return 0;
  return (await sql.query(`delete from auth.sessions where user_id = $1 returning id`, [userId])).length;
}

// A system step: call it after act()/withUser has returned, never inside it (the demo
// database runs one transaction at a time).
export function endAuthSessions(userId: string): Promise<number> {
  return withSystem((sql) => deleteAuthSessions(sql, userId));
}

// True when a token belongs to a session opened before the last «Cerrar sus sesiones». A
// renewed token keeps its session but gets a fresh iat, so the session's start wins when known.
export function revokedSession(revokedAt: Date | string | null, iat: number | undefined, sessionStart: Date | string | null): boolean {
  if (!revokedAt) return false;
  const cut = new Date(revokedAt).getTime();
  if (sessionStart && new Date(sessionStart).getTime() <= cut) return true;
  return !!iat && cut > iat * 1000;
}
