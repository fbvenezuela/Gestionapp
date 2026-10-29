import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Mensajes (R3, design §5.3 and §9.2) on the phone, with axe, on ONE server (the strict one): two people of the same
// demo database write to each other. The notice is accepted the first time (no box until «Entendido»; Escape lets you
// read without writing); Redes writes to Grabación and it arrives (the envelope's number, the answer within 20 s by
// the loop); the bubble shows before the server answers; the boss writing to Redes gets asked about «mañana» (E1)
// and refused a concrete time, with the text kept in the box; Grabación's «2:15»; a phone refused; the boss reads
// another's conversation in «Todas» without a box; the boss closes Redes ↔ Grabación and opens it again; «Solo el
// jefe escribe en Todo el equipo»; administración has no Mensajes; at 360×640 the conversation fills the screen
// without the bottom bar. Texts are unique and invented; the rules are put back at the end (other specs find the seed
// as it was, D-02).

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const RUN = Date.now().toString(36).slice(-4);
const NOT_YOURS = 'Esa pantalla no es de tu rol';

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

const ackDialog = (page: Page) => page.getByRole('dialog', { name: 'Antes de escribir en Mensajes' });
const box = (page: Page) => page.getByRole('textbox', { name: 'Tu mensaje' });
const log = (page: Page) => page.getByRole('log', { name: 'Mensajes' });

// Accepts the notice if this person has not yet (once per server run). The page sends the closed <dialog> only while
// it is not accepted; it opens as soon as the page is live.
async function accept(page: Page) {
  if (!(await page.locator('dialog', { hasText: 'Antes de escribir en Mensajes' }).count())) return;
  const d = ackDialog(page);
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.locator('dialog', { hasText: 'Antes de escribir en Mensajes' })).toHaveCount(0);
}

// Opens a conversation from the list by the name on its row.
async function openFromList(page: Page, name: string | RegExp) {
  await page.goto('/mensajes');
  await shown(page);
  await accept(page);
  await page.locator('main [data-tour="chat-list"]').getByRole('link', { name }).first().click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  await shown(page);
  return page.url().replace(/^https?:\/\/[^/]+/, '');
}

// The number on the envelope at the top (0 when it says just «Mensajes»), read again from the server.
async function envelope(page: Page): Promise<number> {
  await page.goto('/hoy');
  await shown(page);
  const name = (await page.getByRole('link', { name: /^Mensajes(: \d+ sin leer)?$/ }).first().getAttribute('aria-label')) ?? '';
  return Number(/(\d+) sin leer/.exec(name)?.[1] ?? 0);
}

