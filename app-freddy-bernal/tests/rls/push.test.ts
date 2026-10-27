// RLS for phone notifications: each person only sees, adds and removes their own phones.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from './setup';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const ep = (s: string) => `https://fcm.googleapis.com/fcm/send/${s}`;

describe('push_subscriptions: cada quien con lo suyo', () => {
  it('cada persona guarda y ve solo sus teléfonos', async () => {
    await t.as('social', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, 'test')`, [ep('social-1'), KEY, AUTH]));
    await t.as('politics', (sql) => sql.query(`insert into public.push_subscriptions (endpoint, p256dh, auth) values ($1, $2, $3)`, [ep('pol-1'), KEY, AUTH]));
    const mine = await t.as('social', (sql) => sql.query<{ endpoint: string }>(`select endpoint from public.push_subscriptions`));
    expect(mine.map((r) => r.endpoint)).toEqual([ep('social-1')]);
    const pol = await t.as('politics', (sql) => sql.query<{ endpoint: string }>(`select endpoint from public.push_subscriptions`));
    expect(pol.map((r) => r.endpoint)).toEqual([ep('pol-1')]);
  });

  it('nadie ve los de otro, ni siquiera administración', async () => {
    const admin = await t.as('admin', (sql) => sql.query(`select * from public.push_subscriptions`));
    expect(admin).toHaveLength(0);
    const n = await t.as('social', (sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions where user_id = $1`, [t.ids.politics]));
    expect(n!.n).toBe(0);
  });

  it('nadie borra los de otro', async () => {
    const del = await t.as('social', (sql) => sql.query(`delete from public.push_subscriptions where endpoint = $1 returning id`, [ep('pol-1')]));
    expect(del).toHaveLength(0);
    const adminDel = await t.as('admin', (sql) => sql.query(`delete from public.push_subscriptions returning id`));
    expect(adminDel).toHaveLength(0);
    const still = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions where endpoint = $1`, [ep('pol-1')]));
    expect(still!.n).toBe(1);
  });

  it('nadie inserta a nombre de otro ni edita filas', async () => {
    await expect(
      t.as('social', (sql) => sql.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [t.ids.politics, ep('fake'), KEY, AUTH])),
    ).rejects.toThrow();
    await expect(t.as('social', (sql) => sql.query(`update public.push_subscriptions set failed_count = 0`))).rejects.toThrow();
  });

  it('cada quien borra los suyos', async () => {
    const del = await t.as('social', (sql) => sql.query(`delete from public.push_subscriptions where endpoint = $1 returning id`, [ep('social-1')]));
    expect(del).toHaveLength(1);
  });

  it('en un teléfono compartido el aviso es de quien entró de último', async () => {
    await t.as('camera', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [ep('shared'), KEY, AUTH]));
    await t.as('camera2', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [ep('shared'), KEY, AUTH]));
    const rows = await t.system((sql) => sql.query<{ user_id: string }>(`select user_id from public.push_subscriptions where endpoint = $1`, [ep('shared')]));
    expect(rows.map((r) => r.user_id)).toEqual([t.ids.camera2]);
  });

  it('al apagar o borrar a una persona se borran sus teléfonos, y apagada no puede guardar otro', async () => {
    const count = (uid: string) => t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions where user_id = $1`, [uid]));
    const save = (who: 'camera2' | 'dispatch', name: string) => t.as(who, (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [ep(name), KEY, AUTH]));
    try {
      await save('camera2', 'cam2-b');
      // Changing other fields keeps the phones.
      await t.as('admin', (sql) => sql.query(`update public.profiles set full_name = full_name where id = $1`, [t.ids.camera2]));
      expect((await count(t.ids.camera2))!.n).toBeGreaterThan(0);
      await t.as('admin', (sql) => sql.query(`update public.profiles set active = false where id = $1`, [t.ids.camera2]));
      expect((await count(t.ids.camera2))!.n).toBe(0);
      await expect(save('camera2', 'cam2-c')).rejects.toThrow();
      await save('dispatch', 'dispatch-a');
      await t.system((sql) => sql.query(`update public.profiles set deleted_at = now() where id = $1`, [t.ids.dispatch]));
      expect((await count(t.ids.dispatch))!.n).toBe(0);
    } finally {
      await t.system((sql) => sql.query(`update public.profiles set active = true, deleted_at = null where id = any($1::uuid[])`, [[t.ids.camera2, t.ids.dispatch]]));
    }
  });

  it('al cerrar sus sesiones (teléfono perdido o reinicio del doble factor) se borran sus teléfonos', async () => {
    const count = (uid: string) => t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions where user_id = $1`, [uid]));
    await t.as('social2', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [ep('lost-phone'), KEY, AUTH]));
    await t.as('ivt', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [ep('other-phone'), KEY, AUTH]));
    expect((await count(t.ids.social2))!.n).toBe(1);
    // The same update «Cerrar sus sesiones» and «Reiniciar doble factor» make.
    await t.as('admin', (sql) => sql.query(`update public.profiles set sessions_revoked_at = now() where id = $1`, [t.ids.social2]));
    expect((await count(t.ids.social2))!.n).toBe(0);
    expect((await count(t.ids.ivt))!.n).toBe(1);
    // Signing in again on a phone works as usual.
    await t.as('social2', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, [ep('new-phone'), KEY, AUTH]));
    expect((await count(t.ids.social2))!.n).toBe(1);
  });

  it('solo direcciones https', async () => {
    await expect(t.as('social', (sql) => sql.query(`select public.save_push_subscription($1, $2, $3, '')`, ['http://10.0.0.1/x', KEY, AUTH]))).rejects.toThrow();
  });

  it('las marcas de envío y el turno del cron no son legibles por personas', async () => {
    await t.system((sql) => sql.query(`insert into public.notify_throttle (user_id, kind) values ($1, 'push:test')`, [t.ids.social]));
    for (const who of ['social', 'admin'] as const) {
      await expect(t.as(who, (sql) => sql.query(`select * from public.notify_throttle`))).rejects.toThrow();
      await expect(t.as(who, (sql) => sql.query(`select * from public.cron_leases`))).rejects.toThrow();
    }
  });
});
