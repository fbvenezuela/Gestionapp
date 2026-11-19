import { test, expect } from '@playwright/test';
import { PAGES, fitsWidth, noSerious } from './web-helpers';

// The public website's frame (D-91, design §1–§3), with no session, at 360 px and on a desktop: the demo says it is a
// demo; the header keeps its two actions in sight and the footer its year, legal pages and «Acceso del personal»; the phone
// menu opens on the FIRST tap even without JavaScript (the old site's bug) and the content arrives whole without it;
// «Saltar al contenido» comes first; an address that does not exist gets the 404 inside the frame; nothing is indexed
// (robots.txt, meta and header); the CSP; old addresses answer 301; the sitemap and the sharing image; the desktop bar.
// (Until 19/11/2026 in web-publica.spec.ts, with the home, the news and the pages; the shared helpers are in
// web-helpers.ts.)

test.describe('la web pública en el teléfono (360 px)', () => {
  test('el aviso fijo de la versión de prueba, las dos acciones a la vista y el pie con el año, las legales y «Acceso del personal»', async ({ page }) => {
    await page.goto('/gestion');
    await expect(page.getByRole('complementary', { name: 'Versión de prueba' })).toHaveText(/Versión de prueba\. El contenido es de ejemplo\./);
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Hacer un reporte' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Consultar mi solicitud' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Hacer un reporte' })).toHaveAttribute('href', '/atencion/nueva?tipo=reporte');
    await expect(header.getByRole('link', { name: 'Consultar mi solicitud' })).toHaveAttribute('href', '/atencion/consultar');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText(`© ${new Date().getFullYear()} Freddy Bernal. Todos los derechos reservados.`);
    for (const name of ['Aviso de privacidad', 'Condiciones de participación', 'Accesibilidad']) await expect(footer.getByRole('link', { name })).toBeVisible();
    // The accounts nobody has confirmed yet: one line, never a mark on each.
    await expect(footer.getByText('Estas cuentas están en proceso de confirmación.')).toBeVisible();
    await expect(footer.getByText('sin verificar')).toHaveCount(0);
    await expect(footer.getByRole('link', { name: /YouTube @FreddyBernalOficial/i })).toHaveCount(0);
    // The accounts the governor's channel links: the dead X account of the old site is not one of them.
    await expect(footer.getByRole('link', { name: /^X @freddybernal_ve/ })).toBeVisible();
    await expect(footer.locator('a[href="https://x.com/FreddyBernal"]')).toHaveCount(0);
    await footer.getByRole('link', { name: 'Acceso del personal' }).click();
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
    for (const [path, h1] of [['/', /Freddy Bernal/], ['/gestion?vista=linea', 'Gestión y obras'], ['/canales', 'Canales oficiales']] as const) {
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
    // The importer's rules (D-97): a later page of an old list, the feed, and an old file that was not brought (410).
    // (With the final slash Next first answers 308 to the address without it, then the 301 comes.)
    const paged = await page.request.get('/page/3', { maxRedirects: 0 });
    expect(paged.status()).toBe(301);
    expect(paged.headers()['location']).toMatch(/\/actualidad$/);
    const feed = await page.request.get('/feed', { maxRedirects: 0 });
    expect(feed.status()).toBe(301);
    expect(feed.headers()['location']).toMatch(/\/actualidad$/);
    await page.goto('/page/3/');
    await expect(page).toHaveURL(/\/actualidad$/);
    const gone = await page.request.get('/wp-content/uploads/2019/01/foto-no-traida-300x200.jpg', { maxRedirects: 0 });
    expect(gone.status()).toBe(410);
    expect(gone.headers()['x-robots-tag']).toBe('noindex');
    expect((await page.request.get('/2026/03/una-nota-que-no-existe', { maxRedirects: 0 })).status()).toBe(404);
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
