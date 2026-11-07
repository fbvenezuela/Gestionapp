import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SECRET as GPS_TEXT, jpegWithGps } from '../unit/fixtures/photos';

// Citizen participation on the public website (design §4): send one of each kind (one with a photo), download the
// receipt, follow it with the code and the secret and add information, the uniform «not found» for a wrong secret or an
// altered code, a retry that never makes a second request, «Apoyar este reporte», the draft that survives a reload, the
// form without JavaScript, «Casos atendidos» with its filters, and axe at 360 px and on a desktop. Each test comes from a network
// of its own (x-real-ip), so the persistent limits of one never touch another; each one is a new browser (device).

const YEAR = new Date().getFullYear();
const DEMR02 = { reference: `AC-${YEAR}-DEMR02`, secret: 'R3PS-W8N2-DEMV-7QKA' };
const DEMR03 = { reference: `AC-${YEAR}-DEMR03`, secret: 'H4JX-5ZTB-9CNF-W2YE' };
const REF = /^AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;
const SECRET = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
const NOT_FOUND = 'No hay ninguna solicitud con esos datos.';

let net = 20 + Math.floor(Math.random() * 120);
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-real-ip': `198.51.100.${net++ % 250}` });
});

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, label).toEqual([]);
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();
const unique = () => `Sector de prueba ${Math.random().toString(36).slice(2, 8)}`;

type Fill = { type: RegExp; category: RegExp; municipality?: string; sector?: string; reference?: string; title: string; description: string };

/** Steps 1 to 3 of the form (the kind already chosen when `?tipo=` came in the address). */
async function fillSteps(page: Page, f: Fill) {
  const radio = page.getByLabel(f.type);
  if (!(await radio.isChecked())) await radio.check();
  await page.getByLabel(f.category).check();
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: /^Lugar/ })).toBeVisible();
  if (f.municipality) await page.getByLabel(/^Municipio/).selectOption({ label: f.municipality });
  if (f.sector) await page.getByLabel(/Parroquia, localidad o sector/).fill(f.sector);
  if (f.reference) await page.getByLabel(/^Punto de referencia/).fill(f.reference);
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Detalle de la solicitud' })).toBeVisible();
  await page.getByLabel(/^Título/).fill(f.title);
  await page.getByLabel(/^Descripción/).fill(f.description);
}

async function toContactStep(page: Page) {
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Contacto y envío' })).toBeVisible();
}

