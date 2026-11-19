import { test, expect } from '@playwright/test';
import { PAGES, firstLink, fitsWidth, noScaffolding, noSerious } from './web-helpers';

// The public website's pages (D-91, design §1–§3), with no session, at 360 px: every page opens with its h1, fits the
// phone, has no serious accessibility problem and a unique title that names the person once, and no scaffolding of the
// editors («Por completar», «Foto por subir…», «Video por enlazar…») reaches it; the works' filters, pages and timeline
// work with plain links; a project's ficha points at the citizen form with what it is about; the Semanario and
// transparency, the weekly program, the governor and the channels.
// (Until 19/11/2026 in web-publica.spec.ts; the shared helpers are in web-helpers.ts.)

test.describe('la web pública en el teléfono (360 px)', () => {
  test('cada página abre con su h1, cabe en el teléfono, sin problemas serios de accesibilidad y con títulos únicos', async ({ page }) => {
    const titles = new Map<string, string>();
    for (const [path, h1] of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: h1 }).first(), path).toBeVisible();
      await expect(page.locator('h1'), path).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'No se pudo cargar la página' }), path).toHaveCount(0);
      await noScaffolding(page, path);
      await fitsWidth(page, path);
      await noSerious(page, path);
      const title = await page.title();
      expect((title.match(/Freddy Bernal/g) ?? []).length, `${path}: «${title}»`).toBeLessThanOrEqual(1);
      if (!path.includes('?')) titles.set(path, title);
    }
    const all = [...titles.values()];
    expect(new Set(all).size, all.join(' | ')).toBe(all.length);
  });

  test('gestión: los filtros por estado, categoría y municipio, y la página siguiente', async ({ page }) => {
    await page.goto('/gestion');
    await expect(page.getByText(/^14 obras y proyectos$/)).toBeVisible();
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
    await expect(page.getByText(/^1 obra o proyecto$/)).toBeVisible();
    await expect(page.locator('main article').first()).toContainText('Junín');
    await page.getByRole('link', { name: 'Quitar los filtros' }).click();
    await page.waitForURL(/\/gestion$/);
    await page.getByRole('link', { name: 'Siguiente', exact: true }).click();
    await page.waitForURL(/pagina=2/);
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
  });

  test('la línea de tiempo: todo lo más nuevo primero y el filtro solo por fecha', async ({ page }) => {
    await page.goto('/gestion?vista=linea');
    await expect(page.getByRole('link', { name: 'Línea de tiempo' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Ordenadas de la más reciente a la más antigua.')).toBeVisible();
    await expect(page.getByLabel('Municipio')).toHaveCount(0);
    const days = await page.locator('main ol li time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));
    expect(days.length).toBeGreaterThan(5);
    expect([...days].sort().reverse()).toEqual(days);
    const from = days[3];
    const to = days[1];
    await page.getByLabel('Desde').fill(from);
    await page.getByLabel('Hasta').fill(to);
    await page.getByRole('button', { name: 'Filtrar por fecha' }).click();
    await page.waitForURL(/desde=/);
    await expect(page.getByText(/obras? desde el/)).toBeVisible();
    const shown = await page.locator('main ol li time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(days.length);
    for (const d of shown) expect(d >= from && d <= to, d).toBe(true);
  });

  test('la ficha de una obra: sus datos con fuente y «Enviar una observación sobre esta obra» ligada a ella', async ({ page }) => {
    await page.goto('/gestion');
    const href = await firstLink(page, '/gestion/');
    await page.goto(href);
    const slug = href.split('/').pop()!;
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toBeVisible();
    await expect(page.getByText('Última actualización')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enviar una observación sobre esta obra' })).toHaveAttribute('href', `/atencion/nueva?tipo=acotacion&sobre=project:${slug}`);
    await fitsWidth(page, href);
    await noSerious(page, href);
    expect((await page.request.get('/gestion/una-obra-que-no-existe')).status()).toBe(404);
  });

  test('el Semanario y transparencia: documentos con fecha, versión y archivo; las cifras con su definición', async ({ page }) => {
    await page.goto('/actualidad/semanario');
    await expect(page.getByRole('heading', { level: 1, name: 'Semanario El Informativo Táchira' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Semanario n\.º 12/ })).toBeVisible();
    const pdf = await page.getByRole('link', { name: /Ver el PDF/ }).first().getAttribute('href');
    const res = await page.request.get(pdf!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    await page.goto('/transparencia?q=semanario');
    await expect(page.getByText(/^3 documentos$/)).toBeVisible();
    await page.goto('/transparencia');
    await expect(page.getByRole('heading', { name: 'Estadísticas de atención ciudadana' })).toBeVisible();
    await expect(page.getByText('Recibidas', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Definiciones' })).toBeVisible();
    await expect(page.getByText('Por categoría (sin denuncias)')).toBeVisible();
    await page.getByRole('link', { name: 'Últimos 30 días' }).click();
    await page.waitForURL(/periodo=30d/);
    await expect(page.getByRole('link', { name: 'Últimos 30 días' })).toHaveAttribute('aria-current', 'page');
  });

  test('el programa semanal: el canal activo y ninguna emisión sin video dibuja un reproductor vacío', async ({ page }) => {
    await page.goto('/reporte-bernal');
    await expect(page.getByRole('link', { name: /Canal de YouTube @FreddyBernal\.oficial/ })).toHaveAttribute('href', 'https://www.youtube.com/@FreddyBernal.oficial');
    await expect(page.getByRole('main').getByText('sin verificar')).toHaveCount(0);
    await expect(page.locator('main a[href*="@FreddyBernalOficial"]')).toHaveCount(0);
    await expect(page.getByText('Última emisión')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Emisiones anteriores' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Ver el video/ })).toHaveCount(0);
    await noScaffolding(page, '/reporte-bernal');
  });

  test('el gobernador: el nombre y el cargo, sin espacios «por completar», y la fecha de la última actualización', async ({ page }) => {
    await page.goto('/gobernador');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Freddy Bernal' })).toBeVisible();
    await expect(main.getByText('Gobernador del estado Táchira', { exact: true })).toBeVisible();
    // The biography is still to be written: its headings do not show over nothing.
    await expect(main.getByRole('heading', { name: 'Biografía' })).toHaveCount(0);
    await expect(main.getByRole('heading', { level: 2, name: 'Material para la prensa' })).toBeVisible();
    await expect(main.getByText(/^Última actualización: \d{1,2} de \p{L}+ de \d{4}$/u)).toBeVisible();
    await noScaffolding(page, '/gobernador');
  });

  test('canales: la lista marcada y cómo identificar las cuentas oficiales; sin portal mientras no esté verificado', async ({ page }) => {
    await page.goto('/canales');
    await expect(page.getByRole('heading', { name: 'Cómo identificar las cuentas oficiales' })).toBeVisible();
    await expect(page.getByRole('main').getByText(/solicita dinero, claves, códigos de verificación ni datos bancarios/)).toBeVisible();
    for (const url of ['https://www.instagram.com/freddybernal_ve/', 'https://x.com/freddybernal_ve', 'https://www.tiktok.com/@freddybernal_ve', 'https://www.threads.com/@freddybernal_ve']) {
      await expect(page.locator(`main a[href="${url}"]`), url).toHaveCount(1);
    }
    for (const gone of ['https://x.com/FreddyBernal', 'https://www.tiktok.com/@freddybernalr', 'https://www.threads.com/@freddybernalven']) {
      await expect(page.locator(`a[href="${gone}"]`), gone).toHaveCount(0);
    }
    await expect(page.getByText('Portal institucional')).toHaveCount(0);
    await expect(page.locator('main a[href^="https://www.youtube.com/@FreddyBernal.oficial"]')).toHaveCount(1);
    await expect(page.locator('main a[href*="@FreddyBernalOficial"]')).toHaveCount(0);
  });
});
