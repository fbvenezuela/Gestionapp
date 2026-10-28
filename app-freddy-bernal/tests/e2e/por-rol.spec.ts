import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// §8 of the change request, «Pruebas por rol», on the phone (360 px) with axe: each person walks its own screens and
// sees what the database gives it (tests/rls/por-rol.test.ts proves the database side). The date, time and address
// the others must not see are read first from the boss's own pages. Read-only: nothing here changes the demo, so the
// other specs find it as seeded (D-02).

// Each test walks many screens of one or two people.
test.describe.configure({ timeout: 240_000 });

const NOT_YOURS = 'Esa pantalla no es de tu rol';
// fmtTime / fmtDateTime (src/lib/time.ts): «10:00 a. m.», «hasta las 12:00 p. m.».
const CLOCK = /\d{1,2}:\d{2}\s?[ap]\.\s?m\./i;

type Sched = { href: string; when: string; time: string; day: string; until: string; address: string };

async function noSerious(page: Page, where: string) {
  // A toast fading in or out is half transparent: axe would read its contrast mid-animation.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
  expect(serious, where).toEqual([]);
}

// Opens a screen of this person's own: it loads, says no error, fits 360 px and has no serious axe issue.
// `quotes`: the guides (Ayuda) quote those notices in their own text, so there the address and the headings tell.
async function open(page: Page, path: string, opts: { axe?: boolean; quotes?: boolean } = {}) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBeLessThan(400);
  const main = page.locator('main');
  // The page itself, not the loading skeleton ((panel)/loading.tsx).
  await expect(main, path).toBeVisible();
  await expect(main.locator('[aria-busy="true"]'), path).toHaveCount(0);
  if (opts.quotes) {
    const url = new URL(page.url());
    expect(url.pathname, `${path}: ${NOT_YOURS}`).toBe(path.split('?')[0]);
    expect(url.searchParams.get('sin-permiso'), `${path}: ${NOT_YOURS}`).toBeNull();
    for (const bad of ['Algo no cargó', 'No encontramos esto']) await expect(main.getByRole('heading', { name: bad }), `${path}: ${bad}`).toHaveCount(0);
  } else {
    for (const bad of [NOT_YOURS, 'Algo no cargó', 'No encontramos esto']) await expect(main.getByText(bad), `${path}: ${bad}`).toHaveCount(0);
  }
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w, `${path}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (opts.axe !== false) await noSerious(page, path);
  return main.innerText();
}

// A screen that is not this person's: sent home with the notice, or «No encontramos esto» for a record.
async function closed(page: Page, path: string, how: 'role' | 'record') {
  await page.goto(path);
  await expect(page.locator('main').getByText(how === 'role' ? NOT_YOURS : 'No encontramos esto').first(), path).toBeVisible();
}

async function other(browser: Browser, email: string) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 360, height: 760 }, locale: 'es-VE', timezoneId: 'America/Caracas' });
  const page = await ctx.newPage();
  await loginAs(page, email);
  return { ctx, page };
}

const eventLinks = async (page: Page) =>
  page.locator('main a[href^="/eventos/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('?')[0]))]);

// The boss reads each event's date, time and address on its page (the schedule card at the top).
async function schedulesOf(browser: Browser, hrefs: string[]): Promise<Sched[]> {
  const boss = await other(browser, 'jefe@demo.test');
  const out: Sched[] = [];
  for (const href of hrefs) {
    await boss.page.goto(`${href}?tab=ficha`);
    await expect(boss.page.locator('main').getByText(CLOCK).first(), href).toBeVisible();
    const text = await boss.page.locator('main').innerText();
    const when = text.match(/^[^\n]*\d{1,2} de [^\n,]+, \d{1,2}:\d{2}\s?[ap]\.\s?m\.$/m)?.[0]?.trim() ?? '';
    const until = text.match(/^hasta las [^\n(]+/m)?.[0]?.trim() ?? '';
    const address = text.match(/^hasta las [^\n]+\n+([^\n]+)/m)?.[1]?.trim() ?? '';
    expect(when, `${href}: el jefe ve la fecha y la hora`).not.toBe('');
    expect(until, `${href}: el jefe ve hasta qué hora`).not.toBe('');
    out.push({ href, when, time: when.match(CLOCK)![0], day: when.match(/\d{1,2} de [a-záéíóú]+/i)![0], until, address });
  }
  await boss.ctx.close();
  return out;
}

// Mensajes and Ayuda (R3) for a team role: the conversations (the notice to accept may be open on top) and the guide.
// The guide never has a clock; the messages' own times are not checked against CLOCK (each message shows when it was
// written), only that no event's address or end time is there (D-52: the database keeps the agenda out of them).
async function mensajesYAyuda(page: Page, slug: string, sched: Sched[] = []) {
  for (const path of ['/mensajes', '/mensajes/nueva']) {
    const text = (await open(page, path)).toLowerCase();
    for (const s of sched) for (const piece of [s.until, s.address]) if (piece) expect(text, `${path}: «${piece}»`).not.toContain(piece.toLowerCase());
  }
  for (const path of ['/ayuda', `/ayuda/${slug}`, `/ayuda/${slug}?ver=pantallas`, '/ayuda/flujos']) {
    const text = await open(page, path, { axe: path !== '/ayuda/flujos', quotes: true });
    expect(text, path).not.toMatch(CLOCK);
    for (const s of sched) noSchedule(text, s, path);
  }
  // Only the boss reads «Todas» and decides who talks with whom.
  for (const path of ['/mensajes/todas', '/mensajes/permisos']) await closed(page, path, 'role');
}

// None of the agenda's strings of this event on the page. `done`: the day it was done may show (D-06), never its
// time or address.
function noSchedule(text: string, s: Sched, where: string, done = false) {
  const t = text.toLowerCase();
  for (const piece of [s.when, s.time, s.until, s.address, ...(done ? [] : [s.day])]) {
    if (piece) expect(t, `${where}: «${piece}»`).not.toContain(piece.toLowerCase());
  }
}

test('Redes no ve fecha ni hora: ni en la agenda, ni en el evento, ni en Hoy, ni en la biblioteca', async ({ page, browser }) => {
  await loginAs(page, 'redes@demo.test');
  await open(page, '/agenda');
  const live = await eventLinks(page);
  await page.goto('/biblioteca');
  const done = (await eventLinks(page)).filter((h) => !live.includes(h));
  expect(live.length).toBeGreaterThan(2);
  expect(done.length).toBeGreaterThan(0);
  const sched = await schedulesOf(browser, [...live, ...done]);
  const of = (href: string) => sched.find((s) => s.href === href)!;

  // The lists: no clock anywhere, and none of the agenda's strings.
  for (const path of ['/hoy', '/agenda', '/biblioteca']) {
    const text = await open(page, path);
    expect(text, path).not.toMatch(CLOCK);
    expect(text, path).not.toContain('hasta las');
    for (const s of sched) noSchedule(text, s, path, path !== '/agenda');
  }
  // Every event it works on: its page, read mode included. A storyboard and the material in full for two of them.
  for (const [i, href] of live.entries()) {
    const tabs = i < 2 ? ['ficha', 'storyboard', 'material', 'piezas'] : ['ficha'];
    for (const tab of tabs) {
      // The storyboard's history says when someone saved it (not when the event is): it is left out of the clock check.
      const text = (await open(page, `${href}?tab=${tab}`, { axe: i < 2 })).split('Historial del storyboard')[0];
      expect(text, `${href} ${tab}`).not.toMatch(CLOCK);
      expect(text, `${href} ${tab}`).not.toContain('Sin dirección exacta');
      noSchedule(text, of(href), `${href} ${tab}`);
    }
    noSchedule(await open(page, `${href}/lectura`, { axe: false }), of(href), `${href}/lectura`);
  }
  // What was already done (from the biblioteca): only the day, «Realizado el …», never the time or the place.
  for (const href of done) {
    for (const tab of ['ficha', 'obra', 'material']) {
      const text = await open(page, `${href}?tab=${tab}`, { axe: tab === 'ficha' });
      expect(text, `${href} ${tab}`).toMatch(/Realizado el \d{1,2} de [a-záéíóú]+/i);
      expect(text, `${href} ${tab}`).not.toMatch(CLOCK);
      noSchedule(text, of(href), `${href} ${tab}`, true);
    }
  }
  // The agenda's own screens are not Redes'.
  for (const path of ['/agenda/por-fecha', '/agenda/nuevo', '/obras', '/municipios']) await closed(page, path, 'role');
  // Mensajes and its guide (R3); another role's guide is not its.
  await mensajesYAyuda(page, 'redes', sched);
  await closed(page, '/ayuda/jefe', 'role');
});

test('El IVT y el director de política no ponen fecha: ningún «Ponerle fecha», «Mover» ni «Nuevo evento» en sus pantallas', async ({ page, browser }) => {
  const NO_DATE_BUTTONS = ['Ponerle fecha', 'Mover', 'Cancelar', 'Nuevo evento', 'Visita de obra', 'Marcar realizado'];
  const noButtons = async (p: Page, where: string) => {
    for (const name of NO_DATE_BUTTONS) {
      await expect(p.locator('main').getByRole('button', { name, exact: true }), `${where}: botón «${name}»`).toHaveCount(0);
      await expect(p.locator('main').getByRole('link', { name: new RegExp(`^${name}`) }), `${where}: enlace «${name}»`).toHaveCount(0);
    }
    // «Crear» offers its own ficha, never an event.
    const create = p.locator('header details').filter({ has: p.getByText('Crear', { exact: true }) });
    await create.locator('summary').click();
    await expect(create.getByRole('link', { name: 'Nuevo evento' }), where).toHaveCount(0);
    await expect(create.getByRole('link', { name: 'Visita de obra' }), where).toHaveCount(0);
    await p.keyboard.press('Escape');
  };

  // The IVT: its obra fichas (one waits for a date), «Mis visitas de obra» with the date of its visit (2FA), the visit.
  await loginAs(page, 'ivt@demo.test');
  await open(page, '/obras');
  await noButtons(page, '/obras');
  await open(page, '/obras?estado=to_schedule');
  const waiting = page.locator('main a[href^="/obras/"]').filter({ hasText: 'Asfaltado de la vía del sector Las Palmas (demo)' }).first();
  await expect(waiting).toBeVisible();
  const obraHref = (await waiting.getAttribute('href'))!.split('?')[0];
  await open(page, obraHref);
  await noButtons(page, obraHref);
  const visits = await open(page, '/agenda');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis visitas de obra' })).toBeVisible();
  const visitHrefs = await eventLinks(page);
  expect(visitHrefs.length).toBeGreaterThan(0);
  const [visit] = await schedulesOf(browser, visitHrefs.slice(0, 1));
  // The date of its own visit, yes (spec §4.1: it has to be there).
  expect(visits.toLowerCase()).toContain(visit.when.toLowerCase());
  const visitText = await open(page, visit.href);
  expect(visitText.toLowerCase()).toContain(visit.when.toLowerCase());
  await noButtons(page, visit.href);
  for (const path of ['/agenda/por-fecha', '/agenda/nuevo', '/agenda/nuevo?tipo=obra', '/municipios', '/reportes/nuevo', '/piezas']) await closed(page, path, 'role');
  await mensajesYAyuda(page, 'ivt');
  await page.context().clearCookies();

  // Política: its municipalities, a report that goes to the agenda and the activity born from another one, without
  // the date.
  await loginAs(page, 'politica@demo.test');
  await open(page, '/municipios');
  await noButtons(page, '/municipios');
  await open(page, '/municipios/torbes');
  const report = page.locator('main a[href^="/reportes/"]').filter({ hasText: 'Asamblea con los voceros del sector La Ermita (demo)' }).first();
  await expect(report).toBeVisible();
  const reportHref = (await report.getAttribute('href'))!.split('?')[0];
  await open(page, reportHref);
  await noButtons(page, reportHref);
  await open(page, '/municipios/san-cristobal');
  const activities = await eventLinks(page);
  expect(activities.length).toBeGreaterThan(0);
  const sched = await schedulesOf(browser, activities);
  for (const s of sched) {
    const text = await open(page, s.href);
    expect(text, s.href).not.toMatch(CLOCK);
    noSchedule(text, s, `${s.href} para política`);
    await expect(page.getByText('Ya tiene fecha. La ven el jefe y el despacho en la agenda.'), s.href).toBeVisible();
    await noButtons(page, s.href);
  }
  for (const path of ['/agenda', '/agenda/por-fecha', '/agenda/nuevo', '/obras', '/biblioteca']) await closed(page, path, 'role');
  // Mensajes and its guide, without the date of those activities (R3).
  await mensajesYAyuda(page, 'politica', sched);
  await closed(page, '/ayuda/despacho', 'role');
});

test('Solo jefe y despacho la ponen: «Ponerle fecha» y los botones de la agenda son suyos; Administración solo mira', async ({ page }) => {
  for (const email of ['jefe@demo.test', 'despacho@demo.test']) {
    await loginAs(page, email);
    await open(page, '/agenda', { axe: false });
    const actions = page.getByRole('navigation', { name: 'Acciones de la agenda' });
    await expect(actions.getByRole('link', { name: /^Nuevo evento/ }), email).toBeVisible();
    await expect(actions.getByRole('link', { name: /^Visita de obra/ }), email).toBeVisible();
    await open(page, '/agenda/por-fecha');
    await expect(page.getByRole('button', { name: 'Ponerle fecha' }).first(), email).toBeVisible();
    await page.context().clearCookies();
  }
  // Administración reads «Por ponerle fecha» (support), with no button, and has no agenda buttons.
  await loginAs(page, 'admin@demo.test');
  await open(page, '/agenda/por-fecha');
  await expect(page.locator('main').getByText('Asfaltado de la vía del sector Las Palmas (demo)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ponerle fecha' })).toHaveCount(0);
  await open(page, '/agenda', { axe: false });
  await expect(page.getByRole('navigation', { name: 'Acciones de la agenda' })).toHaveCount(0);
  await closed(page, '/agenda/nuevo', 'role');
  // Administración has its own guide and is not in Mensajes (D-43, D-49).
  await open(page, '/ayuda/administracion', { quotes: true });
  for (const path of ['/mensajes', '/mensajes/todas', '/mensajes/permisos']) await closed(page, path, 'role');
  await page.context().clearCookies();
  // Grabación and Redes do not reach the agenda's writing screens at all.
  for (const email of ['grabacion@demo.test', 'redes2@demo.test']) {
    await loginAs(page, email);
    for (const path of ['/agenda/por-fecha', '/agenda/nuevo']) await closed(page, path, 'role');
    await page.context().clearCookies();
  }
});

test('El jefe ve todo: llega a cada pantalla de cada rol, con la fecha y la hora', async ({ page }) => {
  await loginAs(page, 'jefe@demo.test');
  // Every menu of the team (his own, despacho's, the IVT's, política's, Redes', Grabación's) and their lists.
  const screens = ['/jefe', '/jefe/politica', '/jefe/digital', '/hoy', '/agenda', '/agenda?vista=dia', '/agenda?vista=mes', '/agenda/por-fecha', '/agenda/nuevo',
    '/aprobar', '/aprobar?tab=tweets', '/redes', '/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca', '/obras', '/obras?estado=to_schedule',
    '/municipios', '/municipios/torbes', '/reportes/nuevo', '/obras/nueva', '/avisos', '/perfil',
    // R3: Mensajes with «Todas» and «Quién habla con quién», Ayuda with every role's guide and the flows.
    '/mensajes', '/mensajes/nueva', '/mensajes/todas', '/mensajes/permisos', '/ayuda', '/ayuda/flujos',
    ...['jefe', 'despacho', 'politica', 'ivt', 'grabacion', 'redes'].map((slug) => `/ayuda/${slug}`)];
  for (const path of screens) await open(page, path, { axe: false, quotes: path.startsWith('/ayuda') });
  // Every detail page those lists lead to: each obra, each report of a municipality, each piece, tweet batch and
  // publication, and every event (with each of its tabs and the read mode).
  const linksOn = async (path: string, prefix: string) => {
    await page.goto(path);
    return page.locator(`main a[href^="${prefix}"]`).evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('?')[0]))]);
  };
  const obras = (await linksOn('/obras', '/obras/')).filter((h) => /\/obras\/[0-9a-f-]{36}$/.test(h));
  const reports = [...(await linksOn('/municipios/torbes', '/reportes/')), ...(await linksOn('/municipios/junin', '/reportes/'))].filter((h) => /[0-9a-f-]{36}$/.test(h));
  const pieces = (await linksOn('/piezas', '/piezas/')).filter((h) => /[0-9a-f-]{36}$/.test(h));
  const tweets = (await linksOn('/tweets', '/tweets/')).filter((h) => /[0-9a-f-]{36}$/.test(h));
  const pubs = (await linksOn('/publicar', '/publicar/')).filter((h) => /[0-9a-f-]{36}$/.test(h));
  const events = [...new Set([...(await linksOn('/jefe/politica', '/eventos/')), ...(await linksOn('/biblioteca', '/eventos/'))])].filter((h) => /^\/eventos\/[0-9a-f-]{36}$/.test(h));
  for (const [what, list] of [['obras', obras], ['reportes', reports], ['piezas', pieces], ['tweets', tweets], ['publicaciones', pubs], ['eventos', events]] as const) {
    expect(list.length, what).toBeGreaterThan(0);
  }
  for (const href of [...obras, ...obras.map((h) => `${h}/lectura`), ...reports, ...pieces.slice(0, 3), ...tweets.slice(0, 2), ...pubs.slice(0, 2)]) {
    await open(page, href, { axe: href === obras[0] || href === reports[0] });
  }
  let sawObraTab = false;
  let sawReportTab = false;
  for (const href of events) {
    const text = await open(page, `${href}?tab=ficha`, { axe: href === events[0] });
    // His agenda: the date and the time of every event, and he sees the tab of the ficha it was born from.
    expect(text, href).toMatch(CLOCK);
    const tabs = page.getByRole('navigation', { name: 'Secciones del evento' });
    const obraTab = (await tabs.getByRole('link', { name: 'Ficha de obra' }).count()) > 0;
    const reportTab = (await tabs.getByRole('link', { name: 'Reporte' }).count()) > 0;
    sawObraTab ||= obraTab;
    sawReportTab ||= reportTab;
    for (const tab of ['storyboard', 'material', 'piezas', ...(obraTab ? ['obra'] : []), ...(reportTab ? ['reporte'] : [])]) {
      await open(page, `${href}?tab=${tab}`, { axe: href === events[0] || tab === 'obra' || tab === 'reporte' });
    }
    await open(page, `${href}/lectura`, { axe: false });
  }
  expect(sawObraTab, 'una visita de obra con su pestaña').toBe(true);
  expect(sawReportTab, 'una actividad comunitaria con su pestaña').toBe(true);
});

test('Grabación solo ve lo suyo: sus eventos con fecha, nada de los de la otra persona, ni de Redes, la obra solo la de su visita', async ({ page, browser }) => {
  // What each camera person records, from its own «Mis eventos».
  const mine: Record<string, string[]> = {};
  for (const email of ['grabacion@demo.test', 'grabacion2@demo.test']) {
    const p = await other(browser, email);
    await p.page.goto('/agenda');
    await expect(p.page.getByRole('heading', { level: 1, name: 'Mis eventos' })).toBeVisible();
    mine[email] = await eventLinks(p.page);
    await p.ctx.close();
  }
  expect(mine['grabacion@demo.test'].length).toBeGreaterThan(0);
  expect(mine['grabacion2@demo.test'].length).toBeGreaterThan(0);
  expect(mine['grabacion@demo.test'].filter((h) => mine['grabacion2@demo.test'].includes(h))).toEqual([]);

  for (const [email, otherEmail] of [['grabacion@demo.test', 'grabacion2@demo.test'], ['grabacion2@demo.test', 'grabacion@demo.test']] as const) {
    await loginAs(page, email);
    const list = await open(page, '/agenda');
    // Its own events, with their date and time (D-05).
    expect(list, email).toMatch(CLOCK);
    for (const href of mine[email]) {
      const text = await open(page, href, { axe: href === mine[email][0] });
      expect(text, href).toMatch(CLOCK);
      // Never the pieces tab (Redes'), and the obra tab only on the visit it records, without contacts.
      const tabs = page.getByRole('navigation', { name: 'Secciones del evento' });
      await expect(tabs.getByRole('link', { name: /^Piezas/ }), href).toHaveCount(0);
      await expect(tabs.getByRole('link', { name: 'Reporte' }), href).toHaveCount(0);
      if (await tabs.getByRole('link', { name: 'Ficha de obra' }).count()) {
        const obra = await open(page, `${href}?tab=obra`);
        expect(obra, href).toContain('Sin contactos, nombres de la comunidad ni teléfonos.');
        expect(obra, href).not.toMatch(/Enlace comunitario|Vocero comunal|0000-00001\d\d/);
      }
    }
    // The other person's events do not exist for it.
    for (const href of mine[otherEmail]) await closed(page, href, 'record');
    for (const path of ['/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca', '/obras', '/municipios', '/agenda/por-fecha']) await closed(page, path, 'role');
    if (email === 'grabacion@demo.test') {
      await mensajesYAyuda(page, 'grabacion');
      await closed(page, '/ayuda/redes', 'role');
    }
    await page.context().clearCookies();
  }
});
