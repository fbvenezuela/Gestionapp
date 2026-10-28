import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './helpers';

// «La ficha completa del evento, cuando la abro, da error» (27/10): on Vercel the list and the
// event page can come from different servers, each with its own demo database. The two local
// servers (strict and shortcuts) play those two instances; a session cookie works on both.
const other = `http://localhost:${Number(process.env.E2E_PORT ?? 3100) + 1}`;

// The page itself, not the loading skeleton ((panel)/loading.tsx): the streamed page can take its place after the
// load event, and until then «No encontramos esto» is absent even for a record that is missing.
async function shown(page: Page, where: string) {
  await expect(page.locator('main'), where).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]'), where).toHaveCount(0);
}

test('la ficha de un evento abre aunque la sirva otro servidor de la demo', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  await loginAs(page, 'despacho@demo.test');
  await page.goto('/agenda');
  const link = page.locator('main a[href^="/eventos/"]').first();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!.split('?')[0];
  await page.goto(href);
  const title = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();

  const res = await page.goto(`${other}${href}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.goto(`${other}${href}/lectura`);
  await shown(page, `${href}/lectura`);
  await expect(page.getByText('No encontramos esto')).toHaveCount(0);
});

// The same for the two new roles (cambios del 27/10/2026, §8): the IVT's visit and its obra ficha, política's report
// and the activity born from another one, each opened on the other server with the same session.
async function sameOnTheOther(page: Page, href: string) {
  await page.goto(href);
  const title = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();
  const res = await page.goto(`${other}${href}`);
  expect(res?.status(), href).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: title }), href).toBeVisible();
  await expect(page.getByText('No encontramos esto'), href).toHaveCount(0);
}

test('la visita de obra y la ficha del IVT abren aunque las sirva otro servidor', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  await loginAs(page, 'ivt@demo.test');
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis visitas de obra' })).toBeVisible();
  const visit = (await page.locator('main a[href^="/eventos/"]').first().getAttribute('href'))!.split('?')[0];
  await sameOnTheOther(page, visit);
  await page.goto(visit);
  const obra = (await page.getByRole('link', { name: 'Ver la ficha de obra' }).getAttribute('href'))!.split('?')[0];
  await sameOnTheOther(page, obra);
  await page.goto(`${other}${obra}/lectura`);
  await shown(page, `${obra}/lectura`);
  await expect(page.getByText('No encontramos esto')).toHaveCount(0);
});

test('el reporte y la actividad de política abren aunque los sirva otro servidor', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  await loginAs(page, 'politica@demo.test');
  await page.goto('/municipios/san-cristobal');
  const activity = (await page.locator('main a[href^="/eventos/"]').first().getAttribute('href'))!.split('?')[0];
  const report = (await page.locator('main a[href^="/reportes/"]').first().getAttribute('href'))!.split('?')[0];
  await sameOnTheOther(page, activity);
  // Still without the date on the other server.
  await expect(page.getByText('Ya tiene fecha. La ven el jefe y el despacho en la agenda.')).toBeVisible();
  await sameOnTheOther(page, report);
});

// The other four roles (audit of 28/10/2026): each one opens, on the other server, the events it reaches from its own
// screens, every tab it sees there and «Modo lectura» when the page offers it. The boss and administración also an
// event born from an obra ficha and one born from a community report, so the «Ficha de obra» and «Reporte» tabs are
// opened there too.
const EVENT = /^\/eventos\/[0-9a-f-]{36}$/;
const ROLES = [
  { email: 'jefe@demo.test', screens: ['/agenda', '/jefe/politica', '/biblioteca'], fichaTabs: true },
  { email: 'redes@demo.test', screens: ['/agenda'], fichaTabs: false },
  { email: 'grabacion@demo.test', screens: ['/agenda'], fichaTabs: false },
  { email: 'admin@demo.test', screens: ['/agenda', '/biblioteca'], fichaTabs: true },
] as const;

for (const { email, screens, fichaTabs } of ROLES) {
  test(`${email}: sus eventos, cada pestaña y el modo lectura abren aunque los sirva otro servidor`, async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
    await loginAs(page, email);
    const found: string[] = [];
    for (const screen of screens) {
      await page.goto(screen);
      await shown(page, screen);
      found.push(...(await page.locator('main a[href^="/eventos/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!.split('?')[0]))));
    }
    const events = [...new Set(found)].filter((h) => EVENT.test(h));
    expect(events.length, email).toBeGreaterThan(0);
    const tabsOf = () => page.getByRole('navigation', { name: 'Secciones del evento' }).getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    const reads = async () => (await page.getByRole('link', { name: 'Modo lectura' }).count()) > 0;

    // On its own server: the first event of its screens, then the first one that offers «Modo lectura» and (the boss
    // and administración) the first one with each ficha tab.
    let wants = ['lectura', ...(fichaTabs ? ['obra', 'reporte'] : [])];
    const pick = new Set([events[0]]);
    for (const href of events) {
      if (!wants.length) break;
      await page.goto(href);
      await shown(page, href);
      const offers = [...((await reads()) ? ['lectura'] : []), ...(await tabsOf()).map((t) => t.split('?tab=')[1])];
      if (wants.some((w) => offers.includes(w))) pick.add(href);
      wants = wants.filter((w) => !offers.includes(w));
    }
    expect(wants, `${email}: lo que no se encontró en sus eventos`).toEqual([]);
    for (const href of pick) {
      await sameOnTheOther(page, href);
      const title = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();
      const tabs = await tabsOf();
      expect(tabs.length, `${email} ${href}`).toBeGreaterThan(1);
      for (const path of [...tabs, ...((await reads()) ? [`${href}/lectura`] : [])]) {
        const res = await page.goto(`${other}${path}`);
        expect(res?.status(), `${email} ${path}`).toBe(200);
        await shown(page, `${email} ${path}`);
        // Every tab and the teleprompter name the event.
        await expect(page.locator('main').getByText(title, { exact: true }).first(), `${email} ${path}`).toBeVisible();
        await expect(page.getByText('No encontramos esto'), `${email} ${path}`).toHaveCount(0);
      }
    }
  });
}

// Mensajes in the demo (R3, D-57): the seeded conversations have the same ids on every server, also the directs that
// have no message yet (so «Escribirle a alguien» opens the same one anywhere); a conversation made on another server
// says so instead of «No encontramos esto». The notice of Mensajes is closed with Escape: nothing is written here.
async function closeNotice(page: Page) {
  if (!(await page.locator('dialog', { hasText: 'Antes de escribir en Mensajes' }).count())) return;
  const d = page.getByRole('dialog', { name: 'Antes de escribir en Mensajes' });
  await expect(d).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
}

test('las conversaciones sembradas de Mensajes abren con el mismo id en los dos servidores', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'solo con los dos servidores locales');
  const { chatDirectId } = await import('../../src/lib/db/seed-parts/chat');
  // Daniela (Redes) and Elio (Política), fixed demo ids (src/lib/db/seed-demo.ts): seeded, with no message.
  const empty = `/mensajes/${chatDirectId('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000010')}`;
  await loginAs(page, 'redes@demo.test');
  await page.goto('/mensajes');
  await shown(page, '/mensajes');
  await closeNotice(page);
  const withKevin = (await page.locator('main [data-tour="chat-list"] a', { hasText: 'Kevin Sánchez' }).first().getAttribute('href'))!;
  for (const [href, title, text] of [
    [withKevin, 'Kevin Sánchez', 'Ya subí las tomas de la cancha de El Mirador, con la nota para el editor.'],
    [empty, 'Elio Rondón', 'Todavía no hay mensajes. Escribe el primero.'],
  ] as const) {
    for (const base of ['', other]) {
      const res = await page.goto(`${base}${href}`);
      expect(res?.status(), `${base}${href}`).toBe(200);
      await shown(page, `${base}${href}`);
      await closeNotice(page);
      await expect(page.getByRole('heading', { level: 1, name: title }), `${base}${href}`).toBeVisible();
      await expect(page.getByRole('log', { name: 'Mensajes' }), `${base}${href}`).toContainText(text);
    }
  }
  // An id this server never had (a group made on another one): said plainly, in the demo only.
  await page.goto(`${other}/mensajes/00000000-0000-4000-8000-00000000c0de`);
  await shown(page, 'conversación de otro servidor');
  await expect(page.getByText('Esta conversación se creó en otro servidor de la demostración. Prueba con las que ya están.')).toBeVisible();
  await expect(page.getByText('No encontramos esto')).toHaveCount(0);
});

// «Ir al inicio» goes to each person's own home: Hoy for despacho, Municipios for política (not Hoy for everyone).
test('lo que no existe dice «No encontramos esto» en español y lleva al inicio de cada quien', async ({ page }) => {
  for (const [email, missing, home] of [
    ['despacho@demo.test', '/eventos/00000000-0000-4000-8000-00000000abcd', '/hoy'],
    ['politica@demo.test', '/reportes/00000000-0000-4000-8000-00000000abcd', '/municipios'],
  ] as const) {
    await page.context().clearCookies();
    await loginAs(page, email);
    await page.goto(missing);
    await expect(page.getByRole('heading', { name: 'No encontramos esto' }), email).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a Hoy' }), email).toHaveCount(0);
    await page.getByRole('link', { name: 'Ir al inicio' }).click();
    await page.waitForURL((u) => u.pathname === home);
  }
});
