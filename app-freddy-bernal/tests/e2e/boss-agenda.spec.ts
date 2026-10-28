import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// The boss's own agenda (cambios del 27/10/2026, §3 and §4), on the iPad (1024×768) and the phone (360 px), with axe:
// he creates an event and a «Visita de obra» with the big buttons (accepted at once), a seeded ficha waits in «Por
// ponerle fecha», he puts the date, Redes sees the visit without a date, the IVT sees the date of its obra's visit,
// and política sees «Ya tiene fecha» on its report without the date. Each dated ficha is cancelled at the end, so it
// is back in «Por ponerle fecha» for the other specs. Demo data only.
test.describe.configure({ mode: 'serial' });

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

async function other(browser: Browser, email: string, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

// «Botones grandes para el iPad y el teléfono» (§3): what the boss taps is at least 44 px tall.
async function bigEnough(where: string, controls: Locator[]) {
  for (const c of controls) {
    await expect(c, where).toBeVisible();
    const box = (await c.boundingBox())!;
    expect(box.height, `${where}: «${(await c.innerText()).trim()}» mide ${box.height} px de alto`).toBeGreaterThanOrEqual(44);
  }
}

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const actions = (page: Page) => page.getByRole('navigation', { name: 'Acciones de la agenda' });

// `place`: what «A dónde se va» starts with, the same as on the ficha's own page (the obra's sector and parish, the
// report's community).
async function putDate(page: Page, card: string, time: string, kind: 'obra' | 'report', place: string | RegExp) {
  await page.goto('/agenda/por-fecha');
  await expect(page.getByRole('heading', { level: 1, name: 'Por ponerle fecha' })).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: card });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Ponerle fecha' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Ponerle fecha' })).toBeVisible();
  await expect(sheet.getByLabel('A dónde se va')).toHaveValue(place);
  // Who will see the date: an obra visit's reaches the IVT too. The place's name is the whole team's, so the sheet
  // names what is kept (the date, the time and the exact address), never «el lugar».
  await expect(sheet.getByText('La fecha, la hora y la dirección exacta solo las ven el jefe, el despacho, administración', { exact: false })).toBeVisible();
  await expect(sheet.getByText('el lugar solo', { exact: false })).toHaveCount(0);
  await expect(sheet.getByText('y el IVT (es su visita de obra)', { exact: false })).toHaveCount(kind === 'obra' ? 1 : 0);
  await sheet.getByLabel('Fecha', { exact: true }).fill(inDays(6));
  await sheet.getByLabel('Hora (Táchira)').fill(time);
  await sheet.getByLabel('Guardar aunque choque con otro evento').check();
  await sheet.getByRole('button', { name: 'Guardar la fecha' }).click();
  await expect(page).toHaveURL(/\/eventos\/[0-9a-f-]{36}$/);
  return page.url();
}

