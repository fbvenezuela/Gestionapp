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

// The emails of the attention desk go to citizens (src/lib/actions/participation-core.ts, attention-email.ts): their
// address is the contact the app keeps encrypted (request_contacts, D-96), read only by who works the case. The outbox
// is read by Administración (Ajustes → Buzón), which never reads a case (D-93): with real data it keeps only a masked
// address for those, enough to tell two apart and to see that it went out, never the address itself (the security
// review of 06/11). The demo keeps it whole: invented people, and its outbox stands in for their inbox.
export const CITIZEN_TEMPLATE = /^atencion_/;

/** «ana.perez@gmail.com» → «a***@g***.com». */
export function maskEmail(address: string): string {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf('@');
  if (at < 1) return '***';
  const domain = a.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${a[0]}***@${domain[0] ?? ''}***${tld}`;
}

/** What the outbox keeps of an address. */
export function outboxAddress(to: string, template: string, mode: 'demo' | 'supabase' = env.dataMode): string {
  const a = to.toLowerCase();
  return mode === 'supabase' && CITIZEN_TEMPLATE.test(template) ? maskEmail(a) : a;
}

export async function sendEmail(opts: { to: string; subject: string; template: string; element: ReactElement; idempotencyKey: string }): Promise<SendResult> {
  const html = await render(opts.element);
  const text = await render(opts.element, { plainText: true });
  const kept = outboxAddress(opts.to, opts.template);
  const inserted = await withSystem((sql) =>
    sql.one<{ id: string }>(
      `insert into public.outbox (to_email, subject, html, text_body, template, idempotency_key)
       values ($1, $2, $3, $4, $5, $6) on conflict (idempotency_key) do nothing returning id`,
      [kept, opts.subject, html, text, opts.template, opts.idempotencyKey],
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
    // The provider's words may repeat the address: the outbox keeps what it keeps of it, never more.
    const msg = (e as Error).message.split(opts.to).join(kept).split(opts.to.toLowerCase()).join(kept).slice(0, 500);
    await withSystem((sql) => sql.query(`update public.outbox set status = 'failed', error = $2 where id = $1`, [inserted.id, msg]));
    return { stored: true, sent: false, error: msg };
  }
}