async function sendAnonymous(page: Page) {
  await page.getByLabel(/Enviar como anónimo/).check();
  await page.getByLabel(/Leí el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
}

async function readReceipt(page: Page) {
  const code = page.getByTestId('comprobante-codigo');
  await expect(code).toBeVisible({ timeout: 30_000 });
  const reference = (await code.textContent())!.trim();
  const secret = (await page.getByTestId('comprobante-clave').textContent())!.trim();
  expect(reference).toMatch(REF);
  expect(secret).toMatch(SECRET);
  return { reference, secret };
}

async function lookup(page: Page, reference: string, secret: string) {
  await page.goto('/atencion/consultar');
  await page.getByLabel('Código', { exact: true }).fill(reference);
  await page.getByLabel('Clave', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Consultar' }).click();
}

test('«Atención ciudadana» se lee en el teléfono: los dos botones grandes, los pasos, las preguntas y el aviso de emergencias', async ({ page }) => {
  await page.goto('/atencion');
  await expect(page.getByRole('heading', { level: 1, name: 'Atención ciudadana' })).toBeVisible();
  // The page's own big button, in its title block (the attention desk's small menu has a «Nueva solicitud» too).
  await expect(page.locator('#contenido header').getByRole('link', { name: 'Nueva solicitud' })).toHaveAttribute('href', '/atencion/nueva');
  await expect(page.getByRole('link', { name: /^Consultar mi solicitud$/ }).last()).toBeVisible();
  await expect(page.getByText('Esto no es un servicio de emergencias.').first()).toBeVisible();
  await expect(page.getByText(/acuda también a las autoridades competentes/).first()).toBeVisible();
  // The FAQs of the group «atencion» (demo) open on tap; no invented contacts: the empty state.
  await page.getByText('¿Qué pasa si pierdo la clave? (demo)').click();
  await expect(page.getByText(/La clave no se puede recuperar/).first()).toBeVisible();
  await expect(page.getByText('Canal de atención')).toBeVisible();
  await noSideScroll(page);
  await axe(page, '/atencion');
});

/**
 * The whole journey of a report with a photo: the steps, the summary of errors, the receipt (PDF in the browser), the
 * lookup with the code and the secret as typed, the photo without its GPS position, adding information and «Salir»;
 * then a wrong secret gets the one answer. Runs on the phone and on a desktop.
 */
async function reportWithPhoto(page: Page, where: string) {
  await page.goto('/atencion/nueva?tipo=reporte');
  await expect(page.getByRole('heading', { level: 1, name: 'Hacer un reporte' })).toBeVisible();
  await axe(page, `paso 1 (${where})`);
  await fillSteps(page, {
    type: /^Reporte/, category: /^Agua/, municipality: 'Torbes', sector: unique(), reference: 'Frente a la bodega (prueba)',
    title: 'Bote de agua en la esquina (prueba)', description: 'Sale agua limpia de la tubería desde ayer y se pierde por la cuneta (prueba).',
  });
  await page.getByLabel('Elegir fotos o documentos').setInputFiles({ name: 'foto del bote.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegWithGps()) });
  await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText('foto del bote.jpg')).toBeVisible();
  await toContactStep(page);
  await page.getByRole('textbox', { name: /^Nombre/ }).fill('Ana Prueba');
  await page.getByRole('textbox', { name: /^Correo/ }).fill('ana.prueba@demo.test');
  // Without the privacy notice nothing is sent: the summary at the top says what to check and takes the focus.
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const summary = page.getByRole('alert').filter({ hasText: 'Revise este dato' });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('link', { name: 'Para enviar, debe aceptar el aviso de privacidad.' })).toBeVisible();
  await axe(page, `paso 4 con errores (${where})`);
  await page.getByLabel(/Leí el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  const { reference, secret } = await readReceipt(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Solicitud recibida' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Archivos adjuntos' }).getByText(/· Listo$/)).toBeVisible({ timeout: 30_000 });
  await noSideScroll(page);
  await axe(page, `comprobante (${where})`);

  // «Descargar comprobante (PDF)»: made in the browser, with the code and the secret.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar comprobante/ }).click()]);
  expect(download.suggestedFilename()).toBe(`comprobante-${reference}.pdf`);
  const pdf = fs.readFileSync((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.includes(Buffer.from(reference))).toBe(true);
  expect(pdf.includes(Buffer.from(secret))).toBe(true);
  // The secret is never in an address.
  expect(page.url()).not.toContain(secret);

  await lookup(page, reference.toLowerCase(), secret.toLowerCase());
  await expect(page.locator('#caso-titulo')).toHaveText(reference);
  await expect(page.locator('#caso-titulo')).toBeFocused();
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Recibida');
  await expect(page.getByText('Bote de agua en la esquina (prueba)')).toBeVisible();
  expect(page.url()).toMatch(/\/atencion\/consultar$/);
  // Its own photo downloads while the consultation lasts, without the GPS position.
  const href = await page.getByRole('link', { name: /Descargar Foto 1/ }).getAttribute('href');
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('image/jpeg');
  expect((await file.body()).includes(Buffer.from(GPS_TEXT, 'latin1'))).toBe(false);
  await axe(page, `consulta (${where})`);

  await page.getByLabel(/^Información adicional/).fill('El bote creció esta mañana (prueba).');
  await page.getByRole('button', { name: 'Enviar información' }).click();
  await expect(page.getByText('Información enviada al personal de atención.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historial de la solicitud' }).getByText('El bote creció esta mañana (prueba).')).toBeVisible();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === 'fb_consulta')).toBe(false);
  expect((await page.request.get(href!)).status()).toBe(404);
  // The same code with one wrong letter in the secret: the one answer, nothing opened.
  const wrong = secret.replace(/^./, (c) => (c === 'Z' ? 'Y' : 'Z'));
  await lookup(page, reference, wrong);
  await expect(page.getByRole('alert').getByText(NOT_FOUND)).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === 'fb_consulta')).toBe(false);
}

test('un reporte con una foto: comprobante en PDF, consulta con la clave, la foto sin GPS y agregar información', async ({ page }) => {
  await reportWithPhoto(page, 'teléfono');
});

