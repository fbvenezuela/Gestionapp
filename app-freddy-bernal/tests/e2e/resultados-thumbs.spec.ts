import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { loginAs } from './helpers';

// §6 «Resultados con miniaturas», at 360 px against the demo: every publication shows its picture (served by
// /api/media/<id>/thumb after the permission check) or the icon of its format, never a broken picture. The demo's
// pictures are invented and abstract (src/lib/db/demo-assets). The boss's own post can carry a screenshot, which
// becomes its picture.
test.describe.configure({ mode: 'serial' });

const fixture = (f: string) => path.join(__dirname, '..', 'fixtures', f);

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

// What a row shows once its picture has settled: a loaded picture, the icon, or (never) a broken one.
async function thumbState(row: Locator): Promise<'img' | 'icon' | 'loading' | 'broken'> {
  await row.scrollIntoViewIfNeeded();
  return row.evaluate((el) => {
    const img = el.querySelector<HTMLImageElement>('img[src$="/thumb"]');
    if (img) return !img.complete ? 'loading' : img.naturalWidth > 0 ? 'img' : 'broken';
    return el.querySelector('[data-thumb-icon]') ? 'icon' : 'broken';
  });
}

async function everyRowHasAPicture(rows: Locator, where: string) {
  const n = await rows.count();
  expect(n, `${where}: sin publicaciones`).toBeGreaterThan(0);
  const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    // A missing thumbnail answers 404 and MediaThumb moves on to the next file or the icon: wait for it to settle.
    await expect.poll(() => thumbState(row), { message: `${where} fila ${i + 1}`, timeout: 15_000 }).toMatch(/^(img|icon)$/);
    seen.push(await thumbState(row));
  }
  return seen;
}

test('Resultados: cada publicación con su miniatura o el ícono de su formato', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/resultados');
  await expect(page.getByRole('heading', { name: 'Por publicación' })).toBeVisible();
  const seen = await everyRowHasAPicture(page.locator('h2:text-is("Por publicación") + ul > li'), '/resultados');
  // The demo's publications all have a kept picture (the approved cover, the boss's screenshot).
  expect(seen.filter((s) => s === 'img').length).toBeGreaterThanOrEqual(6);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await axe(page);
});

test('Redes registra lo que publicó el jefe con una captura, y esa es su miniatura', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/publicar/espontanea');
  await page.getByLabel('Red', { exact: true }).selectOption('instagram');
  await page.getByLabel('Link de la publicación').fill('https://example.com/demo/ig/historia-del-jefe');
  await page.getByLabel('¿De qué se trató?').fill('Historia del jefe saludando (prueba)');
  await page.getByLabel('Subir una captura (opcional)').setInputFiles(fixture('cover.jpg'));
  await expect(page.getByText('Captura lista: sale como miniatura en Resultados.')).toBeVisible({ timeout: 30_000 });
  await axe(page);
  await page.getByRole('button', { name: 'Registrar' }).click();
  await page.waitForURL(/\/publicar\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const evidence = page.locator('main').getByText('Ver captura').locator('..');
  await expect.poll(() => thumbState(evidence), { timeout: 15_000 }).toBe('img');
  await page.goto('/resultados');
  const row = page.locator('h2:text-is("Por publicación") + ul > li').filter({ hasText: 'Historia del jefe saludando (prueba)' });
  await expect(row).toHaveCount(1);
  await expect.poll(() => thumbState(row), { timeout: 15_000 }).toBe('img');
});

test('el «Digital» del jefe muestra lo publicado con su miniatura', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/jefe/digital');
  await expect(page.getByRole('heading', { name: 'Lo publicado' })).toBeVisible();
  const rows = page.locator('.glass-card').filter({ has: page.getByRole('heading', { name: 'Lo publicado' }) }).locator('ul > li');
  const seen = await everyRowHasAPicture(rows, '/jefe/digital');
  expect(seen).toContain('img');
  await axe(page);
});
