import 'server-only';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { env } from '../env';
import { withSystem } from '../db';

export type SendResult = { stored: boolean; sent: boolean; error?: string };

// Every email goes to the `outbox` table first (with an idempotency key so a notice
// is never sent twice). It only leaves the platform when EMAIL_MODE=send, real data
// is in use, and we are on production — or the address is a Resend test inbox.
export function canDeliver(to: string): boolean {
  if (env.email.mode !== 'send' || !env.email.resendKey) return false;
  if (env.dataMode === 'demo') return false;
  if (to.endsWith('.test')) return false;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return /@resend\.dev$/i.test(to);
  return true;
}

export async function sendEmail(opts: { to: string; subject: string; template: string; element: ReactElement; idempotencyKey: string }): Promise<SendResult> {
  const html = await render(opts.element);
  const text = await render(opts.element, { plainText: true });
  const inserted = await withSystem((sql) =>
    sql.one<{ id: string }>(
      `insert into public.outbox (to_email, subject, html, text_body, template, idempotency_key)
       values ($1, $2, $3, $4, $5, $6) on conflict (idempotency_key) do nothing returning id`,
      [opts.to.toLowerCase(), opts.subject, html, text, opts.template, opts.idempotencyKey],
    ),
  );
  if (!inserted) return { stored: false, sent: false };
  if (!canDeliver(opts.to)) return { stored: true, sent: false };

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(env.email.resendKey);
    const { data, error } = await resend.emails.send(
      { from: env.email.from, to: opts.to, subject: opts.subject, html, text },
      { idempotencyKey: opts.idempotencyKey },
    );
    if (error) throw new Error(error.message);
    await withSystem((sql) => sql.query(`update public.outbox set status = 'sent', provider_id = $2, sent_at = now() where id = $1`, [inserted.id, data?.id ?? null]));
    return { stored: true, sent: true };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await withSystem((sql) => sql.query(`update public.outbox set status = 'failed', error = $2 where id = $1`, [inserted.id, msg]));
    return { stored: true, sent: false, error: msg };
  }
}
