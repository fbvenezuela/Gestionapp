import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

// Secretaría proposes, corrects her proposal, the boss decides (with the app's own dialog, not
// the browser's) and both sides get a notice that carries only the title.
test.describe.configure({ mode: 'serial' });

const TITLE = 'Visita de prueba a la biblioteca comunal';
const FIXED = 'Visita corregida a la biblioteca comunal';

test('secretaría propone sin casilla de choque y corrige su propuesta', async ({ page }) => {
  await loginAs(page, 'secretaria@demo.test');
  await page.goto('/agenda/nuevo');
  await expect(page.getByLabel('Guardar aunque choque con otro evento')).toHaveCount(0);
  await expect(page.getByText('El despacho revisa si choca con otro evento.')).toBeVisible();
  await page.getByLabel('Título').fill(TITLE);
  const d = new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel('Fecha', { exact: true }).fill(d);
  await page.getByLabel('Hora (Táchira)').fill('10:00');
  await page.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Storyboard', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Corregir mi propuesta' }).click();
  await page.getByRole('dialog').getByLabel('Título').fill(FIXED);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Propuesta corregida.')).toBeVisible();
  await expect(page.getByRole('heading', { name: FIXED })).toBeVisible();
});

test('el jefe recibe el aviso y rechaza con el diálogo de la app', async ({ page }) => {
  let nativeDialog = false;
  page.on('dialog', (dl) => {
    nativeDialog = true;
    void dl.dismiss();
  });
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/avisos');
  await page.getByText(`Hay un evento nuevo por decidir: ${FIXED}`).click();
  await expect(page.getByRole('heading', { name: FIXED })).toBeVisible();
  await page.getByRole('button', { name: 'Rechazar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('¿Rechazar este evento?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByText('Evento rechazado.')).toBeVisible();
  expect(nativeDialog).toBe(false);
});

test('secretaría se entera y ya no puede cambiarla', async ({ page }) => {
  await loginAs(page, 'secretaria@demo.test');
  await page.goto('/avisos');
  await page.getByText(`El jefe rechazó: ${FIXED}`).click();
  await expect(page.getByText('El jefe rechazó tu propuesta.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Corregir mi propuesta' })).toHaveCount(0);
});
