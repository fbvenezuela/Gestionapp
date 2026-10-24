// POST /api/asistente: who may ask, the body, and the window's contract (Spanish keys).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@/lib/auth/session';

const state: { enabled: boolean; session: Session | null } = { enabled: true, session: null };

vi.mock('@/lib/env', async (orig) => {
  const m = await orig<typeof import('@/lib/env')>();
  return { ...m, env: { ...m.env, assistant: { get enabled() { return state.enabled; }, models: '' } } };
});
vi.mock('@/lib/auth/session', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/session')>()), getSession: vi.fn(async () => state.session) }));
const handleTurn = vi.fn(async (_s: Session, i: { question: string; conversationId?: string | null }) => ({
  answer: `ok: ${i.question}`,
  scope: 'equipo' as const,
  model: 'local',
  ms: 3,
  degraded: false,
  did: [{ tool: 'mis_pendientes' }],
  goTo: { href: '/hoy', label: 'Hoy' },
  conversationId: i.conversationId ?? '123e4567-e89b-42d3-a456-426614174000',
}));
vi.mock('@/lib/assistant', async (orig) => ({ ...(await orig<typeof import('@/lib/assistant')>()), handleTurn }));

const { POST } = await import('@/app/api/asistente/route');

const session = (roles: string[], mfaOk = true): Session =>
  ({ userId: 'u1', email: 'x@demo.test', name: 'Prueba', roles, aal: 'aal2', mfaRequired: false, mfaOk, claims: { sub: 'u1' }, viewAs: null }) as unknown as Session;
const req = (body: unknown) =>
  new Request('http://localhost/api/asistente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) as never;

beforeEach(() => {
  state.enabled = true;
  state.session = session(['social']);
  handleTurn.mockClear();
});

describe('POST /api/asistente', () => {
  it('apagado (ASISTENTE_ENABLED=false) → 404', async () => {
    state.enabled = false;
    const r = await POST(req({ pregunta: 'hola' }));
    expect(r.status).toBe(404);
    expect(handleTurn).not.toHaveBeenCalled();
  });

  it('sin sesión → 401; sin rol, sin doble factor o solo roles de la fase 3 → 403', async () => {
    state.session = null;
    expect((await POST(req({ pregunta: 'hola' }))).status).toBe(401);
    state.session = session([]);
    expect((await POST(req({ pregunta: 'hola' }))).status).toBe(403);
    state.session = session(['supervisor'], false);
    expect((await POST(req({ pregunta: 'hola' }))).status).toBe(403);
    state.session = session(['complaints_operator']);
    expect((await POST(req({ pregunta: 'hola' }))).status).toBe(403);
    expect(handleTurn).not.toHaveBeenCalled();
  });

  it('valida el cuerpo: pregunta de 1 a 1.500 caracteres y conversación uuid', async () => {
    expect((await POST(req({ pregunta: '   ' }))).status).toBe(400);
    expect((await POST(req({ pregunta: 'x'.repeat(1501) }))).status).toBe(400);
    expect((await POST(req({ pregunta: 'hola', conversacion: 'no-es-uuid' }))).status).toBe(400);
    expect((await POST(req('{no es json'))).status).toBe(400);
    expect(handleTurn).not.toHaveBeenCalled();
  });

  it('responde con las claves en español que espera la ventana', async () => {
    const conv = '123e4567-e89b-42d3-a456-426614174999';
    const r = await POST(req({ pregunta: '¿qué tengo pendiente?', conversacion: conv, ambito: 'visitante' }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toEqual({
      respuesta: 'ok: ¿qué tengo pendiente?',
      ambito: 'equipo',
      modelo: 'local',
      ms: 3,
      degradado: false,
      hizo: [{ tool: 'mis_pendientes' }],
      ir: { href: '/hoy', label: 'Hoy' },
      conversacion: conv,
    });
    // The scope sent by the window is ignored: the server decides it.
    expect(handleTurn).toHaveBeenCalledWith(state.session, { question: '¿qué tengo pendiente?', conversationId: conv });
  });
});
