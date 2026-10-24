import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Free usability polish, at 360 px: «Modo sol», tips, polite redirect, review chips,
// Resultados as cards and tweets by tap. Nothing here sends or approves anything.

async function noSerious(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

test('«Modo sol» se activa desde la cuenta y se recuerda en el teléfono', async ({ page }) => {
  await loginAs(page, 'supervision@demo.test');
  await page.goto('/hoy');
  await page.getByLabel('Mi cuenta').click();
  const sun = page.getByRole('switch', { name: 'Modo sol' });
  await expect(sun).toHaveAttribute('aria-checked', 'false');
  await sun.click();
  await expect(sun).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await noSerious(page);
  await page.getByLabel('Mi cuenta').click();
  await page.getByRole('switch', { name: 'Modo sol' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-contrast', 'high');
});

test('el consejo sale la primera vez y «Entendido» lo esconde', async ({ page }) => {
  await loginAs(page, 'supervision@demo.test');
  await page.goto('/aprobar');
  const tip = page.getByRole('complementary', { name: 'Consejo' });
  await expect(tip).toContainText('Las verdes se pueden aprobar juntas');
  await tip.getByRole('button', { name: 'Entendido' }).click();
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Por aprobar' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Consejo' })).toHaveCount(0);
});

test('una pantalla que no es del rol lleva a su inicio con un aviso', async ({ page }) => {
  await loginAs(page, 'supervision@demo.test');
  await page.goto('/piezas');
  await expect(page).toHaveURL(/\/hoy\?sin-permiso=1$/);
  await expect(page.getByText('Esa pantalla no es de tu rol.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(page).toHaveURL(/\/hoy$/);
  await page.context().clearCookies();

  await loginAs(page, 'jefe@demo.test');
  await page.goto('/piezas');
  await expect(page).toHaveURL(/\/jefe\?sin-permiso=1$/);
  await expect(page.getByText('Esa pantalla no es de tu rol.')).toBeVisible();
});

test('pedir cambios: motivos rápidos y aviso sin ventanas del navegador', async ({ page }) => {
  let nativeDialog = false;
  page.on('dialog', (d) => {
    nativeDialog = true;
    void d.dismiss();
  });
  await loginAs(page, 'supervision@demo.test');
  await page.goto('/aprobar');
  await page.getByRole('link', { name: /Aclaratoria sobre el servicio de agua/ }).click();
  await page.getByRole('button', { name: 'Pedir cambios' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Escribe qué hay que cambiar' })).toBeVisible();
  expect(nativeDialog).toBe(false);
  const box = page.getByLabel('Qué hay que cambiar (o un comentario)');
  await page.getByRole('button', { name: 'Muy largo' }).click();
  await page.getByRole('button', { name: 'Se oye bajo' }).click();
  await expect(box).toHaveValue('Muy largo. Se oye bajo.');
  await expect(page.getByRole('button', { name: 'Muy largo' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Muy largo' }).click();
  await expect(box).toHaveValue('Se oye bajo.');
  await expect(page.getByText('Escribe qué hay que cambiar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Copies: cómo saldrá' })).toBeVisible();
  await expect(page.getByText(/X: (hasta 280|se pasa por \d+)/)).toBeVisible();
  await noSerious(page);
});

test('resultados en el teléfono: tarjetas y sin enlaces muertos', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/resultados?dias=90');
  await expect(page.locator('table')).toBeHidden();
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/publicar/"]')).toHaveCount(0);
  await noSerious(page);
});

test('tweets: tocar un tweet abre el cambio de día y hora', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/tweets');
  await expect(page.getByText('Toca un tweet para cambiar el día o la hora.')).toBeVisible();
  const first = page.locator('section button[aria-haspopup="dialog"]').first();
  test.skip((await first.count()) === 0, 'no hay tweets en el tablero');
  await first.tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const change = dialog.getByRole('button', { name: 'Cambiar día y hora' });
  if (await change.count()) {
    const b = await change.boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
    const day = await dialog.getByLabel('Día').boundingBox();
    expect(day!.height).toBeGreaterThanOrEqual(44);
  }
});
