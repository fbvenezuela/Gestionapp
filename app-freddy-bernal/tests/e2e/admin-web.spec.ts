import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs, readyForAxe } from './helpers';
import { QUIET_STATE } from './global-setup';
import { pngOf } from '../unit/fixtures/web-png';

// The website's administrator (/admin/web, D-90, design §3) on the strict demo server, with the real sign-in (code by
// email and the second factor): the editor writes a news item (with a photo whose alternative text is required), looks
// at its preview and sends it; the publisher publishes it and it is on /actualidad. The editor changes and reorders the
// home's blocks, the publisher approves them and the home shows them; then the old version comes back (restoring a
// version) and the home is as before. A notice is scheduled (not visible before its time) and taken back. The editor
// never gets the publisher's buttons; someone else cannot open the administrator. axe on the main screens, at 360 px
// and on a computer. Everything it writes is invented, says «(demo)», and is left as the other specs expect it (the
// home restored, nothing new waiting for approval).
test.describe.configure({ mode: 'serial' });

const EDITOR = 'web.editora@demo.test';
const PUBLISHER = 'web.aprobador@demo.test';
// A token of this run in what it writes: CI retries the group from its first test on the same server, where the news
// and the notice of the first attempt are still there (the news published): with the same title, the retry's news got
// «…-demo-2» and its search found the first one.
const RUN = Math.random().toString(36).slice(2, 7);
const NEWS_TITLE = `Nueva cancha techada en el barrio de prueba ${RUN} (demo)`;
const NEWS_SLUG = `nueva-cancha-techada-en-el-barrio-de-prueba-${RUN}-demo`;
const NOTICE_TITLE = `Corte de agua programado en el sector de prueba ${RUN} (demo)`;
const PHOTO_ALT = `Niños jugando en la cancha techada del barrio de prueba ${RUN} (demo)`;
const HOME_NOTE = `Prueba ${RUN}: título de los accesos y avisos antes de las noticias`;
const OLD_ADDRESS = `/2019/01/nota-vieja-de-prueba-${RUN}`;
const PHONE = { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };

async function noSerious(page: Page, where: string) {
  await readyForAxe(page, where);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function fitsWidth(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function personContext(browser: Browser, email: string, device: typeof PHONE | typeof DESKTOP = PHONE): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...device, baseURL: test.info().project.use.baseURL, locale: 'es-VE', timezoneId: 'America/Caracas', storageState: QUIET_STATE });
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

/** Confirms the app's own dialog (never the browser's). */
async function confirmDialog(page: Page, label: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog).toHaveCount(0);
}

async function openHomeEditor(page: Page) {
  await page.goto('/admin/web/contenido/paginas');
  await page.locator('main a[href^="/admin/web/editar/"]', { hasText: 'Inicio' }).first().click();
  await page.waitForURL(/\/admin\/web\/editar\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 3, name: 'Bloques de la página' })).toBeVisible();
}

/** An item of «Por aprobar» by words of its title (the section tabs also say «Inicio»: only the list's links). */
function queued(page: Page, text: string) {
  return page.locator('main a[href^="/admin/web/revisar/"]', { hasText: text }).first();
}

async function publishFromQueue(page: Page, text: string) {
  await page.goto('/admin/web/por-aprobar');
  await queued(page, text).click();
  await page.waitForURL(/\/admin\/web\/revisar\//);
  await page.getByRole('button', { name: 'Publicar ahora' }).click();
  await confirmDialog(page, 'Publicar ahora');
  await expect(page.getByText('Publicado: ya se ve en la web.').first()).toBeVisible();
}

let editor: { ctx: BrowserContext; page: Page };
let publisher: { ctx: BrowserContext; page: Page };
let newsSlug = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  editor = await personContext(browser, EDITOR);
  publisher = await personContext(browser, PUBLISHER);
});

test.afterAll(async () => {
  await editor?.ctx.close();
  await publisher?.ctx.close();
});

