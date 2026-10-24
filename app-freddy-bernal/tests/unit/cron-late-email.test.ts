// /api/cron/tick with the real notify(): if a «Venció el plazo» email fails, the piece stays
// unmarked and the next tick sends the emails that were left out, exactly one per person.
// The first email fails once (a dropped connection); the digest and the assistant check are mocked.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ fail: 0 }));
vi.mock('@/lib/email/send', async (orig) => {
  const m = await orig<typeof import('@/lib/email/send')>();
  return {
    ...m,
    sendEmail: vi.fn(async (o: Parameters<typeof m.sendEmail>[0]) => {
      if (o.subject.startsWith('Venció') && h.fail > 0) {
        h.fail--;
        throw new Error('connection reset');
      }
      return m.sendEmail(o);
    }),
  };
});
vi.mock('@/lib/push/digest-run', () => ({ DIGEST_HOUR: 7, runDailyDigest: vi.fn(async () => ({ claimed: 0, sent: 0 })) }));
vi.mock('@/lib/assistant', () => ({ assistantHealthCheck: vi.fn(async () => ({ notified: false })) }));

let t: TestDb;
let GET: typeof import('@/app/api/cron/tick/route').GET;
let id = '';

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  const { env } = await import('@/lib/env');
  env.cronSecret = 'cron-test-secret';
  GET = (await import('@/app/api/cron/tick/route')).GET;
  id = await t.system(async (sql) => {
    const p = await sql.one<{ id: string }>(
      `insert into public.pieces (kind, title, status, current_version, review_level, created_by) values ('video', 'Pieza sin respuesta (demo)', 'in_review', 1, 'verde', $1) returning id`,
      [t.ids.social],
    );
    await sql.query(`update public.pieces set sent_to_review_at = now() - interval '4 days' where id = $1`, [p!.id]);
    return p!.id;
  });
});

const tick = async () => {
  const r = await GET(new NextRequest('http://localhost/api/cron/tick', { headers: { authorization: 'Bearer cron-test-secret' } }));
  return (await r.json()) as Record<string, unknown>;
};
const emails = () =>
  t.system((sql) =>
    sql.query<{ to_email: string }>(`select to_email from public.outbox where idempotency_key like $1 order by to_email`, [`review-late:${id}:%`]),
  );
const marked = async () => (await t.system((sql) => sql.one<{ m: boolean }>(`select review_escalated_at is not null as m from public.pieces where id = $1`, [id])))!.m;

describe('cron tick: correo de «Venció el plazo» que falló', () => {
  it('el próximo turno manda los correos que faltaban, uno por persona, y entonces marca la pieza', async () => {
    h.fail = 1;
    const first = await tick();
    expect(first.lateReviews).toEqual({ error: expect.stringContaining('connection reset') });
    expect(await marked()).toBe(false);
    expect(await emails()).toEqual([]);

    const second = await tick();
    expect(second.lateReviews).toBe(1);
    expect(await marked()).toBe(true);
    expect((await emails()).map((e) => e.to_email)).toEqual(['admin@demo.test', 'supervision@demo.test']);

    expect((await tick()).lateReviews).toBe(0);
    expect(await emails()).toHaveLength(2);
    const notices = await t.system((sql) => sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where link = $1 and kind = 'review_overdue'`, [`/aprobar/${id}`]));
    expect(notices!.n).toBe(2);
  });
});
