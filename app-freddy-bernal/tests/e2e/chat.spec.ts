import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Mensajes as channels (R5, D-79 to D-88) on the phone, with axe, on ONE server (the strict one). No notice anywhere,
// for any role (Juan, 29/10: «se siente como si estuviéramos espiando a las personas»): each channel shows who is in
// it. Daniela sees her channels and «5 personas» with the boss in the sheet; Redes writes to Grabación in «Grabación y
// Redes» and it arrives (the envelope's number, the answer within 20 s by the loop); Grabación's «2:15»; a phone
// refused; the boss in a channel with Redes gets asked about «mañana» (E1) and refused a concrete time; the boss arms
// «Prueba» with Kevin (Kevin sees it, Daniela does not), changes who is in it (asked first; Kevin's open screen says
// «Ya no estás en este canal.»), and archives it; administración has no Mensajes; the iPad and 360×640 (also with the
// keyboard open), dark and «Modo sol». Texts are unique and invented; what this spec arms ends archived (archived
// channels add nothing to anybody's envelope, D-86), so the other specs find the seed as it was (D-02).

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const RUN = Date.now().toString(36).slice(-4);
const NOT_YOURS = 'Esa pantalla no es de tu rol';
const NOTICE = /puede leer todas las conversaciones|puede leer esta conversación|Lo lee el jefe|no se borra|Antes de escribir en Mensajes|acepta el aviso|Quién habla con quién|Escribirle a alguien|Todas las conversaciones/i;
const TEAM = ['jefe@demo.test', 'despacho@demo.test', 'politica@demo.test', 'ivt@demo.test', 'redes@demo.test', 'redes2@demo.test', 'grabacion@demo.test', 'grabacion2@demo.test'];