test('quien no es de la web no entra: sin sesión va a entrar; Redes vuelve a su inicio; la subida de fotos le dice que no', async ({ page }) => {
  await page.goto('/admin/web');
  await expect(page).toHaveURL(/\/entrar/);
  await loginAs(page, 'redes@demo.test');
  for (const path of ['/admin/web', '/admin/web/contenido/noticias', '/admin/web/biblioteca', '/admin/web/ajustes']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/hoy\?sin-permiso=1$/);
  }
  const res = await page.request.post('/admin/web/biblioteca/subir', { multipart: { kind: 'image', alt: 'Intento (demo)', file: { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(pngOf(400, 300)) } } });
  expect(res.status()).toBe(403);
});

test('el editor crea una noticia con su foto (el texto alternativo es obligatorio), la mira en la vista previa y la envía', async () => {
  const page = editor.page;
  await page.goto('/admin/web');
  await expect(page.getByRole('heading', { level: 1, name: 'La web' })).toBeVisible();
  await noSerious(page, '/admin/web');
  await fitsWidth(page, '/admin/web');
  await page.goto('/admin/web/contenido/noticias');
  await noSerious(page, 'lista de noticias');
  await page.getByRole('link', { name: 'Nueva noticia' }).click();
  await page.waitForURL(/\/nuevo$/);
  await page.getByLabel('Título').fill(NEWS_TITLE);
  await expect(page.getByText(`/actualidad/${NEWS_SLUG}`)).toBeVisible();
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await page.waitForURL(/\/admin\/web\/editar\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Borrador', { exact: true }).first()).toBeVisible();

  await page.getByLabel('Resumen').fill('La comunidad del barrio de prueba estrena una cancha techada (demo).');
  await page.getByLabel('Fecha', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Firma').fill('Prensa (demo)');
  await page.getByLabel('Párrafo (parte 1)').fill('La cancha tiene techo nuevo y **luces** para jugar de noche (demo).');
  await page.getByRole('button', { name: 'Agregar fuente' }).click();
  await page.getByLabel('Nombre 1').fill('Nota de prensa inventada para la prueba (demo)');

  // The photo: uploaded right from the field; without its alternative text it does not go.
  await page.getByRole('group', { name: 'Foto principal' }).getByRole('button', { name: 'Elegir foto' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /Subir una nueva/ }).click();
  await sheet.getByLabel('Foto (JPG, PNG o WebP)').setInputFiles({ name: 'cancha.png', mimeType: 'image/png', buffer: Buffer.from(pngOf(480, 320)) });
  await expect(sheet.getByText('Preparando la foto…')).toHaveCount(0);
  await expect(sheet.getByRole('group', { name: /Punto de interés de la foto/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Subir y usar esta foto' }).click();
  await expect(sheet.getByText(/^Falta el texto alternativo/)).toBeVisible();
  await sheet.getByLabel(/^Texto alternativo/).fill(PHOTO_ALT);
  await sheet.getByRole('button', { name: 'Subir y usar esta foto' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Foto principal' }).getByText(PHOTO_ALT)).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Listo para enviar a aprobación' })).toBeVisible();
  await noSerious(page, 'editor de noticia');
  await fitsWidth(page, 'editor de noticia');
  await page.getByRole('button', { name: 'Guardar borrador' }).first().click();
  await expect(page.getByText(/^Guardado \(versión \d+\)/).first()).toBeVisible();

  // The preview: the draft as the public site would draw it, never published.
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await page.waitForURL(/\/admin\/web\/vista-previa\//);
  await expect(page.getByText('Vista previa: no está publicado')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: NEWS_TITLE })).toBeVisible();
  await expect(page.getByText('luces', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await noSerious(page, 'vista previa de noticia');
  await fitsWidth(page, 'vista previa de noticia');
  await page.getByRole('link', { name: 'Volver al editor' }).click();
  await page.waitForURL(/\/admin\/web\/editar\//);

  // Never the publisher's buttons for the editor.
  await expect(page.getByRole('link', { name: 'Revisar y publicar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Enviar a aprobación' }).click();
  await expect(page.getByText(/^Enviado a aprobación/).first()).toBeVisible();
  await expect(page.getByText('En revisión', { exact: true }).first()).toBeVisible();
  newsSlug = (await page.getByLabel('Dirección en la web').inputValue()).trim();
  expect(newsSlug).toBe(NEWS_SLUG);

  // Its review page shows the changes but no decision for the editor.
  const id = page.url().split('/').pop()!;
  await page.goto(`/admin/web/revisar/${id}`);
  await expect(page.getByText('Es la primera vez que se publica')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar ahora' })).toHaveCount(0);
  await expect(page.getByText(/Publica, programa o devuelve quien aprueba la web o el jefe/)).toBeVisible();
});

test('quien aprueba la publica y aparece en /actualidad, con su foto', async ({ page }) => {
  const p = publisher.page;
  await p.goto('/admin/web/por-aprobar');
  await noSerious(p, 'por aprobar');
  await queued(p, NEWS_TITLE).click();
  await p.waitForURL(/\/admin\/web\/revisar\//);
  await noSerious(p, 'revisar');
  await fitsWidth(p, 'revisar');
  await p.getByRole('button', { name: 'Publicar ahora' }).click();
  await confirmDialog(p, 'Publicar ahora');
  await expect(p.getByText('Publicado: ya se ve en la web.').first()).toBeVisible();

  await page.goto('/actualidad?q=cancha+techada');
  await page.getByRole('link', { name: NEWS_TITLE }).first().click();
  await page.waitForURL(`**/actualidad/${newsSlug}`);
  await expect(page.getByRole('heading', { level: 1, name: NEWS_TITLE })).toBeVisible();
  await expect(page.getByRole('img', { name: PHOTO_ALT })).toBeVisible();
  await expect(page.getByText('Por Prensa (demo)')).toBeVisible();
});

test('el editor cambia y reordena bloques de la portada; quien aprueba lo publica y la portada lo muestra', async ({ page }) => {
  const e = editor.page;
  await openHomeEditor(e);
  await noSerious(e, 'editor de la portada');
  await fitsWidth(e, 'editor de la portada');
  await e.getByRole('button', { name: /^Editar Accesos de participación/ }).click();
  await e.getByLabel('Título del bloque').fill('Participación ciudadana (demo)');
  // «Avisos de servicio» goes above «Noticias» (the keyboard keeps its focus on the moved block).
  const up = e.getByRole('button', { name: /^Subir Avisos de servicio/ });
  await up.focus();
  await e.keyboard.press('Enter');
  await expect(e.getByRole('button', { name: /^Subir Avisos de servicio .*\(bloque 7\)$/ })).toBeFocused();
  await e.getByLabel('Nota de esta versión (opcional)').fill(HOME_NOTE);
  await e.getByRole('button', { name: 'Guardar borrador' }).first().click();
  await expect(e.getByText(/^Guardado \(versión \d+\)/).first()).toBeVisible();
  await e.getByRole('button', { name: 'Enviar a aprobación' }).click();
  await expect(e.getByText(/^Enviado a aprobación/).first()).toBeVisible();

  const p = publisher.page;
  await p.goto('/admin/web/por-aprobar');
  await queued(p, 'Inicio').click();
  await p.waitForURL(/\/admin\/web\/revisar\//);
  await expect(p.getByText('Orden nuevo')).toBeVisible();
  await expect(p.getByText(/título: «Atención ciudadana» → «Participación ciudadana \(demo\)»/)).toBeVisible();
  await p.getByRole('button', { name: 'Publicar ahora' }).click();
  await confirmDialog(p, 'Publicar ahora');
  await expect(p.getByText('Publicado: ya se ve en la web.').first()).toBeVisible();

  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Participación ciudadana (demo)' })).toBeVisible();
  const order = await main.getByRole('heading', { level: 2 }).allTextContents();
  expect(order.indexOf('Avisos de servicio')).toBeGreaterThan(-1);
  expect(order.indexOf('Avisos de servicio')).toBeLessThan(order.indexOf('Últimas publicaciones'));
});

test('volver a una versión: el editor recupera la portada anterior, quien aprueba la publica y la portada queda como antes', async ({ page }) => {
  const e = editor.page;
  await openHomeEditor(e);
  await e.getByRole('link', { name: 'Versiones' }).click();
  await e.waitForURL(/\/versiones$/);
  await expect(e.getByText('La publicada')).toBeVisible();
  await expect(e.getByText(`«${HOME_NOTE}»`)).toBeVisible();
  await noSerious(e, 'versiones');
  await e.getByRole('button', { name: /^Volver a esta versión/ }).first().click();
  await confirmDialog(e, 'Volver a esta versión');
  await e.waitForURL(/\/admin\/web\/editar\/[0-9a-f-]{36}$/);
  await expect(e.getByText('Cambios sin publicar').first()).toBeVisible();
  await e.getByRole('button', { name: 'Enviar a aprobación' }).click();
  await expect(e.getByText(/^Enviado a aprobación/).first()).toBeVisible();

  await publishFromQueue(publisher.page, 'Inicio');
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 2, name: 'Atención ciudadana', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { level: 2, name: 'Participación ciudadana (demo)' })).toHaveCount(0);
  const order = await main.getByRole('heading', { level: 2 }).allTextContents();
  expect(order.indexOf('Últimas publicaciones')).toBeLessThan(order.indexOf('Avisos de servicio'));
});

test('la vista previa muestra a los editores lo que falta (la foto, los textos «por completar»); la web pública no', async ({ page }) => {
  const e = editor.page;
  await e.goto('/admin/web/contenido/paginas');
  // The row starts with the page's title («Inicio»'s summary also says «…del gobernador…»).
  await e.locator('main a[href^="/admin/web/editar/"]', { hasText: /^\s*El gobernador/ }).first().click();
  await e.waitForURL(/\/admin\/web\/editar\/[0-9a-f-]{36}$/);
  const id = e.url().split('/').pop()!;
  await e.goto(`/admin/web/vista-previa/${id}`);
  await expect(e.getByText('Vista previa: no está publicado')).toBeVisible();
  await expect(e.getByText('Foto por subir desde el administrador')).toBeVisible();
  // The slot says what is missing once, without repeating «Por completar».
  await expect(e.getByText('Por completar · ', { exact: false }).first()).toBeVisible();
  await expect(e.getByText('la biografía verificada, con sus fuentes. Solo se publica lo confirmado.', { exact: false })).toBeVisible();
  await expect(e.getByText(/Por completar · Por completar/)).toHaveCount(0);
  await noSerious(e, 'vista previa del gobernador');
  await page.goto('/gobernador');
  await expect(page.getByRole('heading', { level: 1, name: 'Freddy Bernal' })).toBeVisible();
  await expect(page.getByText(/Por completar|Foto por subir/)).toHaveCount(0);
});

test('la página «Atención ciudadana» de «Páginas» avisa que lo que se escribe ahí no sale en la web; las demás no', async () => {
  const e = editor.page;
  const open = async (title: RegExp) => {
    await e.goto('/admin/web/contenido/paginas');
    await e.locator('main a[href^="/admin/web/editar/"]', { hasText: title }).first().click();
    await e.waitForURL(/\/admin\/web\/editar\/[0-9a-f-]{36}$/);
  };
  await open(/^\s*Atención ciudadana/);
  await expect(e.getByText('Esta página no sale en la web')).toBeVisible();
  await expect(e.getByText('Lo que escribas aquí no se ve.', { exact: false })).toBeVisible();
  // Nor a link to «/atencion» as if it were this page.
  await expect(e.getByText(/^\s*En la web:/)).toHaveCount(0);
  await fitsWidth(e, 'editor de la página de atención');
  await noSerious(e, 'editor de la página de atención');
  await open(/^\s*El gobernador/);
  await expect(e.getByRole('heading', { level: 1, name: 'El gobernador' })).toBeVisible();
  await expect(e.getByText('Esta página no sale en la web')).toHaveCount(0);
});

test('programar un aviso: queda programado y no se ve antes de su hora; quitar la programación lo devuelve a borrador', async ({ page }) => {
  const e = editor.page;
  await e.goto('/admin/web/contenido/avisos');
  await e.getByRole('link', { name: 'Nuevo aviso' }).click();
  await e.getByLabel('Título').fill(NOTICE_TITLE);
  await e.getByRole('button', { name: 'Crear borrador' }).click();
  await e.waitForURL(/\/admin\/web\/editar\//);
  await expect(e.getByText(/Texto del aviso: No puede quedar vacío/)).toBeVisible();
  await e.getByLabel(/^Texto del aviso/).fill('Sin agua de 8 a 12 por mantenimiento en el sector de prueba (demo).');
  await expect(e.getByRole('heading', { name: 'Listo para enviar a aprobación' })).toBeVisible();
  await e.getByRole('button', { name: 'Guardar y enviar a aprobación' }).click();
  await expect(e.getByText(/^Enviado a aprobación/).first()).toBeVisible();

  const p = publisher.page;
  await p.goto('/admin/web/por-aprobar');
  await queued(p, NOTICE_TITLE).click();
  await p.waitForURL(/\/admin\/web\/revisar\//);
  // Tomorrow at 8:00 in the Táchira is the suggestion.
  await expect(p.getByLabel('Hora')).toHaveValue('08:00');
  await p.getByRole('button', { name: 'Programar' }).click();
  await confirmDialog(p, 'Programar');
  await expect(p.getByText('Programado: sale solo a esa hora.').first()).toBeVisible();
  await expect(p.getByText('Programado', { exact: true }).first()).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('main').getByText(NOTICE_TITLE)).toHaveCount(0);

  await p.getByRole('button', { name: 'Quitar la programación' }).click();
  await expect(p.getByText('Programación quitada: vuelve a borrador.').first()).toBeVisible();
  await expect(p.getByText('Borrador', { exact: true }).first()).toBeVisible();
});

test.describe('en una computadora', () => {
  test.use(DESKTOP);

  test('la biblioteca (punto de interés con el teclado, dónde se usa), los ajustes del sitio y una redirección que se agrega y se quita', async ({ browser, page }) => {
    const pub = await personContext(browser, PUBLISHER, DESKTOP);
    const p = pub.page;
    try {
      await p.goto('/admin/web/biblioteca');
      await noSerious(p, 'biblioteca (computadora)');
      await p.getByRole('link', { name: PHOTO_ALT }).first().click();
      await p.waitForURL(/\/admin\/web\/biblioteca\/[0-9a-f-]{36}$/);
      await expect(p.getByRole('link', { name: new RegExp(NEWS_TITLE.replace(/[()?]/g, '.')) })).toBeVisible();
      await expect(p.getByText('En lo publicado')).toBeVisible();
      const focal = p.getByRole('group', { name: /Punto de interés de la foto: 50 % desde la izquierda/ });
      await focal.focus();
      await p.keyboard.press('ArrowRight');
      await expect(p.getByRole('group', { name: /Punto de interés de la foto: 55 % desde la izquierda/ })).toBeVisible();
      await p.getByLabel(/^Texto alternativo/).fill('');
      await p.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(p.getByText(/^Falta el texto alternativo/)).toBeVisible();
      await noSerious(p, 'archivo de la biblioteca');

      await p.goto('/admin/web/ajustes');
      await expect(p.getByRole('heading', { name: 'Cuentas en redes' })).toBeVisible();
      await expect(p.getByRole('checkbox', { name: /^Verificada/ }).first()).not.toBeChecked();
      await noSerious(p, 'ajustes del sitio');

      await p.goto('/admin/web/redirecciones');
      await p.getByLabel('Dirección vieja').fill(`${OLD_ADDRESS}/`);
      await p.getByLabel('Lleva a').fill('/actualidad');
      await p.getByRole('button', { name: 'Agregar la redirección' }).click();
      await expect(p.getByText(OLD_ADDRESS, { exact: true })).toBeVisible();
      await noSerious(p, 'redirecciones');
      const res = await page.request.get(OLD_ADDRESS, { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      expect(res.headers().location).toMatch(/\/actualidad$/);
      await p.getByRole('button', { name: `Quitar la redirección de ${OLD_ADDRESS}` }).click();
      await confirmDialog(p, 'Quitar');
      await expect(p.getByText(OLD_ADDRESS, { exact: true })).toHaveCount(0);
    } finally {
      await pub.ctx.close();
    }
  });

  test('el editor en la computadora: la portada por bloques y la lista sin problemas serios; no ve ajustes ni redirecciones', async ({ browser }) => {
    const ed = await personContext(browser, EDITOR, DESKTOP);
    try {
      const e = ed.page;
      await openHomeEditor(e);
      await noSerious(e, 'editor de la portada (computadora)');
      await e.goto('/admin/web');
      await expect(e.getByRole('link', { name: 'Ajustes del sitio' })).toHaveCount(0);
      await e.goto('/admin/web/ajustes');
      await expect(e).toHaveURL(/\/admin\/web\?sin-permiso=1$/);
    } finally {
      await ed.ctx.close();
    }
  });
});
