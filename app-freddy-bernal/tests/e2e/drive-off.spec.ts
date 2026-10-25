import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './helpers';

// With STORAGE_PROVIDER empty (the published demo) nothing of Google Drive shows: no Ajustes item,
// no «Elegir de Drive», no thumbnails or «Archivo» section in Biblioteca. At 360 px, as the rest.
test.skip(process.env.STORAGE_PROVIDER === 'drive', 'Solo con STORAGE_PROVIDER vacío (la demo).');

async function noSideScroll(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('la demo sin Drive: Ajustes, el material y la Biblioteca quedan como antes', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes');
  await expect(page.getByRole('link', { name: /Equipo/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Google Drive/ })).toHaveCount(0);

  // The page exists for Administración, but only says Drive is off.
  await page.goto('/ajustes/drive');
  await expect(page.getByRole('heading', { name: 'Drive no está activado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar Drive' })).toHaveCount(0);
  await noSideScroll(page, '/ajustes/drive');

  await page.goto('/agenda');
  const href = await page.locator('a[href^="/eventos/"]').first().getAttribute('href');
  await page.goto(`${href!.split('?')[0]}?tab=material`);
  await expect(page.getByRole('heading', { name: 'Jefe hablando' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Elegir de Drive/ })).toHaveCount(0);
  await expect(page.locator('img[src$="/thumb"]')).toHaveCount(0);
  await noSideScroll(page, 'material');

  await page.goto('/biblioteca');
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Elegir de Drive|Traer lo nuevo de Drive/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Archivo \(sin evento\)/ })).toHaveCount(0);
  await expect(page.locator('img[src$="/thumb"]')).toHaveCount(0);
  await noSideScroll(page, '/biblioteca');
});