const KINDS = [
  { tipo: 'peticion', type: /^Petición/, category: /^Salud/, municipality: 'Junín', title: 'Jornada de vacunación (prueba)', heading: 'Solicitud recibida' },
  { tipo: 'acotacion', type: /^Observación/, category: /^Vialidad/, municipality: undefined, title: 'Faltan señales en los desvíos (prueba)', heading: 'Solicitud recibida' },
  { tipo: 'sugerencia', type: /^Sugerencia/, category: /^Transporte/, municipality: undefined, title: 'Publicar las rutas del transporte (prueba)', heading: 'Solicitud recibida' },
  { tipo: 'reconocimiento', type: /^Reconocimiento/, category: /^Educación/, municipality: 'Michelena', title: 'Gracias por arreglar la escuela (prueba)', heading: 'Solicitud recibida' },
  { tipo: 'denuncia', type: /^Denuncia/, category: /^Seguridad/, municipality: 'Cárdenas', title: 'Cobro irregular por un trámite (prueba)', heading: 'Solicitud recibida' },
] as const;

for (const k of KINDS) {
  test(`una ${k.tipo} llega y da su comprobante`, async ({ page }) => {
    await page.goto(`/atencion/nueva?tipo=${k.tipo}`);
    if (k.tipo === 'denuncia') await expect(page.getByText(/acuda también a las autoridades competentes/).first()).toBeVisible();
    await page.getByLabel(k.category).check();
    await next(page);
    if (k.municipality) await page.getByLabel(/^Municipio/).selectOption({ label: k.municipality });
    await page.getByLabel(/Parroquia, localidad o sector/).fill(unique());
    if (k.tipo === 'denuncia') {
      // A denuncia carries only the approximate place: no reference and no point.
      await expect(page.getByLabel(/^Punto de referencia/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Usar mi ubicación' })).toHaveCount(0);
    }
    await next(page);
    await page.getByLabel(/^Título/).fill(k.title);
    await page.getByLabel(/^Descripción/).fill('Lo cuento con el detalle que hace falta para atenderlo (prueba).');
    await toContactStep(page);
    await sendAnonymous(page);
    await readReceipt(page);
    await expect(page.getByRole('heading', { level: 2, name: k.heading })).toBeVisible();
    if (k.tipo === 'denuncia') await expect(page.getByText(/acuda también a las autoridades competentes/).first()).toBeVisible();
  });
}

test('clave mala, código alterado o inventado: siempre la misma respuesta y ninguna consulta abierta', async ({ page }) => {
  const altered = DEMR03.reference.replace(/3$/, '4');
  for (const [reference, secret] of [
    [DEMR03.reference, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ'],
    [altered, DEMR03.secret],
    [`AC-${YEAR}-ZZZZZZ`, DEMR03.secret],
    ['hola', 'chao'],
  ]) {
    await lookup(page, reference, secret);
    await expect(page.getByRole('alert').getByText(NOT_FOUND)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
  }
  expect((await page.context().cookies()).some((c) => c.name === 'fb_consulta')).toBe(false);
  await noSideScroll(page);
  await axe(page, 'consulta con error');
  // The right ones open it.
  await lookup(page, DEMR03.reference, DEMR03.secret);
  await expect(page.locator('#caso-titulo')).toHaveText(DEMR03.reference);
  const cookie = (await page.context().cookies()).find((c) => c.name === 'fb_consulta')!;
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/atencion/consultar' });
  expect(cookie.value).not.toContain(DEMR03.secret);
});

test('una solicitud resuelta pregunta si se resolvió; el «no» pide qué falta', async ({ page }) => {
  await lookup(page, DEMR02.reference, DEMR02.secret);
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Resuelta');
  await expect(page.getByRole('heading', { name: 'La solicitud fue marcada como resuelta' })).toBeVisible();
  // The team's evidence it shared downloads too (a demo placeholder without a real file behind it answers 404).
  await expect(page.getByText(/Evidencia de la atención/).first()).toBeVisible();
  await page.getByLabel('No, todavía no').check();
  await expect(page.getByLabel(/¿Qué falta por resolver\?/)).toBeVisible();
  await page.getByRole('button', { name: 'Responder' }).click();
  await expect(page.getByText('Indique qué falta por resolver.')).toBeVisible();
  // Nothing changed: the case is still waiting for the answer.
  await expect(page.getByTestId('estado-solicitud')).toHaveText('Resuelta');
  await axe(page, 'confirmar');
});

test('un reintento (la respuesta se perdió) no crea otra solicitud: vuelve el mismo código', async ({ page }) => {
  let first = true;
  let committed = '';
  await page.route('**/atencion/nueva**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    if (!first) return route.continue();
    first = false;
    // The request reaches the server and is saved; the answer never arrives.
    const res = await route.fetch();
    committed = (await res.text()).match(/AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}/)?.[0] ?? '';
    await route.abort('failed');
  });
  await page.goto('/atencion/nueva?tipo=peticion');
  await page.getByLabel(/^Salud/).check();
  await next(page);
  await page.getByLabel(/^Municipio/).selectOption({ label: 'Junín' });
  await next(page);
  await page.getByLabel(/^Título/).fill('Una petición que se reintenta (prueba)');
  await page.getByLabel(/^Descripción/).fill('La respuesta se pierde en el camino y el teléfono vuelve a enviar (prueba).');
  await toContactStep(page);
  await sendAnonymous(page);
  // Next retries the send by itself when the connection comes back; if it gives up, the person taps «Enviar» again.
  const code = page.getByTestId('comprobante-codigo');
  const failed = page.getByText(/No se pudo enviar/);
  await expect(code.or(failed)).toBeVisible({ timeout: 30_000 });
  if (await failed.isVisible()) await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(code).toBeVisible({ timeout: 30_000 });
  expect(committed).toMatch(REF);
  await expect(code).toHaveText(committed);
});

test('«Apoyar este reporte»: con reportes abiertos del mismo problema en el mismo sitio, apoyar da un código propio que sigue el caso', async ({ page }) => {
  await page.goto('/atencion/nueva?tipo=reporte');
  await page.getByLabel(/^Vialidad/).check();
  await next(page);
  await page.getByLabel(/^Municipio/).selectOption({ label: 'San Cristóbal' });
  await page.getByLabel(/Parroquia, localidad o sector/).fill('Sector centro (demo)');
  await next(page);
  // Only how many, never their texts, photos or names.
  await expect(page.getByRole('heading', { name: /^Hay \d+ reportes? abiertos? del mismo problema cerca de ese lugar\.$/ })).toBeVisible();
  await expect(page.getByText('Hueco grande en la avenida principal (demo)')).toHaveCount(0);
  await axe(page, 'reportes parecidos');
  await page.getByRole('button', { name: 'Apoyar este reporte' }).click();
  await page.getByLabel(/^Comentario/).fill('También me cuesta pasar por ahí (prueba).');
  await page.getByLabel(/Enviar como anónimo/).check();
  await page.getByLabel(/Leí el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Enviar apoyo' }).click();
  const { reference, secret } = await readReceipt(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Apoyo registrado' })).toBeVisible();

  await lookup(page, reference, secret);
  await expect(page.locator('#caso-titulo')).toHaveText(reference);
  await expect(page.getByText('Su apoyo a un reporte')).toBeVisible();
  await expect(page.getByText('Hueco grande en la avenida principal (demo)')).toHaveCount(0);
  await expect(page.getByText('También me cuesta pasar por ahí (prueba).')).toBeVisible();
});

test('la ubicación, solo si la persona quiere: «Usar mi ubicación» y el mapa, que carga al tocarlo', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 7.7712345, longitude: -72.2254321 });
  await page.goto('/atencion/nueva?tipo=reporte');
  await page.getByLabel(/^Ambiente y aseo/).check();
  await next(page);
  await page.getByLabel(/^Municipio/).selectOption({ label: 'San Cristóbal' });
  await page.getByLabel(/Parroquia, localidad o sector/).fill(unique());
  // Nothing of the map before the tap.
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
  await expect(page.getByText('Punto guardado con su autorización.')).toBeVisible();
  await expect(page.getByText('7.77123, -72.22543')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar en el mapa' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar el centro del mapa' }).click();
  await expect(page.getByText('Punto guardado con su autorización.')).toBeVisible();
  await noSideScroll(page);
  await axe(page, 'mapa');
  await page.getByRole('button', { name: /Quitar ubicación/ }).click();
  await expect(page.getByText('Punto guardado con su autorización.')).toHaveCount(0);
});

