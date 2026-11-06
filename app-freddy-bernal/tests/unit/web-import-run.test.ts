// The importer's run (scripts/web-import/run.ts) against the real in-memory database (same migrations, the system's
// writes, the people's RLS) and an invented old site: a dry run writes nothing, not even with the database at hand;
// --apply makes drafts (never published) with their photos and redirects; running again changes only what nobody
// touched; the database refuses to publish a photo without its alternative text or a text with the importer's marks;
// a redirect made by hand is never overwritten; personal data never reaches a table. Everything here is invented.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Sql } from '@/lib/db/core';
import { ALT_PLACEHOLDER, REMOVED_MARKS } from '@/lib/web/import-marks';
import { makeTestDb, type TestDb } from '../rls/setup';
import { pngOf } from './fixtures/web-png';
import { reportText, runImport, type RunOptions } from '../../scripts/web-import/run';
import { memoryMediaStore } from '../../scripts/web-import/store';
import type { WpPost, WpTerm } from '../../scripts/web-import/mapping';
import type { WpMedia } from '../../scripts/web-import/media';

const SITE = 'sitio-viejo.test';
const HOSTS = [SITE, `www.${SITE}`];
const UP = `https://${SITE}/wp-content/uploads/2026/03`;
const SECRET_EMAIL = 'premio.inventado@correo.test';

const term = (id: number, slug: string, name: string): WpTerm => ({ id, slug, name, link: `https://${SITE}/categoria/${slug}/` });
const CATS = [term(1, 'tachira', 'Táchira'), term(2, 'opinion', 'Opinión'), term(3, 'biografia', 'BIOGRAFÍA')];

function wpPost(id: number, slug: string, over: Partial<WpPost> = {}): WpPost {
  return {
    id, slug, date: '2026-03-10T09:00:00', date_gmt: '2026-03-10T13:00:00', modified: '2026-03-10T09:00:00', modified_gmt: '2026-03-10T13:00:00',
    status: 'publish', type: 'post', link: `https://${SITE}/2026/03/${slug}/`, title: { rendered: `Nota ${id} (prueba)` },
    content: { rendered: `<p>Texto de la nota ${id}, inventado.</p>` }, excerpt: { rendered: '' }, featured_media: 0, categories: [1], tags: [], ...over,
  };
}
const wpMedia = (id: number, file: string): WpMedia => ({ id, source_url: `${UP}/${file}`, alt_text: '', caption: { rendered: '' }, media_details: { width: 320, height: 200 } });

/** The old site, in memory: its posts, its media library, its files, and what the importer asked for. */
function oldSite() {
  const posts: WpPost[] = [
    wpPost(501, 'nota-uno', {
      featured_media: 9001,
      categories: [1],
      tags: [21, 22],
      content: {
        rendered: `<p>Para inscribirse, escribir a ${SECRET_EMAIL} antes del viernes.</p>
          <p><img class="size-medium wp-image-9002" src="${UP}/dentro-300x200.png" alt=""></p>
          <p><img src="https://cdn.otro.test/ajena.jpg" alt="De otra página"></p>
          <figure class="wp-block-embed is-provider-youtube"><iframe src="https://www.youtube.com/embed/Abc_def-123"></iframe></figure>`,
      },
    }),
    wpPost(502, 'nota-que-choca', { categories: [2] }),
    wpPost(503, 'biografia', { categories: [3], link: `https://${SITE}/2014/07/biografia/`, date_gmt: '2014-07-14T13:00:00' }),
  ];
  const media = new Map<number, WpMedia>([[9001, wpMedia(9001, 'portada.png')], [9002, wpMedia(9002, 'dentro.png')]]);
  const files = new Map<string, Uint8Array>([[`${UP}/portada.png`, pngOf(320, 200)], [`${UP}/dentro.png`, pngOf(330, 210)]]);
  const requested: string[] = [];
  const api: RunOptions['api'] = {
    counts: async () => ({ posts: posts.length, pages: 1 }),
    categories: async () => CATS,
    async *posts(o) {
      yield { posts: posts.slice(0, o?.limit ?? posts.length).map((p) => structuredClone(p)), total: posts.length };
    },
    media: async (ids) => new Map(ids.filter((id) => media.has(id)).map((id) => [id, media.get(id)!])),
    tags: async (ids) => new Map(ids.map((id) => [id, { id, slug: `etiqueta-${id}`, name: `Etiqueta ${id}`, link: `https://${SITE}/tag/etiqueta-${id}/` }])),
  };
  const photos = {
    requests: 0,
    async bytes(url: string) {
      requested.push(url);
      return files.get(url) ?? null;
    },
  };
  return { posts, media, files, requested, api, photos };
}

