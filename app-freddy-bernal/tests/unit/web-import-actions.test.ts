// What the website's administrator says about an imported draft (src/lib/actions/web.ts) before the database refuses
// it: a photo whose alternative text is still the importer's «[Por escribir]» and a text with the importer's marks are
// not sent to approval nor published; written by a person, they go. Against the in-memory database, session mocked, all
// data invented.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { ALT_PLACEHOLDER, REMOVED_MARKS } from '@/lib/web/import-marks';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/auth/session', () => ({ requireSession: vi.fn(async () => h.session), getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}), usersWithRole: vi.fn(async () => []) }));

let t: TestDb;
let web: typeof import('@/lib/actions/web');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  web = await import('@/lib/actions/web');
}, 180_000);

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: true, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

/** A draft as the importer leaves it (the system writes it): a photo without alternative text. */
async function imported(slug: string, text: string) {
  return t.system(async (sql) => {
    const media = (await sql.one<{ id: string }>(
      `insert into public.web_media (storage_key, kind, mime, bytes, width, height, alt) values ($1, 'image', 'image/png', 100, 320, 200, $2) returning id`,
      [`${crypto.randomUUID()}.png`, ALT_PLACEHOLDER],
    ))!;
    const draft = { title: `Nota importada ${slug} (prueba)`, date: '2026-03-10', category: 'noticia', coverId: media.id, body: [{ type: 'paragraph', text }], galleryIds: [], topics: [] };
    const item = (await sql.one<{ id: string }>(`insert into public.web_items (kind, slug, draft) values ('news', $1, $2::text::jsonb) returning id`, [slug, JSON.stringify(draft)]))!;
    return { id: item.id, mediaId: media.id };
  });
}
const rev = async (id: string) => (await t.system((sql) => sql.one<{ rev: number }>(`select rev from public.web_items where id = $1`, [id])))!.rev;

describe('un borrador importado en el administrador', () => {
  it('con una foto «[Por escribir]» no se envía ni se publica; con su texto alternativo, sí', async () => {
    const { id, mediaId } = await imported('importada-foto', 'Texto de la nota (prueba).');
    as('webEditor');
    expect(await web.submitWebItem({ id })).toEqual({ ok: false, error: expect.stringMatching(/^Una foto de este contenido no tiene su texto alternativo todavía.*antes de enviarlo\.$/) });
    as('webPublisher');
    expect(await web.publishWebItem({ id, rev: await rev(id) })).toEqual({ ok: false, error: expect.stringMatching(/antes de publicarlo\.$/) });
    await t.system((sql) => sql.query(`update public.web_media set alt = 'Una plaza con árboles (prueba)' where id = $1`, [mediaId]));
    as('webEditor');
    expect(await web.submitWebItem({ id })).toMatchObject({ ok: true });
    as('webPublisher');
    expect(await web.publishWebItem({ id, rev: await rev(id) })).toMatchObject({ ok: true });
  });

  it('con una marca del importador en el texto dice qué falta, antes de llegar a la base', async () => {
    const { id, mediaId } = await imported('importada-marca', `Escribir a ${REMOVED_MARKS.email} (prueba).`);
    await t.system((sql) => sql.query(`update public.web_media set alt = 'Una plaza con árboles (prueba)' where id = $1`, [mediaId]));
    as('webEditor');
    expect(await web.submitWebItem({ id })).toEqual({ ok: false, error: expect.stringContaining('Quedó «[correo retirado]» donde se quitó un dato personal al traer la nota') });
    as('webPublisher');
    expect(await web.publishWebItem({ id, rev: await rev(id) })).toEqual({ ok: false, error: expect.stringContaining('Todavía no se puede publicar: Quedó «[correo retirado]»') });
  });
});
