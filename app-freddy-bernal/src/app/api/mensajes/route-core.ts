import 'server-only';
import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth/session';
import { isTeamRole } from '@/lib/roles';

// The two GET routes of Mensajes' loop (R3, D-56): the same session as the pages, as the person (db(session)), never
// stored by the browser or a proxy. No session (or 2FA missing) → 401 with no body; an account with Administración or
// without a team role → 404 (Mensajes does not exist for it, D-49). They never log their parameters.

export const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Vary: 'Cookie' } as const;

export type Gate = { ok: true; s: Session } | { ok: false; res: NextResponse };

export async function teamSession(): Promise<Gate> {
  const s = await getSession();
  if (!s || !s.mfaOk || !s.roles.length) return { ok: false, res: new NextResponse(null, { status: 401, headers: NO_STORE }) };
  if (s.roles.includes('admin') || !s.roles.some((r) => isTeamRole(r))) return { ok: false, res: notFound() };
  return { ok: true, s };
}

export const notFound = () => new NextResponse(null, { status: 404, headers: NO_STORE });

export const json = (data: unknown) => NextResponse.json(data, { headers: NO_STORE });