async function cancel(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Motivo (opcional)').fill('Prueba de la agenda (demo)');
  await sheet.getByRole('button', { name: 'Sí, cancelar el evento' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cancelado' })).toBeVisible();
}

test.describe('en el iPad (1024×768)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('el jefe crea un evento con el botón grande: queda aceptado de una vez', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe/politica');
    await noSerious(page, '/jefe/politica');
    await actions(page).getByRole('link', { name: /^Nuevo evento/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo evento' })).toBeVisible();
    await page.getByLabel('Título').fill('Rueda de prensa de prueba en la gobernación');
    await page.getByLabel('Fecha', { exact: true }).fill(inDays(9));
    await page.getByLabel('Hora (Táchira)').fill('11:10');
    await page.getByLabel('Guardar aunque choque con otro evento').check();
    await noSerious(page, '/agenda/nuevo');
    await page.getByRole('button', { name: 'Guardar evento' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Rueda de prensa de prueba en la gobernación' })).toBeVisible();
    await expect(page.getByText('Aceptado', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Lo agregó el jefe/)).toBeVisible();
    // His own agenda: Mover and Cancelar are there, big.
    await expect(page.getByRole('button', { name: 'Mover' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
    await noSerious(page, '/eventos/[id] del jefe');
  });

  test('una ficha de obra sembrada espera fecha; el jefe se la pone; Redes la ve sin fecha y el IVT con fecha', async ({ page, browser }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/jefe/politica');
    await actions(page).getByRole('link', { name: /^Por ponerle fecha/ }).click();
    await expect(page).toHaveURL(/\/agenda\/por-fecha$/);
    await noSerious(page, '/agenda/por-fecha');
    const url = await putDate(page, 'Asfaltado de la vía del sector Las Palmas (demo)', '09:40', 'obra', /^Sector Las Palmas \(demo\), \S/);
    const title = 'Visita de obra: Asfaltado de la vía del sector Las Palmas (demo)';
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('main').getByText('Visita de obra', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Aceptado', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/9:40/).first()).toBeVisible();
    await noSerious(page, '/eventos/[id] visita de obra');

    // Redes: the visit is there, without a date or a time.
    const redes = await other(browser, 'redes@demo.test', { width: 1024, height: 768 });
    await redes.page.goto('/agenda');
    await redes.page.getByRole('link', { name: new RegExp(title.replace(/[()]/g, '\\$&')) }).click();
    await expect(redes.page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(redes.page.getByText(/9:40/)).toHaveCount(0);
    await expect(redes.page.getByText('Sin dirección exacta')).toHaveCount(0);
    await noSerious(redes.page, '/eventos/[id] para Redes');
    await redes.ctx.close();

    // The IVT: «Mis visitas de obra», with the date of this visit (2FA).
    const ivt = await other(browser, 'ivt@demo.test', { width: 1024, height: 768 });
    await ivt.page.goto('/agenda');
    await expect(ivt.page.getByRole('heading', { level: 1, name: 'Mis visitas de obra' })).toBeVisible();
    const visit = ivt.page.getByRole('listitem').filter({ hasText: title });
    await expect(visit.getByText(/9:40/)).toBeVisible();
    await noSerious(ivt.page, '/agenda del IVT');
    await visit.getByRole('link').click();
    await expect(ivt.page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(ivt.page.getByText(/9:40/).first()).toBeVisible();
    await expect(ivt.page.getByRole('link', { name: 'Ver la ficha de obra' })).toBeVisible();
    // Never the brief, the storyboard or the material.
    await expect(ivt.page.getByRole('navigation', { name: 'Secciones del evento' })).toHaveCount(0);
    await ivt.ctx.close();

    // Cancelled: struck through, and the obra is back in «Por ponerle fecha».
    await cancel(page, url);
    await page.goto('/agenda/por-fecha');
    const again = page.getByRole('listitem').filter({ hasText: 'Asfaltado de la vía del sector Las Palmas (demo)' });
    await expect(again.getByText('Se canceló una visita antes')).toBeVisible();
  });
});

test.describe('en el teléfono (360 px)', () => {
  test('el jefe crea una visita de obra con el botón grande', async ({ page }) => {
    await loginAs(page, 'jefe@demo.test');
    await page.goto('/agenda');
    await fitsWidth(page, '/agenda del jefe');
    await noSerious(page, '/agenda del jefe');
    await bigEnough('/agenda del jefe', ['Día', 'Semana', 'Mes'].map((name) => page.getByRole('tab', { name, exact: true })));
    await actions(page).getByRole('link', { name: /^Visita de obra/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nueva visita de obra' })).toBeVisible();
    await page.getByLabel('Título').fill('Visita a la cancha techada de prueba (demo)');
    await page.getByRole('button', { name: 'Mañana' }).click();
    await page.getByLabel('Hora (Táchira)').fill('08:20');
    await page.getByLabel('Guardar aunque choque con otro evento').check();
    await fitsWidth(page, '/agenda/nuevo?tipo=obra');
    await noSerious(page, '/agenda/nuevo?tipo=obra');
    await page.getByRole('button', { name: 'Guardar visita de obra' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Visita a la cancha techada de prueba (demo)' })).toBeVisible();
    await expect(page.getByRole('main').getByText('Visita de obra', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Aceptado', { exact: true }).first()).toBeVisible();
    await fitsWidth(page, '/eventos/[id] en el teléfono');
    await bigEnough('/eventos/[id] en el teléfono', [
      page.getByRole('button', { name: 'Mover' }),
      page.getByRole('button', { name: 'Cambiar fecha o lugar' }),
      page.getByRole('button', { name: 'Editar', exact: true }),
      page.locator('main header').first().getByRole('link', { name: 'Agenda' }),
    ]);
    // Rated 7/10: in «Los próximos 7 días» of Política the chips (decision, kind, importance) wrap at 360 px.
    await page.getByRole('radio', { name: '7', exact: true }).click();
    await page.getByRole('button', { name: 'Aceptar', exact: true }).click();
    await expect(page.getByText('Evento aceptado.')).toBeVisible();
    await page.goto('/jefe/politica');
    const row = page.getByRole('listitem').filter({ hasText: 'Visita a la cancha techada de prueba (demo)' });
    await expect(row.getByText('7/10')).toBeVisible();
    await expect(row.getByText('Visita de obra', { exact: true })).toBeVisible();
    await fitsWidth(page, '/jefe/politica en el teléfono');
    await bigEnough('/jefe/politica en el teléfono', [page.getByRole('link', { name: 'Ver todas' }), page.locator('main header').first().getByRole('link', { name: 'Inicio' })]);
  });

  test('un reporte de política espera fecha; el jefe se la pone; política ve «Ya tiene fecha», sin la fecha', async ({ page, browser }) => {
    await loginAs(page, 'jefe@demo.test');
    const report = 'Asamblea con los voceros del sector La Ermita (demo)';
    const url = await putDate(page, report, '16:20', 'report', 'Sector La Ermita (demo)');
    await expect(page.getByRole('heading', { level: 1, name: report })).toBeVisible();
    await expect(page.getByText('Actividad comunitaria', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/4:20/).first()).toBeVisible();
    await fitsWidth(page, '/eventos/[id] actividad comunitaria');
    await noSerious(page, '/eventos/[id] actividad comunitaria');

    const pol = await other(browser, 'politica@demo.test', { width: 360, height: 760 });
    await pol.page.goto('/municipios/torbes');
    await pol.page.locator('main a[href^="/reportes/"]').filter({ hasText: report }).first().click();
    await expect(pol.page).toHaveURL(/\/reportes\/[0-9a-f-]{36}$/);
    await expect(pol.page.getByText('Ya tiene fecha. La ven el jefe y el despacho en la agenda.')).toBeVisible();
    await expect(pol.page.getByText(/4:20/)).toHaveCount(0);
    await noSerious(pol.page, '/reportes/[id] para política');
    // The activity itself, from its municipality: still no date.
    await pol.page.goto('/municipios/torbes');
    await pol.page.locator('main a[href^="/eventos/"]').filter({ hasText: report }).first().click();
    await expect(pol.page.getByRole('heading', { level: 1, name: report })).toBeVisible();
    await expect(pol.page.getByText('Ya tiene fecha. La ven el jefe y el despacho en la agenda.')).toBeVisible();
    await expect(pol.page.getByText(/4:20/)).toHaveCount(0);
    await fitsWidth(pol.page, '/eventos/[id] para política');
    await noSerious(pol.page, '/eventos/[id] para política');
    await pol.ctx.close();

    await cancel(page, url);
  });
});
