import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Perfil: phone notifications card and quiet hours, at 360 px. The permission is only asked
// from the tap, so loading the page must not prompt (nothing is clicked here).
test('perfil muestra los avisos del teléfono y guarda las horas de silencio', async ({ page }) => {
  await loginAs(page, 'supervision@demo.test');
  let prompted = false;
  page.on('dialog', () => {
    prompted = true;
  });
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Avisos en este teléfono' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeVisible();
  expect(prompted).toBe(false);
  expect(await page.evaluate(() => Notification.permission)).toBe('default');

  await expect(page.getByRole('heading', { name: 'Horas de silencio' })).toBeVisible();
  await page.getByLabel('Desde').fill('22:00');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Desde')).toHaveValue('22:00');
  await expect(page.getByLabel('Hasta')).toHaveValue('07:00');

  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => v.id)).toEqual([]);
});
