import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// «La oficina» (06/11/2026) at 360 px against the demo: the drawing with its ten rooms, the coffee growers' meeting in
// «Guionistas» with its script waiting for the boss; the boss approves it and, as it already has a storyboard shot, it moves to «Grabación»; política has
// no office in its menu. No date or time anywhere. Runs in order. All data here is invented.
test.describe.configure({ mode: 'serial' });

const EVENT = 'Reunión con productores de café de la zona alta';
const TIME_RE = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)/i;
const SHOTS = process.env.OFICINA_SHOTS;

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
}

test('Redes ve la oficina: once salas y cada actividad en la suya, sin fecha ni hora', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/oficina');
  await expect(page.getByRole('heading', { name: 'La oficina', level: 1 })).toBeVisible();
  await expect(page.getByRole('group', { name: /once salas/ })).toBeVisible();
  await expect(page.locator('ol > li[id^="sala-"]')).toHaveCount(11);
  await expect(page.locator('#sala-meeting').getByText('Jornada de salud en la escuela Los Andes')).toBeVisible();
  await expect(page.locator('#sala-script').getByText(EVENT)).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(TIME_RE);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/oficina-redes-360.png`, fullPage: true });
  await axe(page);
});

test('el jefe aprueba el guion y la actividad sigue (ya tenía storyboard: pasa a Grabación)', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/oficina');
  await page.locator('#sala-script').getByText(EVENT).click();
  await expect(page.getByRole('heading', { name: EVENT })).toBeVisible();
  await expect(page.getByText('Espera al jefe')).toBeVisible();
  await expect(page.getByLabel('Guion, una toma por línea')).toHaveValue(/Toma 1/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/oficina-guion-360.png`, fullPage: true });
  await axe(page);
  await page.getByRole('button', { name: 'Aprobar guion' }).click();
  await expect(page.getByText('Guion aprobado. Sigue su camino.')).toBeVisible();
  await expect(page.getByText(/está en Grabación/)).toBeVisible();
  await page.goto('/oficina');
  await expect(page.locator('#sala-recording').getByText(EVENT)).toBeVisible();
});

test('la reunión de arranque: el jefe la da por hecha y la actividad pasa a Guionistas', async ({ page }) => {
  const MEETING = 'Jornada de salud en la escuela Los Andes';
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/oficina');
  await page.locator('#sala-meeting').getByText(MEETING).click();
  await expect(page.getByText(/está en Sala de reuniones/)).toBeVisible();
  await expect(page.getByText('Van todos: el jefe, despacho, Redes y Grabación. Ya les llegó el aviso.')).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(TIME_RE);
  await axe(page);
  await page.getByRole('button', { name: 'La reunión ya se hizo' }).click();
  await expect(page.getByText('Reunión hecha. Pasa a Guionistas.')).toBeVisible();
  await expect(page.getByText(/está en Guionistas/)).toBeVisible();
});

test('el jefe tiene la oficina en su menú y arriba de «Digital»', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/jefe/digital');
  await expect(page.getByRole('heading', { name: 'La oficina' })).toBeVisible();
  await expect(page.getByRole('group', { name: /once salas/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^8\. Oficina del jefe/ })).toHaveAttribute('href', '/oficina#sala-approval');
  await axe(page);
});

test('política no tiene la oficina', async ({ page }) => {
  await loginAs(page, 'politica@demo.test');
  await expect(page.getByRole('link', { name: 'Oficina' })).toHaveCount(0);
  // The page sends it back to its own home with the «no tienes permiso» notice (after the loading screen).
  await page.goto('/oficina');
  await page.waitForURL((u) => u.pathname !== '/oficina');
  await expect(page.getByRole('heading', { name: 'La oficina' })).toHaveCount(0);
});
