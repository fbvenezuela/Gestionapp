import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Fichas (cambios del 27/10/2026, §4.1 and §4.2), at 360 px with axe: the IVT on its obra fichas (without a date),
// política on the municipalities (overdue on top), and Redes kept out of the community reports. Demo data only.

async function noSerious(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function fitsWidth(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('el IVT: sus fichas de obra, la ficha O-0001 con su diálogo FAB y una ficha nueva sin fecha', async ({ page }) => {
  await loginAs(page, 'ivt@demo.test');
  await page.goto('/');
  await expect(page).toHaveURL(/\/obras$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Fichas de obra' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Por ponerle fecha \(\d+\)$/ })).toBeVisible();
  await noSerious(page, '/obras');
  await fitsWidth(page, '/obras');

  // O-0001: the bridge of the demo (already dated by despacho: the IVT does not see the date yet).
  await page.getByRole('link', { name: /Rehabilitación del puente La Quebrada/ }).click();
  await expect(page).toHaveURL(/\/obras\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Rehabilitación del puente La Quebrada' })).toBeVisible();
  await expect(page.getByText('O-0001', { exact: true })).toBeVisible();
  await expect(page.getByText('Ya tiene fecha. La ponen y la ven el jefe y el despacho en la agenda.')).toBeVisible();
  // Contacts are there for the IVT (with 2FA), and the history has only field names.
  await expect(page.getByText('0000-0000102')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historia' })).toBeVisible();
  await expect(page.getByText(/le puso fecha a la visita/)).toBeVisible();
  // «Generar diálogo FAB»: only the ficha's figures; editable before saving.
  await page.getByRole('button', { name: 'Generar diálogo FAB' }).click();
  // (If the saved text was edited by hand, it asks before replacing it.)
  await page.getByRole('button', { name: 'Reemplazar' }).click({ timeout: 1500 }).catch(() => undefined);
  const box = page.getByLabel('Texto para leer (lo puedes cambiar antes de guardar)');
  await expect(box).toHaveValue(/Ya vamos en 60 % de avance\./);
  await expect(box).toHaveValue(/Son 1\.200 personas y 300 familias\./);
  await noSerious(page, '/obras/O-0001');
  await fitsWidth(page, '/obras/O-0001');

  // A new ficha: «No aplica» disables the field; «Guardar borrador» sends nothing and lands on the ficha.
  await page.goto('/obras/nueva');
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva ficha de obra' })).toBeVisible();
  await expect(page.getByLabel(/fecha de la visita/i)).toHaveCount(0);
  await noSerious(page, '/obras/nueva');
  await fitsWidth(page, '/obras/nueva');
  await page.getByLabel('Nombre de la obra (obligatorio)').fill('Cancha techada de prueba (demo)');
  await page.getByLabel('Municipio (obligatorio)').selectOption('Torbes');
  const sector = page.getByRole('group', { name: 'Otra respuesta para «Sector»' });
  await sector.getByRole('button', { name: 'No aplica' }).click();
  await expect(sector.getByRole('button', { name: 'No aplica' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Sector', { exact: true })).toBeDisabled();
  await expect(page.getByText(/^Falta «/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/obras\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cancha techada de prueba (demo)' })).toBeVisible();
  await expect(page.getByText('Borrador', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/el jefe o el despacho le ponen fecha y hora/)).toBeVisible();
});

test('política: los municipios con lo vencido arriba, un municipio y la ficha comunitaria nueva', async ({ page }) => {
  await loginAs(page, 'politica@demo.test');
  await page.goto('/');
  await expect(page).toHaveURL(/\/municipios$/);
  const overdue = page.getByRole('region', { name: /Vencidas en los municipios/ });
  await expect(overdue).toBeVisible();
  await expect(overdue.getByRole('link', { name: /Bote de aguas negras en la calle principal \(demo\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Los 29 municipios' })).toBeVisible();
  await noSerious(page, '/municipios');
  await fitsWidth(page, '/municipios');

  await page.getByRole('link', { name: /^Junín/ }).first().click();
  await expect(page).toHaveURL(/\/municipios\/junin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Junín' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Parroquias' })).toBeVisible();
  await expect(page.getByText('Vencida', { exact: true }).first()).toBeVisible();
  // Política sees no obra fichas and no events of the agenda here.
  await expect(page.locator('main a[href^="/obras/"]')).toHaveCount(0);
  await expect(page.locator('main a[href^="/eventos/"]')).toHaveCount(0);
  await noSerious(page, '/municipios/junin');
  await fitsWidth(page, '/municipios/junin');

  // A report from the list: its history keeps every change with its reason.
  await page.getByRole('link', { name: /Bote de aguas negras/ }).first().click();
  await expect(page).toHaveURL(/\/reportes\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Se reportó a la hidrológica; esperan la cuadrilla.')).toBeVisible();
  await expect(page.getByText(/Vencida hace \d+ días?/)).toBeVisible();
  await noSerious(page, '/reportes/R-0003');
  await fitsWidth(page, '/reportes/R-0003');

  await page.goto('/reportes/nuevo?municipio=Torbes');
  await expect(page.getByRole('heading', { level: 1, name: 'Nueva ficha comunitaria' })).toBeVisible();
  await expect(page.getByLabel('Municipio (obligatorio)')).toHaveValue('Torbes');
  // «¿Va a la agenda del jefe?» turns on by itself for an «Evento».
  const agenda = page.getByRole('switch', { name: '¿Va a la agenda del jefe?' });
  await expect(agenda).not.toBeChecked();
  await page.getByLabel('Tipo (obligatorio)').selectOption('event');
  await expect(agenda).toBeChecked();
  await expect(page.getByRole('button', { name: 'Guardar y avisar al jefe' })).toBeVisible();
  await noSerious(page, '/reportes/nuevo');
  await fitsWidth(page, '/reportes/nuevo');
});

test('redes no entra a los municipios ni a un reporte comunitario, ni con el enlace', async ({ page }) => {
  await loginAs(page, 'politica@demo.test');
  await page.goto('/municipios?vencidas=1');
  const href = await page.locator('main a[href^="/reportes/"]:not([href^="/reportes/nuevo"])').first().getAttribute('href');
  expect(href).toMatch(/^\/reportes\/[0-9a-f-]{36}$/);
  await page.context().clearCookies();

  await loginAs(page, 'redes@demo.test');
  for (const path of ['/municipios', href!, '/reportes/nuevo', '/obras']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/hoy\?sin-permiso=1$/);
    await expect(page.getByText('Esa pantalla no es de tu rol.')).toBeVisible();
    await expect(page.getByText('Bote de aguas negras')).toHaveCount(0);
  }
  // Not in the menu either.
  await expect(page.getByRole('link', { name: 'Municipios' })).toHaveCount(0);
});

// What the phone keeps of a ficha (useDraft + domain/ficha-draft.ts): opening «Editar» and leaving keeps nothing, so
// someone else's later save is never reverted by an old copy; a field both changed brings back the person's text
// with the «Ojo» warning before and after saving; a ?municipio= preset wins over an old new-form draft.
test('borradores en el teléfono: abrir y salir no deja nada, y el cambio de otra persona no se pierde', async ({ page, browser }) => {
  const drafts = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('draft:')));
  await loginAs(page, 'ivt@demo.test');
  await page.goto('/obras/nueva');
  await page.getByLabel('Nombre de la obra (obligatorio)').fill('Ficha de borradores de prueba (demo)');
  await page.getByLabel('Municipio (obligatorio)').selectOption('Torbes');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/obras\/[0-9a-f-]{36}$/);
  const ficha = new URL(page.url()).pathname;
  expect(await drafts()).toEqual([]);

  // Open «Editar» and tap «Cancelar»: nothing stays in the phone.
  await page.goto(`${ficha}?editar=1`);
  await expect(page.getByLabel('Ingeniero responsable', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  expect(await drafts()).toEqual([]);

  // Despacho, on its own phone, changes «Ingeniero responsable».
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 760 }, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const despacho = await other.newPage();
  await loginAs(despacho, 'despacho@demo.test');
  const editAs = async (p: Page, label: string, value: string) => {
    await p.goto(`${ficha}?editar=1`);
    await p.getByLabel(label, { exact: true }).fill(value);
    await p.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(p).toHaveURL(new RegExp(`${ficha}$`));
  };
  await editAs(despacho, 'Ingeniero responsable', 'Ing. de despacho (demo)');

  // The IVT opens «Editar» again: no old copy, despacho's value is there.
  await page.goto(`${ficha}?editar=1`);
  await expect(page.getByLabel('Ingeniero responsable', { exact: true })).toHaveValue('Ing. de despacho (demo)');
  await expect(page.getByText('Recuperamos lo que estabas escribiendo en este teléfono.')).toHaveCount(0);

  // The IVT types «Sector» and leaves without saving; despacho saves another «Sector».
  await page.getByLabel('Sector', { exact: true }).fill('Sector de la IVT (demo)');
  await expect.poll(drafts).toHaveLength(1);
  await page.goto(ficha);
  await editAs(despacho, 'Sector', 'Sector de despacho (demo)');
  await other.close();

  // Back in «Editar»: the IVT's text comes back, with the warning; despacho's engineer stays.
  await page.goto(`${ficha}?editar=1`);
  await expect(page.getByText('Recuperamos lo que estabas escribiendo en este teléfono.')).toBeVisible();
  await expect(page.getByText(/Ojo: alguien cambió «Sector» después de que empezaste/)).toBeVisible();
  await expect(page.getByLabel('Sector', { exact: true })).toHaveValue('Sector de la IVT (demo)');
  await expect(page.getByLabel('Ingeniero responsable', { exact: true })).toHaveValue('Ing. de despacho (demo)');
  await noSerious(page, '/obras/[id]?editar=1 con borrador');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText(/Ojo: alguien la cambió mientras escribías/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  await expect(page.getByText('Ing. de despacho (demo)')).toBeVisible();
  await expect(page.getByText('Sector de la IVT (demo)').first()).toBeVisible();
  expect(await drafts()).toEqual([]);
});

test('ficha comunitaria nueva: el municipio del enlace gana sobre un borrador viejo', async ({ page }) => {
  await loginAs(page, 'politica@demo.test');
  await page.goto('/reportes/nuevo?municipio=Torbes');
  await expect(page.getByLabel('Municipio (obligatorio)')).toHaveValue('Torbes');
  await page.getByRole('link', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/\/municipios\/torbes$/);
  await page.goto('/reportes/nuevo?municipio=Jun%C3%ADn');
  await expect(page.getByLabel('Municipio (obligatorio)')).toHaveValue('Junín');
  await expect(page.getByText('Recuperamos lo que estabas escribiendo en este teléfono.')).toHaveCount(0);
});

test('política: el reporte que ya tiene visita dice «Ya tiene fecha», sin la fecha', async ({ page }) => {
  await loginAs(page, 'politica@demo.test');
  await page.goto('/municipios/san-cristobal');
  await page.getByRole('link', { name: /Jornada de salud en la escuela Los Andes \(demo\)/ }).first().click();
  await expect(page).toHaveURL(/\/reportes\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Ya tiene fecha. La ven el jefe y el despacho en la agenda.')).toBeVisible();
  await expect(page.getByText(/Va a la agenda: por ponerle fecha/)).toHaveCount(0);
  await expect(page.locator('main a[href^="/eventos/"]')).toHaveCount(0);
});
