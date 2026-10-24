'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { isAllowedEndpoint } from '../push/endpoint';
import { sendToSubscriptions, type PushSub } from '../push/deliver';
import { vapidConfig } from '../push/config';

export async function markAllRead() {
  return act(z.object({}), {}, async (sql) => {
    await sql.query(`update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null`);
  }, { revalidate: ['/avisos'] });
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida.');

export async function updateProfile(raw: unknown) {
  return act(
    z.object({
      fullName: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(40).default(''),
      // Per-kind on/off (booleans) plus quiet hours: quiet (on/off), quiet_from / quiet_to ("21:00").
      prefs: z
        .record(z.string().max(40), z.union([z.boolean(), hhmm]))
        .refine((p) => Object.keys(p).length <= 40, 'Demasiadas preferencias.')
        .refine((p) => Object.entries(p).every(([k, v]) => (k === 'quiet_from' || k === 'quiet_to' ? typeof v === 'string' : typeof v === 'boolean')), 'Revisa las preferencias.')
        .default({}),
    }),
    raw,
    async (sql, i) => {
      await sql.query(`update public.profiles set full_name = $1, phone = nullif($2, ''), notify_prefs = $3::text::jsonb where id = auth.uid()`, [i.fullName, i.phone, JSON.stringify(i.prefs)]);
    },
    { revalidate: ['/perfil'] },
  );
}

const subscriptionInput = z.object({
  endpoint: z.string().max(1000).refine(isAllowedEndpoint, 'Este navegador no es compatible con los avisos.'),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  userAgent: z.string().max(300).default(''),
});

// This phone accepted notifications: keep its subscription for the person signed in.
export async function savePushSubscription(raw: unknown) {
  return act(
    subscriptionInput,
    raw,
    async (sql, i) => {
      await sql.query(`select public.save_push_subscription($1, $2, $3, $4)`, [i.endpoint, i.p256dh, i.auth, i.userAgent]);
    },
    { revalidate: ['/perfil'] },
  );
}

// On opening «Mi perfil» when this browser already has a subscription: make sure the row is the
// signed-in person's (shared phone, or a row the server dropped). Silent and idempotent; only
// writes when the row is missing or belongs to someone else. RLS only shows the person's rows.
export async function syncPushSubscription(raw: unknown): Promise<Result<{ changed: boolean }>> {
  return act(subscriptionInput, raw, async (sql, i) => {
    const mine = await sql.one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions where endpoint = $1 and p256dh = $2 and auth = $3`, [i.endpoint, i.p256dh, i.auth]);
    if (mine?.n) return { changed: false };
    await sql.query(`select public.save_push_subscription($1, $2, $3, $4)`, [i.endpoint, i.p256dh, i.auth, i.userAgent]);
    return { changed: true };
  });
}

export async function removePushSubscription(raw: unknown) {
  return act(
    z.object({ endpoint: z.string().max(1000) }),
    raw,
    async (sql, i) => {
      await sql.query(`delete from public.push_subscriptions where endpoint = $1 and user_id = auth.uid()`, [i.endpoint]);
    },
    { revalidate: ['/perfil'] },
  );
}

// «Probar aviso»: only to the phones of the person who taps it. Read with RLS, sent after the
// transaction ends.
export async function sendTestPush(): Promise<Result> {
  if (!vapidConfig()) return { ok: false, error: 'Los avisos al teléfono están apagados en el servidor.' };
  const r = await act(z.object({}), {}, async (sql) => {
    const subs = await sql.query<PushSub>(`select endpoint, p256dh, auth from public.push_subscriptions where user_id = auth.uid()`);
    if (!subs.length) throw new UserError('Este teléfono todavía no tiene los avisos activos.');
    return subs;
  });
  if (!r.ok) return r;
  const out = await sendToSubscriptions(r.data ?? [], { title: 'Aviso de prueba', body: 'Si ves esto, los avisos llegan a este teléfono.', url: '/perfil', tag: 'test', kind: 'test' }, { urgency: 'high', ttlSeconds: 600 });
  if (out.ok) return { ok: true, message: 'Enviado. Revisa el teléfono.' };
  if (out.gone) return { ok: false, error: 'El teléfono ya no acepta avisos. Toca «Activar avisos» otra vez.' };
  return { ok: false, error: 'No se pudo enviar. Revisa la señal y vuelve a intentar.' };
}