async function noSerious(page: Page, where: string) {
  // A toast fading in or out is half transparent: axe would read its contrast mid-animation.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

async function noSideScroll(page: Page, where: string) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function shown(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

async function phone(browser: Browser, email: string, viewport = { width: 360, height: 760 }) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport, locale: 'es-VE', timezoneId: 'America/Caracas', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

const box = (page: Page) => page.getByRole('textbox', { name: 'Tu mensaje' });
const log = (page: Page) => page.getByRole('log', { name: 'Mensajes' });
const list = (page: Page) => page.locator('main [data-tour="chat-list"]');

// Opens a channel from the list by the name on its row.
async function openFromList(page: Page, name: string | RegExp) {
  await page.goto('/mensajes');
  await shown(page);
  await list(page).getByRole('link', { name }).first().click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  await shown(page);
  return page.url().replace(/^https?:\/\/[^/]+/, '');
}

// The number on the envelope at the top (0 when it says just «Mensajes»), read again from the server.
async function envelope(page: Page): Promise<number> {
  await page.goto('/avisos');
  await shown(page);
  const name = (await page.getByRole('link', { name: /^Mensajes(: \d+ sin leer)?$/ }).first().getAttribute('aria-label')) ?? '';
  return Number(/(\d+) sin leer/.exec(name)?.[1] ?? 0);
}

async function sendText(page: Page, text: string) {
  await box(page).fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

let c1 = ''; // «Grabación y Redes» (seeded): the boss, Daniela, Yorman, Kevin, Mariela

test('ningún aviso para nadie: ni en Mensajes, ni en un canal, ni en Ayuda, ni un diálogo que aceptar', async ({ page }) => {
  for (const email of TEAM) {
    await loginAs(page, email);
    await page.goto('/mensajes');
    await shown(page);
    await expect(page.locator('dialog[open]'), email).toHaveCount(0);
    await expect(page.locator('main'), email).not.toContainText(NOTICE);
    // Every channel the person is in shows who is in it, and nothing else about who reads.
    await list(page).getByRole('link').first().click();
    await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
    await shown(page);
    await expect(page.locator('main'), email).not.toContainText(NOTICE);
    await expect(page.locator('[data-tour="chat-members"]'), email).toContainText(/\d+ personas?/);
    await page.goto('/ayuda');
    await page.locator('#para-todos summary', { hasText: 'Mensajes' }).click();
    await expect(page.locator('#para-todos'), email).not.toContainText(NOTICE);
    await page.context().clearCookies();
  }
});

test('Daniela ve solo sus canales, «Archivados» al final, y en cada canal quiénes están (el jefe primero)', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/mensajes');
  await shown(page);
  await expect(list(page).getByRole('link', { name: /Todo el equipo/ })).toBeVisible();
  await expect(list(page).getByRole('link', { name: /Grabación y Redes/ })).toContainText('5 personas');
  await expect(page.locator('main')).not.toContainText(/Jefe y despacho|Obras y comunidad/);
  await expect(page.getByRole('link', { name: 'Nuevo canal' })).toHaveCount(0);
  await expect(page.getByText('Archivados (1)')).toBeVisible();
  await noSerious(page, '/mensajes');
  await noSideScroll(page, '/mensajes');

  c1 = await openFromList(page, /Grabación y Redes/);
  await expect(page.getByRole('heading', { level: 1, name: 'Grabación y Redes' })).toBeVisible();
  await expect(page.getByText('Tomas, material y piezas').first()).toBeVisible();
  const members = page.locator('[data-tour="chat-members"]');
  await expect(members).toContainText('5 personas');
  await expect(members).toContainText('Jefe, Daniela');
  await members.click();
  const sheet = page.getByRole('dialog', { name: 'Miembros' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('li').first()).toContainText('Jefe (demo)');
  await expect(sheet).toContainText('Daniela Pernía (tú)');
  await expect(sheet).not.toContainText('Editar miembros');
  await noSerious(page, 'la hoja «Miembros»');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(box(page)).toBeVisible();
  // A channel she is not in: not even its name.
  await page.goto('/mensajes/' + '00000000-0000-4000-8000-00000000c0de');
  await expect(page.getByText('No encontramos esto').or(page.getByText('Este canal no está en tu lista')).first()).toBeVisible();
});

test('Redes le escribe a Grabación: la burbuja sale antes que la respuesta del servidor, le llega y la respuesta vuelve sola', async ({ page, browser }) => {
  // Grabación first reads what the seed left in this channel, so the envelope counts only what Redes sends now.
  const cam = await phone(browser, 'grabacion@demo.test');
  await cam.page.goto(c1);
  await shown(cam.page);
  await expect(log(cam.page)).toContainText('Buen trabajo. Daniela, me pasas la pieza cuando esté.');
  const row = (p: Page) => list(p).getByRole('link', { name: /Grabación y Redes/ }).first();
  await expect
    .poll(async () => {
      await cam.page.goto('/mensajes');
      await shown(cam.page);
      return (await row(cam.page).textContent()) ?? '';
    }, { timeout: 15_000 })
    .not.toMatch(/sin leer/);
  const before = await envelope(cam.page);

  await loginAs(page, 'redes@demo.test');
  await page.goto(c1);
  await shown(page);
  const msg = `Prueba ${RUN}: subí el guion del parque (inventado)`;
  await page.route('**/mensajes/**', async (route) => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) await new Promise((r) => setTimeout(r, 2_500));
    await route.continue();
  });
  await sendText(page, msg);
  const mine = log(page).locator('li', { hasText: msg });
  await expect(mine).toContainText('Enviando…', { timeout: 1_500 });
  await expect(box(page)).toHaveValue('');
  await expect(mine).not.toContainText('Enviando…', { timeout: 15_000 });
  await page.unroute('**/mensajes/**');

  try {
    await expect.poll(() => envelope(cam.page), { timeout: 15_000 }).toBe(before + 1);
    await openFromList(cam.page, /Grabación y Redes/);
    await expect(log(cam.page)).toContainText(msg);
    await expect.poll(() => envelope(cam.page), { timeout: 15_000 }).toBe(before);
    await openFromList(cam.page, /Grabación y Redes/);
    const reply = `Respuesta ${RUN}: ya lo veo (inventado)`;
    await sendText(cam.page, reply);
    await expect(log(cam.page)).toContainText(reply);
    await expect(log(page)).toContainText(reply, { timeout: 20_000 });
    await noSerious(cam.page, 'grabación en el canal');
  } finally {
    await cam.ctx.close();
  }
});

test('Grabación: «2:15» pregunta si es del video; con «Sí, es del video» se envía', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto(c1);
  await shown(page);
  const text = `En el 2:15 está la toma del dron ${RUN}`;
  await sendText(page, text);
  const ask = page.getByRole('dialog', { name: '¿2:15 es un tiempo del video? Si es una hora, no va aquí.' });
  await expect(ask).toBeVisible();
  await noSerious(page, 'pregunta del tiempo del video');
  await ask.getByRole('button', { name: 'Sí, es del video' }).click();
  await expect(log(page).locator('li', { hasText: text })).not.toContainText('Enviando…', { timeout: 15_000 });
});

