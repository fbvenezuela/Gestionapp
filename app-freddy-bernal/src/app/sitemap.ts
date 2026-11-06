import type { MetadataRoute } from 'next';
import { getItem, listItems } from '@/lib/web/cache';
import { itemPath, pagePath } from '@/lib/web/routes';
import { siteBaseUrl } from '@/lib/web/site';

// sitemap.xml (docs/diagnostico.md problem 5): only what is published and public — the sections, the pages the publisher
// approved, every news item and every project. Never the panel, the admin, the private lookup or the API. Read as anon
// (D-96) and cached like the pages; refreshed every five minutes and when something is published (revalidate.ts).
export const revalidate = 300;

const SECTIONS = ['/gestion', '/actualidad', '/actualidad/semanario', '/reporte-bernal', '/transparencia', '/canales', '/atencion', '/atencion/nueva', '/atencion/atendido'];
const PAGES = ['inicio', 'gobernador', 'aviso-de-privacidad', 'condiciones-de-participacion', 'accesibilidad'];

/** Every published item of a kind, page by page (the database answers at most 100 per read). */
async function all(kind: 'news' | 'project') {
  const out = [];
  for (let offset = 0; offset < 50_000; offset += 100) {
    const { items, total } = await listItems({ kind, limit: 100, offset });
    out.push(...items);
    if (!items.length || offset + 100 >= total) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();
  const [pages, news, projects] = await Promise.all([Promise.all(PAGES.map((slug) => getItem('page', slug))), all('news'), all('project')]);
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();
  const add = (path: string, lastModified?: string, priority?: number) => {
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({ url: `${base}${path === '/' ? '/' : path}`, ...(lastModified ? { lastModified } : {}), ...(priority ? { priority } : {}) });
  };
  for (const p of pages) if (p) add(pagePath(p.slug) ?? `/${p.slug}`, p.publishedAt, p.slug === 'inicio' ? 1 : 0.8);
  add('/', undefined, 1);
  for (const path of SECTIONS) add(path, undefined, 0.7);
  for (const n of news) add(itemPath('news', n.slug)!, n.publishedAt, 0.6);
  for (const p of projects) add(itemPath('project', p.slug)!, p.publishedAt, 0.6);
  return entries;
}
