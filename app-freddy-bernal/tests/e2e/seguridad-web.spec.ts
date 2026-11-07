import { test, expect } from '@playwright/test';
import { jpegWithGps } from '../unit/fixtures/photos';

// The security review of 06/11 (docs/SEGURIDAD.md «Web pública y atención ciudadana: revisión del 06/11»), through the
// real server: the test version says never to write real data; the files' ways in and out answer the one «not found»
// with the right headers and never to another site; old addresses never redirect to another site; the consultation's
// cookie is httpOnly, SameSite=Strict and only under /atencion/consultar. Each test comes from a network of its own.

const YEAR = new Date().getFullYear();
const DEMR03 = { reference: `AC-${YEAR}-DEMR03`, secret: 'H4JX-5ZTB-9CNF-W2YE' };
const NOT_FOUND = 'No hay ninguna solicitud con esos datos.';

let net = 10 + Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-real-ip': `192.0.2.${net++ % 250}` });
});

test('la versión de prueba avisa en el formulario que no se escriban datos reales', async ({ page }) => {
  await page.goto('/atencion/nueva');
  await expect(page.getByText('Versión de prueba. No escriba datos reales.')).toBeVisible();
  await expect(page.getByText(/en la versión real se guarda cifrado/i)).toBeVisible();
});

test('los archivos: un comprobante malo recibe el «no encontrado» de siempre; otro sitio, 403; sin sesión, 401; nunca en caché', async ({ page }) => {
  const photo = { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpegWithGps()) };
  // No Origin (not a browser): the route lets it through to the receipt check.
  const wrong = await page.request.post('/api/atencion/adjuntos', { multipart: { reference: DEMR03.reference, secret: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', file: photo } });
  expect(wrong.status()).toBe(404);
  expect(await wrong.json()).toEqual({ ok: false, error: NOT_FOUND });
  expect(wrong.headers()['cache-control']).toBe('private, no-store');

  const cross = await page.request.post('/api/atencion/adjuntos', {
    multipart: { reference: DEMR03.reference, secret: DEMR03.secret, file: photo },
    headers: { origin: 'https://otro-sitio.example' },
  });
  expect(cross.status()).toBe(403);

  const staffFile = await page.request.get('/api/archivos/atencion/00000000-0000-4000-8000-000000000000');
  expect(staffFile.status()).toBe(401);
  expect(staffFile.headers()['cache-control']).toBe('private, no-store');
  const citizenFile = await page.request.get('/atencion/consultar/archivo/00000000-0000-4000-8000-000000000000');
  expect(citizenFile.status()).toBe(404);
  expect(citizenFile.headers()['cache-control']).toBe('private, no-store');
});

test('una dirección vieja nunca manda a otro sitio', async ({ page }) => {
  for (const path of ['/%2F%2Fotro-sitio.example', '/%5Cotro-sitio.example', '/?p=..%2F%2Fotro-sitio.example']) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    const location = res.headers()['location'];
    if (location) expect(new URL(location, 'http://localhost').host, path).toBe(new URL(res.url()).host);
  }
  const api = await page.request.get('/api/web/redireccion?ruta=//otro-sitio.example');
  expect(await api.json()).toEqual({ to: null });
});

test('la cookie de la consulta: solo bajo /atencion/consultar, httpOnly y SameSite=Strict', async ({ page }) => {
  await page.goto('/atencion/consultar');
  await page.getByLabel('Código', { exact: true }).fill(DEMR03.reference);
  await page.getByLabel('Clave', { exact: true }).fill(DEMR03.secret);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText('Versión de prueba. No escriba datos reales.')).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === 'fb_consulta');
  expect(cookie).toMatchObject({ path: '/atencion/consultar', httpOnly: true, sameSite: 'Strict' });
  // Neither the code nor the secret ever travel in the address.
  expect(page.url()).not.toContain(DEMR03.secret);
  expect(page.url()).not.toContain(DEMR03.reference);
  await page.getByRole('button', { name: 'Salir' }).click();
});