test('un teléfono no va en un mensaje: lo dice mientras escribes y al enviar, y el texto se queda', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto(c1);
  await shown(page);
  const text = `Llámalo al 0414 555 12 34 (${RUN})`;
  await box(page).fill(text);
  await expect(page.getByText('Los teléfonos no van en los mensajes: los contactos van en la ficha, con doble factor.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Los teléfonos no van en los mensajes' })).toBeVisible({ timeout: 15_000 });
  await expect(box(page)).toHaveValue(text);
  await expect(log(page)).not.toContainText('0414 555');
  await box(page).fill('');
});

test('el jefe donde está Redes: «mañana» se pregunta (E1); una hora concreta se avisa, no se envía, y el texto se queda', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto(c1);
  await shown(page);
  await expect(page.getByText('Aquí está Redes o política: sin fechas, horas, ni cuándo sales o llegas.')).toBeVisible();

  const relative = `Mañana te mando la frase ${RUN}`;
  await sendText(page, relative);
  const ask = page.getByRole('dialog', { name: '“Mañana”: ¿dice cuándo va el jefe? Si es de la agenda, no va aquí.' });
  await expect(ask).toBeVisible();
  await noSerious(page, 'pregunta de la palabra relativa');
  await ask.getByRole('button', { name: 'Corregir' }).click();
  await expect(box(page)).toHaveValue(relative);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('dialog', { name: /“Mañana”/ }).getByRole('button', { name: 'Enviar igual' }).click();
  await expect(log(page).locator('li', { hasText: relative })).not.toContainText('Enviando…', { timeout: 15_000 });

  const concrete = `Te espero a las 3 en la plaza ${RUN}`;
  await box(page).fill(concrete);
  await expect(page.getByText('“a las 3” no puede ir aquí')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Aquí está Redes o política: el mensaje no puede llevar una hora, una fecha ni un mapa.' })).toBeVisible({ timeout: 15_000 });
  await expect(box(page)).toHaveValue(concrete);
  await expect(log(page)).not.toContainText('a las 3 en la plaza');
  await box(page).fill('');
});

