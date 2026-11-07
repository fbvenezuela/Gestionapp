import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';
import { QUIET_STATE } from './global-setup';
import { jpegWithGps } from '../unit/fixtures/photos';

// The attention desk's administrator (design §5, D-93) on the strict demo server (code by email and the second
// factor), at 360 px and on a desktop, with axe: a request sent from the public form reaches the coordinator, who
// assigns it; the responsible of its area replies (the person reads it) and leaves an internal note (the person never
// reads it) and moves the state; the person consults and adds information; the team resolves it with evidence and the
// whole history stays. A responsible of another area, the web's editor and someone outside the desk cannot open the
// case, its files, its notes or the export; the auditor reads it without the contact; the boss reads it.
test.describe.configure({ mode: 'serial' });

const RUN = Math.random().toString(36).slice(2, 7);
const TITLE = `Tubo roto frente a la escuela ${RUN} (prueba)`;
const DESCRIPTION = 'Sale agua limpia de un tubo desde anoche y se va por la cuneta (prueba).';
const REPLY = `Ya programamos la visita de la cuadrilla ${RUN} (prueba).`;
const NOTE = `Nota interna: llevar la llave de paso ${RUN} (prueba).`;
const MORE = `Hoy salió más agua y se mojó la acera ${RUN} (prueba).`;
const RESOLUTION = 'Se cambió el tramo de tubo y se probó la presión (prueba).';
const REF = /^AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;

const shared = { reference: '', secret: '', caseUrl: '', fileUrl: '' };
let net = 20 + Math.floor(Math.random() * 200);

async function axe(page: Page, where: string) {
  // A toast that is fading out is not part of the screen (the other specs wait for it too).
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function noSideScroll(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

/** A citizen without an account: a browser of their own, on a network of their own (the persistent limits). */
async function citizen(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, locale: 'es-VE', timezoneId: 'America/Caracas', storageState: QUIET_STATE });
  await ctx.setExtraHTTPHeaders({ 'x-real-ip': `203.0.113.${net++ % 250}` });
  return { ctx, page: await ctx.newPage() };
}

async function lookup(page: Page, reference: string, secret: string) {
  await page.goto('/atencion/consultar');
  await page.getByLabel('Código', { exact: true }).fill(reference);
  await page.getByLabel('Clave', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.locator('#caso-titulo')).toHaveText(reference);
}

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

