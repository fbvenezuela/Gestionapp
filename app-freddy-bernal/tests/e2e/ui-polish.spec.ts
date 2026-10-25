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
  // An amarillo piece that no other spec approves (the red one is approved by the boss in flows.spec).
  await page.getByRole('link', { name: /Avance del puente La Quebrada/ }).click();
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
  // Like any piece sent to review, it has its three copies.
  await expect(page.getByText('Sin copy', { exact: true })).toHaveCount(0);
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

test('«Más», «Mi cuenta» y «Crear» se cierran con un toque afuera, con Escape o al elegir', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/hoy');
  const more = page.locator('nav[aria-label="Menú"] details');
  const outside = page.getByRole('heading', { level: 1 }); // «Hola, …»: not a link
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  await outside.click({ position: { x: 4, y: 4 } }); // left edge: the account menu covers the middle
  await expect(more).not.toHaveAttribute('open');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(more).not.toHaveAttribute('open');
  await expect(more.locator('summary')).toBeFocused();

  const sun = page.getByRole('switch', { name: 'Modo sol' });
  await page.getByLabel('Mi cuenta').click();
  await expect(sun).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sun).toBeHidden();
  await expect(page.getByLabel('Mi cuenta')).toBeFocused();
  await page.getByLabel('Mi cuenta').click();
  await expect(sun).toBeVisible();
  await outside.click({ position: { x: 4, y: 4 } }); // left edge: the account menu covers the middle
  await expect(sun).toBeHidden();

  // «Crear» too: opening «Mi cuenta» closes it (no two panels on top of each other), and so does
  // choosing an item (the header stays in place when the page changes).
  const create = page.locator('header details').filter({ has: page.getByText('Crear', { exact: true }) });
  await create.locator('summary').click();
  await expect(create).toHaveAttribute('open', '');
  await page.getByLabel('Mi cuenta').click();
  await expect(create).not.toHaveAttribute('open');
  await expect(sun).toBeVisible();
  await page.keyboard.press('Escape');
  await create.locator('summary').click();
  await create.getByRole('link', { name: 'Nueva pieza' }).click();
  await expect(page).toHaveURL(/\/piezas\/nueva$/);
  await expect(create).not.toHaveAttribute('open');
});

test('con el teclado, un menú se cierra al salir de él, y abrir uno cierra el otro', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/hoy');
  const create = page.locator('header details').filter({ has: page.getByText('Crear', { exact: true }) });
  const account = page.locator('header details').filter({ has: page.getByLabel('Mi cuenta') });
  await create.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(create).toHaveAttribute('open', '');
  // Tab through its items and on to the next control: it closes by itself.
  for (let i = 0; i < 12 && (await create.getAttribute('open')) !== null; i++) await page.keyboard.press('Tab');
  await expect(create).not.toHaveAttribute('open');
  // From «Crear» straight to «Mi cuenta»: never two panels at once.
  await create.locator('summary').focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Mi cuenta').focus();
  await page.keyboard.press('Enter');
  await expect(account).toHaveAttribute('open', '');
  await expect(create).not.toHaveAttribute('open');
  // Opened by any other means (a script, an assistive tool): the other one still closes.
  await create.evaluate((d: HTMLDetailsElement) => { d.open = true; });
  await expect(account).not.toHaveAttribute('open');
});

test('el botón de 360 nunca tapa «Enviar propuesta»: pegada abajo ni al final del formulario', async ({ page }) => {
  await loginAs(page, 'secretaria@demo.test');
  await page.goto('/agenda/nuevo');
  const bubble = page.locator('[data-assistant-button]');
  const send = page.getByRole('button', { name: 'Enviar propuesta' });
  const last = page.getByLabel('Protocolo', { exact: true }); // the form's last field
  await expect(send).toBeVisible();
  await expect(bubble).toBeVisible();
  const apart = async (other: typeof send) => {
    const a = (await bubble.boundingBox())!;
    const b = (await other.boundingBox())!;
    return a.y + a.height <= b.y || b.y + b.height <= a.y || a.x + a.width <= b.x || b.x + b.width <= a.x;
  };
  await expect.poll(() => apart(send)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => apart(send)).toBe(true);
  // With the bar resting in its place, the button goes back down: it does not sit on the field above.
  await expect.poll(() => apart(last)).toBe(true);
});

test('asistente: en el teléfono se ve la pestaña abierta', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  for (const tab of ['conversaciones', 'va', 'preguntan', 'hizo', 'ajustes']) {
    await page.goto(`/ajustes/asistente?tab=${tab}`);
    await expect(page.locator('nav[aria-label="Secciones del asistente"] a[aria-current="page"]'), tab).toBeInViewport({ ratio: 0.9 });
  }
});

test('material: con «Quitar» el nombre del archivo se sigue leyendo entero', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/buscar?q=Mirador');
  const href = await page.locator('main a[href^="/eventos/"]').first().getAttribute('href');
  await page.goto(`${href!.split('?')[0]}?tab=material`);
  const names = page.locator('main').getByText(/^(Jefe hablando 1|Dron 1|Apoyo 1|Video final v1|Portada v1)$/);
  await expect(names.first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Quitar / }).first()).toBeVisible();
  expect(await names.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent))).toEqual([]);
});