test('el jefe arma «Prueba» con Kevin; Kevin lo ve y Daniela no; cambia quién está (con pregunta) y Kevin lo sabe en su pantalla; lo archiva', async ({ page, browser }) => {
  const title = `Prueba ${RUN}`;
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/mensajes');
  await shown(page);
  await page.getByRole('link', { name: 'Nuevo canal' }).click();
  await page.waitForURL(/\/mensajes\/canales\/nuevo$/);
  await shown(page);
  await expect(page.getByText('Tú estás en todos los canales.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear canal' })).toBeDisabled();
  await page.getByLabel('Nombre del canal').fill(title);
  await page.getByLabel('Descripción corta (opcional)').fill('Para probar los canales');
  await page.getByRole('checkbox', { name: /Kevin Sánchez/ }).check();
  await noSerious(page, '/mensajes/canales/nuevo');
  await noSideScroll(page, '/mensajes/canales/nuevo');
  // A date in the name is said at once, and «Crear canal» stays off.
  await page.getByLabel('Nombre del canal').fill('Gira del 12 de noviembre');
  await expect(page.getByText('El nombre y la descripción no llevan teléfonos, fechas, horas ni mapas').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear canal' })).toBeDisabled();
  await page.getByLabel('Nombre del canal').fill(title);
  await page.getByRole('button', { name: 'Crear canal' }).click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  await shown(page);
  const href = page.url().replace(/^https?:\/\/[^/]+/, '');
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.locator('[data-tour="chat-members"]')).toContainText('2 personas');

  const kevin = await phone(browser, 'grabacion@demo.test');
  const daniela = await phone(browser, 'redes@demo.test');
  try {
    await kevin.page.goto('/mensajes');
    await expect(list(kevin.page).getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await daniela.page.goto('/mensajes');
    await shown(daniela.page);
    await expect(daniela.page.locator('main')).not.toContainText(title);
    await kevin.page.goto(href);
    await shown(kevin.page);
    await expect(box(kevin.page)).toBeVisible();

    // «Editar canal»: Mariela in, Kevin out, one «Guardar», asked first.
    await page.locator('summary[aria-label="Opciones del canal"]').click();
    await page.getByRole('link', { name: 'Editar canal' }).click();
    await page.waitForURL(/\/editar$/);
    await shown(page);
    await expect(page.getByText('Quien agregues verá lo que ya se escribió en el canal. Quien quites deja de verlo.')).toBeVisible();
    await noSerious(page, `${href}/editar`);
    await noSideScroll(page, `${href}/editar`);
    await page.getByRole('checkbox', { name: /Mariela Ostos/ }).check();
    await page.getByRole('checkbox', { name: /Kevin Sánchez/ }).uncheck();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const sure = page.getByRole('dialog', { name: '¿Guardar los cambios?' });
    await expect(sure).toContainText('Kevin deja de ver este canal, también lo anterior.');
    await sure.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(new RegExp(`${href}$`));
    await expect(page.locator('[data-tour="chat-members"]')).toContainText('2 personas');
    await expect(page.locator('[data-tour="chat-members"]')).toContainText('Mariela');

    // Kevin had it open: within the loop's next turns it says so, and nothing of it stays.
    await expect(kevin.page.getByText('Ya no estás en este canal.')).toBeVisible({ timeout: 20_000 });
    await expect(log(kevin.page)).toHaveCount(0);
    await expect(box(kevin.page)).toHaveCount(0);
    await kevin.page.getByRole('link', { name: 'Ir a Mensajes' }).click();
    await shown(kevin.page);
    await expect(kevin.page.locator('main')).not.toContainText(title);
  } finally {
    await kevin.ctx.close();
    await daniela.ctx.close();
  }

  // Archive, asked first: it moves to «Archivados» and nobody writes in it.
  await page.locator('summary[aria-label="Opciones del canal"]').click();
  await page.getByRole('button', { name: 'Archivar' }).click();
  const ask = page.getByRole('dialog', { name: `¿Archivar «${title}»?` });
  await expect(ask).toContainText('Nadie podrá escribir en él.');
  await ask.getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByText('Este canal está archivado: se lee, pero ya no se escribe.')).toBeVisible({ timeout: 15_000 });
  await expect(box(page)).toHaveCount(0);
  await page.goto('/mensajes');
  await shown(page);
  await page.getByText(/Archivados \(\d+\)/).click();
  await expect(page.locator('main details[open]')).toContainText(title);
});

test('administración no tiene Mensajes: ni el sobre, ni la lista, ni un canal, ni «Nuevo canal»', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes');
  await shown(page);
  await expect(page.getByRole('link', { name: /^Mensajes/ })).toHaveCount(0);
  for (const path of ['/mensajes', '/mensajes/canales/nuevo', c1, `${c1}/editar`]) {
    await page.goto(path);
    await expect(page.locator('main').getByText(NOT_YOURS), path).toBeVisible();
  }
  const r = await page.request.get('/api/mensajes/sin-leer');
  expect(r.status()).toBe(404);
});

