'use server';

import { createElement } from 'react';
import { z } from 'zod';
import { InviteEmail } from '@emails/templates';
import { act, UserError } from './run';
import { env } from '../env';
import { withSystem } from '../db';
import { endAuthSessions } from '../auth/revoke';
import { brand } from '../client-config';
import { sendEmail } from '../email/send';
import { INVITABLE_ROLES, ROLE_LABEL } from '../roles';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
  fullName: z.string().trim().min(2, 'Escribe el nombre.').max(120),
  role: z.enum(INVITABLE_ROLES, 'Ese rol no es del equipo.'),
});

export async function inviteUser(raw: unknown) {
  return act(inviteSchema, raw, async (sql, input, s) => {
    if (!s.roles.includes('admin')) throw new UserError('Solo administración invita.');
    const existing = await sql.one<{ id: string }>(`select id from public.profiles where email = $1`, [input.email]);
    if (existing) {
      await sql.query(`insert into public.user_roles (user_id, role, granted_by) values ($1, $2, auth.uid()) on conflict do nothing`, [existing.id, input.role]);
    } else {
      await sql.query(`insert into public.invitations (email, full_name, roles, invited_by) values ($1, $2, $3::public.app_role[], auth.uid())`, [
        input.email,
        input.fullName,
        `{${input.role}}`,
      ]);
    }
    return { existing: !!existing };
  }, { revalidate: ['/ajustes/equipo'] }).then(async (r) => {
    if (!r.ok) return r;
    const input = inviteSchema.parse(raw);
    if (!r.data?.existing) {
      // Create the sign-in account; the database trigger assigns the invited role.
      if (env.dataMode === 'demo') {
        await withSystem((sql) => sql.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::text::jsonb) on conflict (email) do nothing`, [input.email, JSON.stringify({ full_name: input.fullName })]));
      } else {
        const { supabaseAdmin } = await import('../supabase/server');
        const { error } = await supabaseAdmin().auth.admin.createUser({ email: input.email, email_confirm: true, user_metadata: { full_name: input.fullName } });
        if (error && !/already/i.test(error.message)) return { ok: false as const, error: 'No se pudo crear la cuenta. Revisa la configuración de Supabase.' };
      }
    }
    await sendEmail({
      to: input.email,
      subject: `Te invitaron a ${brand.appName}`,
      template: 'invite',
      element: createElement(InviteEmail, { appName: brand.appName, name: input.fullName, roleLabel: ROLE_LABEL[input.role], url: `${env.appUrl}/entrar` }),
      idempotencyKey: `invite:${input.email}:${input.role}:${new Date().toISOString().slice(0, 13)}`,
    });
    return { ok: true as const, message: r.data?.existing ? 'Rol agregado.' : 'Invitación enviada.' };
  });
}

const roleSchema = z.object({ userId: z.string().uuid(), role: z.enum(INVITABLE_ROLES, 'Ese rol no es del equipo.'), on: z.boolean() });

export async function setRole(raw: unknown) {
  return act(roleSchema, raw, async (sql, input, s) => {
    if (input.userId === s.userId && input.role === 'admin' && !input.on) throw new UserError('No puedes quitarte tu propio rol de administración.');
    if (input.on) await sql.query(`insert into public.user_roles (user_id, role, granted_by) values ($1, $2, auth.uid()) on conflict do nothing`, [input.userId, input.role]);
    else await sql.query(`delete from public.user_roles where user_id = $1 and role = $2`, [input.userId, input.role]);
  }, { revalidate: ['/ajustes/equipo'] });
}

const userSchema = z.object({ userId: z.string().uuid() });

// The Auth step runs after the profile change is committed (sessions_revoked_at set), and the app
// already refuses their old sessions (readClaims checks when each one began): a failed Auth delete
// is a partial success, not an error that would make the admin think nothing happened.
const AUTH_NOT_ENDED = 'No se pudieron borrar sus sesiones en Supabase, pero la app ya no las acepta.';
const partial = <T extends { ok: true }>(res: T) => ({ ...res, message: `Listo. ${AUTH_NOT_ENDED}` });

// The database also drops their phones' notices (migration 20261025001000_revoke_push.sql).
export async function revokeSessions(raw: unknown) {
  const res = await act(userSchema, raw, async (sql, input) => {
    const r = await sql.query(`update public.profiles set sessions_revoked_at = now() where id = $1 returning id`, [input.userId]);
    if (!r.length) throw new UserError('No autorizado.');
  }, { revalidate: ['/ajustes/equipo'] });
  if (!res.ok) return res;
  return (await endSessionsAfter(userSchema.parse(raw).userId)).error ? partial(res) : res;
}

const activeSchema = userSchema.extend({ active: z.boolean() });

export async function setActive(raw: unknown) {
  const res = await act(activeSchema, raw, async (sql, input, s) => {
    if (input.userId === s.userId) throw new UserError('No puedes desactivarte a ti mismo.');
    // RLS lets only admin change someone else: 0 rows means no, and then no Auth step either.
    const r = await sql.query(`update public.profiles set active = $2, sessions_revoked_at = case when $2 then sessions_revoked_at else now() end where id = $1 returning id`, [input.userId, input.active]);
    if (!r.length) throw new UserError('No autorizado.');
  }, { revalidate: ['/ajustes/equipo'] });
  if (!res.ok) return res;
  const input = activeSchema.parse(raw);
  return !input.active && (await endSessionsAfter(input.userId)).error ? partial(res) : res;
}

// After act() has returned (never inside it): also end their sign-in sessions in Supabase Auth,
// so a renewed token on the old phone cannot bring them back. Never throws.
async function endSessionsAfter(userId: string): Promise<{ ended: number | null; error: string | null }> {
  try {
    return { ended: await endAuthSessions(userId), error: null };
  } catch (e) {
    const error = (e as Error).message.slice(0, 300);
    console.error('[sessions]', error);
    return { ended: null, error };
  }
}

export async function revokeInvitation(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, input) => {
    await sql.query(`update public.invitations set revoked_at = now() where id = $1 and accepted_at is null`, [input.id]);
  }, { revalidate: ['/ajustes/equipo'] });
}

// Someone lost or changed their phone: admin removes their two-factor so they enroll again at
// the next sign-in. Their open sessions are closed too (whoever has the old phone stays out).
export async function resetTwoFactor(raw: unknown) {
  return act(userSchema, raw, async (sql, input, s) => {
    if (!s.roles.includes('admin')) throw new UserError('Solo administración puede hacer esto.');
    if (input.userId === s.userId) throw new UserError('Tu propio doble factor lo reinicia otra persona de administración.');
    const ok = await sql.one<{ ok: boolean }>(`select public.has_role('admin') and public.mfa_ok() as ok`);
    if (!ok?.ok) throw new UserError('No autorizado.');
    const r = await sql.one<{ email: string }>(
      `update public.profiles set sessions_revoked_at = now() where id = $1 and deleted_at is null returning email`,
      [input.userId],
    );
    if (!r) throw new UserError('No se encontró a esa persona.');
    return { actorId: s.userId, email: r.email };
  }, { revalidate: ['/ajustes/equipo'] }).then(async (res) => {
    if (!res.ok || !res.data) return res;
    const { userId } = userSchema.parse(raw);
    const { actorId, email } = res.data;
    // Two independent steps: the factors go even when deleting the Auth sessions fails (else whoever
    // lost the phone could never be reset, every retry failing the same way).
    const { ended, error: authError } = await endSessionsAfter(userId);
    let removed: number;
    try {
      removed = env.dataMode === 'demo' ? await removeDemoFactors(userId) : await removeSupabaseFactors(userId);
    } catch (e) {
      console.error('[mfa reset]', (e as Error).message);
      return { ok: false as const, error: 'No se pudo quitar el doble factor. Sus sesiones sí quedaron cerradas; vuelve a intentar.' };
    }
    try {
      // Auth factors live outside the audited tables: leave an explicit note in the audit trail.
      await withSystem((sql) =>
        sql.query(`insert into public.audit_log (actor_id, table_name, row_id, action, new_data) values ($1, 'two_factor', $2, 'mfa_reset', $3::text::jsonb)`, [
          actorId,
          userId,
          JSON.stringify({ email, factors_removed: removed, sessions_closed: true, auth_sessions_ended: ended, auth_sessions_error: authError }),
        ]),
      );
    } catch (e) {
      // The reset already happened: say so, and leave the missing note in the server log.
      console.error('[mfa reset] audit:', (e as Error).message);
    }
    const done = 'Listo. La próxima vez que entre, tendrá que activar el doble factor otra vez.';
    return { ok: true as const, message: authError ? `${done} ${AUTH_NOT_ENDED}` : done };
  });
}

async function removeDemoFactors(userId: string): Promise<number> {
  return withSystem(async (sql) => (await sql.query(`delete from demo_auth.totp_factors where user_id = $1 returning user_id`, [userId])).length);
}

// Supabase Auth admin API with the service key (server only).
async function removeSupabaseFactors(userId: string): Promise<number> {
  const { supabaseAdmin } = await import('../supabase/server');
  const mfa = supabaseAdmin().auth.admin.mfa;
  const { data, error } = await mfa.listFactors({ userId });
  if (error) throw error;
  for (const f of data?.factors ?? []) {
    const { error: e } = await mfa.deleteFactor({ id: f.id, userId });
    if (e) throw e;
  }
  return data?.factors.length ?? 0;
}
