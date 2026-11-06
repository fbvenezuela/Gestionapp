// What the administrator calls after publishing (src/lib/web/revalidate.ts): the kind's tag right away (no stale page
// for whoever pressed «Publicar») and every page that shows the item, its own page and the sitemap. And every public page
// declares the same short revalidation (WEB_REVALIDATE), so a scheduled item appears within a minute by itself.
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ tags: [] as [string, unknown][], paths: [] as string[] }));
vi.mock('next/cache', () => ({
  revalidateTag: (tag: string, profile: unknown) => calls.tags.push([tag, profile]),
  revalidatePath: (p: string) => calls.paths.push(p),
  unstable_cache: (fn: unknown) => fn,
}));

import { revalidateWeb, revalidateWebItem, revalidateWebRedirects, revalidateWebSettings } from '@/lib/web/revalidate';
import { WEB_REVALIDATE, WEB_TAG } from '@/lib/web/tags';

beforeEach(() => {
  calls.tags.length = 0;
  calls.paths.length = 0;
});

describe('refrescar la web al publicar', () => {
  it('una noticia: su etiqueta ya, la portada, la lista, su página y el sitemap', () => {
    revalidateWebItem('news', 'una-nota');
    expect(calls.tags).toEqual([[WEB_TAG.kind('news'), { expire: 0 }]]);
    expect(calls.paths).toEqual(['/', '/actualidad', '/actualidad/una-nota', '/sitemap.xml']);
  });

  it('la página «inicio» refresca la portada; un documento, transparencia, el Semanario y el gobernador', () => {
    revalidateWebItem('page', 'inicio');
    expect(calls.paths).toContain('/');
    calls.paths.length = 0;
    revalidateWebItem('document');
    expect(calls.paths).toEqual(['/transparencia', '/actualidad/semanario', '/gobernador', '/sitemap.xml']);
  });

  it('los ajustes, las redirecciones y todo', () => {
    revalidateWebSettings();
    expect(calls.tags).toEqual([[WEB_TAG.settings, { expire: 0 }]]);
    calls.tags.length = 0;
    revalidateWebRedirects();
    expect(calls.tags).toEqual([[WEB_TAG.redirects, { expire: 0 }]]);
    calls.tags.length = 0;
    revalidateWeb();
    expect(calls.tags.map(([t]) => t)).toEqual(expect.arrayContaining([WEB_TAG.all, WEB_TAG.settings, WEB_TAG.catalogs, WEB_TAG.attended, WEB_TAG.stats]));
  });
});

describe('cada página pública se vuelve a leer sola', () => {
  const pages = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? pages(path.join(dir, d.name)) : d.name === 'page.tsx' ? [path.join(dir, d.name)] : []));

  it(`export const revalidate = ${WEB_REVALIDATE} en cada página del grupo (web) (un número fijo: Next lo lee sin ejecutar)`, () => {
    const mine = pages(path.join(process.cwd(), 'src', 'app', '(web)')).filter((f) => !f.includes(`${path.sep}atencion${path.sep}`));
    expect(mine.length).toBeGreaterThanOrEqual(12);
    for (const f of mine) expect(fs.readFileSync(f, 'utf8'), f).toContain(`export const revalidate = ${WEB_REVALIDATE};`);
  });
});
