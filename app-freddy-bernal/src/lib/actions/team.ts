'use server';

import { createElement } from 'react';
import { z } from 'zod';
import { InviteEmail } from '@emails/templates';
import { act, UserError } from './run';
import { env } from '../env';
import { withSystem } from '../db';
import { brand } from '../client-config';
import { sendEmail } from '../email/send';
import { INVITABLE_ROLES, ROLE_LABEL, type Role } from '../roles';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
  fullName: z.string().trim().min(2, 'Escribe el nombre.').max(120),
  role: z.enum(INVITABLE_ROLES as [Role, ...Role[]]),
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

const roleSchema = z.object({ userId: z.string().uuid(), role: z.enum(INVITABLE_ROLES as [Role, ...Role[]]), on: z.boolean() });

export async function setRole(raw: unknown) {
  return act(roleSchema, raw, async (sql, input, s) => {
    if (input.userId === s.userId && input.role === 'admin' && !input.on) throw new UserError('No puedes quitarte tu propio rol de administración.');
    if (input.on) await sql.query(`insert into public.user_roles (user_id, role, granted_by) values ($1, $2, auth.uid()) on conflict do nothing`, [input.userId, input.role]);
    else await sql.query(`delete from public.user_roles where user_id = $1 and role = $2`, [input.userId, input.role]);
  }, { revalidate: ['/ajustes/equipo'] });
}

const userSchema = z.object({ userId: z.string().uuid() });

export async function revokeSessions(raw: unknown) {
  return act(userSchema, raw, async (sql, input) => {
    const r = await sql.query(`update public.profiles set sessions_revoked_at = now() where id = $1 returning id`, [input.userId]);
    if (!r.length) throw new UserError('No autorizado.');
  }, { revalidate: ['/ajustes/equipo'] });
}

export async function setActive(raw: unknown) {
  return act(userSchema.extend({ active: z.boolean() }), raw, async (sql, input, s) => {
    if (input.userId === s.userId) throw new UserError('No puedes desactivarte a ti mismo.');
    await sql.query(`update public.profiles set active = $2, sessions_revoked_at = case when $2 then sessions_revoked_at else now() end where id = $1`, [input.userId, input.active]);
  }, { revalidate: ['/ajustes/equipo'] });
}

export async function revokeInvitation(raw: unknown) {
  return act(z.object({ id: z.string().uuid() }), raw, async (sql, input) => {
    await sql.query(`update public.invitations set revoked_at = now() where id = $1 and accepted_at is null`, [input.id]);
  }, { revalidate: ['/ajustes/equipo'] });
}
