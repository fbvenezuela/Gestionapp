import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, loginAs, passMfa } from './helpers';

// First-time 2FA on the strict server: drawing /doble-factor never makes a QR (with Supabase that
// replaced the factor already scanned on every reload). The QR comes only from the button.
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

test('el código QR sale solo con el botón y, si se recarga, hay que tocarlo otra vez', async ({ page }) => {
  // Administración reinicia el doble factor del director de despacho (si ya lo tenía en esta corrida).
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes/equipo');
  const row = page.getByRole('listitem').filter({ hasText: 'Rubén Contreras' });
  if (await row.getByText('Doble factor activo').count()) {
    await row.getByRole('button', { name: 'Cambiar' }).click();
    await row.getByRole('button', { name: 'Reiniciar doble factor' }).click();
    await page.getByRole('button', { name: 'Reiniciar', exact: true }).click();
    await expect(page.getByText(/La próxima vez que entre, tendrá que activar el doble factor/)).toBeVisible();
    // The reset also closes his sessions, and token times are whole seconds: a sign-in within the
    // same second would count as closed.
    await page.waitForTimeout(1_100);
  }
  await page.context().clearCookies();

  await login(page, 'despacho@demo.test');
  await page.waitForURL('**/doble-factor');
  const show = page.getByRole('button', { name: 'Mostrar el código QR' });
  const qr = page.getByRole('img', { name: 'Código QR para la aplicación de códigos' });
  await expect(show).toBeVisible();
  await expect(qr).toHaveCount(0);
  await expect(page.getByLabel('Código de 6 números')).toHaveCount(0);

  await show.click();
  await expect(qr).toBeVisible();
  await expect(show).toHaveCount(0);
  // Focus moves to the QR (the button that had it is gone).
  await expect(page.getByRole('group', { name: '2. Escanea el código QR' })).toBeFocused();
  await expect(page.getByText(/Si la recargas, toca otra vez «Mostrar el código QR»/)).toBeVisible();
  await expect(page.getByLabel('Código de 6 números')).toBeVisible();
  await axe(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // A reload shows the button again, never a QR on its own.
  await page.reload();
  await expect(show).toBeVisible();
  await expect(qr).toHaveCount(0);

  await passMfa(page, 'despacho@demo.test');
  await page.waitForURL('**/hoy');

  // Next time only the code is asked.
  await page.context().clearCookies();
  await login(page, 'despacho@demo.test');
  await page.waitForURL('**/doble-factor');
  await expect(page.getByRole('heading', { name: 'Código de tu aplicación' })).toBeVisible();
  await expect(show).toHaveCount(0);
  await passMfa(page, 'despacho@demo.test');
  await page.waitForURL('**/hoy');
});

test('el código del correo admite de 6 a 10 números', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill('redes@demo.test');
  await page.getByRole('button', { name: 'Mandarme el código' }).click();
  const code = page.getByLabel('Código del correo');
  await expect(code).toBeVisible({ timeout: 20_000 });
  await expect(code).toHaveAttribute('maxlength', '10');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  // The browser accepts an 8-digit code (Supabase may send 8) and refuses 5 or letters.
  await code.fill('12345678');
  expect(await code.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(true);
  await code.fill('12345');
  expect(await code.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
  await code.fill('12345a');
  expect(await code.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
  // A wrong 8-digit code reaches the server and gets the normal answer, not a length error.
  await code.fill('12345678');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('El código no es correcto o ya venció. Pide uno nuevo.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