let t: TestDb;
const store = memoryMediaStore();
let site: ReturnType<typeof oldSite>;
const run = (o: Partial<RunOptions> = {}) =>
  runImport({ api: site.api, photos: site.photos, site: SITE, ownHosts: HOSTS, apply: false, db: t.backend, store, tz: 'America/Caracas', ...o });
const sys = <T,>(q: string, p: unknown[] = []) => t.system((sql) => sql.query<T>(q, p));
const one = async <T,>(q: string, p: unknown[] = []) => (await sys<T>(q, p))[0];
const totals = () =>
  one<Record<string, number>>(`select (select count(*) from public.web_items)::int as items, (select count(*) from public.web_media)::int as media,
    (select count(*) from public.web_redirects)::int as redirects, (select count(*) from public.web_import_items)::int as imported,
    (select count(*) from public.web_import_media)::int as imported_media, (select count(*) from public.web_versions)::int as versions,
    (select count(*) from public.audit_log)::int as audit`);
type Item = { id: string; slug: string; status: string; rev: number; draft: Record<string, unknown>; published: unknown };
const item = (slug: string) => one<Item>(`select id, slug, status, rev, draft, published from public.web_items where kind = 'news' and slug = $1`, [slug]);
const redirect = async (from: string) => (await one<{ to_path: string; source: string }>(`select to_path, source from public.web_redirects where from_path = $1`, [from])) ?? null;
const asEditor = <T,>(fn: (sql: Sql) => Promise<T>) => t.as('webEditor', fn);
const asPublisher = <T,>(fn: (sql: Sql) => Promise<T>) => t.as('webPublisher', fn);

beforeAll(async () => {
  t = await makeTestDb();
  site = oldSite();
  // Something of the team already uses the address of post 502; and a redirect someone made by hand.
  await sys(`insert into public.web_items (kind, slug, draft) values ('news', 'nota-que-choca', '{"title":"Nota del equipo (prueba)","category":"noticia","body":[]}'::jsonb)`);
  await sys(`insert into public.web_redirects (from_path, to_path, source) values ('/categoria/opinion', '/gobernador', 'manual')`);
}, 120_000);