test.describe('en el iPad (820×1180)', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('la caja queda abajo y la última burbuja no queda tapada', async ({ page }) => {
    await loginAs(page, 'grabacion@demo.test');
    await page.goto(c1);
    await shown(page);
    const last = log(page).locator('li[data-message]').last();
    await expect(last).toBeVisible();
    await expect.poll(async () => page.evaluate(() => Math.round(window.innerHeight + window.scrollY - document.documentElement.scrollHeight))).toBeGreaterThanOrEqual(-2);
    const composer = page.locator('[data-tour="chat-composer"]');
    const lb = (await last.boundingBox())!;
    const cb = (await composer.boundingBox())!;
    expect(lb.y + lb.height, 'la última burbuja queda por encima de la caja').toBeLessThanOrEqual(cb.y + 1);
    expect(cb.y + cb.height, 'la caja se ve entera').toBeLessThanOrEqual(1180);
    expect(cb.y + cb.height, 'la caja está abajo').toBeGreaterThan(1180 - 120);
    await noSideScroll(page, `${c1} en el iPad`);
    await noSerious(page, `${c1} en el iPad`);
  });
});

test.describe('a 360×640', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('el canal ocupa la pantalla: sin barra de abajo, cabecera corta, abre al final y la última burbuja no queda tapada', async ({ page }) => {
    await loginAs(page, 'grabacion@demo.test');
    await page.goto(c1);
    await shown(page);
    await expect(page.locator('nav[aria-label="Menú"]')).toHaveCount(0);
    const last = log(page).locator('li[data-message]').last();
    await expect(last).toBeVisible();
    await expect.poll(async () => page.evaluate(() => Math.round(window.innerHeight + window.scrollY - document.documentElement.scrollHeight))).toBeGreaterThanOrEqual(-2);
    const composer = page.locator('[data-tour="chat-composer"]');
    const lb = (await last.boundingBox())!;
    const cb = (await composer.boundingBox())!;
    expect(lb.y + lb.height, 'la última burbuja queda por encima de la caja').toBeLessThanOrEqual(cb.y + 1);
    expect(cb.y + cb.height, 'la caja se ve entera').toBeLessThanOrEqual(640);
    // The description and «N personas» share one line: the header stays short.
    const members = (await page.locator('[data-tour="chat-members"]').boundingBox())!;
    const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    expect(members.y - (h1.y + h1.height), 'quiénes están, justo bajo el nombre').toBeLessThan(48);
    await noSideScroll(page, c1);
    await noSerious(page, `${c1} a 360×640`);
  });

  test('con el teclado abierto (360×360) la caja sigue a la vista', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 360 });
    await loginAs(page, 'grabacion@demo.test');
    await page.goto(c1);
    await shown(page);
    await box(page).click();
    await box(page).fill(`Probando con el teclado ${RUN}`);
    const cb = (await page.locator('[data-tour="chat-composer"]').boundingBox())!;
    expect(cb.y, 'la caja empieza dentro de la pantalla').toBeGreaterThanOrEqual(0);
    expect(cb.y + cb.height, 'la caja se ve entera').toBeLessThanOrEqual(360);
    await box(page).fill('');
  });

  test('en modo oscuro y en modo sol, sin problemas de axe: la lista, un canal con «Miembros» abierto, «Nuevo canal» y «Editar canal»', async ({ browser }) => {
    for (const mode of ['oscuro', 'sol'] as const) {
      const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 640 }, locale: 'es-VE', timezoneId: 'America/Caracas', colorScheme: mode === 'oscuro' ? 'dark' : 'light' });
      const page = await ctx.newPage();
      try {
        await loginAs(page, 'jefe@demo.test');
        if (mode === 'sol') await page.evaluate(() => localStorage.setItem('fb:sun', '1'));
        for (const path of ['/mensajes', c1, '/mensajes/canales/nuevo', `${c1}/editar`]) {
          await page.goto(path);
          await shown(page);
          if (path === c1) {
            await page.locator('[data-tour="chat-members"]').click();
            await expect(page.getByRole('dialog', { name: 'Miembros' })).toBeVisible();
            await expect(page.getByRole('dialog', { name: 'Miembros' }).getByRole('link', { name: 'Editar miembros' })).toBeVisible();
          }
          await noSerious(page, `${path} (${mode})`);
          await noSideScroll(page, `${path} (${mode})`);
        }
      } finally {
        await ctx.close();
      }
    }
  });
});
