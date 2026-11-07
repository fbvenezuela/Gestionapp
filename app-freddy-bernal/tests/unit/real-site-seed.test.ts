// The official site's content seeded at the demo's boot (src/lib/db/index.ts seedDemoData → seed-parts/web-real.ts), on
// the real in-memory database with every migration, with the snapshot of an INVENTED site (tests/fixtures/real-site):
// two servers seed the very same rows; everything is published and passes the importer's last gate; the pages and the
// settings as the design says; the invented citizen requests stay, no invented web item and no public «lo atendido»;
// a snapshot the database refuses leaves the demo with its invented content.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClientConfig } from '@/lib/client-config';
import { seedDemoData } from '@/lib/db';
import { asAnon, asSystem, type Backend } from '@/lib/db/core';
import { createMemoryDb } from '@/lib/db/pglite';
import { stableId } from '@/lib/db/seed-parts/web';
import { DEMO_FAQS, DEMO_NEWS } from '@/lib/db/seed-parts/web-content';
import { REAL_DEMO_BANNER, realFaqs } from '@/lib/db/seed-parts/web-real';
import { DENUNCIA_NOTICE, EMERGENCY_NOTICE } from '@/lib/participation/notices';
import { DEMO_REQUESTS } from '@/lib/db/seed-parts/web-requests';
import { importOrigin } from '@/lib/data/web-admin';
import type { Block, TextNode } from '@/lib/web/blocks';
import { REMOVED_MARKS } from '@/lib/web/import-marks';
import { publishedList, publishedBySlug, publicSettings, publicAttended } from '@/lib/web/public';
import type { RealSnapshot } from '@/lib/web/real-site';
import { demoClientConfig, demoSnapshot, DEMO_HOST } from '../fixtures/real-site/site';

let real: RealSnapshot;
let cfg: ClientConfig;
let a: Backend;
let b: Backend;
const sys = <T,>(db: Backend, q: string, p: unknown[] = []) => asSystem(db, (sql) => sql.query<T>(q, p));

beforeAll(async () => {
  real = (await demoSnapshot()).snapshot;
  cfg = demoClientConfig();
  a = (await createMemoryDb()).backend;
  expect(await seedDemoData(a, real, cfg)).toBe('real');
  b = (await createMemoryDb()).backend;
  expect(await seedDemoData(b, real, cfg)).toBe('real');
}, 300_000);

