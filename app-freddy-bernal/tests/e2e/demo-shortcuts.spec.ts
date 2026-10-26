import { test, expect } from '@playwright/test';

// Demo server with testing shortcuts ON: one tap per role, no code, no 2FA.
test('un toque por rol, sin código ni doble factor', async ({ page }) => {
  for (const [label, home, heading] of [
    ['El jefe', '/jefe', /Buen día/],
    ['Supervisión política', '/hoy', /Hola, Gustavo/],
    ['Administración', '/hoy', /Hola, Carla/],
    ['Redes', '/hoy', /Hola, (Daniela|Yorman)/],
  ] as const) {
    await page.context().clearCookies();
    await page.goto('/entrar');
    await page.getByRole('button', { name: new RegExp(`^Entrar como ${label}`) }).first().click();
    await page.waitForURL((u) => u.pathname === home);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('el jefe ve la agenda completa sin pasar por el doble factor', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('button', { name: /^Entrar como El jefe/ }).click();
  await page.waitForURL('**/jefe');
  await page.goto('/agenda?vista=mes');
  await expect(page.locator('main a[href^="/eventos/"]').first()).toBeVisible();
  await page.goto('/doble-factor');
  await expect(page).not.toHaveURL(/doble-factor/);
});

test('el formulario con código sigue funcionando y no pide doble factor', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill('despacho@demo.test');
  await page.getByRole('button', { name: 'Mandarme el código' }).click();
  const inbox = page.getByText(/Tu código para entrar: \d{6}/).first();
  await expect(inbox).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Código del correo').fill((await inbox.textContent())!.match(/\d{6}/)![0]);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/hoy');
});
