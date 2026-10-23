'use server';

import crypto from 'node:crypto';
import { createElement } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { LoginCodeEmail } from '@emails/templates';
import { env } from '../env';
import { withSystem } from '../db';
import { brand } from '../client-config';
import { sendEmail } from '../email/send';
import { DEMO_COOKIE, SESSION_HOURS, hashCode, readSession, signSession } from './cookie';
import { newTotpSecret, otpauthUrl, verifyTotp } from './totp';

export type ActionState = { ok?: boolean; error?: string; info?: string; data?: Record<string, string> };

const emailSchema = z.string().trim().toLowerCase().email('Escribe un correo válido.');
const codeSchema = z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 números.');

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_HOURS * 3600,
};

// Same answer whether or not the email exists, so nobody can probe who is invited.
const SENT = 'Si tu correo está invitado, te llegó un código de 6 números. Revisa también la carpeta de spam.';

export async function requestCode(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(form.get('email'));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data;

  if (env.dataMode === 'demo') {
    const exists = await withSystem((sql) =>
      sql.one(`select 1 from public.profiles where email = $1 and active and deleted_at is null`, [email]),
    );
    if (exists) {
      const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      await withSystem((sql) =>
        sql.query(
          `insert into demo_auth.login_codes (email, code_hash, expires_at, attempts) values ($1, $2, now() + interval '10 minutes', 0)
           on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
          [email, hashCode(email, code)],
        ),
      );
      await sendEmail({
        to: email,
        subject: `Tu código para entrar: ${code}`,
        template: 'login_code',
        element: createElement(LoginCodeEmail, { appName: brand.appName, code }),
        idempotencyKey: `login:${email}:${crypto.randomUUID()}`,
      });
    }
    return { ok: true, info: SENT, data: { email } };
  }

  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error && error.status === 429) return { error: 'Pediste muchos códigos seguidos. Espera un minuto y vuelve a intentar.' };
  return { ok: true, info: SENT, data: { email } };
}

export async function verifyCode(_: ActionState, form: FormData): Promise<ActionState> {
  const email = emailSchema.safeParse(form.get('email'));
  const code = codeSchema.safeParse(form.get('code'));
  if (!email.success) return { error: email.error.issues[0].message };
  if (!code.success) return { error: code.error.issues[0].message };

  if (env.dataMode === 'demo') {
    const uid = await withSystem(async (sql) => {
      const row = await sql.one<{ code_hash: string; expired: boolean; attempts: number }>(
        `select code_hash, expires_at < now() as expired, attempts from demo_auth.login_codes where email = $1`,
        [email.data],
      );
      if (!row || row.expired || row.attempts >= 5) return null;
      if (row.code_hash !== hashCode(email.data, code.data)) {
        await sql.query(`update demo_auth.login_codes set attempts = attempts + 1 where email = $1`, [email.data]);
        return null;
      }
      await sql.query(`delete from demo_auth.login_codes where email = $1`, [email.data]);
      return (await sql.one<{ id: string }>(`select id from public.profiles where email = $1`, [email.data]))?.id ?? null;
    });
    if (!uid) return { error: 'El código no es correcto o ya venció. Pide uno nuevo.' };
    const now = Math.floor(Date.now() / 1000);
    (await cookies()).set(DEMO_COOKIE, signSession({ uid, aal: 'aal1', iat: now, exp: now + SESSION_HOURS * 3600, sid: crypto.randomUUID() }), cookieOpts);
    redirect('/');
  }

  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: 'email' });
  if (error) return { error: 'El código no es correcto o ya venció. Pide uno nuevo.' };
  redirect('/');
}

export async function signOut() {
  if (env.dataMode === 'demo') {
    (await cookies()).delete(DEMO_COOKIE);
  } else {
    const { supabaseServer } = await import('../supabase/server');
    await (await supabaseServer()).auth.signOut();
  }
  (await cookies()).delete('fb_view_as');
  redirect('/entrar');
}

// ---------------------------------------------------------------------------
// Two-factor (TOTP)
// ---------------------------------------------------------------------------
export type MfaStatus = { enrolled: boolean; secret?: string; uri?: string; factorId?: string; qr?: string };

async function demoUid(): Promise<string | null> {
  return readSession((await cookies()).get(DEMO_COOKIE)?.value)?.uid ?? null;
}

export async function mfaStart(): Promise<MfaStatus> {
  if (env.dataMode === 'demo') {
    const uid = await demoUid();
    if (!uid) redirect('/entrar');
    return withSystem(async (sql) => {
      const f = await sql.one<{ secret: string; verified: boolean }>(`select secret, verified from demo_auth.totp_factors where user_id = $1`, [uid]);
      if (f?.verified) return { enrolled: true };
      const secret = f?.secret ?? newTotpSecret();
      if (!f) await sql.query(`insert into demo_auth.totp_factors (user_id, secret) values ($1, $2)`, [uid, secret]);
      const email = (await sql.one<{ email: string }>(`select email from public.profiles where id = $1`, [uid]))!.email;
      return { enrolled: false, secret, uri: otpauthUrl(secret, email, brand.shortName) };
    });
  }
  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === 'verified');
  if (verified) return { enrolled: true, factorId: verified.id };
  // Clean half-finished enrollments, then start a new one.
  for (const f of factors?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Teléfono ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) throw new Error('No se pudo iniciar el doble factor.');
  return { enrolled: false, factorId: data.id, secret: data.totp.secret, uri: data.totp.uri, qr: data.totp.qr_code };
}

export async function mfaVerify(_: ActionState, form: FormData): Promise<ActionState> {
  const code = codeSchema.safeParse(form.get('code'));
  if (!code.success) return { error: code.error.issues[0].message };

  if (env.dataMode === 'demo') {
    const store = await cookies();
    const s = readSession(store.get(DEMO_COOKIE)?.value);
    if (!s) redirect('/entrar');
    const ok = await withSystem(async (sql) => {
      const f = await sql.one<{ secret: string }>(`select secret from demo_auth.totp_factors where user_id = $1`, [s.uid]);
      if (!f || !verifyTotp(f.secret, code.data)) return false;
      await sql.query(`update demo_auth.totp_factors set verified = true where user_id = $1`, [s.uid]);
      return true;
    });
    if (!ok) return { error: 'El código no coincide. Mira que la hora del teléfono esté bien y usa el código que se ve ahora.' };
    store.set(DEMO_COOKIE, signSession({ ...s, aal: 'aal2' }), cookieOpts);
    redirect('/');
  }

  const factorId = String(form.get('factorId') ?? '');
  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) return { error: 'El código no coincide. Mira que la hora del teléfono esté bien y usa el código que se ve ahora.' };
  redirect('/');
}
