import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The shared agenda (§3): despacho and the boss on the SAME event. Despacho creates it (it reaches the boss «por
// decidir»); both edit it at the same time: the last save wins, the other person gets «cambió lo mismo que tú»
// (field names only) and what was there stays in «Historial». Then the boss rejects it with the app's own dialog
// and despacho learns it, with the title only. Two phones (contexts) on the same demo server. Invented data only.
test.describe.configure({ mode: 'serial' });

const TITLE = 'Visita de prueba a la biblioteca comunal';

async function noSerious(page: Page, where: string) {
  // A toast fading in or out is half transparent: axe would read its contrast mid-animation.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function phone(browser: Browser, email: string) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 760 }, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

test('despacho crea el evento y al jefe le llega «por decidir» con el título', async ({ page }) => {
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/agenda/nuevo');
  await page.getByLabel('Título').fill(TITLE);
  const d = new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel('Fecha', { exact: true }).fill(d);
  await page.getByLabel('Hora (Táchira)').fill('10:00');
  await page.getByLabel('De qué se trata').fill('Resumen inicial de prueba');
  await page.getByLabel('Guardar aunque choque con otro evento').check();
  await page.getByRole('button', { name: 'Guardar evento' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByText('Por decidir', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Propuesto por Despacho/)).toBeVisible();
});

test('los dos editan el mismo evento a la vez: gana el último, el otro recibe el aviso y lo de antes queda en el historial', async ({ page, browser }) => {
  // Despacho opens «Editar datos del evento» and starts typing…
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/buscar?q=biblioteca%20comunal');
  await page.getByRole('link', { name: new RegExp(TITLE) }).first().click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  const eventUrl = page.url();
  await page.getByRole('button', { name: 'Editar datos del evento' }).click();
  await page.getByRole('dialog').getByLabel('De qué se trata').fill('Lo que escribió el despacho');

  // …meanwhile the boss, on his iPad, changes the same field and saves.
  const boss = await phone(browser, 'jefe@demo.test');
  await boss.page.goto(eventUrl);
  await boss.page.getByRole('button', { name: 'Editar datos del evento' }).click();
  await boss.page.getByRole('dialog').getByLabel('De qué se trata').fill('Lo que escribió el jefe');
  await boss.page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(boss.page.getByText('Guardado.', { exact: true })).toBeVisible();

  // Despacho saves after him: its text wins, and it is told so.
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/^Guardado\. Jefe \(demo\) también había cambiado De qué se trata: quedó lo tuyo/)).toBeVisible();
  await page.reload();
  await expect(page.getByText('Lo que escribió el despacho').first()).toBeVisible();
  // «Historial»: who changed what, with what was there before (the boss's text is not lost).
  await expect(page.getByRole('heading', { name: /Historial/ })).toBeVisible();
  await expect(page.getByText('Lo que escribió el jefe').first()).toBeVisible();
  await noSerious(page, '/eventos/[id] con historial');

  // The boss gets «cambió lo mismo que tú», with the field's name and never a value or a date.
  await boss.page.goto('/avisos');
  const notice = boss.page.getByText(`Rubén Contreras cambió lo mismo que tú en ${TITLE}`);
  await expect(notice).toBeVisible();
  await expect(boss.page.getByText(/De qué se trata\. Lo tuyo quedó en el historial del evento\./).first()).toBeVisible();
  await expect(boss.page.getByText('Lo que escribió el despacho')).toHaveCount(0);
  await boss.ctx.close();
});

test('el jefe rechaza con el diálogo de la app, y el despacho se entera solo con el título', async ({ page, browser }) => {
  let nativeDialog = false;
  page.on('dialog', (dl) => {
    nativeDialog = true;
    void dl.dismiss();
  });
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/avisos');
  await page.getByText(`Hay un evento nuevo por decidir: ${TITLE}`).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Rechazar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('¿Rechazar este evento?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByText('Evento rechazado.')).toBeVisible();
  expect(nativeDialog).toBe(false);

  const despacho = await phone(browser, 'despacho@demo.test');
  await despacho.page.goto('/avisos');
  await expect(despacho.page.getByText(`El jefe rechazó: ${TITLE}`)).toBeVisible();
  await despacho.ctx.close();
});
