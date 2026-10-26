import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The public pages Google reads to publish the OAuth app (Drive): they open without a session, at
// 360 px, and the sign-in page links to them.
const PAGES = [
  ['/acerca', /FB · Operaciones 360|Operaciones 360/],
  ['/privacidad', 'Política de privacidad'],
  ['/condiciones', 'Condiciones de uso'],
] as const;

for (const [path, heading] of PAGES) {
  test(`${path} abre sin entrar y se lee en el teléfono`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
}

test('la política de privacidad dice el permiso de Drive y el uso limitado de Google', async ({ page }) => {
  await page.goto('/privacidad');
  await expect(page.getByText('drive.file').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Política de datos del usuario de los servicios de las API de Google/ })).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
});

test('la pantalla de entrar enlaza las páginas públicas', async ({ page }) => {
  await page.goto('/entrar');
  const nav = page.getByRole('navigation', { name: 'Información' });
  for (const name of ['Acerca', 'Privacidad', 'Condiciones']) await expect(nav.getByRole('link', { name })).toBeVisible();
  await nav.getByRole('link', { name: 'Privacidad' }).click();
  await expect(page).toHaveURL(/\/privacidad$/);
});
