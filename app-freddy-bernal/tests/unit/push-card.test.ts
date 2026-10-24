// «Avisos en este teléfono»: the card only says «Activos» when the server row is the signed-in
// person's; opening Mi perfil on a shared phone moves the phone to whoever is signed in now.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS } from '@/lib/db/seed-demo';
import { deniedHelp, firstCheck } from '@/lib/push/card-state';
import { makeTestDb, type TestDb } from '../rls/setup';

const state: { session: Session | null } = { session: null };
vi.mock('@/lib/auth/session', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/session')>()), requireSession: vi.fn(async () => state.session) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const EP = 'https://fcm.googleapis.com/fcm/send/shared-phone';

function sessionOf(key: string): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: u.roles, aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null } as unknown as Session;
}

describe('qué muestra la tarjeta con lo que sabe el navegador', () => {
  const base = { supported: true, permission: 'granted', hasSub: true, keyMatches: true };
  it('solo pide confirmar al servidor si hay permiso, suscripción y la clave es la de ahora', () => {
    expect(firstCheck(base)).toBe('sync');
    expect(firstCheck({ ...base, supported: false })).toBe('unsupported');
    expect(firstCheck({ ...base, permission: 'denied' })).toBe('denied');
    expect(firstCheck({ ...base, permission: 'default' })).toBe('off');
    expect(firstCheck({ ...base, hasSub: false })).toBe('off');
    expect(firstCheck({ ...base, keyMatches: false })).toBe('off');
  });

  it('dice dónde desbloquear los avisos según el teléfono', () => {
    const ios = deniedHelp('ios', true, 'Operaciones 360');
    expect(ios).toContain('Ajustes › Notificaciones › Operaciones 360');
    expect(ios).not.toMatch(/candado|dirección/);
    expect(deniedHelp('android', true, 'X')).toMatch(/ícono de la app/);
    expect(deniedHelp('android', false, 'X')).toMatch(/candado junto a la dirección/);
    expect(deniedHelp('other', false, 'X')).toMatch(/candado/);
  });
});

describe('al abrir Mi perfil, el teléfono queda a nombre de quien entró', () => {
  let t: TestDb;
  let sync: typeof import('@/lib/actions/profile').syncPushSubscription;
  let sendTestPush: typeof import('@/lib/actions/profile').sendTestPush;
  const owner = () => t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.push_subscriptions where endpoint = $1`, [EP]));
  const input = { endpoint: EP, p256dh: KEY, auth: AUTH, userAgent: 'test' };

  beforeAll(async () => {
    t = await makeTestDb();
    (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
    ({ syncPushSubscription: sync, sendTestPush } = await import('@/lib/actions/profile'));
  });

  it('teléfono compartido: B entra y la fila deja de ser de A; repetir no escribe nada', async () => {
    await t.as('supervisor', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [EP, KEY, AUTH]));
    state.session = sessionOf('camera');
    expect(await sync(input)).toEqual({ ok: true, data: { changed: true } });
    expect((await owner()).map((r) => r.user_id)).toEqual([t.ids.camera]);
    expect(await sync(input)).toEqual({ ok: true, data: { changed: false } });
    expect((await owner()).map((r) => r.user_id)).toEqual([t.ids.camera]);
  });

  it('si el servidor borró la fila (410 o fallas), al abrir Mi perfil vuelve', async () => {
    await t.system((sql) => sql.query(`delete from public.push_subscriptions where endpoint = $1`, [EP]));
    state.session = sessionOf('camera');
    expect(await sync(input)).toEqual({ ok: true, data: { changed: true } });
    expect((await owner()).map((r) => r.user_id)).toEqual([t.ids.camera]);
  });

  it('no acepta direcciones que no son de un servicio de avisos', async () => {
    state.session = sessionOf('camera');
    const r = await sync({ ...input, endpoint: 'https://10.0.0.1/x' });
    expect(r.ok).toBe(false);
  });

  it('«Probar aviso» de A ya no encuentra el teléfono que pasó a B', async () => {
    state.session = sessionOf('supervisor');
    const r = await sendTestPush();
    expect(r).toEqual({ ok: false, error: 'Este teléfono todavía no tiene los avisos activos.' });
  });
});
