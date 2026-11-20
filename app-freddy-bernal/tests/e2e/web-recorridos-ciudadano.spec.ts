import { test, expect, type Browser, type Request } from '@playwright/test';
import {
  DEMR02, DENUNCIA_TEXT, DESKTOP, KINDS, PHONE, REF, RUN, axe, citizen, fillForm, next, nextIp, noSideScroll, openCase, readReceipt, staff,
  toContactStep, type Kind,
} from './recorridos-helpers';

// The citizen's journeys of the typed brief and of the 6/11 brief (§11), where the other specs cover them only in part
// (the table journey → test is in docs/INFORME-PRUEBAS-WEB.md), on the strict demo server with the real sign-in:
// - a case of EACH of the six kinds is sent and then followed with its code and its secret, on the phone and on a
//   computer; the coordination receives all twelve, and a responsible of an area sees only its area's, never a denuncia;
// - the form and the consultation never break the site's CSP, and each file of a consultation reads whole on a phone;
// - a repeated send (a lost answer with JavaScript, or the same form posted twice without it) makes ONE request: the
//   coordination finds exactly one with that title.
// Everything it writes is invented and says «(prueba)». (Until 19/11/2026 in web-recorridos.spec.ts, with the team's
// and the CMS's journeys; the shared helpers are in recorridos-helpers.ts.)

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
        if (k.tipo === 'denuncia') await expect(page.getByText(/acuda también a las autoridades competentes/).first()).toBeVisible();
        expect(page.url()).not.toContain(secret);

        // Followed with its code and secret (typed in small letters, as people do).
        await openCase(page, reference.toLowerCase(), secret.toLowerCase());
        await expect(page.getByTestId('estado-solicitud')).toHaveText('Recibida');
        await expect(page.getByText(new RegExp(`^${k.label} · ${k.categoryName}${k.municipality ? ` · ${k.municipality}` : ''} · Solicitud enviada el `))).toBeVisible();
        await expect(page.getByText(title, { exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Historial de la solicitud' }).getByText('Solicitud enviada', { exact: true })).toBeVisible();
        // Never the contact (encrypted), in the page or in the address.
        await expect(page.getByText(withContact ? 'Sus datos de contacto están cifrados y no se muestran aquí.' : 'Solicitud anónima, sin datos de contacto.')).toBeVisible();
        await expect(page.getByText(`recorrido.${RUN}@demo.test`)).toHaveCount(0);
        expect(page.url()).toMatch(/\/atencion\/consultar$/);
        if (k.tipo === 'denuncia') {
          // Private end to end: the notice, and only the approximate place (no reference, no point).
          await expect(page.getByText(DENUNCIA_TEXT)).toBeVisible();
          await expect(page.getByText('Punto de referencia', { exact: true })).toHaveCount(0);
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
  const k: Kind = { tipo: 'sugerencia', label: 'Sugerencia', type: /^Sugerencia/, category: /^Transporte/, categoryName: 'Transporte', heading: 'Solicitud recibida', servicesArea: false };
  await fillForm(page, k, { title: `Sugerencia sin eval ${RUN} (prueba)`, description: 'El formulario valida en el teléfono sin pedirle a la CSP nada prohibido (prueba).', sector: `Sector csp ${RUN}` });
  // The browser's own checks still work (they are zod's, without its speed-up): a short title is refused on the spot.
  await page.getByLabel(/^Título/).fill('No');
  await next(page);
  await expect(page.getByText(/entre 3 y 140/).first()).toBeVisible();
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

test('en el teléfono, cada archivo de la consulta se lee entero: el botón «Descargar» baja si no cabe al lado', async ({ browser }) => {
  // The screenshots of 06/11 showed «3 KB · 17 de octubre de 2026 · sin revisión antivirus…» one word per line, squeezed
  // by the button at 360 px.
  const c = await citizen(browser);
  await openCase(c.page, DEMR02.reference, DEMR02.secret);
  const rows = c.page.getByRole('list', { name: 'Archivos', exact: true }).getByRole('listitem');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    const text = (await row.locator(':scope > span').first().boundingBox())!;
    const box = (await row.boundingBox())!;
    expect(text.width, `${await row.innerText()}`).toBeGreaterThan(box.width * 0.6);
  }
  await noSideScroll(c.page, 'archivos de la consulta (360)');
  await c.ctx.close();
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
    const k: Kind = { tipo: 'peticion', label: 'Petición', type: /^Petición/, category: /^Salud/, categoryName: 'Salud', municipality: 'Junín', heading: 'Solicitud recibida', servicesArea: false };
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
    const form = page.locator('form').filter({ hasText: 'Formulario en una sola página' });
    await form.getByLabel(/^Petición/).check();
    await form.getByLabel('Categoría').selectOption({ label: 'Salud' });
    await form.getByLabel(/^Municipio/).selectOption({ label: 'Junín' });
    await form.getByLabel(/^Título/).fill(`Petición enviada dos veces ${token} (prueba)`);
    await form.getByLabel(/^Descripción/).fill('Un teléfono sin JavaScript manda el mismo formulario dos veces (prueba).');
    await form.getByLabel(/Enviar como anónimo/).check();
    await form.getByLabel(/Leí el aviso de privacidad/).check();
    let posted: Request | null = null;
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/atencion/nueva') posted = r;
    });
    await form.getByRole('button', { name: 'Enviar' }).click();
    const receipt = page.getByRole('region', { name: 'Solicitud recibida' });
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
