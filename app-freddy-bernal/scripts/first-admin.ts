// Steps of scripts/create-first-admin.mts, apart from the script so they can be tested against the
// in-memory database (tests/unit/first-admin.test.ts). Safe to run again: it reuses a pending admin
// invitation, cleans up after a failed Auth step and never puts the email in its messages.
import type { Sql } from '../src/lib/db/core';

// Creates the person in Supabase Auth (service key). The database trigger handle_new_auth_user then
// gives them the roles of their newest pending invitation.
export type CreateAuthUser = (email: string, name: string) => Promise<{ error: string | null }>;

export type FirstAdminResult = { ok: true; reused: boolean } | { ok: false; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The script's output ends up in terminals, logs and chats (and the repository is public).
export function hideEmails(text: string): string {
  return text.replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[correo]');
}

export async function createFirstAdmin(o: { sql: Sql; email: string; name: string; createUser: CreateAuthUser; warn?: (m: string) => void }): Promise<FirstAdminResult> {
  const warn = o.warn ?? (() => {});
  const email = o.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: 'El correo no es válido.' };

  // Without the client configuration nobody would be asked for 2FA: load it first.
  if (!(await o.sql.one(`select 1 from public.app_settings where key = 'security.mfa_roles'`))) {
    return { ok: false, message: 'Falta la configuración del cliente (security.mfa_roles). Corre primero npm run db:seed-client.' };
  }

  // «Cerrar sus sesiones» deletes the person's Supabase Auth sessions, and every request reads when
  // its session began (D-25). The app degrades without these grants; warn now so they get fixed.
  const g = await o.sql.one<{ del: boolean | null; fn: boolean | null }>(
    `select case when to_regclass('auth.sessions') is null then null else has_table_privilege(current_user, 'auth.sessions', 'DELETE') end as del,
            case when to_regprocedure('public.auth_session_started(uuid)') is null then null
                 else has_function_privilege(current_user, 'public.auth_session_started(uuid)', 'EXECUTE') end as fn`,
  );
  if (g?.del === false) warn('el rol de DATABASE_URL no puede borrar en auth.sessions. «Cerrar sus sesiones» no cerrará las de Supabase.');
  if (g?.fn === null) warn('falta la migración 20261025001100_session_started.sql.');
  if (g?.fn === false) warn('el rol de DATABASE_URL no puede usar public.auth_session_started. Dale EXECUTE.');

  // The trigger takes the newest pending invitation: reuse it when it already makes them admin.
  const pending = await o.sql.one<{ admin: boolean }>(
    `select 'admin' = any(roles) as admin from public.invitations
      where lower(email) = $1 and accepted_at is null and revoked_at is null and expires_at > now()
      order by created_at desc limit 1`,
    [email],
  );
  let created: string | null = null;
  if (!pending?.admin) {
    const row = await o.sql.one<{ id: string }>(`insert into public.invitations (email, full_name, roles) values ($1, $2, '{admin}') returning id`, [email, o.name]);
    created = row!.id;
  }

  let authError: string | null;
  try {
    authError = (await o.createUser(email, o.name)).error;
  } catch (e) {
    authError = (e as Error).message || 'error desconocido';
  }
  if (authError) {
    // Leave nothing behind from this run (an invitation that was already there stays as it was).
    if (created) await o.sql.query(`update public.invitations set revoked_at = now() where id = $1 and accepted_at is null`, [created]);
    return { ok: false, message: `Supabase no creó el usuario: ${hideEmails(authError).replace(/\.$/, '')}.${created ? ' La invitación de esta corrida quedó revocada.' : ''}` };
  }

  const isAdmin = await o.sql.one(
    `select 1 from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'admin' where lower(p.email) = $1`,
    [email],
  );
  if (!isAdmin) return { ok: false, message: 'El usuario se creó, pero no quedó como administrador. Revisa public.invitations y public.user_roles.' };
  return { ok: true, reused: !created };
}
