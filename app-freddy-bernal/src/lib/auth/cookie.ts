import crypto from 'node:crypto';

// Signed session cookie for the demo sign-in (no Supabase). HMAC-SHA256.
export type DemoSessionPayload = { uid: string; aal: 'aal1' | 'aal2'; iat: number; exp: number; sid: string };

export const DEMO_COOKIE = 'fb_session';
export const SESSION_HOURS = 12;

export function demoSecret(): string {
  // Demo data is invented; in demo mode a fixed fallback keeps sessions valid across
  // serverless instances. With real data (Supabase) this cookie is not used.
  return process.env.SESSION_SECRET || 'demo-only-not-a-secret-change-me';
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString('base64url');
}

export function signSession(p: DemoSessionPayload, secret = demoSecret()): string {
  const body = b64url(JSON.stringify(p));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function readSession(token: string | undefined, secret = demoSecret()): DemoSessionPayload | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as DemoSessionPayload;
    if (p.exp * 1000 < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export function hashCode(email: string, code: string) {
  return crypto.createHmac('sha256', demoSecret()).update(`${email.toLowerCase()}:${code}`).digest('hex');
}
