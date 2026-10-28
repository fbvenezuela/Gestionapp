import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The obra ficha goes into its event (cambios del 27/10/2026, §4.1), at 360 px with axe: the IVT saves a ficha with
// a photo of the before and its FAB dialog; the boss puts the date; Redes opens the visit and sees no date and a
// «Ficha de obra» tab without contacts (not even in what the server sends), takes the FAB as the speech, and modo
// lectura reads it; the boss also sees «Antes de hablar». The visit is cancelled at the end, so the other specs find
// the agenda as it was. All data here is invented.

const fixture = (f: string) => path.join(__dirname, '..', 'fixtures', f);
const NAME = 'Puente peatonal de prueba (demo)';
const TITLE = `Visita de obra: ${NAME}`;
const WORKS = 'Puente peatonal de 25 m con barandas.';
const REPORTER = 'Vecina de prueba (demo)';
const LIAISON = 'Enlace peatonal (demo)';
const PHONE = '0000-0000555';
const TIME = '10:20';
const TIME_RE = /\b\d{1,2}:\d{2}\s?(a\.?\s?m\.?|p\.?\s?m\.?|AM|PM)/i;
const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const DAY = inDays(8);

async function noSerious(page: Page, where: string) {
  // A toast fading in or out is half transparent: axe would read its contrast mid-animation.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function fitsWidth(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function other(browser: Browser, email: string) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 760 }, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

// A picture that really loaded (not the type icon, not a broken image). Scrolled to first: the pictures load lazily.
async function shownPictures(page: Page, region: string) {
  const box = page.getByRole('region', { name: region });
  await box.scrollIntoViewIfNeeded();
  return box.locator('img[src$="/thumb"]').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length);
}

