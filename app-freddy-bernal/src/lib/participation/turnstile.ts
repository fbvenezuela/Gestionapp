import 'server-only';
import { env } from '../env';

// Cloudflare Turnstile on the public forms (design §4): ON only when TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are
// both set (production, with Juan's account); otherwise off, and the honeypot field and the persistent limits by device
// and network keep working. The token is checked here, on the server, once per send.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled(cfg: { siteKey: string; secretKey: string } = env.turnstile): boolean {
  return !!(cfg.siteKey && cfg.secretKey);
}

/** Whether Cloudflare accepts this token. No answer, a bad one or a timeout is false (the person tries again). */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string,
  opts: { secretKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  const secret = opts.secretKey ?? env.turnstile.secretKey;
  if (!secret || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
