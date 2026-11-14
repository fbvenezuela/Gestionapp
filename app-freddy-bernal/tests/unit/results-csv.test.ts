// «Cargar resultados desde un archivo (CSV)» (APP-37): the importer itself (not a copy of how it reads the file),
// against a real in-memory database with the demo seed and Redes's session. The first row names the columns as a person
// writes them in a spreadsheet («Enlace», «Me gusta»); the old names (link, me_gusta) still import. The session is mocked.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session) }));

let t: TestDb;
let results: typeof import('@/lib/actions/results');
let pub: { id: string; url: string };

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  results = await import('@/lib/actions/results');
  const u = DEMO_USERS.find((x) => x.key === 'social')!;
  h.session = {
    userId: t.ids.social, email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids.social, aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
  pub = (await t.system((sql) =>
    sql.query<{ id: string; url: string }>(
      `select id, url from public.publications where url is not null and status = 'published' and deleted_at is null order by url limit 1`,
    ),
  ))[0];
}, 120_000);

const csvRows = (id: string) =>
  t.system((sql) =>
    sql.query<{ views: number | null; likes: number | null; reach: number | null }>(
      `select views, likes, reach from public.publication_metrics where publication_id = $1 and source = 'csv' order by captured_at`,
      [id],
    ),
  );

describe('cargar resultados desde un CSV', () => {
  it('«Enlace;Vistas;Me gusta» (como se escribe en una hoja de cálculo) se carga, y un enlace que no es de ninguna publicación se cuenta', async () => {
    const r = await results.importMetricsCsv({ csv: `Enlace;Vistas;Me gusta\n${pub.url};1.200;30\nhttps://example.com/no-es-de-ninguna;5;1\n` });
    expect(r).toEqual({ ok: true, data: { matched: 1, unmatched: ['https://example.com/no-es-de-ninguna'], unmatchedCount: 1 } });
    expect((await csvRows(pub.id)).at(-1)).toEqual({ views: 1200, likes: 30, reach: null });
  });

  it('los nombres de antes (link, me_gusta) siguen sirviendo', async () => {
    const r = await results.importMetricsCsv({ csv: `link,vistas,alcance,me_gusta\n${pub.url},900,700,12\n` });
    expect(r).toMatchObject({ ok: true, data: { matched: 1, unmatchedCount: 0 } });
    expect((await csvRows(pub.id)).at(-1)).toEqual({ views: 900, likes: 12, reach: 700 });
  });

  it('sin la columna del enlace, lo dice con su nombre y no carga nada', async () => {
    const before = (await csvRows(pub.id)).length;
    const r = await results.importMetricsCsv({ csv: 'Vistas;Me gusta\n100;3\n' });
    expect(r).toEqual({ ok: false, error: 'Falta la columna «enlace» (el link de cada publicación).' });
    expect((await csvRows(pub.id)).length).toBe(before);
  });
});
