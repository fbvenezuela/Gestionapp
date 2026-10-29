import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { loginAs } from './helpers';

// Google Drive end to end at 360 px, with the in-memory fake Drive of the demo. Runs only when
// the servers start with STORAGE_PROVIDER=drive DRIVE_FAKE=1 (docs/DRIVE.md, «Para probar sin
// Google»), never in the normal run:
//   STORAGE_PROVIDER=drive DRIVE_FAKE=1 npx playwright test tests/e2e/drive-fake.spec.ts
test.skip(process.env.STORAGE_PROVIDER !== 'drive' || process.env.DRIVE_FAKE !== '1', 'Solo con STORAGE_PROVIDER=drive y DRIVE_FAKE=1.');
test.describe.configure({ mode: 'serial' });

const fixture = (f: string) => path.join(__dirname, '..', 'fixtures', f);
let mediaId = '';

async function fits(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}`)).toEqual([]);
}

test('Administración conecta Drive y «Probar» dice que todo está bien', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes');
  await page.getByRole('link', { name: /Google Drive/ }).click();
  await expect(page.getByText('Sin conectar')).toBeVisible();
  await expect(page.getByText('Drive de prueba (en memoria): nada sale a Google.')).toBeVisible();
  await fits(page, '/ajustes/drive');
  await page.getByRole('button', { name: 'Conectar Drive' }).click();
  await expect(page.getByText('Drive quedó conectado.', { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('cuenta@demo.test').first()).toBeVisible();
  await page.getByRole('button', { name: 'Probar' }).click();
  await expect(page.getByRole('heading', { name: 'Todo bien: Drive está listo' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Se leyó de vuelta, igualito, y se mandó a la papelera.')).toBeVisible();
  await expect(page.getByText('Todo bien: los videos van del teléfono directo a Drive.')).toBeVisible();
  await fits(page, '/ajustes/drive (probado)');
});

test('quien graba sube un video: va a Drive por partes y queda con su miniatura', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto('/agenda');
  await page.getByText('Jornada de salud en la escuela Los Andes').click();
  await expect(page.getByRole('heading', { name: 'Jefe hablando' })).toBeVisible();
  // Not for camera: «Elegir de Drive» is Administración's only.
  await expect(page.getByRole('button', { name: /Elegir de Drive/ })).toHaveCount(0);
  await page.getByLabel('Subir jefe hablando').setInputFiles(fixture('vertical-4s.mp4'));
  const row = page.getByText(/^Jefe hablando \d+$/).last();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const thumb = page.locator('img[src$="/thumb"]').first();
  await expect(thumb).toBeVisible();
  const src = (await thumb.getAttribute('src'))!;
  mediaId = /\/api\/media\/([0-9a-f-]{36})\/thumb/.exec(src)![1];
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // Playback by pieces: the platform answers a range (Safari's probe is bytes=0-1).
  const part = await page.evaluate(async (id) => {
    const r = await fetch(`/api/media/${id}?ver=1`, { headers: { Range: 'bytes=0-1' } });
    return { status: r.status, range: r.headers.get('content-range'), len: (await r.arrayBuffer()).byteLength };
  }, mediaId);
  expect(part.status).toBe(206);
  expect(part.range).toMatch(/^bytes 0-1\/\d+$/);
  expect(part.len).toBe(2);
  // «Descargar» goes by pieces and hands over the file with its date-free name.
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: /^Descargar Jefe hablando \d+$/ }).last().click()]);
  expect(download.suggestedFilename()).toMatch(/^E-\d+-Jefe-hablando-\d+\.mp4$/);
  await fits(page, 'material con Drive');
});

test('una subida que falla y se quita de la lista: al elegir el mismo archivo empieza de nuevo y termina', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto('/agenda');
  await page.getByText('Jornada de salud en la escuela Los Andes').click();
  await expect(page.getByRole('heading', { name: 'Jefe hablando' })).toBeVisible();
  const thumbs = page.locator('img[src$="/thumb"]');
  const before = await thumbs.count();
  // Google unreachable from this browser: every chunk fails.
  await page.route('**/api/drive/fake-upload**', (r) => r.abort());
  await page.getByLabel('Subir jefe hablando').setInputFiles(fixture('vertical-4s.mp4'));
  await expect(page.getByText('Google no deja subir directo desde este teléfono. Avísale a Administración.')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Quitar de la lista' }).first().click();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('upload:')))).toEqual([]);
  await page.unroute('**/api/drive/fake-upload**');
  await page.getByLabel('Subir jefe hablando').setInputFiles(fixture('vertical-4s.mp4'));
  await expect(thumbs).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(page.getByText('Esta subida no se completó. Súbelo otra vez.')).toHaveCount(0);
});

test('quien no ve ese material tampoco lo saca de Drive', async ({ page }) => {
  expect(mediaId).not.toBe('');
  for (const email of ['politica@demo.test', 'grabacion2@demo.test']) {
    await loginAs(page, email);
    const s = await page.evaluate(async (id) => (await fetch(`/api/media/${id}`, { headers: { Range: 'bytes=0-1' } })).status, mediaId);
    expect(s, email).toBe(404);
    const th = await page.evaluate(async (id) => (await fetch(`/api/media/${id}/thumb`)).status, mediaId);
    expect(th, email).toBe(404);
    await page.context().clearCookies();
  }
});

test('Biblioteca: miniaturas, «Elegir de Drive» y «Traer lo nuevo de Drive» para Administración', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/biblioteca');
  await expect(page.locator(`img[src="/api/media/${mediaId}/thumb"]`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Traer lo nuevo de Drive' }).click();
  await expect(page.getByText('No hay nada nuevo en la carpeta «Importado».')).toBeVisible({ timeout: 20_000 });
  // The demo's Drive has no Google Picker: a box asks for a file id.
  await page.getByRole('button', { name: 'Elegir de Drive' }).click();
  await expect(page.getByRole('heading', { name: 'Drive de prueba' })).toBeVisible();
  await page.getByLabel('Id del archivo').fill('archivoQueNoExiste01');
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Ese archivo ya no está en Drive. Avísale a Administración.')).toBeVisible({ timeout: 20_000 });
  await fits(page, '/biblioteca con Drive');
  // Redes sees the thumbnails but not the Drive buttons.
  await page.context().clearCookies();
  await loginAs(page, 'redes@demo.test');
  await page.goto('/biblioteca');
  await expect(page.locator(`img[src="/api/media/${mediaId}/thumb"]`)).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Elegir de Drive|Traer lo nuevo de Drive/ })).toHaveCount(0);
});

test('la pieza en Drive: «Descargar portada» baja por partes, y si Drive se desconecta el video dice por qué', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/buscar?q=Jornada de salud escolar');
  await page.getByRole('link', { name: /^Jornada de salud escolar/ }).click();
  await page.waitForURL(/\/piezas\/[0-9a-f-]{36}$/);
  const piece = page.url();
  await page.getByLabel('Subir video final (nueva versión)').setInputFiles(fixture('vertical-4s.mp4'));
  await expect(page.getByText('Nueva versión guardada.')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Subir portada').setInputFiles(fixture('cover.jpg'));
  await expect(page.getByText('Portada guardada.')).toBeVisible({ timeout: 30_000 });
  // A file kept in Drive is never a plain link: the button downloads it by pieces.
  await expect(page.getByRole('link', { name: 'Descargar portada' })).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Descargar portada' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^E-\d+-Portada-\d+\.(jpg|jpeg|webp|png)$/);
  await fits(page, 'pieza con Drive');

  // Administración disconnects Drive.
  await page.context().clearCookies();
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes/drive');
  await page.getByRole('button', { name: 'Desconectar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desconectar' }).click();
  await expect(page.getByText('Sin conectar')).toBeVisible({ timeout: 20_000 });

  // The player says why instead of staying grey.
  await page.context().clearCookies();
  await loginAs(page, 'redes@demo.test');
  await page.goto(piece);
  await expect(page.getByRole('alert').filter({ hasText: 'Drive no está conectado. Ya le avisamos a Administración.' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Intentar otra vez' })).toBeVisible();
  await fits(page, 'pieza con Drive desconectado');

  // Connected again for whatever runs next.
  await page.context().clearCookies();
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes/drive');
  await page.getByRole('button', { name: 'Conectar Drive' }).click();
  await expect(page.getByText('Drive quedó conectado.', { exact: false })).toBeVisible({ timeout: 20_000 });
});