test('lo escrito sigue ahí después de recargar la página', async ({ page }) => {
  await page.goto('/atencion/nueva?tipo=peticion');
  await page.getByLabel(/^Salud/).check();
  await next(page);
  await page.getByLabel(/^Municipio/).selectOption({ label: 'Junín' });
  await page.getByLabel(/Parroquia, localidad o sector/).fill('Sector que no se pierde (prueba)');
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByText('Se recuperó lo que había escrito en esta pestaña.')).toBeVisible();
  await expect(page.getByLabel(/Parroquia, localidad o sector/)).toHaveValue('Sector que no se pierde (prueba)');
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tipo de solicitud' })).toBeVisible();
});

test('«Casos atendidos»: casos publicados sin datos personales, las denuncias solo por su municipio, con filtros y su estado vacío', async ({ page }) => {
  await page.goto('/atencion/atendido');
  await expect(page.getByRole('heading', { level: 1, name: 'Casos atendidos' })).toBeVisible();
  await expect(page.getByText(/^\d+ casos? publicados?/)).toBeVisible();
  await page.getByLabel('Municipio').selectOption({ label: 'Bolívar' });
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/municipio=bolivar/);
  await expect(page.getByText('Denuncia atendida en el municipio Bolívar.')).toBeVisible();
  await noSideScroll(page);
  await axe(page, 'casos atendidos');
  await page.goto('/atencion/atendido?municipio=ayacucho');
  await expect(page.getByRole('heading', { name: 'No hay casos con esos filtros' })).toBeVisible();
  await page.getByRole('link', { name: 'Quitar filtros' }).click();
  await expect(page).toHaveURL(/\/atencion\/atendido$/);
});

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('el formulario de una página da el comprobante (la clave la hace el servidor) y la consulta abre', async ({ page }) => {
    await page.goto('/atencion/nueva');
    const form = page.locator('form').filter({ hasText: 'Formulario en una sola página' });
    await expect(form).toBeVisible();
    await form.getByLabel(/^Petición/).check();
    await form.getByLabel('Categoría').selectOption({ label: 'Salud' });
    await form.getByLabel(/^Municipio/).selectOption({ label: 'Junín' });
    await form.getByLabel(/^Título/).fill('Petición sin JavaScript (prueba)');
    await form.getByLabel(/^Descripción/).fill('Un teléfono sencillo sin JavaScript también puede enviar (prueba).');
    await form.getByLabel(/Enviar como anónimo/).check();
    await form.getByLabel(/Leí el aviso de privacidad/).check();
    await form.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByRole('heading', { name: 'Solicitud recibida' })).toBeVisible();
    const text = (await page.getByRole('region', { name: 'Solicitud recibida' }).textContent()) ?? '';
    const reference = text.match(/AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}/)![0];
    const secret = text.match(/[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}/)![0];
    await lookup(page, reference, secret);
    await expect(page.locator('#caso-titulo')).toHaveText(reference);
    await expect(page.getByText('Petición sin JavaScript (prueba)')).toBeVisible();
  });
});