test('la ficha de obra llega al evento: foto, fecha del jefe, Redes sin fecha ni contactos y el diálogo FAB en el modo lectura', async ({ page, browser }) => {
  test.setTimeout(300_000);

  // 1. The IVT fills the ficha (no date), answers every field and tells the boss.
  await loginAs(page, 'ivt@demo.test');
  await page.goto('/obras/nueva');
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva ficha de obra' })).toBeVisible();
  const filled: Record<string, string> = {
    'Qué problema resuelve': 'Los niños cruzan la quebrada saltando por las piedras.',
    'Qué trabajos se están haciendo (medidas y características)': WORKS,
    'Cuántas personas': '350',
    'Qué beneficios concretos tendrá para la gente': 'Los niños llegan a la escuela sin mojarse.',
    'Quién hizo el reporte o la denuncia': REPORTER,
    'Nombre del enlace comunitario': LIAISON,
    'Teléfono del enlace comunitario': PHONE,
  };
  await page.getByLabel('Nombre de la obra (obligatorio)').fill(NAME);
  await page.getByLabel('Municipio (obligatorio)').selectOption('Torbes');
  for (const [label, value] of Object.entries(filled)) await page.getByLabel(label, { exact: true }).fill(value);
  // Everything else: «No aplica», said on purpose.
  const groups = page.getByRole('group', { name: /^Otra respuesta para «/ });
  const n = await groups.count();
  expect(n).toBeGreaterThan(20);
  for (let i = 0; i < n; i++) {
    const g = groups.nth(i);
    const field = (await g.getAttribute('aria-label'))!.replace(/^Otra respuesta para «/, '').replace(/»$/, '');
    if (field in filled) continue;
    await g.getByRole('button', { name: 'No aplica' }).click();
  }
  await expect(page.getByText('Todo respondido: lista para avisar al jefe.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y avisar al jefe' }).click();
  await expect(page).toHaveURL(/\/obras\/[0-9a-f-]{36}$/);
  const obraUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();

  // A photo of the before, with the upload that survives bad signal; its small picture shows.
  await page.getByLabel('Subir fotos del antes').setInputFiles(fixture('cover.jpg'));
  const before = page.getByRole('region', { name: 'Antes' });
  await expect(before.getByRole('listitem')).toHaveCount(1, { timeout: 30_000 });
  await expect(before.getByRole('listitem')).toContainText('Antes 1');
  await expect.poll(() => shownPictures(page, 'Antes'), { timeout: 15_000 }).toBe(1);

  // «Generame un diálogo FAB con esto», saved as it came out.
  await page.getByRole('button', { name: 'Generar diálogo FAB' }).click();
  const box = page.getByLabel('Texto para leer (lo puedes cambiar antes de guardar)');
  await expect(box).toHaveValue(/Puente peatonal de 25 m con barandas/i);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Modo lectura' })).toBeVisible();
  await noSerious(page, '/obras/[id] con fotos');
  await fitsWidth(page, '/obras/[id] con fotos');

  // 2. The boss puts the date: the ficha becomes a «Visita de obra».
  const boss = await other(browser, 'jefe@demo.test');
  await boss.page.goto(obraUrl);
  await boss.page.getByRole('button', { name: 'Ponerle fecha' }).click();
  const sheet = boss.page.getByRole('dialog');
  await expect(sheet.getByLabel('Título del evento')).toHaveValue(TITLE);
  await sheet.getByLabel('Fecha', { exact: true }).fill(DAY);
  await sheet.getByLabel('Hora (Táchira)').fill(TIME);
  await sheet.getByLabel('Guardar aunque choque con otro evento').check();
  await sheet.getByRole('button', { name: 'Guardar la fecha' }).click();
  await expect(boss.page).toHaveURL(/\/eventos\/[0-9a-f-]{36}$/);
  const eventUrl = new URL(boss.page.url()).pathname;
  await expect(boss.page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(boss.page.getByText(/10:20/).first()).toBeVisible();
  // The boss's tab has the contacts too (2FA).
  await boss.page.goto(`${eventUrl}?tab=obra`);
  await expect(boss.page.getByText(LIAISON)).toBeVisible();
  await expect(boss.page.getByRole('link', { name: PHONE })).toBeVisible();

  // 3. Redes opens the visit: no date, no time, no address.
  const redes = await other(browser, 'redes@demo.test');
  await redes.page.goto(eventUrl);
  await expect(redes.page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  expect(await redes.page.locator('main').innerText()).not.toMatch(TIME_RE);
  await expect(redes.page.getByText(/10:20/)).toHaveCount(0);
  await expect(redes.page.getByText('Sin dirección exacta')).toHaveCount(0);
  await redes.page.getByRole('navigation', { name: 'Secciones del evento' }).getByRole('link', { name: 'Ficha de obra' }).click();
  await expect(redes.page).toHaveURL(/\?tab=obra$/);
  await expect(redes.page.getByText(WORKS)).toBeVisible();
  await expect(redes.page.getByText('350', { exact: true })).toBeVisible();
  for (const secret of [REPORTER, LIAISON, PHONE]) await expect(redes.page.getByText(secret), secret).toHaveCount(0);
  await expect.poll(() => shownPictures(redes.page, 'Antes'), { timeout: 15_000 }).toBe(1);
  await noSerious(redes.page, '/eventos/[id]?tab=obra para Redes');
  await fitsWidth(redes.page, '/eventos/[id]?tab=obra para Redes');
  // Not even in what the server sends with the page (the RSC payload inline in the document).
  await redes.page.goto(`${eventUrl}?tab=obra`);
  await expect(redes.page.getByText(WORKS)).toBeVisible();
  const html = await redes.page.content();
  for (const secret of [REPORTER, LIAISON, PHONE, DAY, 'T14:20']) expect(html, secret).not.toContain(secret);

  // Storyboard: «Usar como discurso» puts the FAB dialog in «Lo que va a decir».
  await redes.page.goto(`${eventUrl}?tab=storyboard`);
  await expect(redes.page.getByRole('heading', { name: 'Lo que voy a decir (ficha de obra)' })).toBeVisible();
  await redes.page.getByRole('button', { name: 'Usar como discurso' }).click();
  await expect(redes.page.getByLabel('Lo que va a decir')).toHaveValue(/Puente peatonal de 25 m con barandas/i);
  await expect(redes.page.getByRole('button', { name: 'Ya es el discurso' })).toBeDisabled();
  await noSerious(redes.page, '/eventos/[id]?tab=storyboard con el FAB');

  // 4. Modo lectura: with no speech saved yet it reads the FAB dialog. Redes gets no «Antes de hablar».
  await redes.page.goto(`${eventUrl}/lectura`);
  await expect(redes.page.getByText(/Puente peatonal de 25 m con barandas/i).first()).toBeVisible();
  await expect(redes.page.getByText(/De la ficha de obra O-\d{4}/)).toBeVisible();
  await expect(redes.page.getByRole('heading', { name: 'Antes de hablar' })).toHaveCount(0);
  for (const secret of [REPORTER, LIAISON, PHONE]) expect(await redes.page.content(), secret).not.toContain(secret);
  await redes.ctx.close();

  // The boss: the same text, and «Antes de hablar» with who reported it and the liaison (never a phone).
  await boss.page.goto(`${eventUrl}/lectura`);
  await expect(boss.page.getByText(/Puente peatonal de 25 m con barandas/i).first()).toBeVisible();
  const beforeBox = boss.page.getByRole('region', { name: 'Antes de hablar' });
  await expect(beforeBox.getByText(REPORTER)).toBeVisible();
  await expect(beforeBox.getByText(LIAISON)).toBeVisible();
  await expect(beforeBox.getByText(PHONE)).toHaveCount(0);
  await noSerious(boss.page, '/eventos/[id]/lectura del jefe');

  // Cancelled at the end: the obra goes back to «Por ponerle fecha».
  await boss.page.goto(eventUrl);
  await boss.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const cancel = boss.page.getByRole('dialog');
  await cancel.getByLabel('Motivo (opcional)').fill('Prueba de la ficha en el evento (demo)');
  await cancel.getByRole('button', { name: 'Sí, cancelar el evento' }).click();
  await expect(boss.page.getByRole('status').filter({ hasText: 'Cancelado' })).toBeVisible();
  await boss.ctx.close();
});