describe('el importador contra la base', () => {
  it('la prueba no escribe nada, ni con la base a la mano: ni filas, ni archivos, ni auditoría, ni una foto bajada', async () => {
    const before = await totals();
    const r = await run();
    expect(await totals()).toEqual(before);
    expect(store.files.size).toBe(0);
    expect(site.requested).toEqual([]);
    expect(r.apply).toBe(false);
    expect(r.actions).toMatchObject({ new: 3, update: 0, unchanged: 0 });
    expect(r.photos).toMatchObject({ found: 3, cover: 1, inline: 2, wouldDownload: 2, external: 1, altMissing: 2 });
    expect(r.redirects).toMatchObject({ posts: 3, shortlinks: 3, photos: 2, categories: 3, tags: 2, months: 2, feed: 1 });
    expect(reportText(r)).toMatch(/no se escribió nada/);
    expect(reportText(r)).not.toContain(SECRET_EMAIL);
  });

  it('--apply: borradores que nunca se publican, fotos con «[Por escribir]», de dónde vino cada uno y sus redirecciones', async () => {
    const r = await run({ apply: true });
    expect(r.errors).toEqual([]);
    expect(r.actions).toMatchObject({ new: 3 });
    const uno = (await item('nota-uno'))!;
    expect(uno).toMatchObject({ status: 'draft', published: null });
    expect(uno.draft).toMatchObject({ title: 'Nota 501 (prueba)', date: '2026-03-10', category: 'noticia', topics: ['Táchira'], youtubeId: 'Abc_def-123' });
    expect(JSON.stringify(uno.draft.body)).toContain(REMOVED_MARKS.email);
    const media = await sys<{ id: string; alt: string; mime: string; width: number; storage_key: string }>(
      `select id, alt, mime, width, storage_key from public.web_media where id = any ($1::uuid[]) order by width`,
      [[uno.draft.coverId, ...(uno.draft.galleryIds as string[])]],
    );
    expect(media).toHaveLength(2);
    expect(media.every((m) => m.alt === ALT_PLACEHOLDER && m.mime === 'image/png')).toBe(true);
    expect(store.files.size).toBe(2);
    // The photo of another site was never asked for.
    expect(site.requested.some((u) => u.includes('otro.test'))).toBe(false);
    const where = await one<{ item_rev: number; review_flags: string[]; source_url: string }>(`select item_rev, review_flags, source_url from public.web_import_items where source_id = 501`);
    expect(where).toMatchObject({ item_rev: uno.rev, source_url: `https://${SITE}/2026/03/nota-uno/` });
    expect(where!.review_flags).toEqual(expect.arrayContaining(['email_removed', 'alt_missing', 'image_external']));
    // Another content had the address: this one gets its id.
    expect((await item('nota-que-choca-502'))?.status).toBe('draft');
    expect(await redirect('/2026/03/nota-uno')).toEqual({ to_path: '/actualidad/nota-uno', source: 'importador' });
    expect(await redirect('/?p=501')).toEqual({ to_path: '/actualidad/nota-uno', source: 'importador' });
    expect(await redirect('/2026/03/nota-que-choca')).toEqual({ to_path: '/actualidad/nota-que-choca-502', source: 'importador' });
    // The client's seed already has the biography's and the feed's (by hand, docs/diagnostico.md §5): they stay.
    expect(await redirect('/2014/07/biografia')).toEqual({ to_path: '/gobernador', source: 'manual' });
    expect(await redirect('/feed')).toEqual({ to_path: '/actualidad', source: 'manual' });
    expect(await redirect('/?p=503')).toEqual({ to_path: '/gobernador', source: 'importador' });
    expect(await redirect('/categoria/tachira')).toEqual({ to_path: '/actualidad?q=tachira', source: 'importador' });
    expect(await redirect('/categoria/opinion')).toEqual({ to_path: '/gobernador', source: 'manual' });
    expect(r.redirects.keptManual).toBe(3);
    expect(await redirect('/tag/etiqueta-21')).toEqual({ to_path: '/actualidad?q=Etiqueta%2021', source: 'importador' });
    expect(await redirect('/2026/03')).toEqual({ to_path: '/actualidad', source: 'importador' });
    const cover = media.find((m) => m.id === uno.draft.coverId)!;
    expect(await redirect('/wp-content/uploads/2026/03/portada.png')).toEqual({ to_path: `/api/archivos/web/${cover.storage_key}`, source: 'importador' });
    // The email never reached a table, the history or the audit.
    const leaks = await one<{ n: number }>(
      `select ((select count(*) from public.web_items where draft::text like $1) + (select count(*) from public.web_versions where snapshot::text like $1)
             + (select count(*) from public.audit_log where coalesce(new_data::text, '') like $1 or coalesce(old_data::text, '') like $1)
             + (select count(*) from public.web_import_items where review_flags::text like $1))::int as n`,
      [`%${SECRET_EMAIL}%`],
    );
    expect(leaks!.n).toBe(0);
  });

  it('otra corrida sin cambios no escribe nada, ni baja otra vez las fotos', async () => {
    const before = await totals();
    const asked = site.requested.length;
    const r = await run({ apply: true });
    expect(r.actions).toMatchObject({ unchanged: 3, new: 0, update: 0 });
    expect(await totals()).toEqual(before);
    expect(site.requested.length).toBe(asked);
    // A dry run now says the same, reading the base.
    expect((await run()).actions).toMatchObject({ unchanged: 3 });
  });

  it('si el artículo cambió en la web vieja y nadie tocó el borrador, se actualiza (una versión nueva)', async () => {
    const before = (await item('nota-que-choca-502'))!;
    site.posts[1].content.rendered = '<p>Texto corregido en la web vieja (prueba).</p>';
    const r = await run({ apply: true });
    expect(r.actions).toMatchObject({ update: 1, unchanged: 2 });
    const after = (await item('nota-que-choca-502'))!;
    expect(after.rev).toBeGreaterThan(before.rev);
    expect(after.draft.body).toEqual([{ type: 'paragraph', text: 'Texto corregido en la web vieja (prueba).' }]);
    expect((await one<{ item_rev: number }>(`select item_rev from public.web_import_items where source_id = 502`))!.item_rev).toBe(after.rev);
    expect((await one<{ note: string }>(`select note from public.web_versions where item_id = $1 order by version_no desc limit 1`, [after.id]))!.note).toMatch(/web vieja/);
  });

  it('la base no deja publicar una foto con «[Por escribir]» ni un texto con las marcas del importador', async () => {
    const uno = (await item('nota-uno'))!;
    const publish = (rev: number) => asPublisher((sql) => sql.one(`select public.publish_web_item($1, $2) as at`, [uno.id, rev]));
    await expect(publish(uno.rev)).rejects.toThrow(/todavía no tiene su texto alternativo/);
    await asEditor((sql) => sql.query(`update public.web_media set alt = 'Una plaza con árboles (prueba)' where id = any ($1::uuid[])`, [[uno.draft.coverId, ...(uno.draft.galleryIds as string[])]]));
    await expect(publish(uno.rev)).rejects.toThrow(/marca del importador/);
    await asEditor((sql) => sql.query(`update public.web_items set draft = replace(draft::text, $2, 'la organización')::jsonb where id = $1`, [uno.id, REMOVED_MARKS.email]));
    const fixed = (await item('nota-uno'))!;
    await publish(fixed.rev);
    expect((await item('nota-uno'))!.published).not.toBeNull();
  });

  it('lo que el equipo tocó no se vuelve a tocar: publicado, editado o enviado a aprobación', async () => {
    const choca = (await item('nota-que-choca-502'))!;
    await asEditor((sql) => sql.query(`update public.web_items set draft = jsonb_set(draft, '{title}', '"Título del equipo (prueba)"') where id = $1`, [choca.id]));
    const bio = (await item('biografia'))!;
    await asEditor((sql) => sql.query(`update public.web_items set status = 'in_review' where id = $1`, [bio.id]));
    for (const p of site.posts) p.content.rendered += '<p>Otro cambio en la web vieja (prueba).</p>';
    const before = await totals();
    const r = await run({ apply: true });
    expect(r.actions).toMatchObject({ published: 1, edited: 1, in_review: 1, update: 0, new: 0 });
    expect(await totals()).toEqual(before);
    expect((await item('nota-que-choca-502'))!.draft.title).toBe('Título del equipo (prueba)');
  });

  it('una foto que ya se trajo no se baja otra vez; la misma con otra dirección queda como un solo archivo; --no-media no trae ninguna', async () => {
    const mediaBefore = (await totals())!.media;
    site.files.set(`${UP}/copia-sin-id.png`, pngOf(320, 200));
    site.posts.push(
      wpPost(504, 'nota-con-la-misma-portada', { featured_media: 9001 }),
      wpPost(505, 'nota-con-una-copia', { content: { rendered: `<p>Texto (prueba).</p><p><img src="${UP}/copia-sin-id.png"></p>` } }),
    );
    const asked = site.requested.length;
    const r = await run({ apply: true });
    expect(r.actions).toMatchObject({ new: 2 });
    expect((await totals())!.media).toBe(mediaBefore);
    // 9001 was not asked again; the copy was (it has no id), and turned out to be the same file.
    expect(site.requested.slice(asked)).toEqual([`${UP}/copia-sin-id.png`]);
    const a = (await item('nota-con-la-misma-portada'))!;
    const b = (await item('nota-con-una-copia'))!;
    expect(b.draft.coverId).toBe(a.draft.coverId);
    expect(await redirect('/wp-content/uploads/2026/03/copia-sin-id.png')).toMatchObject({ source: 'importador' });

    site.posts.push(wpPost(506, 'nota-sin-fotos', { featured_media: 9002 }));
    site.media.set(9003, wpMedia(9003, 'nueva.png'));
    site.posts[site.posts.length - 1].content.rendered = `<p>Texto (prueba).</p><img class="wp-image-9003" src="${UP}/nueva.png">`;
    const filesBefore = store.files.size;
    const nm = await run({ apply: true, noMedia: true });
    const sin = (await item('nota-sin-fotos'))!;
    expect(sin.draft.galleryIds).toEqual([]);
    expect(store.files.size).toBe(filesBefore);
    expect(nm.flags.media_skipped).toBe(1);
  });
});