test('la coordinación recibe una solicitud enviada desde el formulario público y la asigna', async ({ page, browser }) => {
  // The person sends it from the public site (no account), with an email.
  const c = await citizen(browser);
  await c.page.goto('/atencion/nueva?tipo=reporte');
  const type = c.page.getByLabel(/^Reporte/);
  if (!(await type.isChecked())) await type.check();
  await c.page.getByLabel(/^Agua/).check();
  await next(c.page);
  await c.page.getByLabel(/^Municipio/).selectOption({ label: 'Torbes' });
  await c.page.getByLabel(/Parroquia, localidad o sector/).fill(`Sector del administrador ${RUN} (prueba)`);
  await next(c.page);
  await c.page.getByLabel(/^Título/).fill(TITLE);
  await c.page.getByLabel(/^Descripción/).fill(DESCRIPTION);
  await next(c.page);
  await c.page.getByRole('textbox', { name: /^Nombre/ }).fill('Vecina de Prueba');
  await c.page.getByRole('textbox', { name: /^Correo/ }).fill(`vecina.${RUN}@demo.test`);
  await c.page.getByLabel(/Leí el aviso de privacidad/).check();
  await c.page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(c.page.getByTestId('comprobante-codigo')).toBeVisible({ timeout: 30_000 });
  shared.reference = (await c.page.getByTestId('comprobante-codigo').textContent())!.trim();
  shared.secret = (await c.page.getByTestId('comprobante-clave').textContent())!.trim();
  expect(shared.reference).toMatch(REF);
  await c.ctx.close();

  // The coordinator finds it by its code (typed in small letters) in the inbox.
  await loginAs(page, 'atencion.coordinacion@demo.test');
  await page.goto('/admin/atencion');
  await expect(page.getByRole('heading', { level: 1, name: 'Atención ciudadana' })).toBeVisible();
  await noSideScroll(page, 'bandeja');
  await axe(page, 'bandeja (360)');
  await page.getByLabel('Buscar por código o título').fill(shared.reference.toLowerCase());
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/q=/);
  const row = page.getByRole('link', { name: new RegExp(shared.reference) });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  shared.caseUrl = new URL(page.url()).pathname;
  await expect(page.getByText(DESCRIPTION)).toBeVisible();
  await noSideScroll(page, 'caso');
  await axe(page, 'caso (360)');

  // The contact: decrypted only on «Ver contacto» (and recorded).
  await page.getByRole('button', { name: 'Ver contacto' }).click();
  await expect(page.getByText(`vecina.${RUN}@demo.test`)).toBeVisible();

  // Assign: its category's area is already there; the responsible of that area takes it.
  await expect(page.getByLabel('Área', { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel('Responsable', { exact: true }).selectOption({ label: 'Responsable de servicios públicos (demo)' });
  await page.getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(page.getByText('Listo: quedó asignada.')).toBeVisible();
  await expect(page.getByText('Servicios públicos · Responsable de servicios públicos (demo)')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Historial del caso' }).getByText(/Asignación \(responsable: nadie → Responsable de servicios públicos \(demo\)\)/)).toBeVisible();
});

test('el responsable del área responde, deja una nota interna y cambia el estado', async ({ page }) => {
  await loginAs(page, 'atencion.servicios@demo.test');
  await page.goto('/admin/atencion?responsable=yo');
  await expect(page.getByRole('link', { name: new RegExp(shared.reference) })).toBeVisible();
  await page.goto(shared.caseUrl);
  await page.getByLabel('Respuesta a la persona', { exact: true }).check();
  await page.getByLabel('Usar una respuesta guardada').selectOption({ label: 'Atención programada' });
  await expect(page.getByLabel('Respuesta', { exact: true })).toHaveValue(/Ya está programada la atención/);
  await page.getByLabel('Respuesta', { exact: true }).fill(REPLY);
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(page.getByText('Respuesta enviada a la persona.')).toBeVisible();

  await page.getByLabel('Nota interna', { exact: true }).check();
  await page.getByLabel('Nota para el equipo').fill(NOTE);
  await page.getByRole('button', { name: 'Guardar nota interna' }).click();
  await expect(page.getByText('Nota guardada: solo la ve el equipo.')).toBeVisible();

  // On the board, the usual next step is one tap (no reason needed): «Asignado» → «En atención».
  await page.goto(`/admin/atencion?vista=tablero&q=${shared.reference}`);
  await page.getByRole('button', { name: `Pasar ${shared.reference} a En atención` }).click();
  await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
  await page.goto(shared.caseUrl);
  const history = page.getByRole('list', { name: 'Historial del caso' });
  await expect(history.getByText(REPLY)).toBeVisible();
  await expect(history.getByText(NOTE)).toBeVisible();
  await expect(history.getByText('· no la ve la persona')).toBeVisible();
  await expect(history.getByText('Pasó de «Asignado» a «En atención».')).toBeVisible();
});

test('la persona consulta: ve la respuesta (nunca la nota interna) y agrega información', async ({ browser }) => {
  const c = await citizen(browser);
  await lookup(c.page, shared.reference, shared.secret);
  await expect(c.page.getByTestId('estado-solicitud')).toHaveText('En atención');
  await expect(c.page.getByText(REPLY)).toBeVisible();
  await expect(c.page.getByText(NOTE)).toHaveCount(0);
  await expect(c.page.getByText(/llave de paso/)).toHaveCount(0);
  await c.page.getByLabel(/^Información adicional/).fill(MORE);
  await c.page.getByRole('button', { name: 'Enviar información' }).click();
  await expect(c.page.getByText('Información enviada al personal de atención.')).toBeVisible();
  await c.ctx.close();
});

test('el equipo lo resuelve con evidencia, la persona lo ve y la historia completa queda', async ({ page, browser }) => {
  await loginAs(page, 'atencion.servicios@demo.test');
  await page.goto(shared.caseUrl);
  const history = page.getByRole('list', { name: 'Historial del caso' });
  await expect(history.getByText(MORE)).toBeVisible();
  await expect(history.getByText('La persona agregó información.')).toBeVisible();

  // A photo «después», shared with the person.
  await page.getByLabel('Foto o documento de la atención').setInputFiles({ name: 'despues.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegWithGps()) });
  await expect(page.getByLabel('Que la vea la persona en su consulta')).toBeChecked();
  await page.getByRole('button', { name: 'Subir evidencia' }).click();
  await expect(page.getByText('Evidencia subida: la ve la persona.')).toBeVisible();
  await expect(page.getByText(/Evidencia del equipo · Foto/)).toBeVisible();
  await expect(page.getByText('Archivos sin analizar (versión de prueba): ábrelos solo si confías en ellos.')).toBeVisible();
  shared.fileUrl = (await page.getByRole('link', { name: 'Descargar' }).last().getAttribute('href'))!;
  expect(shared.fileUrl).toMatch(/^\/api\/archivos\/atencion\/[0-9a-f-]{36}$/);
  expect((await page.request.get(shared.fileUrl)).status()).toBe(200);

  // «Resuelto» asks for the justification.
  await page.getByLabel('Pasar a').selectOption('resuelto');
  await page.getByLabel('Cómo se resolvió (justificación)').fill(RESOLUTION);
  await page.getByRole('button', { name: 'Cambiar el estado' }).click();
  await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
  await expect(page.getByText(`Justificación (interna): ${RESOLUTION}`)).toBeVisible();
  for (const line of ['Llegó la solicitud desde la web.', 'Pasó de «En atención» a «Resuelto».', 'Evidencia agregada (la ve la persona).']) {
    await expect(history.getByText(line).first(), line).toBeVisible();
  }

  // The person sees «Resuelta» and the evidence the team shared.
  const c = await citizen(browser);
  await lookup(c.page, shared.reference, shared.secret);
  await expect(c.page.getByTestId('estado-solicitud')).toHaveText('Resuelta');
  await expect(c.page.getByText(/Evidencia de la atención/).first()).toBeVisible();
  await expect(c.page.getByText(RESOLUTION)).toHaveCount(0);
  await c.ctx.close();
});

test('un responsable de otra área, el editor de la web y alguien de fuera no abren el caso, sus archivos ni la exportación', async ({ page }) => {
  // Another area's responsible: the case does not exist for them (404), nor its file (404); no export (403).
  await loginAs(page, 'atencion.vialidad@demo.test');
  await page.goto(shared.caseUrl);
  await expect(page.getByRole('heading', { name: 'No encontramos esto' })).toBeVisible();
  await expect(page.getByText(NOTE)).toHaveCount(0);
  expect((await page.request.get(shared.fileUrl)).status()).toBe(404);
  expect((await page.request.get('/admin/atencion/exportar')).status()).toBe(403);
  await page.goto(`/admin/atencion?q=${shared.reference}`);
  await expect(page.getByRole('link', { name: new RegExp(shared.reference) })).toHaveCount(0);

  // The web's editor: back to its own screen; the file and the export are closed.
  await page.context().clearCookies();
  await loginAs(page, 'web.editora@demo.test');
  await page.goto(shared.caseUrl);
  await expect(page).toHaveURL(/\/admin\/web\?sin-permiso=1$/);
  expect((await page.request.get(shared.fileUrl)).status()).toBe(404);
  expect((await page.request.get('/admin/atencion/exportar')).status()).toBe(403);

  // Someone of the team (Redes): back home; nothing of the case.
  await page.context().clearCookies();
  await loginAs(page, 'redes@demo.test');
  await page.goto(shared.caseUrl);
  await expect(page).toHaveURL(/\/hoy\?sin-permiso=1$/);
  expect((await page.request.get(shared.fileUrl)).status()).toBe(404);
  expect((await page.request.get('/admin/atencion/exportar')).status()).toBe(403);

  // Nobody signed in: to the sign-in; the file and the export ask for a session.
  await page.context().clearCookies();
  await page.goto(shared.caseUrl);
  await expect(page).toHaveURL(/\/entrar/);
  expect((await page.request.get(shared.fileUrl)).status()).toBe(401);
  expect((await page.request.get('/admin/atencion/exportar')).status()).toBe(401);
});

test('auditoría lo lee sin el contacto y sin poder tocarlo; exporta sin contactos', async ({ page }) => {
  await loginAs(page, 'consulta@demo.test');
  await page.goto(shared.caseUrl);
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText('Lo puedes consultar, pero no te toca atenderlo: sin contacto y sin cambios.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver contacto' })).toHaveCount(0);
  await expect(page.getByText(`vecina.${RUN}@demo.test`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cambiar el estado' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Guardar nota interna|Enviar respuesta/ })).toHaveCount(0);
  // The history (internal notes included) is readable: auditing reads what happened.
  await expect(page.getByRole('list', { name: 'Historial del caso' }).getByText(NOTE)).toBeVisible();
  await axe(page, 'caso de auditoría');
  const csv = await page.request.get('/admin/atencion/exportar?contacto=1');
  expect(csv.status()).toBe(200);
  const text = (await csv.text()).replace(/^﻿/, '');
  expect(text.split('\r\n')[0]).not.toMatch(/Correo|Teléfono/);
  expect(text).toContain(shared.reference);
  expect(text).not.toContain(`vecina.${RUN}@demo.test`);

  // The desk's record: who looked at the contact (the coordinator, in the first test) and who exported, never what.
  await page.goto('/admin/atencion/registro');
  await expect(page.getByRole('heading', { level: 1, name: 'Registro de atención' })).toBeVisible();
  const record = page.getByRole('listitem').filter({ hasText: 'vio el contacto de' }).filter({ hasText: shared.reference });
  await expect(record.first()).toContainText('Coordinación de atención (demo)');
  await expect(page.getByRole('listitem').filter({ hasText: /exportó \d+ solicitudes en CSV, sin contactos/ }).first()).toBeVisible();
  await expect(page.getByText(`vecina.${RUN}@demo.test`)).toHaveCount(0);
  await axe(page, 'registro de atención');
});

test('la coordinación: tablero, cifras, mapa, áreas y respuestas guardadas en el teléfono y en la computadora, con axe', async ({ page }) => {
  await loginAs(page, 'atencion.coordinacion@demo.test');
  for (const [width, label] of [[360, '360'], [1280, 'escritorio']] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/atencion?vista=tablero');
    await expect(page.getByRole('heading', { level: 2, name: /^Recibido/ })).toBeVisible();
    await noSideScroll(page, `tablero ${label}`);
    await axe(page, `tablero (${label})`);
    await page.goto('/admin/atencion/estadisticas');
    await expect(page.getByRole('heading', { level: 1, name: 'Cifras de atención' })).toBeVisible();
    await expect(page.getByText('Mediana').first()).toBeVisible();
    await expect(page.getByText(/Solicitudes que llegaron entre las dos fechas/)).toBeVisible();
    await noSideScroll(page, `cifras ${label}`);
    await axe(page, `cifras (${label})`);
    await page.goto('/admin/atencion/mapa');
    await expect(page.getByRole('heading', { level: 1, name: 'Mapa de atención' })).toBeVisible();
    await axe(page, `mapa (${label})`);
    await page.goto('/admin/atencion/areas');
    await expect(page.getByRole('heading', { level: 1, name: 'Áreas y plazos' })).toBeVisible();
    await axe(page, `áreas (${label})`);
    await page.goto('/admin/atencion/plantillas');
    await expect(page.getByRole('heading', { level: 1, name: 'Respuestas guardadas' })).toBeVisible();
    await axe(page, `respuestas guardadas (${label})`);
    await page.goto(shared.caseUrl);
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await noSideScroll(page, `caso ${label}`);
    await axe(page, `caso (${label})`);
  }
  // The map loads Leaflet only on tap; the board moves a case with one tap.
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto('/admin/atencion/mapa');
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver el mapa' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
});

test('el jefe lee la bandeja y las cifras, sin denuncias ni contactos; administración arma las áreas sin ver casos', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto(`/admin/atencion?q=${shared.reference}`);
  await page.getByRole('link', { name: new RegExp(shared.reference) }).click();
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver contacto' })).toHaveCount(0);
  await page.goto('/admin/atencion?tipo=denuncia');
  await expect(page.getByText('No hay solicitudes con esos filtros.')).toBeVisible();
  await page.goto('/admin/atencion/estadisticas');
  await expect(page.getByRole('heading', { level: 1, name: 'Cifras de atención' })).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, 'admin@demo.test');
  await page.goto('/admin/atencion');
  await expect(page.getByText(/Administración no lee las solicitudes ni sus contactos/)).toBeVisible();
  await page.goto(shared.caseUrl);
  await expect(page).toHaveURL(/\/hoy\?sin-permiso=1$/);
  await page.goto('/admin/atencion/areas');
  await expect(page.getByRole('heading', { level: 2, name: 'Nueva área' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar los plazos' })).toBeVisible();
  await axe(page, 'áreas de administración');

  // Ajustes → Equipo gives the attention desk's roles: a responsible with its area(s), always with the second factor.
  await page.goto('/ajustes/equipo');
  await page.getByLabel('Rol').selectOption({ label: 'Responsable de área' });
  await expect(page.getByText(/Entra siempre con su código y el doble factor/)).toBeVisible();
  await page.getByRole('group', { name: /Sus áreas/ }).getByLabel('Vialidad y transporte').check();
  await page.getByLabel('Nombre').fill(`Responsable ${RUN} (prueba)`);
  await page.getByLabel('Correo').fill(`responsable.${RUN}@demo.test`);
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText('Invitación enviada.')).toBeVisible();
  const person = page.getByRole('listitem').filter({ hasText: `responsable.${RUN}@demo.test` });
  await expect(person.getByText('Responsable de área', { exact: true })).toBeVisible();
  await expect(person.getByText('Área: Vialidad y transporte')).toBeVisible();
  await noSideScroll(page, 'equipo');
  await axe(page, 'equipo con los roles de la atención');
});
