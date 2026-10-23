import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test('redes entra y ve Hoy', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await expect(page.getByRole('heading', { name: /Hola, Daniela/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/hoy-redes.png', fullPage: true });
});
