import { test, expect } from '@playwright/test';

// Demo server with testing shortcuts ON: one tap per role, no code, no 2FA.
test('los botones son los seis roles del equipo y Administración; ya no Secretaría ni Supervisión', async ({ page }) => {
  await page.goto('/entrar');
  for (const label of ['El jefe', 'Director de despacho', 'Director de política', 'Director del IVT', 'Grabación', 'Redes', 'Administración']) {
    await expect(page.getByRole('button', { name: new RegExp(`^Entrar como ${label}`) }).first(), label).toBeVisible();
  }
  for (const gone of ['Secretaría', 'Supervisión']) {
    await expect(page.getByRole('button', { name: new RegExp(`^Entrar como ${gone}`) }), gone).toHaveCount(0);
    await expect(page.getByText(gone)).toHaveCount(0);
  }
});

test('un toque por rol, sin código ni doble factor', async ({ page }) => {
  for (const [label, home, heading] of [
    ['El jefe', '/jefe', /Buen día/],
    ['Director de política', '/hoy', /Hola, Elio/],
    ['Director del IVT', '/hoy', /Hola, Fabián/],
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
