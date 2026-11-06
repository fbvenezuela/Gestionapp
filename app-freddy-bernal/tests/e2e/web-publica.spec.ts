import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The public website (D-91, design §1–§3), with no session, at 360 px and on a desktop: every page opens with its h1,
// fits the phone and has no serious accessibility problem; filters, search, pages and the timeline work with plain links;
// a news item and a project ficha open and point at the citizen form with what they are about; the phone menu opens on
// the FIRST tap even without JavaScript (the old site's bug); the demo says it is a demo; nothing is indexed (robots.txt,
// meta and header); old addresses answer 301; titles are unique and name the person once; and the home's weight is
// measured with and without photos (docs/diagnostico.md problem 11: the brief's target is under 200 KB without photos).

const PAGES: [string, RegExp | string][] = [
  ['/', /Saludos/],
  ['/gobernador', /Freddy Bernal/],
  ['/gestion', 'Gestión y obras'],
  ['/gestion?vista=linea', 'Gestión y obras'],
  ['/actualidad', 'Noticias y comunicados'],
  ['/actualidad/semanario', 'Semanario'],
  ['/reporte-bernal', 'Reporte Bernal'],
  ['/transparencia', 'Documentos y cifras'],
  ['/canales', 'Canales oficiales'],
  ['/aviso-de-privacidad', 'Aviso de privacidad'],
  ['/condiciones-de-participacion', 'Condiciones de participación'],
  ['/accesibilidad', 'Accesibilidad'],
];

