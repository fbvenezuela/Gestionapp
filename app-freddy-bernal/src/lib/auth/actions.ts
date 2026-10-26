'use server';

import crypto from 'node:crypto';
import { createElement } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { z } from 'zod';
import { LoginCodeEmail } from '@emails/templates';
import { demoShortcuts, env } from '../env';
import { withSystem } from '../db';
import { brand } from '../client-config';
import { sendEmail } from '../email/send';
import { emailCodeSchema, totpCodeSchema } from './codes';
import { DEMO_COOKIE, SESSION_HOURS, hashCode, readSession, signSession } from './cookie';
import { getSession } from './session';
import { newTotpSecret, otpauthUrl, verifyTotp } from './totp';

export type ActionState = { ok?: boolean; error?: string; info?: string; data?: Record<string, string> };

const emailSchema = z.string().trim().toLowerCase().email('Escribe un correo válido.');

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_HOURS * 3600,
};

// Same answer whether or not the email exists, so nobody can probe who is invited.
const SENT = 'Si tu correo está invitado, te llegó un código. Revisa también la carpeta de spam.';

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
  const code = emailCodeSchema.safeParse(form.get('code'));
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
    await startDemoSession(uid, demoShortcuts() ? 'aal2' : 'aal1');
    redirect('/');
  }

  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: 'email' });
  if (error) return { error: 'El código no es correcto o ya venció. Pide uno nuevo.' };
  redirect('/');
}

async function startDemoSession(uid: string, aal: 'aal1' | 'aal2') {
  const now = Math.floor(Date.now() / 1000);
  (await cookies()).set(DEMO_COOKIE, signSession({ uid, aal, iat: now, exp: now + SESSION_HOURS * 3600, sid: crypto.randomUUID() }), cookieOpts);
}

// Testing shortcut: enter as a demo user with one tap (no code, no 2FA). Refuses
// unless the app runs on the in-memory demo database with shortcuts on, and only for
// the invented demo accounts.
export async function demoQuickLogin(email: string): Promise<ActionState> {
  if (!demoShortcuts()) return { error: 'No disponible.' };
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success || !parsed.data.endsWith('@demo.test')) return { error: 'No disponible.' };
  const uid = await withSystem(
    async (sql) => (await sql.one<{ id: string }>(`select id from public.profiles where email = $1 and active and deleted_at is null`, [parsed.data]))?.id ?? null,
  );
  if (!uid) return { error: 'Ese usuario de prueba no existe.' };
  await startDemoSession(uid, 'aal2');
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
export type MfaSetup = { error?: string; enrolled?: boolean; factorId?: string; secret?: string; qr?: string };

const NOT_READY = 'No se pudo preparar el código QR. Espera un momento y vuelve a intentar.';

const qrFor = (uri: string) => QRCode.toDataURL(uri, { margin: 1, width: 220 });

// The «Mostrar el código QR» button on /doble-factor: drops half-finished enrollments and starts
// a new one, so only the QR now on screen works. The page itself never enrolls (src/lib/auth/mfa.ts).
// A verified factor is never touched: then it only answers enrolled and the page asks for the code.
export async function mfaEnroll(): Promise<MfaSetup> {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (s.mfaOk) redirect('/');

  if (env.dataMode === 'demo') {
    // Demo keeps one secret per person until it is verified (as it always did).
    const secret = await withSystem(async (sql) => {
      const f = await sql.one<{ secret: string; verified: boolean }>(`select secret, verified from demo_auth.totp_factors where user_id = $1`, [s.userId]);
      if (f?.verified) return null;
      if (f) return f.secret;
      const fresh = newTotpSecret();
      await sql.query(`insert into demo_auth.totp_factors (user_id, secret) values ($1, $2)`, [s.userId, fresh]);
      return fresh;
    });
    if (!secret) return { enrolled: true };
    return { secret, qr: await qrFor(otpauthUrl(secret, s.email, brand.shortName)) };
  }

  const { supabaseServer } = await import('../supabase/server');
  const supabase = await supabaseServer();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError || !factors) return { error: NOT_READY };
  if (factors.totp.some((f) => f.status === 'verified')) return { enrolled: true };
  for (const f of factors.all) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Teléfono ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: NOT_READY };
  return { factorId: data.id, secret: data.totp.secret, qr: await qrFor(data.totp.uri) };
}

export async function mfaVerify(_: ActionState, form: FormData): Promise<ActionState> {
  const code = totpCodeSchema.safeParse(form.get('code'));
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
