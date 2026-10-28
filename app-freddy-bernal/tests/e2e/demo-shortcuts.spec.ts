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

// The «name · email» line is long: on a 360 px phone the rows used to run past the card and the page scrolled sideways.
test('la lista de roles cabe en un teléfono de 360 px, sin moverse hacia los lados', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/entrar');
  const despacho = page.getByRole('button', { name: /^Entrar como Director de despacho/ });
  await expect(despacho).toBeVisible();
  for (const [what, el] of [['el botón', despacho], ['«Entrar →»', despacho.getByText('Entrar →')]] as const) {
    const box = (await el.boundingBox())!;
    expect(box.x + box.width, `${what} termina dentro de la pantalla`).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('un toque por rol, sin código ni doble factor', async ({ page }) => {
  for (const [label, home, heading] of [
    ['El jefe', '/jefe', /Buen día/],
    ['Director de política', '/municipios', /^Municipios$/],
    ['Director del IVT', '/obras', /^Fichas de obra$/],
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
