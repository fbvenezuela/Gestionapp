import { test, expect, type Page } from '@playwright/test';
import { DESKTOP, RUN, YEAR, axe, staff } from './recorridos-helpers';

// The CMS's journey of the typed brief (journey 1), on a computer and on the strict demo server with the real sign-in:
// the editor writes a news item and looks at its preview (not public before it is approved), the approver publishes it
// (public) and archives it (gone again). Everything it writes is invented and says «(prueba)»; it leaves nothing
// waiting for approval. (Until 19/11/2026 in web-recorridos.spec.ts; the shared helpers are in recorridos-helpers.ts.)

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
