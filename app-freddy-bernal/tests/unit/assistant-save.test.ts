// «Se guarda después de responder; si guardar falla, se escribe en el log y la respuesta sale igual.»
import { describe, it, expect, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS } from '@/lib/db/seed-demo';

vi.mock('@/lib/assistant/store', async (orig) => ({
  ...(await orig<typeof import('@/lib/assistant/store')>()),
  saveTurn: vi.fn(async () => {
    throw new Error('disco lleno');
  }),
}));

const { handleTurn } = await import('@/lib/assistant');
const { saveTurn } = await import('@/lib/assistant/store');

describe('guardar no tumba la respuesta', () => {
  it('si no se puede guardar el turno, la persona recibe su respuesta y el error queda en el log', async () => {
    const u = DEMO_USERS.find((x) => x.key === 'social')!;
    const s = { userId: u.id, email: u.email, name: u.name, roles: ['social'], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null } as unknown as Session;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await handleTurn(s, { question: 'hola' }, { chain: [] });
    expect(saveTurn).toHaveBeenCalled();
    expect(r.degraded).toBe(false);
    expect(r.answer.length).toBeGreaterThan(5);
    expect(log.mock.calls.some((c) => String(c[0]).includes('no se pudo guardar el turno') && String(c[1]).includes('disco lleno'))).toBe(true);
    log.mockRestore();
  });
});
