// notify() + Web Push against a real in-memory database (same migrations), with the push
// service mocked. A failed push must never break the action that sent the notice.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

let t: TestDb;
let notify: typeof import('@/lib/notify').notify;
let runDailyDigest: typeof import('@/lib/push/digest-run').runDailyDigest;
let pushNotice: typeof import('@/lib/push/deliver').pushNotice;

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const EP = 'https://fcm.googleapis.com/fcm/send/supervisor-phone';

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  ({ notify } = await import('@/lib/notify'));
  ({ runDailyDigest } = await import('@/lib/push/digest-run'));
  ({ pushNotice } = await import('@/lib/push/deliver'));
});

beforeEach(async () => {
  sendNotification.mockReset();
  await t.system(async (sql) => {
    await sql.query(`delete from public.notify_throttle`);
    await sql.query(`delete from public.push_subscriptions`);
    await sql.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [t.ids.supervisor, EP, KEY, AUTH]);
  });
});

const sub = () => t.system((sql) => sql.one<{ failed_count: number; last_ok_at: Date | null }>(`select failed_count, last_ok_at from public.push_subscriptions where endpoint = $1`, [EP]));
const notices = (key: string) => t.system((sql) => sql.query(`select id from public.notifications where idempotency_key = $1`, [key]));

describe('notify() con avisos al teléfono', () => {
  it('manda el aviso con el texto ya limpio y el enlace; los críticos llevan etiqueta propia y suenan', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await notify({ userIds: [t.ids.supervisor], kind: 'changes_requested', title: 'Cambios en «Video» del 24/10 a las 9:30', body: 'Llamar al 0414-1234567', link: '/piezas/x', key: 'k-ok' });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [subscription, payload, opts] = sendNotification.mock.calls[0] as [{ endpoint: string }, string, { urgency: string; topic?: string }];
    expect(subscription.endpoint).toBe(EP);
    const p = JSON.parse(payload);
    expect(p).toMatchObject({ kind: 'changes_requested', url: '/piezas/x' });
    expect(p.tag).toMatch(/^changes_requested-[0-9a-f]{8}$/);
    expect(p.silent).toBeUndefined();
    expect(opts).toMatchObject({ urgency: 'high' });
    expect(opts.topic).toBeUndefined(); // an offline phone gets every critical push, not just the last
    expect(p.title).toBe('Cambios en «Video» del');
    expect(`${p.title} ${p.body}`).not.toMatch(/\d/);
    expect((await sub())!.last_ok_at).not.toBeNull();
  });

  it('nunca manda al teléfono de alguien apagado o borrado (ni aviso ni correo)', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const secretaryEp = 'https://fcm.googleapis.com/fcm/send/secretary-phone';
    const outbox = (key: string) => t.system((sql) => sql.query(`select id from public.outbox where idempotency_key = $1`, [key]));
    try {
      await t.system(async (sql) => {
        await sql.query(`update public.profiles set active = false where id = $1`, [t.ids.secretary]);
        // A row left behind (e.g. saved before the change): the sender must still skip it.
        await sql.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [t.ids.secretary, secretaryEp, KEY, AUTH]);
      });
      await notify({ userIds: [t.ids.secretary], kind: 'event_decided', title: 'El jefe aceptó: Acto', key: 'k-off-person', email: true });
      await notify({ userIds: [t.ids.secretary], kind: 'event_assigned', title: 'Te asignaron un evento', key: 'k-off-person-crit', email: true });
      expect(sendNotification).not.toHaveBeenCalled();
      expect(await outbox(`k-off-person:${t.ids.secretary}`)).toHaveLength(0);
      expect(await outbox(`k-off-person-crit:${t.ids.secretary}`)).toHaveLength(0);
      // The sender checks on its own too (not only notify()).
      await pushNotice([{ id: t.ids.secretary, prefs: {} }], { kind: 'event_assigned', title: 'Te asignaron un evento' }, true);
      await pushNotice([{ id: t.ids.secretary, prefs: { quiet: false } }], { kind: 'event_decided', title: 'El jefe aceptó: Acto' }, false);
      expect(sendNotification).not.toHaveBeenCalled();
      await t.system((sql) => sql.query(`update public.profiles set active = true, deleted_at = now() where id = $1`, [t.ids.secretary]));
      await t.system((sql) => sql.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4) on conflict (endpoint) do nothing`, [t.ids.secretary, secretaryEp, KEY, AUTH]));
      await notify({ userIds: [t.ids.secretary], kind: 'event_assigned', title: 'Te asignaron otro evento', key: 'k-deleted-person' });
      expect(sendNotification).not.toHaveBeenCalled();
      // The others on the same notice still get theirs.
      await notify({ userIds: [t.ids.secretary, t.ids.supervisor], kind: 'event_assigned', title: 'Te asignaron un evento', key: 'k-mixed' });
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect((sendNotification.mock.calls[0] as [{ endpoint: string }])[0].endpoint).toBe(EP);
    } finally {
      await t.system((sql) => sql.query(`update public.profiles set active = true, deleted_at = null where id = $1`, [t.ids.secretary]));
    }
  });

  it('si el servicio de avisos falla, notify no falla y el aviso en la app queda', async () => {
    sendNotification.mockRejectedValue(new Error('network down'));
    await expect(notify({ userIds: [t.ids.supervisor], kind: 'publish_failed', title: 'Falló', key: 'k-fail' })).resolves.toBeUndefined();
    expect(await notices(`k-fail:${t.ids.supervisor}`)).toHaveLength(1);
    expect((await sub())!.failed_count).toBe(1);
  });

  it('si el teléfono ya no existe (410) se borra la suscripción', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    await notify({ userIds: [t.ids.supervisor], kind: 'review_red', title: 'En rojo', key: 'k-gone' });
    expect(await sub()).toBeNull();
    expect(await notices(`k-gone:${t.ids.supervisor}`)).toHaveLength(1);
  });

  it('aunque el envío se cuelgue o la base falle, notify sigue', async () => {
    sendNotification.mockImplementation(() => {
      throw new Error('sync explosion');
    });
    await expect(notify({ userIds: [t.ids.supervisor], kind: 'review_overdue', title: 'Venció', key: 'k-throw' })).resolves.toBeUndefined();
  });

  it('agrupa ráfagas: suena una vez por persona y tipo cada 10 minutos y después avisa «Tienes N avisos nuevos» sin sonar', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await t.system((sql) => sql.query(`update public.profiles set notify_prefs = '{"quiet": false}'::jsonb where id = $1`, [t.ids.supervisor]));
    try {
      for (let i = 0; i < 3; i++) await notify({ userIds: [t.ids.supervisor], kind: 'burst_kind', title: `Evento ${i} a las 9`, link: `/eventos/${i}`, key: `k-burst-${i}` });
      expect(sendNotification).toHaveBeenCalledTimes(3);
      const calls = sendNotification.mock.calls as [{ endpoint: string }, string, { topic?: string }][];
      const [first, second, third] = calls.map((c) => JSON.parse(c[1]));
      expect(first).toMatchObject({ title: 'Evento 0', tag: 'burst_kind', url: '/eventos/0' });
      expect(first.silent).toBeUndefined();
      expect(calls[0][2].topic).toBe('burst_kind');
      expect(second).toMatchObject({ title: 'Tienes 2 avisos nuevos', body: 'El último: Evento 1', tag: 'burst_kind', url: '/avisos', silent: true });
      expect(third).toMatchObject({ title: 'Tienes 3 avisos nuevos', body: 'El último: Evento 2', silent: true });
      expect(calls[1][2].topic).toBeUndefined(); // never replaces an undelivered push that rings
      await notify({ userIds: [t.ids.supervisor], kind: 'burst_other', title: 'Otro tipo', key: 'k-burst-other' });
      expect(sendNotification).toHaveBeenCalledTimes(4);
      expect(JSON.parse(sendNotification.mock.calls[3][1] as string).silent).toBeUndefined();
    } finally {
      await t.system((sql) => sql.query(`update public.profiles set notify_prefs = '{}'::jsonb where id = $1`, [t.ids.supervisor]));
    }
  });

  it('los críticos nunca se agrupan ni se pierden: cada uno suena y queda en la bandeja', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    for (let i = 0; i < 2; i++) await notify({ userIds: [t.ids.supervisor], kind: 'publish_failed', title: `Falló la pieza ${i === 0 ? 'A' : 'B'}`, key: `k-crit-${i}` });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [a, b] = sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string));
    expect([a.title, b.title]).toEqual(['Falló la pieza A', 'Falló la pieza B']);
    expect(a.tag).not.toBe(b.tag);
    expect(a.silent ?? b.silent).toBeUndefined();
  });

  it('respeta lo que la persona apagó (no críticos) y no repite un aviso ya guardado', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    await t.system((sql) => sql.query(`update public.profiles set notify_prefs = '{"review_pending": false, "quiet": false}'::jsonb where id = $1`, [t.ids.supervisor]));
    await notify({ userIds: [t.ids.supervisor], kind: 'review_pending', title: 'Por aprobar', key: 'k-off' });
    expect(sendNotification).not.toHaveBeenCalled();
    await t.system((sql) => sql.query(`update public.profiles set notify_prefs = '{"quiet": false}'::jsonb where id = $1`, [t.ids.supervisor]));
    await notify({ userIds: [t.ids.supervisor], kind: 'review_pending', title: 'Por aprobar', key: 'k-off' });
    expect(sendNotification).not.toHaveBeenCalled(); // same key: the notice already existed
    await notify({ userIds: [t.ids.supervisor], kind: 'review_pending', title: 'Por aprobar', key: 'k-on' });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    await t.system((sql) => sql.query(`update public.profiles set notify_prefs = '{}'::jsonb where id = $1`, [t.ids.supervisor]));
  });
});

describe('resumen diario por correo (en el tick)', () => {
  const at = (iso: string) => new Date(iso);
  const outbox = () => t.system((sql) => sql.query<{ to_email: string; subject: string; text_body: string; idempotency_key: string }>(`select to_email, subject, text_body, idempotency_key from public.outbox where template = 'digest' order by created_at`));

  it('sale una vez al día, desde la mañana, solo a quien lo pidió y sin fechas ni horas', async () => {
    await t.system((sql) => sql.query(`update public.profiles set notify_prefs = '{"daily_digest": true}'::jsonb where id = $1`, [t.ids.supervisor]));
    expect(await runDailyDigest(at('2026-01-15T10:00:00Z'))).toEqual({ claimed: 0, sent: 0 }); // 06:00 Caracas: too early
    const first = await runDailyDigest(at('2026-01-15T12:00:00Z')); // 08:00 Caracas
    expect(first).toEqual({ claimed: 1, sent: 1 });
    expect(await runDailyDigest(at('2026-01-15T12:05:00Z'))).toEqual({ claimed: 0, sent: 0 });
    expect(await runDailyDigest(at('2026-01-15T20:00:00Z'))).toEqual({ claimed: 0, sent: 0 });
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].to_email).toBe('supervision@demo.test');
    expect(rows[0].idempotency_key).toBe(`digest:${t.ids.supervisor}:2026-01-15`);
    expect(rows[0].text_body).toMatch(/por aprobar/);
    expect(`${rows[0].subject}\n${rows[0].text_body}`).not.toMatch(/\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\/|a\. ?m\.|p\. ?m\./i);
    expect(await runDailyDigest(at('2026-01-16T12:00:00Z'))).toEqual({ claimed: 1, sent: 1 }); // next day
    expect(await outbox()).toHaveLength(2);
  });
});
