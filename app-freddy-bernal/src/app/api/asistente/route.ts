import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { handleTurn, isTeamMember, MAX_QUESTION, toApi } from '@/lib/assistant';

// POST /api/asistente — the team assistant (docs/ASISTENTE.md). The window sends only the
// question, its conversation id and the pattern of the screen it is on (/eventos/[id]: never an
// id); who asks, the scope and the thread come from the server. Same checks as requireSession
// (signed in, with a role, 2FA when the role needs it), but answered as JSON for the window
// instead of a redirect.

const Body = z.object({
  pregunta: z.string().trim().min(1, 'Escribe tu pregunta.').max(MAX_QUESTION, `La pregunta es muy larga (máximo ${MAX_QUESTION} caracteres).`),
  conversacion: z.string().uuid().nullish(),
  // A screen that is not a pattern is dropped, never an error the person would see (handleTurn checks it is one of
  // SCREENS as it is).
  pantalla: z.string().regex(/^\/[a-z0-9\-/[\]]{1,80}$/).nullish().catch(null),
});

export async function POST(req: NextRequest) {
  if (!env.assistant.enabled) return NextResponse.json({ error: 'El asistente está apagado.' }, { status: 404 });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Tienes que entrar de nuevo.' }, { status: 401 });
  if (!s.roles.length || !s.mfaOk) return NextResponse.json({ error: 'Tu cuenta no puede usar esto todavía.' }, { status: 403 });
  if (!isTeamMember(s)) return NextResponse.json({ error: 'El asistente es solo para el equipo.' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'No entendí el mensaje.' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Revisa la pregunta.' }, { status: 400 });

  const r = await handleTurn(s, { question: parsed.data.pregunta, conversationId: parsed.data.conversacion ?? null, screen: parsed.data.pantalla ?? null });
  return NextResponse.json(toApi(r), { headers: { 'Cache-Control': 'no-store' } });
}