async function noSerious(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function fitsWidth(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function firstLink(page: Page, prefix: string): Promise<string> {
  const href = await page.locator(`main a[href^="${prefix}"]`).first().getAttribute('href');
  expect(href, prefix).toBeTruthy();
  return href!;
}

test.describe('la web pública en el teléfono (360 px)', () => {
  test('cada página abre con su h1, cabe en el teléfono, sin problemas serios de accesibilidad y con títulos únicos', async ({ page }) => {
    const titles = new Map<string, string>();
    for (const [path, h1] of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: h1 }).first(), path).toBeVisible();
      await expect(page.locator('h1'), path).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Esta página no cargó' }), path).toHaveCount(0);
      await fitsWidth(page, path);
      await noSerious(page, path);
      const title = await page.title();
      expect((title.match(/Freddy Bernal/g) ?? []).length, `${path}: «${title}»`).toBeLessThanOrEqual(1);
      if (!path.includes('?')) titles.set(path, title);
    }
    const all = [...titles.values()];
    expect(new Set(all).size, all.join(' | ')).toBe(all.length);
  });

  test('el aviso fijo de la versión de prueba, las dos acciones a la vista y el pie con el año, las legales y «Entrar (equipo)»', async ({ page }) => {
    await page.goto('/gestion');
    await expect(page.getByRole('complementary', { name: 'Versión de prueba' })).toHaveText(/Versión de prueba: el contenido es inventado/);
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Hacer un reporte' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Consultar mi solicitud' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Hacer un reporte' })).toHaveAttribute('href', '/atencion/nueva?tipo=reporte');
    await expect(header.getByRole('link', { name: 'Consultar mi solicitud' })).toHaveAttribute('href', '/atencion/consultar');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText(`© ${new Date().getFullYear()}`);
    for (const name of ['Aviso de privacidad', 'Condiciones de participación', 'Accesibilidad']) await expect(footer.getByRole('link', { name })).toBeVisible();
    await expect(footer.getByText('por confirmar').first()).toBeVisible();
    await expect(footer.getByRole('link', { name: /YouTube @FreddyBernalOficial/i })).toHaveCount(0);
    await footer.getByRole('link', { name: 'Entrar (equipo)' }).click();
    await page.waitForURL(/\/entrar/);
  });

  test('el menú del teléfono abre al primer toque, lleva a la sección y se cierra; Escape lo cierra', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('navigation', { name: 'Secciones' });
    await expect(menu).toBeHidden();
    await page.locator('summary', { hasText: 'Menú' }).tap();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Transparencia' })).toBeVisible();
    await menu.getByRole('link', { name: 'Transparencia' }).tap();
    await page.waitForURL(/\/transparencia$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Documentos y cifras' })).toBeVisible();
    await expect(menu).toBeHidden();
    await page.locator('summary', { hasText: 'Menú' }).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('summary', { hasText: 'Menú' })).toBeFocused();
  });

  test('sin JavaScript: el contenido llega entero (sin esqueleto que espere un programa), la búsqueda funciona y el menú abre al primer toque', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true, baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    for (const [path, h1] of [['/', /Saludos/], ['/gestion?vista=linea', 'Gestión y obras'], ['/canales', 'Canales oficiales']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: h1 }), path).toBeVisible();
      await expect(page.getByText('Cargando…'), path).toHaveCount(0);
    }
    await page.goto('/gestion?vista=linea');
    await expect(page.locator('main ol li time').first()).toBeVisible();
    await page.goto('/actualidad');
    await page.getByLabel('Buscar', { exact: true }).fill('salud');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText(/resultados? para «salud»/)).toBeVisible();
    await page.locator('summary', { hasText: 'Menú' }).tap();
    await expect(page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Gestión' })).toBeVisible();
    await ctx.close();
  });

  test('«Saltar al contenido» es lo primero con el teclado y lleva al contenido', async ({ page }) => {
    await page.goto('/actualidad');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#contenido$/);
  });

  test('la portada: accesos de participación, lo hecho con su fuente, lo atendido, la gestión, el programa, las noticias y los canales', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    for (const [name, href] of [
      [/Hacer un reporte/, '/atencion/nueva?tipo=reporte'],
      [/Hacer una petición/, '/atencion/nueva?tipo=peticion'],
      [/Dejar una acotación/, '/atencion/nueva?tipo=acotacion'],
      [/Hacer una denuncia/, '/atencion/nueva?tipo=denuncia'],
      [/Consultar mi solicitud/, '/atencion/consultar'],
    ] as const) {
      await expect(main.getByRole('link', { name }).first(), String(name)).toHaveAttribute('href', href);
    }
    await expect(main.getByText(/no es un servicio de emergencias/i).first()).toBeVisible();
    await expect(main.getByText(/Fuente: Cifra inventada para la demostración/).first()).toBeVisible();
    for (const h2 of ['Lo hecho', 'Lo atendido', 'Gestión y obras', 'Reporte Bernal', 'Actualidad', 'Avisos de servicio', 'Canales oficiales']) {
      await expect(main.getByRole('heading', { level: 2, name: h2 }), h2).toBeVisible();
    }
    await expect(main.getByText('Video por enlazar desde el administrador')).toBeVisible();
    await expect(main.getByText('Foto por subir desde el administrador').first()).toBeVisible();
    // Nothing of YouTube loads until someone taps a video: no iframe on the page.
    await expect(page.locator('iframe')).toHaveCount(0);
    // Structured data: the person and the organization; no sameAs while no account is verified.
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!) as Record<string, unknown>[];
    const person = ld.find((x) => x['@type'] === 'Person')!;
    expect(person.name).toBe('Freddy Bernal');
    expect(person.jobTitle).toMatch(/Gobernador/);
    expect(person.sameAs).toBeUndefined();
    expect(ld.some((x) => x['@type'] === 'GovernmentOrganization')).toBe(true);
  });

  test('gestión: los filtros por estado, categoría y municipio, y la página siguiente', async ({ page }) => {
    await page.goto('/gestion');
    await expect(page.getByText(/^14 obras y acciones$/)).toBeVisible();
    await page.getByLabel('Estado').selectOption('concluido');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/estado=concluido/);
    const cards = page.locator('main ul li article');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const c of await cards.all()) await expect(c.getByText('Concluido', { exact: true })).toBeVisible();
    await page.getByLabel('Categoría').selectOption('agua');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/categoria=agua/);
    for (const c of await page.locator('main ul li article').all()) await expect(c.getByText('Agua', { exact: true })).toBeVisible();
    await page.goto('/gestion?municipio=junin');
    await expect(page.getByText(/^1 obra o acción$/)).toBeVisible();
    await expect(page.locator('main article').first()).toContainText('Junín');
    await page.getByRole('link', { name: 'Quitar los filtros' }).click();
    await page.waitForURL(/\/gestion$/);
    await page.getByRole('link', { name: 'Siguiente →' }).click();
    await page.waitForURL(/pagina=2/);
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
  });

  test('la línea de tiempo: todo lo más nuevo primero y el filtro solo por fecha', async ({ page }) => {
    await page.goto('/gestion?vista=linea');
    await expect(page.getByRole('link', { name: 'Línea de tiempo' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Todo, lo más nuevo primero')).toBeVisible();
    await expect(page.getByLabel('Municipio')).toHaveCount(0);
    const days = await page.locator('main ol li time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));
    expect(days.length).toBeGreaterThan(5);
    expect([...days].sort().reverse()).toEqual(days);
    const from = days[3];
    const to = days[1];
    await page.getByLabel('Desde').fill(from);
    await page.getByLabel('Hasta').fill(to);
    await page.getByRole('button', { name: 'Ver esas fechas' }).click();
    await page.waitForURL(/desde=/);
    await expect(page.getByText(/entradas? desde el/)).toBeVisible();
    const shown = await page.locator('main ol li time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(days.length);
    for (const d of shown) expect(d >= from && d <= to, d).toBe(true);
  });

  test('la ficha de una obra: sus datos con fuente y «Hacer una observación sobre esta obra» ligada a ella', async ({ page }) => {
    await page.goto('/gestion');
    const href = await firstLink(page, '/gestion/');
    await page.goto(href);
    const slug = href.split('/').pop()!;
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toBeVisible();
    await expect(page.getByText('Última actualización')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hacer una observación sobre esta obra' })).toHaveAttribute('href', `/atencion/nueva?sobre=project:${slug}`);
    await fitsWidth(page, href);
    await noSerious(page, href);
    expect((await page.request.get('/gestion/una-obra-que-no-existe')).status()).toBe(404);
  });

  test('actualidad: buscar, filtrar por tipo, pasar de página, abrir una nota y comentarla', async ({ page }) => {
    await page.goto('/actualidad');
    await page.getByLabel('Buscar', { exact: true }).fill('salud');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.waitForURL(/q=salud/);
    await expect(page.getByText(/resultados? para «salud»/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Jornada de salud en Junín/ })).toBeVisible();
    await page.goto('/actualidad?categoria=comunicado');
    for (const t of await page.locator('main article p:first-child').allTextContents()) expect(t).toMatch(/^Comunicado/);
    await page.goto('/actualidad');
    await page.getByRole('link', { name: 'Siguiente →' }).click();
    await page.waitForURL(/pagina=2/);
    await page.goto('/actualidad');
    const href = await firstLink(page, '/actualidad/');
    const link = page.locator(`main a[href="${href}"]`).first();
    const title = (await link.textContent())!.trim();
    await link.click();
    await page.waitForURL((u) => u.pathname === href);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/Por Prensa \(demo\)/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Comentar esta noticia' })).toHaveAttribute('href', `/atencion/nueva?sobre=news:${href.split('/').pop()}`);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').last().textContent())!) as Record<string, unknown>;
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.headline).toBe(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${href}$`));
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await noSerious(page, href);
  });

  test('el Semanario y transparencia: documentos con fecha, versión y archivo; las cifras con su definición', async ({ page }) => {
    await page.goto('/actualidad/semanario');
    await expect(page.getByRole('heading', { level: 2, name: /Semanario n\.º 12/ })).toBeVisible();
    const pdf = await page.getByRole('link', { name: /Ver el PDF/ }).first().getAttribute('href');
    const res = await page.request.get(pdf!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    await page.goto('/transparencia?q=semanario');
    await expect(page.getByText(/^3 documentos$/)).toBeVisible();
    await page.goto('/transparencia');
    await expect(page.getByRole('heading', { name: 'Cifras de la atención ciudadana' })).toBeVisible();
    await expect(page.getByText('Recibidas', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cómo se calcula cada cifra' })).toBeVisible();
    await expect(page.getByText('Por categoría (sin denuncias)')).toBeVisible();
    await page.getByRole('link', { name: 'Últimos 30 días' }).click();
    await page.waitForURL(/periodo=30d/);
    await expect(page.getByRole('link', { name: 'Últimos 30 días' })).toHaveAttribute('aria-current', 'page');
  });

  test('Reporte Bernal: el canal activo (por confirmar) y el video que solo carga al tocarlo', async ({ page }) => {
    await page.goto('/reporte-bernal');
    await expect(page.getByRole('link', { name: /Ver el canal en YouTube: @FreddyBernal\.oficial/ })).toHaveAttribute('href', 'https://www.youtube.com/@FreddyBernal.oficial');
    await expect(page.getByRole('main').getByText('por confirmar')).toBeVisible();
    await expect(page.locator('main a[href*="@FreddyBernalOficial"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Episodios anteriores' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('canales: la lista marcada y cómo reconocer los auténticos; sin portal mientras no esté verificado', async ({ page }) => {
    await page.goto('/canales');
    await expect(page.getByRole('heading', { name: 'Cómo reconocer los canales auténticos' })).toBeVisible();
    await expect(page.getByText(/te va a pedir dinero, claves/)).toBeVisible();
    await expect(page.getByText('Portal institucional')).toHaveCount(0);
    await expect(page.locator('main a[href^="https://www.youtube.com/@FreddyBernal.oficial"]')).toHaveCount(1);
    await expect(page.locator('main a[href*="@FreddyBernalOficial"]')).toHaveCount(0);
  });

  test('una dirección que no existe: la 404 de la web, con su marco y el camino de vuelta', async ({ page }) => {
    const res = await page.goto('/2019/09/3911');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Esta página no existe' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Hacer un reporte' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
    await noSerious(page, '404');
  });
});

test.describe('buscadores, cabeceras y direcciones viejas', () => {
  test('nada se indexa en la versión de prueba: robots.txt, la meta y la cabecera', async ({ page }) => {
    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toMatch(/User-Agent: \*\s+Disallow: \/\s/);
    for (const p of ['/admin', '/panel', '/atencion/consultar', '/api']) expect(robots).toContain(`Disallow: ${p}`);
    expect(robots).not.toContain('Sitemap:');
    const res = await page.goto('/');
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('la CSP de la web permite YouTube sin cookies y el mapa; el panel no la lleva', async ({ page }) => {
    const res = await page.request.get('/actualidad');
    const csp = res.headers()['content-security-policy'];
    expect(csp).toContain('frame-src https://www.youtube-nocookie.com');
    expect(csp).toContain('https://tile.openstreetmap.org');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()['permissions-policy']).toContain('geolocation=(self)');
    expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    const panel = await page.request.get('/entrar');
    expect(panel.headers()['content-security-policy']).toBeUndefined();
  });

  test('las direcciones viejas con destino responden 301; la búsqueda de WordPress pasa a actualidad', async ({ page }) => {
    const bio = await page.request.get('/2014/07/biografia', { maxRedirects: 0 });
    expect(bio.status()).toBe(301);
    expect(bio.headers()['location']).toMatch(/\/gobernador$/);
    const search = await page.request.get('/?s=agua', { maxRedirects: 0 });
    expect(search.status()).toBe(301);
    expect(search.headers()['location']).toMatch(/\/actualidad\?q=agua$/);
    await page.goto('/2014/07/biografia/');
    await expect(page).toHaveURL(/\/gobernador$/);
  });

  test('sitemap.xml: solo lo publicado (secciones, notas y obras), nunca el panel', async ({ page }) => {
    const xml = await (await page.request.get('/sitemap.xml')).text();
    expect(xml).toContain('/actualidad/arranco-rehabilitacion-avenida-principal-demo</loc>');
    expect(xml).toContain('/gestion/rehabilitacion-avenida-principal-demo</loc>');
    expect(xml).not.toMatch(/balance-del-mes-demo|proxima-jornada-de-vacunacion|\/panel|\/admin|\/atencion\/consultar/);
  });

  test('la imagen para compartir y las etiquetas Open Graph', async ({ page }) => {
    const img = await page.request.get('/opengraph-image');
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toBe('image/png');
    await page.goto('/canales');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/opengraph-image$/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'es_VE');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });
});

test.describe('la web pública en una computadora', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test('la barra de secciones marca dónde estoy; las acciones y las páginas sin problemas serios', async ({ page }) => {
    await page.goto('/gestion/rehabilitacion-avenida-principal-demo');
    const bar = page.getByRole('navigation', { name: 'Principal' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Gestión' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('summary', { hasText: 'Menú' })).toBeHidden();
    for (const [path] of PAGES) {
      await page.goto(path);
      await noSerious(page, `escritorio ${path}`);
      await fitsWidth(page, `escritorio ${path}`);
    }
  });
});

/** Bytes over the wire for a fresh visit (encoded bodies + response headers), scrolled to the end. `next start` only
 * compresses with gzip; Vercel (the test version) serves brotli, so the same bodies are also compressed with brotli at a
 * moderate level (5, as for responses compressed on the fly) to estimate what a phone downloads there. Fonts and photos
 * are already compressed formats: they count as they are. */
async function transfer(browser: Browser, url: string, blockImages: boolean) {
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

test('el peso de la portada, medido con y sin fotos (meta del encargo: menos de 200 KB sin fotos)', async ({ browser }) => {
  const base = test.info().project.use.baseURL!;
  const withImages = await transfer(browser, `${base}/`, false);
  const without = await transfer(browser, `${base}/`, true);
  const kb = (n: number) => Math.round(n / 1024);
  const note =
    `portada: ${kb(withImages.bytes)} KB con fotos (${withImages.requests} pedidos) · ${kb(without.bytes)} KB sin fotos (${without.requests} pedidos, gzip de next start)` +
    ` · ${kb(without.brotli)} KB sin fotos con brotli (estimado, como sirve Vercel)` +
    ` · por tipo sin fotos: ${Object.entries(without.byType).map(([t, b]) => `${t} ${kb(b)} KB`).join(', ')}`;
  test.info().annotations.push({ type: 'peso', description: note });
  console.log(note);
  // A guard against regressions, not the target: the target (200 KB) is reported with the measurement.
  expect(without.bytes).toBeLessThan(240 * 1024);
  expect(without.byType.image ?? 0).toBe(0);
});
