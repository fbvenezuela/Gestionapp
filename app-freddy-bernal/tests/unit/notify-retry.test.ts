// notify() called again after its email phase failed (the cron retries a late review on the next
// tick): the missing emails go out, nobody gets one twice, and the phone does not ring again.
// Real in-memory database; the push service and Resend are mocked, so nothing leaves.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ failTo: '', resend: [] as { to: string; key: string }[] }));
const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }));
// The real sender, except that the first email to `failTo` fails once (a dropped connection
// while storing it in the outbox).
vi.mock('@/lib/email/send', async (orig) => {
  const m = await orig<typeof import('@/lib/email/send')>();
  return {
    ...m,
    sendEmail: vi.fn(async (o: Parameters<typeof m.sendEmail>[0]) => {
      if (h.failTo && o.to === h.failTo) {
        h.failTo = '';
        throw new Error('connection reset');
      }
      return m.sendEmail(o);
    }),
  };
});
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (m: { to: string }, o: { idempotencyKey: string }) => {
        h.resend.push({ to: m.to, key: o.idempotencyKey });
        return { data: { id: `re-${h.resend.length}` }, error: null };
      },
    };
  },
}));

let t: TestDb;
let notify: typeof import('@/lib/notify').notify;
let env: typeof import('@/lib/env').env;

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  ({ notify } = await import('@/lib/notify'));
  ({ env } = await import('@/lib/env'));
  await t.system((sql) =>
    sql.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/pol-retry', $2, $3)`, [t.ids.politics, KEY, AUTH]),
  );
});

beforeEach(() => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  h.failTo = '';
  h.resend.length = 0;
});

const outbox = (key: string) =>
  t.system((sql) => sql.query<{ to_email: string; status: string }>(`select to_email, status from public.outbox where idempotency_key like $1 || ':%' order by to_email`, [key]));
const notices = (key: string) => t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where idempotency_key like $1 || ':%'`, [key]));

describe('notify() reintentado después de un correo que falló', () => {
  // First on purpose: it is the one that rings a phone, so the push keys get set up in demo mode.
  it('el reintento manda solo los correos que faltaban, uno por persona, y el teléfono no vuelve a sonar', async () => {
    const n = { userIds: [t.ids.politics, t.ids.admin, t.ids.social], kind: 'review_overdue', title: 'Venció el plazo: «Pieza X» sigue sin aprobar', link: '/aprobar/x', key: 'k-retry', email: true };
    h.failTo = 'admin@demo.test';
    await expect(notify(n)).rejects.toThrow('connection reset');
    expect((await notices('k-retry'))!.n).toBe(3);
    expect((await outbox('k-retry')).map((r) => r.to_email)).toEqual(['politica@demo.test']);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    await notify(n);
    expect((await outbox('k-retry')).map((r) => r.to_email)).toEqual(['admin@demo.test', 'politica@demo.test', 'redes@demo.test']);
    expect((await notices('k-retry'))!.n).toBe(3);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    await notify(n);
    expect(await outbox('k-retry')).toHaveLength(3);
  });

  it('el reintento sigue respetando lo apagado: quien quitó el tipo o fue desactivado no recibe correo', async () => {
    try {
      await t.system(async (sql) => {
        await sql.query(`update public.profiles set notify_prefs = '{"material_ready": false}'::jsonb where id = $1`, [t.ids.social2]);
        await sql.query(`update public.profiles set active = false where id = $1`, [t.ids.camera]);
      });
      const n = { userIds: [t.ids.social, t.ids.social2, t.ids.camera, t.ids.politics], kind: 'material_ready', title: 'Llegó material nuevo', key: 'k-retry-prefs', email: true };
      h.failTo = 'redes@demo.test';
      await expect(notify(n)).rejects.toThrow('connection reset');
      await notify(n);
      await notify(n);
      expect((await outbox('k-retry-prefs')).map((r) => r.to_email)).toEqual(['politica@demo.test', 'redes@demo.test']);
      expect((await notices('k-retry-prefs'))!.n).toBe(4);
    } finally {
      await t.system(async (sql) => {
        await sql.query(`update public.profiles set notify_prefs = '{}'::jsonb where id = $1`, [t.ids.social2]);
        await sql.query(`update public.profiles set active = true where id = $1`, [t.ids.camera]);
      });
    }
  });

  it('con Resend tampoco se repite: cada persona recibe un solo correo', async () => {
    const saved = { mode: env.email.mode, key: env.email.resendKey, data: env.dataMode };
    const people = [t.ids.politics, t.ids.admin, t.ids.boss];
    // Addresses that canDeliver() accepts (it never sends to *.test); Resend is mocked above.
    await t.system((sql) => sql.query(`update public.profiles set email = replace(email, '@demo.test', '@demo.example') where id = any($1::uuid[])`, [people]));
    Object.assign(env.email, { mode: 'send', resendKey: 're_test_key' });
    env.dataMode = 'supabase';
    try {
      const n = { userIds: people, kind: 'review_overdue', title: 'Venció el plazo: «Pieza Y» sigue sin aprobar', key: 'k-retry-resend', email: true };
      h.failTo = 'admin@demo.example';
      await expect(notify(n)).rejects.toThrow('connection reset');
      expect(h.resend.map((r) => r.to)).toEqual(['politica@demo.example']);
      await notify(n);
      await notify(n);
      expect(h.resend.map((r) => r.to).sort()).toEqual(['admin@demo.example', 'jefe@demo.example', 'politica@demo.example']);
      expect(new Set(h.resend.map((r) => r.key)).size).toBe(3);
      expect((await outbox('k-retry-resend')).map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
    } finally {
      Object.assign(env.email, { mode: saved.mode, resendKey: saved.key });
      env.dataMode = saved.data;
      await t.system((sql) => sql.query(`update public.profiles set email = replace(email, '@demo.example', '@demo.test') where id = any($1::uuid[])`, [people]));
    }
  });
});
