import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

// Despacho creates an event, the boss decides (with the app's own dialog, not the browser's) and both
// sides get a notice that carries only the title. (Secretaría and its proposals were retired on 27/10/2026.)
test.describe.configure({ mode: 'serial' });

const TITLE = 'Visita de prueba a la biblioteca comunal';

test('despacho crea el evento y al jefe le llega «por decidir» con el título', async ({ page }) => {
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/agenda/nuevo');
  await page.getByLabel('Título').fill(TITLE);
  const d = new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel('Fecha', { exact: true }).fill(d);
  await page.getByLabel('Hora (Táchira)').fill('10:00');
  await page.getByLabel('Guardar aunque choque con otro evento').check();
  await page.getByRole('button', { name: 'Guardar evento' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
});

test('el jefe recibe el aviso y rechaza con el diálogo de la app', async ({ page }) => {
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
});

test('despacho se entera de la decisión, solo con el título', async ({ page }) => {
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/avisos');
  await expect(page.getByText(`El jefe rechazó: ${TITLE}`)).toBeVisible();
});
