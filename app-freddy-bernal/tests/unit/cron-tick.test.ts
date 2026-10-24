// /api/cron/tick against the in-memory database: one failing step never skips the others, and a
// late review is marked only after its «Venció el plazo» notice went out (a failure retries it).
// notify(), the digest and the assistant health check are mocked.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Notice } from '@/lib/notify';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ notices: [] as unknown[], failTitle: '', failStock: false, digest: 0, health: 0 }));

vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: { title: string }) => {
    if (h.failTitle && n.title.includes(h.failTitle)) throw new Error('connection reset');
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/data/tweets', async (orig) => {
  const m = await orig<typeof import('@/lib/data/tweets')>();
  return {
    ...m,
    tweetStock: vi.fn(async (...a: Parameters<typeof m.tweetStock>) => {
      if (h.failStock) throw new Error('stock failed');
      return m.tweetStock(...a);
    }),
  };
});
vi.mock('@/lib/push/digest-run', () => ({
  DIGEST_HOUR: 7,
  runDailyDigest: vi.fn(async () => {
    h.digest++;
    return { claimed: 0, sent: 0 };
  }),
}));
vi.mock('@/lib/assistant', () => ({
  assistantHealthCheck: vi.fn(async () => {
    h.health++;
    return { answers: 0, degraded: 0, ratio: 0, notified: false };
  }),
}));

let t: TestDb;
let GET: typeof import('@/app/api/cron/tick/route').GET;
const late: string[] = [];

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  const { env } = await import('@/lib/env');
  env.cronSecret = 'cron-test-secret';
  GET = (await import('@/app/api/cron/tick/route')).GET;
  // Three green pieces two, three and four days past their deadline (the review clock is set by
  // the system here, as the cron does).
  await t.system(async (sql) => {
    for (const [i, name] of ['A', 'B', 'C'].entries()) {
      const p = await sql.one<{ id: string }>(
        `insert into public.pieces (kind, title, status, current_version, review_level, created_by) values ('video', $1, 'in_review', 1, 'verde', $2) returning id`,
        [`Pieza tarde ${name} (demo)`, t.ids.social],
      );
      await sql.query(`update public.pieces set sent_to_review_at = now() - $2::interval where id = $1`, [p!.id, `${4 - i} days`]);
      late.push(p!.id);
    }
  });
});

beforeEach(() => {
  h.notices.length = 0;
  h.failTitle = '';
  h.failStock = false;
  h.digest = 0;
  h.health = 0;
});

const tick = async () => {
  const r = await GET(new NextRequest('http://localhost/api/cron/tick', { headers: { authorization: 'Bearer cron-test-secret' } }));
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const overdue = () => (h.notices as Notice[]).filter((n) => n.kind === 'review_overdue').map((n) => n.link);
const marked = async () =>
  new Set(
    (await t.system((sql) => sql.query<{ id: string }>(`select id from public.pieces where id = any($1::uuid[]) and review_escalated_at is not null`, [late]))).map((r) => r.id),
  );

describe('cron tick', () => {
  it('sin clave no corre', async () => {
    const r = await GET(new NextRequest('http://localhost/api/cron/tick'));
    expect(r.status).toBe(401);
  });

  it('si un paso falla, los demás corren igual (resumen diario y salud del asistente)', async () => {
    h.failStock = true;
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.tweetDaysLeft).toEqual({ error: 'stock failed' });
    expect(h.digest).toBe(1);
    expect(h.health).toBe(1);
    // Restore the pieces for the next case.
    await t.system((sql) => sql.query(`update public.pieces set review_escalated_at = null where id = any($1::uuid[])`, [late]));
  });

  it('si el aviso de una pieza falla, esa no se marca y sale en el próximo turno; las otras sí', async () => {
    h.failTitle = 'Pieza tarde B';
    const first = await tick();
    expect(first.status).toBe(200);
    expect(first.body.lateReviews).toEqual({ error: expect.stringContaining(late[1]) });
    expect(overdue()).toEqual(expect.arrayContaining([`/aprobar/${late[0]}`, `/aprobar/${late[2]}`]));
    expect(overdue()).not.toContain(`/aprobar/${late[1]}`);
    expect(await marked()).toEqual(new Set([late[0], late[2]]));
    expect(h.digest).toBe(1);
    expect(h.health).toBe(1);

    h.notices.length = 0;
    h.failTitle = '';
    const second = await tick();
    expect(second.status).toBe(200);
    expect(overdue().filter((l) => late.some((id) => l === `/aprobar/${id}`))).toEqual([`/aprobar/${late[1]}`]);
    expect(await marked()).toEqual(new Set(late));
  });
});
