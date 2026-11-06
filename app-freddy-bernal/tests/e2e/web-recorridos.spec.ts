import { test, expect, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';
import { QUIET_STATE } from './global-setup';
import { SECRET as GPS_TEXT, jpegWithGps } from '../unit/fixtures/photos';

// The journeys of the typed brief and of the 6/11 brief (§11), where the other specs cover them only in part (the table
// journey → test is in docs/INFORME-PRUEBAS-WEB.md), on the strict demo server with the real sign-in:
// - a case of EACH of the six kinds is sent and then followed with its code and its secret, on the phone and on a
//   computer; the coordination receives all twelve, and a responsible of an area sees only its area's, never a denuncia;
// - on a computer, from start to end: a petición with a PDF; the coordination assigns it and raises its priority; the
//   responsible asks for more information; the person answers from the consultation WITH a photo; the team reads it,
//   replies, resolves it with its justification; the person confirms; the coordination closes it and the whole history
//   stays (for the team and, in its shared part, for the person);
// - a changed id reveals nothing: another person's consultation, a tampered cookie, an invented id or a case of another
//   area open no file and no case;
// - a repeated send (a lost answer with JavaScript, or the same form posted twice without it) makes ONE request: the
//   coordination finds exactly one with that title;
// - on a computer, the editor writes a news item and looks at its preview (not public before it is approved), the
//   approver publishes it (public) and archives it (gone again).
// Everything it writes is invented and says «(prueba)»; it leaves nothing waiting for approval (web-roles counts it).

const YEAR = new Date().getFullYear();
const RUN = Math.random().toString(36).slice(2, 7);
const REF = /^AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;
const SECRET_RE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
const NOT_FOUND = 'No encontramos una solicitud con esos datos.';
const DEMR03 = { reference: `AC-${YEAR}-DEMR03`, secret: 'H4JX-5ZTB-9CNF-W2YE' };
const DENUNCIA_TEXT = /Tu denuncia es privada de punta a punta/;
const PHONE = { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
type Device = typeof PHONE | typeof DESKTOP;

// Each citizen comes from a network of its own (the persistent limits per network), in a range no other spec uses.
const NET = `100.${64 + Math.floor(Math.random() * 60)}.${Math.floor(Math.random() * 250)}`;
let host = Math.floor(Math.random() * 120);
const nextIp = () => `${NET}.${host++ % 250}`;

/** A small PDF: the server checks its first bytes («%PDF-») and keeps it as it came. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

async function axe(page: Page, where: string) {
  // A toast that is fading out is not part of the screen (the other specs wait for it too).
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  // The <title> comes with Next's streamed metadata: once (1 run in 3, right after a lookup) axe ran before it was back
  // and saw a page without a title; 22 probe runs never saw it again (docs/INFORME-PRUEBAS-WEB.md). Wait for it here: a
  // page that really has no title still fails, after 5 s.
  await expect.poll(() => page.title(), { message: `${where}: la página no tiene título`, timeout: 5_000 }).not.toBe('');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function noSideScroll(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}

async function newContext(browser: Browser, device: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...device, baseURL: test.info().project.use.baseURL, locale: 'es-VE', timezoneId: 'America/Caracas', storageState: QUIET_STATE });
  await ctx.setExtraHTTPHeaders({ 'x-real-ip': nextIp() });
  return ctx;
}

/** A citizen without an account: a browser (device) and a network of their own. */
async function citizen(browser: Browser, device: Device = PHONE) {
  const ctx = await newContext(browser, device);
  return { ctx, page: await ctx.newPage() };
}

/** Someone of the team, signed in with the code by email and the second factor. */
async function staff(browser: Browser, email: string, device: Device = PHONE) {
  const ctx = await newContext(browser, device);
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

async function lookup(page: Page, reference: string, secret: string) {
  await page.goto('/atencion/consultar');
  await page.getByLabel('Código', { exact: true }).fill(reference);
  await page.getByLabel('Clave', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Consultar' }).click();
}

async function openCase(page: Page, reference: string, secret: string) {
  await lookup(page, reference, secret);
  await expect(page.locator('#caso-titulo')).toHaveText(reference.toUpperCase());
}

async function readReceipt(page: Page) {
  const code = page.getByTestId('comprobante-codigo');
  await expect(code).toBeVisible({ timeout: 30_000 });
  const reference = (await code.textContent())!.trim();
  const secret = (await page.getByTestId('comprobante-clave').textContent())!.trim();
  expect(reference).toMatch(REF);
  expect(secret).toMatch(SECRET_RE);
  return { reference, secret };
}

type Kind = {
  tipo: string; label: string; type: RegExp; category: RegExp; categoryName: string; municipality?: string; heading: string;
  /** The area its category goes to (config/clients/fb.json): the services' responsible sees only «servicios». */
  servicesArea: boolean;
};
const KINDS: Kind[] = [
  { tipo: 'reporte', label: 'Reporte', type: /^Reporte/, category: /^Ambiente y aseo/, categoryName: 'Ambiente y aseo', municipality: 'Ayacucho', heading: 'Recibimos tu reporte', servicesArea: true },
  { tipo: 'peticion', label: 'Petición', type: /^Petición/, category: /^Educación/, categoryName: 'Educación', municipality: 'Bolívar', heading: 'Recibimos tu petición', servicesArea: false },
  { tipo: 'acotacion', label: 'Acotación', type: /^Acotación/, category: /^Servicios comunitarios/, categoryName: 'Servicios comunitarios', municipality: 'Lobatera', heading: 'Recibimos tu acotación', servicesArea: true },
  { tipo: 'sugerencia', label: 'Sugerencia', type: /^Sugerencia/, category: /^Otros/, categoryName: 'Otros', heading: 'Recibimos tu sugerencia', servicesArea: false },
  { tipo: 'reconocimiento', label: 'Reconocimiento', type: /^Reconocimiento/, category: /^Salud/, categoryName: 'Salud', municipality: 'Junín', heading: 'Recibimos tu reconocimiento', servicesArea: false },
  { tipo: 'denuncia', label: 'Denuncia', type: /^Denuncia/, category: /^Seguridad/, categoryName: 'Seguridad', municipality: 'Cárdenas', heading: 'Recibimos tu denuncia', servicesArea: false },
];

/** Steps 1 to 3 of the form; then the contact step, ready to send. */
async function fillForm(page: Page, k: Kind, f: { title: string; description: string; sector: string }) {
  await page.goto(`/atencion/nueva?tipo=${k.tipo}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const radio = page.getByLabel(k.type);
  if (!(await radio.isChecked())) await radio.check();
  await page.getByLabel(k.category).check();
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: /^¿Dónde/ })).toBeVisible();
  if (k.municipality) await page.getByLabel(/^Municipio/).selectOption({ label: k.municipality });
  await page.getByLabel(/Parroquia, localidad o sector/).fill(f.sector);
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Cuéntanos' })).toBeVisible();
  await page.getByLabel(/^Título/).fill(f.title);
  await page.getByLabel(/^Cuéntanos/).fill(f.description);
}

async function toContactStep(page: Page) {
  await next(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Último paso: contacto y envío' })).toBeVisible();
}

// --- 6/11 §11: a case of each kind, followed with its code -------------------------------------------------------------

test.describe('un caso de cada tipo se manda y se sigue con su código, en el teléfono y en la computadora', () => {
  test.describe.configure({ mode: 'serial' });
  const sent: { kind: Kind; reference: string; where: string }[] = [];

  for (const [where, device] of [['teléfono', PHONE], ['computadora', DESKTOP]] as const) {
    for (const k of KINDS) {
      test(`${where}: ${k.label.toLowerCase()} — comprobante, consulta con el código y la clave, y solo lo suyo`, async ({ browser }) => {
        const c = await citizen(browser, device);
        const page = c.page;
        const title = `${k.label} de la prueba de recorridos ${RUN} (prueba)`;
        const withContact = k.tipo === 'peticion';
        await fillForm(page, k, { title, description: `Lo cuento con el detalle que hace falta para atenderlo, ${where} (prueba).`, sector: `Sector ${k.tipo} ${RUN} ${where}` });
        if (k.tipo === 'denuncia') {
          // Only the approximate place: no reference field and no point were offered on the way.
          await expect(page.getByLabel(/^Punto de referencia/)).toHaveCount(0);
        }
        await toContactStep(page);
        if (withContact) {
          await page.getByRole('textbox', { name: /^Nombre/ }).fill('Persona de Prueba');
          await page.getByRole('textbox', { name: /^Correo/ }).fill(`recorrido.${RUN}@demo.test`);
        } else {
          await page.getByLabel(/Enviar como anónimo/).check();
        }
        await page.getByLabel(/Leí el aviso de privacidad/).check();
        await page.getByRole('button', { name: 'Enviar', exact: true }).click();
        const { reference, secret } = await readReceipt(page);
        await expect(page.getByRole('heading', { level: 2, name: k.heading })).toBeVisible();
        if (k.tipo === 'denuncia') await expect(page.getByText(/acude también a las autoridades competentes/).first()).toBeVisible();
        expect(page.url()).not.toContain(secret);

        // Followed with its code and secret (typed in small letters, as people do).
        await openCase(page, reference.toLowerCase(), secret.toLowerCase());
        await expect(page.getByTestId('estado-solicitud')).toHaveText('Recibida');
        await expect(page.getByText(new RegExp(`^${k.label} · ${k.categoryName}${k.municipality ? ` · ${k.municipality}` : ''} · enviada el `))).toBeVisible();
        await expect(page.getByText(title, { exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Historia de tu solicitud' }).getByText('Enviaste tu solicitud')).toBeVisible();
        // Never the contact (encrypted), in the page or in the address.
        await expect(page.getByText(withContact ? 'Lo que dejaste está cifrado y no se muestra aquí.' : 'Anónima: sin datos de contacto.')).toBeVisible();
        await expect(page.getByText(`recorrido.${RUN}@demo.test`)).toHaveCount(0);
        expect(page.url()).toMatch(/\/atencion\/consultar$/);
        if (k.tipo === 'denuncia') {
          // Private end to end: the notice, and only the approximate place (no reference, no point).
          await expect(page.getByText(DENUNCIA_TEXT)).toBeVisible();
          await expect(page.getByText('Referencia', { exact: true })).toHaveCount(0);
          await expect(page.getByText('Ubicación', { exact: true })).toHaveCount(0);
        }
        await noSideScroll(page, `consulta de ${k.tipo} (${where})`);
        await axe(page, `consulta de ${k.tipo} (${where})`);
        await page.getByRole('button', { name: 'Salir' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
        sent.push({ kind: k, reference, where });
        await c.ctx.close();
      });
    }
  }

  test('la coordinación recibe los doce con su tipo; el responsable de servicios ve solo los de su área y nunca una denuncia', async ({ browser }) => {
    expect(sent).toHaveLength(KINDS.length * 2);
    const coordination = await staff(browser, 'atencion.coordinacion@demo.test');
    for (const s of sent) {
      await coordination.page.goto(`/admin/atencion?q=${s.reference}`);
      const row = coordination.page.getByRole('list', { name: 'Solicitudes', exact: true }).getByRole('link');
      await expect(row, `${s.reference} (${s.kind.tipo}, ${s.where})`).toHaveCount(1);
      await expect(row).toContainText(s.reference);
      await expect(row).toContainText(s.kind.label);
      await expect(row).toContainText(`de la prueba de recorridos ${RUN}`);
    }
    await coordination.ctx.close();

    const services = await staff(browser, 'atencion.servicios@demo.test');
    for (const s of sent) {
      await services.page.goto(`/admin/atencion?q=${s.reference}`);
      const row = services.page.getByRole('list', { name: 'Solicitudes', exact: true }).getByRole('link');
      if (s.kind.servicesArea) await expect(row, `${s.reference} (${s.kind.tipo})`).toHaveCount(1);
      else {
        await expect(row, `${s.reference} (${s.kind.tipo})`).toHaveCount(0);
        await expect(services.page.getByText('No hay solicitudes con esos filtros.')).toBeVisible();
      }
    }
    await services.ctx.close();
  });
});

// --- The public site's own CSP (no 'unsafe-eval') ---------------------------------------------------------------------

test('el formulario de punta a punta y la consulta no rompen la CSP de la web (nada de eval en el navegador)', async ({ browser }) => {
  const c = await citizen(browser);
  const page = c.page;
  // Every document of this browser counts what its CSP refused (Lighthouse showed one on /atencion/nueva on 06/11: zod's
  // probe of `new Function`; src/lib/participation/input.ts turns it off in the browser).
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const refused = () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  const k: Kind = { tipo: 'sugerencia', label: 'Sugerencia', type: /^Sugerencia/, category: /^Transporte/, categoryName: 'Transporte', heading: 'Recibimos tu sugerencia', servicesArea: false };
  await fillForm(page, k, { title: `Sugerencia sin eval ${RUN} (prueba)`, description: 'El formulario valida en el teléfono sin pedirle a la CSP nada prohibido (prueba).', sector: `Sector csp ${RUN}` });
  // The browser's own checks still work (they are zod's, without its speed-up): a short title is refused on the spot.
  await page.getByLabel(/^Título/).fill('No');
  await next(page);
  await expect(page.getByText(/de 3 a 140/).first()).toBeVisible();
  await page.getByLabel(/^Título/).fill(`Sugerencia sin eval ${RUN} (prueba)`);
  await toContactStep(page);
  await page.getByLabel(/Enviar como anónimo/).check();
  await page.getByLabel(/Leí el aviso de privacidad/).check();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const { reference, secret } = await readReceipt(page);
  expect(await refused(), '/atencion/nueva').toEqual([]);
  await openCase(page, reference, secret);
  expect(await refused(), '/atencion/consultar').toEqual([]);
  await c.ctx.close();
});

// --- Journeys 3 to 9 on a computer -------------------------------------------------------------------------------------

test.describe('de punta a punta en la computadora: llega, se asigna, se pide información, la persona responde con una foto, se resuelve y se cierra', () => {
  test.describe.configure({ mode: 'serial' });
  const TITLE = `Parada de autobús sin techo ${RUN} (prueba)`;
  const DESCRIPTION = 'La parada de la avenida no tiene techo y con la lluvia nadie puede esperar ahí (prueba).';
  const QUESTION = `¿En qué esquina exacta está la parada? ${RUN} (prueba)`;
  const ANSWER = `Frente a la panadería, mando una foto ${RUN} (prueba).`;
  const REPLY = `Ya está en el plan de la semana que viene ${RUN} (prueba).`;
  const NOTE = `Nota interna: pedir el techo al almacén ${RUN} (prueba).`;
  const RESOLUTION = `Se instaló el techo de la parada ${RUN} (prueba).`;
  const CLOSING = `La persona confirmó y no queda nada pendiente ${RUN} (prueba).`;
  const flow = { reference: '', secret: '', caseUrl: '', photoHref: '', pdfHref: '', staffPhotoUrl: '' };

  test('1) una persona manda una petición con un PDF desde la computadora y se lleva su comprobante', async ({ browser }) => {
    const c = await citizen(browser, DESKTOP);
    const page = c.page;
    const k: Kind = { tipo: 'peticion', label: 'Petición', type: /^Petición/, category: /^Transporte/, categoryName: 'Transporte', municipality: 'Lobatera', heading: 'Recibimos tu petición', servicesArea: false };
    await fillForm(page, k, { title: TITLE, description: DESCRIPTION, sector: `Sector de la parada ${RUN}` });
    await page.getByLabel('Elegir fotos o documentos').setInputFiles({ name: 'carta de la comunidad.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText('carta de la comunidad.pdf')).toBeVisible();
    await toContactStep(page);
    await page.getByRole('textbox', { name: /^Nombre/ }).fill('Vecino de Prueba');
    await page.getByRole('textbox', { name: /^Correo/ }).fill(`vecino.${RUN}@demo.test`);
    await page.getByLabel(/Leí el aviso de privacidad/).check();
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    Object.assign(flow, await readReceipt(page));
    await expect(page.getByRole('region', { name: 'Tus archivos' }).getByText(/· Listo$/)).toBeVisible({ timeout: 30_000 });
    await axe(page, 'comprobante con PDF (computadora)');
    await c.ctx.close();
  });

  test('2) la coordinación la recibe por su código, ve el contacto, la asigna al área de vialidad y le sube la prioridad', async ({ browser }) => {
    const s = await staff(browser, 'atencion.coordinacion@demo.test', DESKTOP);
    const page = s.page;
    await page.goto('/admin/atencion');
    await page.getByLabel('Buscar por código o título').fill(flow.reference);
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.getByRole('link', { name: flow.reference, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    flow.caseUrl = new URL(page.url()).pathname;
    await expect(page.getByText(DESCRIPTION)).toBeVisible();
    await expect(page.getByText(/De la persona · PDF/)).toBeVisible();
    await page.getByRole('button', { name: 'Ver contacto' }).click();
    await expect(page.getByText(`vecino.${RUN}@demo.test`)).toBeVisible();
    // The category's area is already there (Transporte → Vialidad y transporte); its responsible takes it.
    await expect(page.getByLabel('Área', { exact: true }).locator('option:checked')).toHaveText('Vialidad y transporte');
    await page.getByLabel('Responsable', { exact: true }).selectOption({ label: 'Responsable de vialidad (demo)' });
    await page.getByRole('button', { name: 'Guardar asignación' }).click();
    await expect(page.getByText('Listo: quedó asignada.')).toBeVisible();
    await page.getByLabel('Prioridad', { exact: true }).selectOption('alta');
    await page.getByRole('button', { name: 'Guardar prioridad' }).click();
    await expect(page.getByText('Prioridad guardada.')).toBeVisible();
    const history = page.getByRole('list', { name: 'Historial del caso' });
    await expect(history.getByText(/Asignación \(responsable: nadie → Responsable de vialidad \(demo\)\)/)).toBeVisible();
    await expect(history.getByText('Prioridad: Normal → Alta.')).toBeVisible();
    await noSideScroll(page, 'caso (computadora)');
    await axe(page, 'caso de la coordinación (computadora)');
    await s.ctx.close();
  });

  test('3) el responsable pide más información; la persona la ve en su consulta y responde con una foto', async ({ browser }) => {
    const s = await staff(browser, 'atencion.vialidad@demo.test', DESKTOP);
    await s.page.goto('/admin/atencion?responsable=yo');
    await expect(s.page.getByRole('link', { name: flow.reference, exact: true })).toBeVisible();
    await s.page.goto(flow.caseUrl);
    await s.page.getByLabel('Pedir más información', { exact: true }).check();
    await s.page.getByLabel('Qué información necesitas', { exact: true }).fill(QUESTION);
    await s.page.getByRole('button', { name: 'Pedir la información' }).click();
    await expect(s.page.getByText('Listo: le pedimos la información.')).toBeVisible();
    // The question is the message the person reads (and, for the team, the reason of the move to «Requiere información»).
    await expect(s.page.getByRole('list', { name: 'Historial del caso' }).getByText(QUESTION, { exact: true })).toBeVisible();
    await expect(s.page.getByRole('list', { name: 'Historial del caso' }).getByText('Pasó de «Asignado» a «Requiere información».')).toBeVisible();
    await s.page.getByLabel('Nota interna', { exact: true }).check();
    await s.page.getByLabel('Nota para el equipo').fill(NOTE);
    await s.page.getByRole('button', { name: 'Guardar nota interna' }).click();
    await expect(s.page.getByText('Nota guardada: solo la ve el equipo.')).toBeVisible();
    await s.ctx.close();

    const c = await citizen(browser, DESKTOP);
    const page = c.page;
    await openCase(page, flow.reference, flow.secret);
    await expect(page.getByTestId('estado-solicitud')).toHaveText('Necesitamos más información');
    const story = page.getByRole('region', { name: 'Historia de tu solicitud' });
    await expect(story.getByText('El equipo te pide más información')).toBeVisible();
    await expect(story.getByText(QUESTION)).toBeVisible();
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await expect(page.getByText(/almacén/)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Responde lo que te pidieron' })).toBeVisible();
    await axe(page, 'consulta que pide información (computadora)');
    // Its own PDF downloads while the consultation lasts.
    flow.pdfHref = (await page.getByRole('link', { name: 'Descargar Documento 1' }).getAttribute('href'))!;
    const pdf = await page.request.get(flow.pdfHref);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');

    await page.getByLabel('Tu respuesta al equipo').fill(ANSWER);
    await page.getByLabel('Elegir fotos o documentos').setInputFiles({ name: 'la parada.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegWithGps()) });
    await expect(page.getByRole('list', { name: 'Archivos elegidos' }).getByText('la parada.jpg')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar al equipo' }).click();
    await expect(page.getByText('Listo: el equipo ya puede leer lo que agregaste.')).toBeVisible({ timeout: 30_000 });
    // Answering puts the case back in review; the photo hangs from the person's message.
    await expect(page.getByTestId('estado-solicitud')).toHaveText('En revisión');
    await expect(story.getByText(ANSWER)).toBeVisible();
    const photo = page.getByRole('link', { name: 'Descargar Foto 1' });
    await expect(photo).toBeVisible({ timeout: 30_000 });
    flow.photoHref = (await photo.getAttribute('href'))!;
    expect(flow.photoHref).toMatch(/^\/atencion\/consultar\/archivo\/[0-9a-f-]{36}$/);
    const file = await page.request.get(flow.photoHref);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('image/jpeg');
    expect(file.headers()['cache-control']).toBe('private, no-store');
    expect((await file.body()).includes(Buffer.from(GPS_TEXT, 'latin1'))).toBe(false);
    await c.ctx.close();
  });

  test('4) el equipo lee la respuesta y la foto (sin GPS), le contesta, la atiende y la resuelve con su justificación', async ({ browser }) => {
    const s = await staff(browser, 'atencion.vialidad@demo.test', DESKTOP);
    const page = s.page;
    await page.goto(flow.caseUrl);
    const history = page.getByRole('list', { name: 'Historial del caso' });
    await expect(history.getByText(ANSWER)).toBeVisible();
    await expect(history.getByText('La persona agregó información.')).toBeVisible();
    await expect(history.getByText('Pasó de «Requiere información» a «En revisión».')).toBeVisible();
    await expect(page.getByText(/De la persona · Foto/)).toBeVisible();
    const photoItem = page.getByRole('listitem').filter({ hasText: /De la persona · Foto/ });
    flow.staffPhotoUrl = (await photoItem.getByRole('link', { name: 'Descargar' }).getAttribute('href'))!;
    expect(flow.staffPhotoUrl).toMatch(/^\/api\/archivos\/atencion\/[0-9a-f-]{36}$/);
    const file = await page.request.get(flow.staffPhotoUrl);
    expect(file.status()).toBe(200);
    expect((await file.body()).includes(Buffer.from(GPS_TEXT, 'latin1'))).toBe(false);

    await page.getByLabel('Respuesta a la persona', { exact: true }).check();
    await page.getByLabel('Respuesta', { exact: true }).fill(REPLY);
    await page.getByRole('button', { name: 'Enviar respuesta' }).click();
    await expect(page.getByText('Respuesta enviada a la persona.')).toBeVisible();

    await page.getByLabel('Pasar a').selectOption('en_atencion');
    await page.getByRole('button', { name: 'Cambiar el estado' }).click();
    await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
    await expect(history.getByText('Pasó de «En revisión» a «En atención».')).toBeVisible();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
    await page.getByLabel('Pasar a').selectOption('resuelto');
    await page.getByLabel('Cómo se resolvió (justificación)').fill(RESOLUTION);
    await page.getByRole('button', { name: 'Cambiar el estado' }).click();
    await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
    await expect(history.getByText('Pasó de «En atención» a «Resuelto».')).toBeVisible();
    await expect(page.getByText(`Justificación (interna): ${RESOLUTION}`)).toBeVisible();
    await axe(page, 'caso resuelto (computadora)');
    await s.ctx.close();
  });

  test('5) la persona confirma que se resolvió; la coordinación la cierra y la historia completa queda, también para la persona', async ({ browser }) => {
    const c = await citizen(browser, DESKTOP);
    await openCase(c.page, flow.reference, flow.secret);
    await expect(c.page.getByTestId('estado-solicitud')).toHaveText('Resuelta');
    await expect(c.page.getByText(REPLY)).toBeVisible();
    await expect(c.page.getByText(RESOLUTION)).toHaveCount(0);
    await c.page.getByLabel('Sí, se resolvió').check();
    await c.page.getByRole('button', { name: 'Responder' }).click();
    await expect(c.page.getByText('Confirmaste que se resolvió. Gracias por contarnos.')).toBeVisible();
    await c.ctx.close();

    const s = await staff(browser, 'atencion.coordinacion@demo.test', DESKTOP);
    const page = s.page;
    await page.goto(flow.caseUrl);
    const history = page.getByRole('list', { name: 'Historial del caso' });
    await expect(history.getByText('La persona confirmó que se resolvió.')).toBeVisible();
    await page.getByLabel('Pasar a').selectOption('cerrado');
    await page.getByLabel('Por qué se cierra').fill(CLOSING);
    await page.getByRole('button', { name: 'Cambiar el estado' }).click();
    await expect(page.getByText('Listo: cambió el estado.')).toBeVisible();
    await expect(history.getByText('Pasó de «Resuelto» a «Cerrado».')).toBeVisible();
    // Nothing is lost: every step, in order, with who and why. (What one action writes at once shares its time, so
    // only the order between the steps is checked; inside a step, that each line is there.)
    const steps = [
      ['Llegó la solicitud desde la web.'],
      ['Pasó de «Recibido» a «Asignado».', 'Asignación (responsable: nadie → Responsable de vialidad (demo)).'],
      ['Prioridad: Normal → Alta.'],
      [QUESTION, 'Pasó de «Asignado» a «Requiere información».'],
      [NOTE],
      [ANSWER, 'La persona agregó información.', 'Pasó de «Requiere información» a «En revisión».'],
      [REPLY],
      ['Pasó de «En revisión» a «En atención».'],
      ['Pasó de «En atención» a «Resuelto».'],
      ['La persona confirmó que se resolvió.'],
      ['Pasó de «Resuelto» a «Cerrado».'],
    ];
    const text = (await history.innerText()).replace(/\s+/g, ' ');
    let after = -1;
    for (const step of steps) {
      const found = step.map((line) => ({ line, at: text.indexOf(line, after + 1) }));
      for (const f of found) expect(f.at, `«${f.line}» en el historial, después del paso anterior`).toBeGreaterThan(after);
      after = Math.max(...found.map((f) => f.at));
    }
    await expect(history.getByText(`Motivo (interno): ${CLOSING}`)).toBeVisible();
    await s.ctx.close();

    // The person still reads the shared part of the story; never the internal note nor the reasons.
    const again = await citizen(browser, DESKTOP);
    await openCase(again.page, flow.reference, flow.secret);
    await expect(again.page.getByTestId('estado-solicitud')).toHaveText('Cerrada');
    const story = again.page.getByRole('region', { name: 'Historia de tu solicitud' });
    for (const line of [QUESTION, ANSWER, REPLY, 'Confirmaste que se resolvió', 'Pasó a «Cerrada»']) await expect(story.getByText(line).first(), line).toBeVisible();
    for (const hidden of [NOTE, RESOLUTION, CLOSING]) await expect(again.page.getByText(hidden), hidden).toHaveCount(0);
    await axe(again.page, 'consulta cerrada (computadora)');
    await again.ctx.close();
  });

  test('6) un id cambiado no revela nada: otra consulta, la cookie alterada, un id inventado o un caso de otra área', async ({ browser }) => {
    // Another person, with THEIR consultation open (the demo's DEMR03): this case's files do not exist for them.
    const other = await citizen(browser, DESKTOP);
    await openCase(other.page, DEMR03.reference, DEMR03.secret);
    for (const href of [flow.photoHref, `${flow.photoHref}?ver=1`, flow.pdfHref]) {
      const r = await other.page.request.get(href);
      expect(r.status(), href).toBe(404);
      expect(await r.text()).not.toContain('%PDF');
    }
    // Their receipt with this case's code: the one answer.
    await other.page.getByRole('button', { name: 'Salir' }).click();
    await expect(other.page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
    await lookup(other.page, flow.reference, DEMR03.secret);
    await expect(other.page.getByRole('alert').getByText(NOT_FOUND)).toBeVisible();
    // The team's door for files asks for a session.
    expect((await other.page.request.get(flow.staffPhotoUrl)).status()).toBe(401);
    await other.ctx.close();

    // The person's own consultation with its cookie changed by one letter: nothing opens.
    const owner = await citizen(browser, DESKTOP);
    await openCase(owner.page, flow.reference, flow.secret);
    const cookie = (await owner.ctx.cookies()).find((x) => x.name === 'fb_consulta')!;
    const mid = Math.floor(cookie.value.length / 2);
    const flipped = cookie.value.slice(0, mid) + (cookie.value[mid] === 'A' ? 'B' : 'A') + cookie.value.slice(mid + 1);
    await owner.ctx.addCookies([{ ...cookie, value: flipped }]);
    expect((await owner.page.request.get(flow.photoHref)).status()).toBe(404);
    await owner.page.goto('/atencion/consultar');
    await expect(owner.page.getByRole('heading', { level: 1, name: 'Consultar mi solicitud' })).toBeVisible();
    await expect(owner.page.getByText(TITLE)).toHaveCount(0);
    // An invented or malformed file id, with or without a consultation: the same 404.
    for (const id of ['00000000-0000-4000-8000-00000000beef', 'no-es-un-id', '..%2F..%2Fetc%2Fpasswd']) {
      expect((await owner.page.request.get(`/atencion/consultar/archivo/${id}`)).status(), id).toBe(404);
    }
    await owner.ctx.close();

    // A responsible of another area: the case, its file and an invented case are «not found».
    const s = await staff(browser, 'atencion.servicios@demo.test', DESKTOP);
    await s.page.goto(flow.caseUrl);
    await expect(s.page.getByRole('heading', { name: 'No encontramos esto' })).toBeVisible();
    await expect(s.page.getByText(TITLE)).toHaveCount(0);
    await expect(s.page.getByText(ANSWER)).toHaveCount(0);
    expect((await s.page.request.get(flow.staffPhotoUrl)).status()).toBe(404);
    for (const id of ['00000000-0000-4000-8000-00000000beef', 'no-es-un-id']) {
      await s.page.goto(`/admin/atencion/${id}`);
      await expect(s.page.getByRole('heading', { name: 'No encontramos esto' }), id).toBeVisible();
    }
    await s.ctx.close();
  });
});

// --- Journey 10: a repeated send makes one request -----------------------------------------------------------------------

async function countByTitle(browser: Browser, token: string) {
  const s = await staff(browser, 'atencion.coordinacion@demo.test');
  await s.page.goto(`/admin/atencion?q=${encodeURIComponent(token)}`);
  await expect(s.page.getByRole('heading', { level: 1, name: 'Atención ciudadana' })).toBeVisible();
  const n = await s.page.getByRole('list', { name: 'Solicitudes', exact: true }).getByRole('link').count();
  await s.ctx.close();
  return n;
}

test.describe('un envío repetido no crea otra solicitud', () => {
  test('con JavaScript: la respuesta se pierde, la persona vuelve a tocar «Enviar», recibe el mismo código y la coordinación ve una sola', async ({ browser }) => {
    const token = `reintento-js-${RUN}`;
    const c = await citizen(browser);
    let first = true;
    let committed = '';
    let posts = 0;
    await c.page.route('**/atencion/nueva**', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
      const body = req.postData() ?? '';
      if (!body.includes(token)) return route.continue();
      posts++;
      if (!first) return route.continue();
      first = false;
      // The request reaches the server and is saved; the answer never arrives.
      const res = await route.fetch();
      committed = (await res.text()).match(/AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}/)?.[0] ?? '';
      await route.abort('failed');
    });
    const k: Kind = { tipo: 'peticion', label: 'Petición', type: /^Petición/, category: /^Salud/, categoryName: 'Salud', municipality: 'Junín', heading: 'Recibimos tu petición', servicesArea: false };
    await fillForm(c.page, k, { title: `Petición que se reintenta ${token} (prueba)`, description: 'La respuesta se pierde en el camino y el teléfono vuelve a enviar (prueba).', sector: `Sector ${token}` });
    await toContactStep(c.page);
    await c.page.getByLabel(/Enviar como anónimo/).check();
    await c.page.getByLabel(/Leí el aviso de privacidad/).check();
    await c.page.getByRole('button', { name: 'Enviar', exact: true }).click();
    const code = c.page.getByTestId('comprobante-codigo');
    const failed = c.page.getByText(/No se pudo enviar/).first();
    await expect(code.or(failed)).toBeVisible({ timeout: 30_000 });
    if (await failed.isVisible()) await c.page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(code).toBeVisible({ timeout: 30_000 });
    expect(committed).toMatch(REF);
    await expect(code).toHaveText(committed);
    expect(posts).toBeGreaterThanOrEqual(2);
    await c.ctx.close();
    expect(await countByTitle(browser, token)).toBe(1);
  });

  test('sin JavaScript: el mismo formulario llega dos veces (doble toque, reenvío) y da el mismo comprobante; la coordinación ve una sola', async ({ browser }) => {
    const token = `reenvio-sin-js-${RUN}`;
    const ctx = await browser.newContext({ ...PHONE, javaScriptEnabled: false, baseURL: test.info().project.use.baseURL, locale: 'es-VE', timezoneId: 'America/Caracas' });
    await ctx.setExtraHTTPHeaders({ 'x-real-ip': nextIp() });
    const page = await ctx.newPage();
    await page.goto('/atencion/nueva');
    const form = page.locator('form').filter({ hasText: 'Tu navegador no tiene JavaScript activo' });
    await form.getByLabel(/^Petición/).check();
    await form.getByLabel('Categoría').selectOption({ label: 'Salud' });
    await form.getByLabel(/^Municipio/).selectOption({ label: 'Junín' });
    await form.getByLabel(/^Título/).fill(`Petición enviada dos veces ${token} (prueba)`);
    await form.getByLabel(/^Cuéntanos/).fill('Un teléfono sin JavaScript manda el mismo formulario dos veces (prueba).');
    await form.getByLabel(/Enviar como anónimo/).check();
    await form.getByLabel(/Leí el aviso de privacidad/).check();
    let posted: Request | null = null;
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/atencion/nueva') posted = r;
    });
    await form.getByRole('button', { name: 'Enviar' }).click();
    const receipt = page.getByRole('region', { name: 'Recibimos tu solicitud' });
    await expect(receipt).toBeVisible();
    const text = (await receipt.textContent()) ?? '';
    const reference = text.match(/AC-\d{4}-[0-9A-HJKMNP-TV-Z]{6}/)![0];
    const secret = text.match(/[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}/)![0];
    expect(posted, 'el envío del formulario').not.toBeNull();
    // The very same form again (same key, same device): the same receipt, not a new request.
    const again = await page.request.fetch(posted!);
    expect(again.status()).toBe(200);
    const html = await again.text();
    expect(html).toContain(reference);
    expect(html).toContain(secret);
    await ctx.close();
    expect(await countByTitle(browser, token)).toBe(1);
  });
});

// --- Journey 1 on a computer: write, preview, approve, publish, archive -----------------------------------------------

test.describe('una noticia en la computadora: el editor la escribe y la ve en vista previa; quien aprueba la publica y la archiva', () => {
  test.describe.configure({ mode: 'serial' });
  const TITLE = `La biblioteca comunal vuelve a abrir ${RUN} (prueba)`;
  const news = { id: '', slug: '' };

  async function confirmDialog(page: Page, label: string) {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: label }).click();
    await expect(dialog).toHaveCount(0);
  }

  test('el editor la crea, la guarda, la mira en la vista previa y la envía; el público todavía no la ve', async ({ browser, page }) => {
    const e = await staff(browser, 'web.editora@demo.test', DESKTOP);
    const p = e.page;
    await p.goto('/admin/web/contenido/noticias');
    await p.getByRole('link', { name: 'Nueva noticia' }).click();
    await p.waitForURL(/\/nuevo$/);
    await p.getByLabel('Título').fill(TITLE);
    await p.getByRole('button', { name: 'Crear borrador' }).click();
    await p.waitForURL(/\/admin\/web\/editar\/[0-9a-f-]{36}$/);
    news.id = p.url().split('/').pop()!;
    await p.getByLabel('Resumen').fill('La biblioteca de la comunidad abre otra vez con libros nuevos (prueba).');
    await p.getByLabel('Fecha', { exact: true }).fill(`${YEAR}-02-10`);
    await p.getByLabel('Firma').fill('Prensa (prueba)');
    await p.getByLabel('Párrafo (parte 1)').fill('Abre de lunes a viernes y tiene una sala para **estudiar** (prueba).');
    await expect(p.getByRole('heading', { name: 'Listo para enviar a aprobación' })).toBeVisible();
    await p.getByRole('button', { name: 'Guardar borrador' }).first().click();
    await expect(p.getByText(/^Guardado \(versión \d+\)/).first()).toBeVisible();
    news.slug = (await p.getByLabel('Dirección en la web').inputValue()).trim();
    expect(news.slug).toMatch(/^la-biblioteca-comunal-vuelve-a-abrir-/);
    await axe(p, 'editor de noticia (computadora)');

    await p.getByRole('button', { name: 'Vista previa' }).click();
    await p.waitForURL(/\/admin\/web\/vista-previa\//);
    await expect(p.getByText('Vista previa: no está publicado')).toBeVisible();
    await expect(p.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(p.getByText('estudiar', { exact: true })).toBeVisible();
    await expect(p.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await axe(p, 'vista previa (computadora)');
    await p.getByRole('link', { name: 'Volver al editor' }).click();
    await p.waitForURL(/\/admin\/web\/editar\//);
    await p.getByRole('button', { name: 'Enviar a aprobación' }).click();
    await expect(p.getByText(/^Enviado a aprobación/).first()).toBeVisible();
    // The editor never has the publisher's buttons, not even on the review page.
    await p.goto(`/admin/web/revisar/${news.id}`);
    await expect(p.getByRole('button', { name: 'Publicar ahora' })).toHaveCount(0);
    await e.ctx.close();

    // Nothing of it is public while it waits: not its page, not the search, not the preview without a session.
    expect((await page.request.get(`/actualidad/${news.slug}`)).status()).toBe(404);
    await page.goto(`/actualidad?q=${RUN}`);
    await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);
    await page.goto(`/admin/web/vista-previa/${news.id}`);
    await expect(page).toHaveURL(/\/entrar/);
  });

  test('quien aprueba la publica (sale en /actualidad) y después la archiva (sale de la web)', async ({ browser, page }) => {
    const a = await staff(browser, 'web.aprobador@demo.test', DESKTOP);
    const p = a.page;
    await p.goto('/admin/web/por-aprobar');
    await p.locator('main a[href^="/admin/web/revisar/"]', { hasText: 'La biblioteca comunal vuelve a abrir' }).first().click();
    await p.waitForURL(/\/admin\/web\/revisar\//);
    await expect(p.getByText('Es la primera vez que se publica')).toBeVisible();
    await axe(p, 'revisar (computadora)');
    await p.getByRole('button', { name: 'Publicar ahora' }).click();
    await confirmDialog(p, 'Publicar ahora');
    await expect(p.getByText('Publicado: ya se ve en la web.').first()).toBeVisible();

    await page.goto(`/actualidad?q=${RUN}`);
    await page.getByRole('link', { name: TITLE }).first().click();
    await page.waitForURL(`**/actualidad/${news.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText('Por Prensa (prueba)')).toBeVisible();
    await axe(page, 'la noticia publicada (computadora)');

    await p.getByRole('button', { name: 'Archivar' }).click();
    await confirmDialog(p, 'Archivar');
    await expect(p.getByText('Archivado: ya no se ve en la web.').first()).toBeVisible();
    await a.ctx.close();
    expect((await page.request.get(`/actualidad/${news.slug}`)).status()).toBe(404);
    await page.goto(`/actualidad?q=${RUN}`);
    await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);
  });
});
