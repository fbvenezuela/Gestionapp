import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fb from '../../config/clients/fb.json';
import { programNameOf } from '../../src/lib/web/program-name';

// What the specs of the public website share (web-marco, web-portada, web-noticias and web-paginas, which were
// web-publica.spec.ts until 19/11/2026): its pages and their h1, the scaffolding no public page may show, the checks
// every page passes (no serious accessibility problem, no sideways scroll) and the measure of what a fresh visit downloads.

// The weekly program's name is the client's (its menu label in config/clients/fb.json), never written here.
export const PROGRAM = programNameOf(fb);

export const PAGES: [string, RegExp | string][] = [
  ['/', /Freddy Bernal/],
  ['/gobernador', /Freddy Bernal/],
  ['/gestion', 'Gestión y obras'],
  ['/gestion?vista=linea', 'Gestión y obras'],
  ['/actualidad', 'Noticias'],
  ['/actualidad/semanario', 'Semanario'],
  ['/reporte-bernal', PROGRAM],
  ['/transparencia', 'Documentos y cifras'],
  ['/canales', 'Canales oficiales'],
  ['/aviso-de-privacidad', 'Aviso de privacidad'],
  ['/condiciones-de-participacion', 'Condiciones de participación'],
  ['/accesibilidad', 'Accesibilidad'],
];

// What only the administrator's preview may draw (F1), and the CMS's version number under a block page (F6): never on
// a public page. (A document's own «Versión 1» label is content, not this.)
export const SCAFFOLDING = /Por completar|por subir desde el administrador|Video por enlazar|Imagen del episodio por subir|Archivo por subir|Publicado el [^\n]*versión \d|por confirmar/i;

export async function noScaffolding(page: Page, where: string) {
  expect(await page.locator('body').innerText(), where).not.toMatch(SCAFFOLDING);
}

export async function noSerious(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

export async function fitsWidth(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

export async function firstLink(page: Page, prefix: string): Promise<string> {
  const href = await page.locator(`main a[href^="${prefix}"]`).first().getAttribute('href');
  expect(href, prefix).toBeTruthy();
  return href!;
}

/** Bytes over the wire for a fresh visit (encoded bodies + response headers), scrolled to the end. `next start` only
 * compresses with gzip; Vercel (the test version) serves brotli, so the same bodies are also compressed with brotli at a
 * moderate level (5, as for responses compressed on the fly) to estimate what a phone downloads there. Fonts and photos
 * are already compressed formats: they count as they are. */
export async function transfer(browser: Browser, url: string, blockImages: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  if (blockImages) await page.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  const sizes: Promise<{ type: string; bytes: number; brotli: number }>[] = [];
  page.on('requestfinished', (req) =>
    sizes.push(
      (async () => {
        const s = await req.sizes();
        const type = req.resourceType();
        let body = s.responseBodySize;
        if (type !== 'image' && type !== 'font') {
          const raw = await (await req.response())?.body().catch(() => null);
          if (raw?.length) body = brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }).length;
        }
        return { type, bytes: s.responseBodySize + s.responseHeadersSize, brotli: body + s.responseHeadersSize };
      })(),
    ),
  );
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const all = await Promise.all(sizes);
  await ctx.close();
  const byType: Record<string, number> = {};
  for (const s of all) byType[s.type] = (byType[s.type] ?? 0) + s.bytes;
  return { bytes: all.reduce((a, s) => a + s.bytes, 0), brotli: all.reduce((a, s) => a + s.brotli, 0), requests: all.length, byType };
}
