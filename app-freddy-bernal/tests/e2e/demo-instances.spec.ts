import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './helpers';

// «La ficha completa del evento, cuando la abro, da error» (27/10): on Vercel the list and the
// event page can come from different servers, each with its own demo database. The two local
// servers (strict and shortcuts) play those two instances; a session cookie works on both.
const other = `http://localhost:${Number(process.env.E2E_PORT ?? 3100) + 1}`;

test('la ficha de un evento abre aunque la sirva otro servidor de la demo', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/agenda');
  const link = page.locator('main a[href^="/eventos/"]').first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!.split('?')[0];
  await page.goto(href);
  const title = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();

  const res = await page.goto(`${other}${href}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.goto(`${other}${href}/lectura`);
  await expect(page.getByText('No encontramos esto')).toHaveCount(0);
});

// The same for the two new roles (cambios del 27/10/2026, §8): the IVT's visit and its obra ficha, política's report
// and the activity born from another one, each opened on the other server with the same session.
async function sameOnTheOther(page: Page, href: string) {
  await page.goto(href);
  const title = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();
  const res = await page.goto(`${other}${href}`);
  expect(res?.status(), href).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: title }), href).toBeVisible();
  await expect(page.getByText('No encontramos esto'), href).toHaveCount(0);
}

test('la visita de obra y la ficha del IVT abren aunque las sirva otro servidor', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  await loginAs(page, 'ivt@demo.test');
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis visitas de obra' })).toBeVisible();
  const visit = (await page.locator('main a[href^="/eventos/"]').first().getAttribute('href'))!.split('?')[0];
  await sameOnTheOther(page, visit);
  await page.goto(visit);
  const obra = (await page.getByRole('link', { name: 'Ver la ficha de obra' }).getAttribute('href'))!.split('?')[0];
  await sameOnTheOther(page, obra);
  await page.goto(`${other}${obra}/lectura`);
  await expect(page.getByText('No encontramos esto')).toHaveCount(0);
});

test('el reporte y la actividad de política abren aunque los sirva otro servidor', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  await loginAs(page, 'politica@demo.test');
  await page.goto('/municipios/san-cristobal');
  const activity = (await page.locator('main a[href^="/eventos/"]').first().getAttribute('href'))!.split('?')[0];
  const report = (await page.locator('main a[href^="/reportes/"]').first().getAttribute('href'))!.split('?')[0];
  await sameOnTheOther(page, activity);
  // Still without the date on the other server.
  await expect(page.getByText('Ya tiene fecha. La ven el jefe y el despacho en la agenda.')).toBeVisible();
  await sameOnTheOther(page, report);
});

test('lo que no existe dice «No encontramos esto» en español', async ({ page }) => {
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/eventos/00000000-0000-4000-8000-00000000abcd');
  await expect(page.getByRole('heading', { name: 'No encontramos esto' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a Hoy' })).toBeVisible();
});