async function sendText(page: Page, text: string) {
  await box(page).fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

let c1 = ''; // Daniela (Redes) ↔ Kevin (Grabación), seeded

test('el aviso se acepta una vez: sin caja hasta «Entendido»; con Escape se lee sin escribir', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/mensajes');
  await shown(page);
  await expect(ackDialog(page)).toBeVisible();
  await expect(ackDialog(page)).toContainText('El jefe puede leer todas las conversaciones. Lo que escribes queda guardado y no se borra.');
  await page.keyboard.press('Escape');
  await expect(ackDialog(page)).toHaveCount(0);
  // The notice that is always there, and the envelope at the top.
  await expect(page.getByRole('note').filter({ hasText: 'El jefe puede leer todas las conversaciones. Administración no las lee, y 360 tampoco.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Mensajes(: \d+ sin leer)?$/ })).toBeVisible();
  await noSerious(page, '/mensajes');
  await noSideScroll(page, '/mensajes');

  await page.locator('main [data-tour="chat-list"]').getByRole('link', { name: /Kevin Sánchez/ }).click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  c1 = page.url().replace(/^https?:\/\/[^/]+/, '');
  await shown(page);
  await expect(ackDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ackDialog(page)).toHaveCount(0);
  await expect(log(page)).toContainText('Perfecto, armo la pieza y te aviso si falta algo.');
  await expect(box(page)).toHaveCount(0);
  await expect(page.getByText('Para escribir, acepta el aviso.')).toBeVisible();
  await expect(page.getByText('El jefe puede leer esta conversación. Administración y 360 no.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver el aviso' }).click();
  await ackDialog(page).getByRole('button', { name: 'Entendido' }).click();
  await expect(box(page)).toBeVisible();
  await expect(page.getByText('Lo lee el jefe · queda guardado, no se borra')).toBeVisible();
  await noSerious(page, c1);
});

test('Redes le escribe a Grabación: la burbuja sale antes que la respuesta del servidor, le llega y la respuesta vuelve sola', async ({ page, browser }) => {
  // Grabación first reads what the seed left in this conversation, so the envelope counts only what Redes sends now.
  const cam = await phone(browser, 'grabacion@demo.test');
  await cam.page.goto(c1);
  await shown(cam.page);
  await expect(log(cam.page)).toContainText('Perfecto, armo la pieza y te aviso si falta algo.');
  // Opening marks it read in the background (markRead): its row in the list stops saying «sin leer», then count.
  const danielaRow = (p: Page) => p.locator('main [data-tour="chat-list"]').getByRole('link', { name: /Daniela Pernía/ }).first();
  await expect
    .poll(async () => {
      await cam.page.goto('/mensajes');
      await shown(cam.page);
      return (await danielaRow(cam.page).textContent()) ?? '';
    }, { timeout: 15_000 })
    .not.toMatch(/sin leer/);
  const before = await envelope(cam.page);

  await loginAs(page, 'redes@demo.test');
  await page.goto(c1);
  await shown(page);
  // The server answers slowly: «Enviando…» shows at once and the box is free again.
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
    // The new message adds this conversation to the envelope; opening it takes it off again.
    await expect.poll(() => envelope(cam.page), { timeout: 15_000 }).toBe(before + 1);
    await expect(cam.page.getByRole('link', { name: `Mensajes: ${before + 1} sin leer` }).first()).toBeVisible();
    await openFromList(cam.page, /Daniela Pernía/);
    await accept(cam.page);
    await expect(log(cam.page)).toContainText(msg);
    await expect.poll(() => envelope(cam.page), { timeout: 15_000 }).toBe(before);
    await openFromList(cam.page, /Daniela Pernía/);
    const reply = `Respuesta ${RUN}: ya lo veo (inventado)`;
    await sendText(cam.page, reply);
    await expect(log(cam.page)).toContainText(reply);
    // Back on Redes' phone, without touching anything: the loop brings it.
    await expect(log(page)).toContainText(reply, { timeout: 20_000 });
    await noSerious(cam.page, 'grabación en la conversación');
  } finally {
    await cam.ctx.close();
  }
});

test('Grabación: «2:15» pregunta si es del video; con «Sí, es del video» se envía', async ({ page }) => {
  await loginAs(page, 'grabacion@demo.test');
  await page.goto(c1);
  await shown(page);
  await accept(page);
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

test('el jefe a Redes: «mañana» se pregunta (E1); una hora concreta se avisa, no se envía, y el texto se queda', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  const conv = await openFromList(page, /Yorman Chacón/);
  await accept(page);
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
  await noSerious(page, conv);
  await box(page).fill('');
});

test('el jefe lee en «Todas» una conversación ajena, sin caja y sin marcarla', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/mensajes/todas');
  await shown(page);
  await expect(page.getByText('Solo lectura: lo que no es tuyo no se marca como leído.')).toBeVisible();
  await noSerious(page, '/mensajes/todas');
  await noSideScroll(page, '/mensajes/todas');
  await page.getByRole('link', { name: /Daniela y Kevin/ }).click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  await shown(page);
  await accept(page);
  await expect(log(page)).toContainText('Perfecto, armo la pieza y te aviso si falta algo.');
  await expect(page.getByText('Estás leyendo como jefe. Aquí no escribes.')).toBeVisible();
  await expect(box(page)).toHaveCount(0);
});

test('«Quién habla con quién»: el jefe cierra Redes ↔ Grabación, Redes ya no escribe ahí, y se abre otra vez; «Solo el jefe escribe en Todo el equipo»', async ({ page, browser }) => {
  await loginAs(page, 'jefe@demo.test');
  await page.goto('/mensajes/permisos');
  await shown(page);
  await expect(page.getByText('Todos pueden escribirle al jefe, y tú a todos.')).toBeVisible();
  await noSerious(page, '/mensajes/permisos');
  await noSideScroll(page, '/mensajes/permisos');
  const pair = page.getByRole('switch', { name: /^Redes \(Daniela, Yorman\) ↔ Grabación \(Kevin, Mariela\)$/ });
  const team = page.getByRole('switch', { name: 'Solo el jefe escribe en Todo el equipo' });
  const redes = await phone(browser, 'redes@demo.test');
  try {
    await expect(pair).toHaveAttribute('aria-checked', 'true');
    await pair.click();
    const sure = page.getByRole('dialog', { name: '¿Cerrar los mensajes entre Redes y Grabación?' });
    await expect(sure).toContainText('En Todo el equipo siguen escribiendo todos.');
    await sure.getByRole('button', { name: 'Cerrar' }).click();
    await expect(pair).toHaveAttribute('aria-checked', 'false');

    await redes.page.goto(c1);
    await shown(redes.page);
    await expect(redes.page.getByText('El jefe cerró los mensajes entre Redes y Grabación. Puedes leer lo anterior.')).toBeVisible();
    await expect(box(redes.page)).toHaveCount(0);
    await expect(log(redes.page)).toContainText('Perfecto, armo la pieza y te aviso si falta algo.');

    await team.click();
    await expect(team).toHaveAttribute('aria-checked', 'true');
    await openFromList(redes.page, /Todo el equipo/);
    await expect(redes.page.getByText('Solo el jefe escribe en esta conversación.')).toBeVisible();
    await expect(box(redes.page)).toHaveCount(0);
  } finally {
    // Back as seeded, for every other spec.
    if ((await pair.getAttribute('aria-checked')) === 'false') {
      await pair.click();
      await expect(pair).toHaveAttribute('aria-checked', 'true');
    }
    if ((await team.getAttribute('aria-checked')) === 'true') {
      await team.click();
      await expect(team).toHaveAttribute('aria-checked', 'false');
    }
    await redes.ctx.close();
  }
  await page.reload();
  await expect(pair).toHaveAttribute('aria-checked', 'true');
  await expect(team).toHaveAttribute('aria-checked', 'false');
});

test('«Escribirle a alguien»: una persona abre su conversación; un grupo se arma con nombre', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/mensajes');
  await shown(page);
  await page.getByRole('link', { name: 'Escribirle a alguien' }).first().click();
  await page.waitForURL(/\/mensajes\/nueva$/);
  await shown(page);
  await noSerious(page, '/mensajes/nueva');
  await noSideScroll(page, '/mensajes/nueva');
  await page.getByRole('button', { name: /Elio Rondón/ }).click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  await shown(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Elio Rondón' })).toBeVisible();
  await expect(page.getByText('Todavía no hay mensajes. Escribe el primero.')).toBeVisible();

  await page.goto('/mensajes/nueva?tipo=grupo');
  await shown(page);
  await page.getByLabel('Nombre del grupo').fill(`Material del parque ${RUN}`);
  await page.getByRole('checkbox', { name: /Kevin Sánchez/ }).check();
  await page.getByRole('checkbox', { name: /Mariela Ostos/ }).check();
  await noSerious(page, '/mensajes/nueva?tipo=grupo');
  await page.getByRole('button', { name: 'Crear grupo' }).click();
  await page.waitForURL(/\/mensajes\/[0-9a-f-]{36}$/);
  await shown(page);
  await expect(page.getByRole('heading', { level: 1, name: `Material del parque ${RUN}` })).toBeVisible();
  await expect(page.getByText('3 personas')).toBeVisible();
});

test('administración no tiene Mensajes: ni el sobre, ni la lista, ni una conversación', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  await page.goto('/ajustes');
  await shown(page);
  await expect(page.getByRole('link', { name: /^Mensajes/ })).toHaveCount(0);
  for (const path of ['/mensajes', '/mensajes/nueva', c1]) {
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
    await accept(page);
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

  test('la conversación ocupa la pantalla: sin barra de abajo, abre al final y la última burbuja no queda tapada', async ({ page }) => {
    await loginAs(page, 'grabacion@demo.test');
    await page.goto(c1);
    await shown(page);
    await accept(page);
    await expect(page.locator('nav[aria-label="Menú"]')).toHaveCount(0);
    const last = log(page).locator('li[data-message]').last();
    await expect(last).toBeVisible();
    await expect.poll(async () => page.evaluate(() => Math.round(window.innerHeight + window.scrollY - document.documentElement.scrollHeight))).toBeGreaterThanOrEqual(-2);
    const composer = page.locator('[data-tour="chat-composer"]');
    const lb = (await last.boundingBox())!;
    const cb = (await composer.boundingBox())!;
    expect(lb.y + lb.height, 'la última burbuja queda por encima de la caja').toBeLessThanOrEqual(cb.y + 1);
    expect(cb.y + cb.height, 'la caja se ve entera').toBeLessThanOrEqual(640);
    // Without 360's button on this screen (WP-E takes it and its spacer out of /mensajes/[id]) nothing is under the box.
    if (!(await page.locator('[data-assistant-button]').count())) expect(cb.y + cb.height, 'la caja está abajo del todo').toBeGreaterThan(640 - 40);
    const area = await page.evaluate(() => {
      const header = document.querySelector('header.sticky')!.getBoundingClientRect().bottom;
      const box = document.querySelector('[data-tour="chat-composer"]')!.getBoundingClientRect().top;
      return (box - header) / window.innerHeight;
    });
    expect(area, 'el área de los mensajes').toBeGreaterThanOrEqual(0.5);
    await noSideScroll(page, c1);
    await noSerious(page, `${c1} a 360×640`);
  });

  test('en modo oscuro y en modo sol, sin problemas de axe', async ({ browser }) => {
    for (const mode of ['oscuro', 'sol'] as const) {
      const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 640 }, locale: 'es-VE', timezoneId: 'America/Caracas', colorScheme: mode === 'oscuro' ? 'dark' : 'light' });
      const page = await ctx.newPage();
      try {
        await loginAs(page, 'redes@demo.test');
        if (mode === 'sol') await page.evaluate(() => localStorage.setItem('fb:sun', '1'));
        for (const path of ['/mensajes', c1]) {
          await page.goto(path);
          await shown(page);
          await accept(page);
          await noSerious(page, `${path} (${mode})`);
        }
      } finally {
        await ctx.close();
      }
    }
  });
});
