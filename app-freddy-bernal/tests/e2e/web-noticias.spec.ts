import { test, expect } from '@playwright/test';
import { firstLink, noScaffolding, noSerious } from './web-helpers';

// The public website's news (D-91, design §1–§3), with no session, at 360 px: the search, the kind filter, the topics
// and the pages work with plain links; a news item opens with its sources, its structured data and the citizen form
// pointing at what it is about.
// (Until 19/11/2026 in web-publica.spec.ts; the shared helpers are in web-helpers.ts.)

test.describe('la web pública en el teléfono (360 px)', () => {
  test('actualidad: buscar, filtrar por tipo, pasar de página, abrir una nota y comentarla', async ({ page }) => {
    await page.goto('/actualidad');
    await page.getByLabel('Buscar', { exact: true }).fill('salud');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.waitForURL(/q=salud/);
    await expect(page.getByText(/resultados? para «salud»/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Jornada de salud en Junín/ })).toBeVisible();
    // The kind filter: only the statements (each card's eyebrow is its topic, so the list says what it holds).
    await page.goto('/actualidad?categoria=comunicado');
    await expect(page.getByText(/^\d+ resultados? en comunicados$/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Comunicado: así funciona la atención de las solicitudes/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Jornada de salud en Junín/ })).toHaveCount(0);
    // The topics open the news search for each one.
    await page.goto('/actualidad');
    const topics = page.getByRole('navigation', { name: 'Temas' });
    await topics.getByRole('link', { name: 'Salud', exact: true }).click();
    await page.waitForURL(/q=Salud/);
    await expect(page.getByText(/resultados? para «Salud»/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Jornada de salud en Junín/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Temas' }).getByRole('link', { name: 'Salud', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goto('/actualidad');
    await page.getByRole('link', { name: 'Siguiente', exact: true }).click();
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
    await expect(page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Noticias' })).toHaveAttribute('href', '/actualidad');
    await noScaffolding(page, href);
    await expect(page.getByRole('link', { name: 'Enviar una observación' })).toHaveAttribute('href', `/atencion/nueva?tipo=acotacion&sobre=news:${href.split('/').pop()}`);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').last().textContent())!) as Record<string, unknown>;
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.headline).toBe(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${href}$`));
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await noSerious(page, href);
  });
});