test.describe('en una computadora', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test('un reporte con una foto, de punta a punta, en la computadora', async ({ page }) => {
    await reportWithPhoto(page, 'computadora');
  });

  test('las cuatro páginas pasan axe y no se desbordan', async ({ page }) => {
    for (const path of ['/atencion', '/atencion/nueva', '/atencion/consultar', '/atencion/atendido']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await noSideScroll(page);
      await axe(page, `${path} (computadora)`);
    }
  });

  test('una observación sobre una obra publicada lleva el contenido; uno sin publicar no aparece', async ({ page }) => {
    await page.goto('/atencion/nueva?sobre=news:balance-del-mes-demo');
    await expect(page.getByText(/^Sobre (esta noticia|esta obra|una publicación de este sitio)$/)).toHaveCount(0);
    await page.goto('/atencion/nueva?tipo=acotacion&sobre=project:rehabilitacion-avenida-principal-demo');
    await expect(page.getByRole('heading', { level: 1, name: 'Enviar una observación' })).toBeVisible();
    await expect(page.getByText('Sobre esta obra', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rehabilitación de la avenida principal (demo)' })).toHaveAttribute('href', '/gestion/rehabilitacion-avenida-principal-demo');
    await fillSteps(page, {
      type: /^Observación/, category: /^Vialidad/, municipality: 'San Cristóbal', sector: unique(),
      title: 'Los desvíos de la obra confunden (prueba)', description: 'Faltan señales en los desvíos de la obra de la avenida (prueba).',
    });
    await toContactStep(page);
    await sendAnonymous(page);
    await readReceipt(page);
    await axe(page, 'comprobante (computadora)');
  });
});