describe('el contenido real en la demo', () => {
  it('dos servidores siembran exactamente las mismas filas (ids, direcciones, versiones, solicitudes)', async () => {
    const tables = [
      `select id, kind, slug, status, rev from public.web_items order by id`,
      `select id, storage_key, alt from public.web_media order by id`,
      `select id, item_id, version_no from public.web_versions order by id`,
      `select id, item_id, source_id from public.web_import_items order by id`,
      `select id, from_path, to_path from public.web_redirects order by id`,
      `select id, reference from public.requests order by id`,
    ];
    for (const q of tables) expect(await sys(b, q), q).toEqual(await sys(a, q));
    const ids = (await sys<{ id: string }>(a, `select id from public.web_items where kind <> 'page' and kind <> 'faq' order by id`)).map((r) => r.id);
    expect(ids).toEqual(real.items.map((i) => i.id).sort());
  });

  it('todo publicado, como lo publica quien aprueba la web, y pasa la última puerta (sin «[Por escribir]» ni marcas)', async () => {
    const rows = await sys<{ kind: string; status: string; published: unknown; published_media: Record<string, { alt: string; kind: string }>; published_by: string }>(
      a, `select kind, status, published, published_media, published_by from public.web_items`,
    );
    expect(rows.every((r) => r.status === 'published' && r.published)).toBe(true);
    expect(new Set(rows.map((r) => r.published_by))).toEqual(new Set(['00000000-0000-4000-8000-0000000000c2']));
    for (const r of rows) {
      for (const m of Object.values(r.published_media)) if (m.kind === 'image') expect(m.alt).not.toMatch(/^\[Por escribir\]/);
      for (const mark of Object.values(REMOVED_MARKS)) expect(JSON.stringify(r.published)).not.toContain(mark);
    }
    expect(rows.filter((r) => r.kind === 'page')).toHaveLength(cfg.web.pages.length);
    // The gate lets it be published again (as the publisher would).
    await asSystem(a, (sql) => sql.query(`select public.publish_web_item($1, null)`, [real.items[0].id]));
    // The photos the news froze are the snapshot's, with their alternative text.
    const news = await asAnon(a, (sql) => publishedBySlug(sql, 'news', 'inauguran-cancha-deportiva-demo'));
    const cover = real.media.find((m) => m.id === news!.data.coverId)!;
    expect(news!.media[cover.id]).toMatchObject({ key: cover.key, alt: cover.alt, width: cover.width });
  });

  it('el público ve las notas, la opinión, las emisiones, el Semanario y las preguntas de atención (sin «(demo)» en estas)', async () => {
    const list = await asAnon(a, async (sql) => ({
      news: await publishedList(sql, { kind: 'news', limit: 100 }),
      opinion: await publishedList(sql, { kind: 'news', category: 'articulo' }),
      episodes: await publishedList(sql, { kind: 'episode' }),
      weekly: await publishedList(sql, { kind: 'document', category: 'semanario' }),
      faqs: await publishedList(sql, { kind: 'faq', category: 'atencion', limit: 50 }),
      projects: await publishedList(sql, { kind: 'project' }),
      notices: await publishedList(sql, { kind: 'notice' }),
      indicators: await publishedList(sql, { kind: 'indicator' }),
    }));
    expect(list.news.total).toBe(real.report.news + real.report.opinion);
    expect(list.opinion.total).toBe(real.report.opinion);
    expect(list.episodes.total).toBe(real.report.episodes);
    expect(list.weekly.items.map((d) => d.data.title)).toEqual(['Semanario de prueba (demo)']);
    expect(list.weekly.items[0].media[list.weekly.items[0].data.fileId!]).toMatchObject({ kind: 'document', mime: 'application/pdf' });
    expect(list.faqs.items.map((f) => f.data.title).sort()).toEqual(realFaqs().map((f) => f.q).sort());
    for (const f of list.faqs.items) expect(JSON.stringify(f.data)).not.toMatch(/\(demo\)|\btú\b|Por completar|el equipo|huella/i);
    // The two legal notices answer with their one text (src/lib/participation/notices.ts), word for word.
    const answer = (slug: string) => list.faqs.items.find((f) => f.slug === slug)!.data.answer;
    expect(answer('servicio-de-emergencias')).toEqual([{ type: 'paragraph', text: EMERGENCY_NOTICE }]);
    expect(answer('quien-lee-una-denuncia')).toEqual([{ type: 'paragraph', text: DENUNCIA_NOTICE }]);
    expect([list.projects.total, list.notices.total, list.indicators.total]).toEqual([0, 0, 0]);
  });

  it('la portada: el nombre, el lema y la foto de la web oficial; nada sin contenido; opinión y Semanario tras las noticias', async () => {
    const home = (await asAnon(a, (sql) => publishedBySlug(sql, 'page', 'inicio')))!;
    const blocks = home.data.blocks as Block[];
    const hero = blocks.find((x) => x.type === 'hero')!;
    expect(hero.data).toMatchObject({ title: 'Persona Demo', text: 'Gobernadora de prueba (demo)', mediaId: real.pages.heroMediaId });
    expect(home.media[real.pages.heroMediaId!]).toMatchObject({ kind: 'image' });
    for (const id of ['indicadores', 'atendido', 'gestion', 'avisos']) expect(blocks.find((x) => x.id === id)?.visible, id).toBe(false);
    const at = blocks.findIndex((x) => x.id === 'actualidad');
    expect(blocks.slice(at + 1, at + 3)).toEqual([
      { id: 'opinion', type: 'news', visible: true, data: { title: 'Opinión', category: 'articulo', limit: 2 } },
      { id: 'semanario', type: 'documents', visible: true, data: { title: 'Semanario', category: 'semanario', limit: 1, ids: [] } },
    ]);
  });

  it('el gobernador: su foto, la biografía, la toma de posesión, las condecoraciones y la fuente; sin material de prensa', async () => {
    const page = (await asAnon(a, (sql) => publishedBySlug(sql, 'page', 'gobernador')))!;
    const blocks = page.data.blocks as Block[];
    expect(blocks.find((x) => x.type === 'hero')!.data).toMatchObject({ mediaId: real.pages.bioMediaId });
    const content = (blocks.find((x) => x.id === 'biografia')!.data as { content: TextNode[] }).content;
    expect(content.filter((n) => n.type === 'heading' && n.level === 2).map((n) => (n as { text: string }).text)).toEqual(['Biografía', cfg.web.structuredData.jobTitle, 'Condecoraciones']);
    expect(JSON.stringify(content)).not.toMatch(/Por completar|"pending"/);
    expect(content[content.length - 1]).toEqual({ type: 'paragraph', runs: [{ text: 'Fuente: ' }, { text: DEMO_HOST, href: real.pages.bioSourceUrl }] });
    expect(blocks.find((x) => x.id === 'prensa')?.visible).toBe(false);
  });

  it('los ajustes: el aviso de prueba, el menú sin Gestión, verificadas solo las cuentas que enlaza el canal, sin notas internas', async () => {
    const s = await asAnon(a, (sql) => publicSettings(sql));
    expect(s['site.demo_banner']).toBe(REAL_DEMO_BANNER);
    const nav = s['site.navigation'] as { path: string }[];
    expect(nav.map((l) => l.path)).not.toContain('/gestion');
    expect(nav.length).toBe((cfg.web.settings['site.navigation'] as unknown[]).length - 1);
    const accounts = s['site.social_accounts'] as { network: string; handle: string; verified: boolean; note?: string }[];
    expect(accounts.filter((x) => x.verified).map((x) => `${x.network} ${x.handle}`)).toEqual([
      'youtube @CanalDemo.oficial', 'instagram @cuenta_demo', 'x @cuenta_demo', 'facebook Persona Demo',
    ]);
    expect(accounts.find((x) => x.network === 'tiktok')!.verified).toBe(false);
    expect(JSON.stringify(accounts)).not.toMatch(/"note"/);
    expect(s['site.youtube_channel']).toMatchObject({ handle: '@CanalDemo.oficial', verified: true });
    expect(s['site.youtube_channel']).not.toHaveProperty('note');
  });

  it('quedan las solicitudes inventadas (y sus comprobantes); no hay contenido web inventado ni «lo atendido» público', async () => {
    const year = new Date().getFullYear();
    const [requests] = await sys<{ n: number; showcase: number }>(
      a, `select count(*)::int as n, count(*) filter (where reference like $1)::int as showcase from public.requests`, [`AC-${year}-DEMR0%`],
    );
    expect(requests).toEqual({ n: DEMO_REQUESTS.length, showcase: 3 });
    const invented = [...DEMO_NEWS.map((x) => stableId(`item:news:${x.slug}`)), ...DEMO_FAQS.map((f) => stableId(`item:faq:${f.slug}`))];
    expect(await sys(a, `select id from public.web_items where id = any ($1::uuid[])`, [invented])).toEqual([]);
    expect(await sys(a, `select id from public.attended_publications`)).toEqual([]);
    expect(await sys(a, `select id from public.request_events where kind = 'attended_published'`)).toEqual([]);
    expect(await asAnon(a, (sql) => publicAttended(sql, 10))).toEqual([]);
    // A request that pointed at an invented project points at nothing now.
    expect(await sys(a, `select id from public.requests where linked_item_id is not null`)).toEqual([]);
  });

  it('las direcciones viejas (del importador, sin pisar las hechas a mano) y de dónde vino cada nota', async () => {
    const redirects = await sys<{ from_path: string; to_path: string }>(a, `select from_path, to_path from public.web_redirects where source = 'importador' order by from_path`);
    expect(redirects.map((r) => ({ from: r.from_path, to: r.to_path }))).toEqual(real.redirects);
    expect(await sys(a, `select to_path from public.web_redirects where from_path = '/2014/07/biografia' and source = 'manual'`)).toEqual([{ to_path: '/gobernador' }]);
    const news = real.items.filter((i) => i.kind === 'news');
    expect(await sys(a, `select count(*)::int as n from public.web_import_items`)).toEqual([{ n: news.length }]);
    const origin = await asSystem(a, (sql) => importOrigin(sql, news[0].id));
    expect(origin).toMatchObject({ sourceUrl: news[0].source!.url, sourcePath: news[0].source!.path, flags: [] });
  });
});

describe('si la base no acepta la foto', () => {
  it('nada de ella queda y la demo sale con su contenido inventado', async () => {
    const broken = structuredClone(real);
    delete broken.media.find((m) => m.kind === 'image')!.width;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = (await createMemoryDb()).backend;
    expect(await seedDemoData(c, broken, cfg)).toBe('invented');
    expect(error.mock.calls.join(' ')).toMatch(/no se pudo sembrar/);
    expect(await sys(c, `select id from public.web_items where id = any ($1::uuid[])`, [real.items.map((i) => i.id)])).toEqual([]);
    const [n] = await sys<{ n: number }>(c, `select count(*)::int as n from public.web_items where kind = 'news'`);
    expect(n.n).toBe(DEMO_NEWS.length);
    error.mockRestore();
  }, 240_000);
});
