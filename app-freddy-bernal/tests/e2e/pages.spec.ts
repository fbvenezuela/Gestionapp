import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Every page of every role opens without errors and without serious accessibility issues. Redes by format (R4): the
// board, its sections, the feed and the search open as themselves for Redes, the boss and administración; /piezas lands
// on the board. Mensajes and Ayuda (R3):
// every team role has its channels and its guide; the boss also «Nuevo canal» and every
// guide; Administración has Ayuda (its own guide apart, D-43) and never Mensajes (D-49, chat.spec.ts).
const ROLES: Record<string, string[]> = {
  'admin@demo.test': ['/hoy', '/agenda', '/agenda?vista=mes', '/agenda?vista=dia', '/redes', '/redes/reels', '/redes/fin-de-mes', '/redes/feed', '/redes/buscar', '/tweets', '/publicar', '/resultados', '/biblioteca', '/aprobar', '/aprobar?tab=tweets', '/ajustes', '/ajustes/equipo', '/ajustes/categorias', '/ajustes/formulas', '/ajustes/horarios', '/ajustes/redes', '/ajustes/marca', '/ajustes/drive', '/ajustes/contenido', '/ajustes/buzon', '/ajustes/registro', '/avisos', '/perfil', '/buscar?q=puente', '/agenda/por-fecha', '/piezas/nueva', '/tweets/nueva', '/publicar/nueva', '/publicar/espontanea', '/ayuda', '/ayuda/administracion', '/ayuda/flujos', '/ayuda/redes'],
  // The boss «tiene todo, hasta lo de redes»: the Redes screens open for him too.
  'jefe@demo.test': ['/jefe', '/jefe/politica', '/jefe/digital', '/redes', '/redes?vista=trimestre', '/redes/posts', '/redes/feed', '/redes/buscar', '/agenda', '/agenda/nuevo', '/agenda/nuevo?tipo=obra', '/agenda/por-fecha', '/resultados', '/aprobar', '/aprobar?tab=tweets', '/piezas/nueva', '/tweets', '/tweets/nueva', '/publicar', '/publicar/nueva', '/biblioteca', '/obras', '/obras/nueva', '/municipios', '/municipios/junin', '/reportes/nuevo', '/mensajes', '/mensajes/canales/nuevo', '/ayuda', '/ayuda/jefe', '/ayuda/despacho', '/ayuda/politica', '/ayuda/ivt', '/ayuda/grabacion', '/ayuda/redes', '/ayuda/flujos'],
  'despacho@demo.test': ['/hoy', '/agenda', '/agenda/nuevo', '/agenda/nuevo?tipo=obra', '/agenda/por-fecha', '/biblioteca', '/obras', '/municipios', '/mensajes', '/ayuda', '/ayuda/despacho'],
  // Fichas (§4.1 and §4.2): the IVT on its obra fichas, política on the municipalities. Both keep Hoy, Avisos and Perfil.
  'politica@demo.test': ['/municipios', '/municipios?vencidas=1', '/municipios/junin', '/municipios/torbes?tipo=event', '/reportes/nuevo', '/hoy', '/avisos', '/perfil', '/mensajes', '/ayuda', '/ayuda/politica'],
  'ivt@demo.test': ['/obras', '/obras?estado=to_schedule', '/obras/nueva', '/agenda', '/hoy', '/avisos', '/perfil', '/mensajes', '/ayuda', '/ayuda/ivt'],
  'grabacion@demo.test': ['/hoy', '/agenda', '/mensajes', '/ayuda', '/ayuda/grabacion'],
  'redes@demo.test': ['/redes', '/redes/historias', '/redes/carruseles', '/redes/youtube', '/redes/feed', '/redes/buscar?q=agua', '/mensajes', '/ayuda', '/ayuda/redes', '/ayuda/flujos'],
};

for (const [email, pages] of Object.entries(ROLES)) {
  test(`páginas de ${email}`, async ({ page }) => {
    await loginAs(page, email);
    for (const p of pages) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: 'Algo no cargó' }), p).toHaveCount(0);
      // The R3 and R4 screens open as themselves, not as the home with «Esa pantalla no es de tu rol» (?sin-permiso=1) or a
      // 404 page. (The guides mention that notice in their text, so the URL is what is checked.)
      if (/^\/(mensajes|ayuda|redes)/.test(p)) {
        const url = new URL(page.url());
        expect(url.pathname, p).toBe(p.split('?')[0]);
        expect(url.searchParams.get('sin-permiso'), p).toBeNull();
        await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esto' }), p).toHaveCount(0);
        await expect(page.locator('main h1'), p).toHaveCount(1);
      }
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${p} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
      expect(serious, p).toEqual([]);
    }
  });
}

// Redes by format (R4): a format that does not exist is «No encontramos esto»; the old list of pieces lands on the board
// (the page redirects while it streams, so it is checked here by its address and not in the axe loop above).
test('una sección de Redes que no existe no abre; /piezas lleva al tablero', async ({ page }) => {
  await loginAs(page, 'redes@demo.test');
  await page.goto('/redes/otra');
  await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esto' })).toBeVisible();
  await page.goto('/piezas?ver=aprobadas');
  await expect(page).toHaveURL(/\/redes$/);
  await expect(page.getByRole('navigation', { name: 'Secciones de Redes' })).toBeVisible();
});

// At 360 px the home of each role does not scroll sideways (the demo's long titles wrap), every
// label of the phone bar fits in its cell and no deadline («vence en …») is cut, also in «Modo
// sol», which enlarges text.
const HOMES: Record<string, string> = {
  'admin@demo.test': '/hoy',
  'jefe@demo.test': '/jefe',
  'despacho@demo.test': '/hoy',
  'politica@demo.test': '/municipios',
  'ivt@demo.test': '/obras',
  'grabacion@demo.test': '/hoy',
  'redes@demo.test': '/hoy',
};

async function fitsThePhone(page: Page, where: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const r = await page.evaluate(() => {
    const cut = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Menú"] li')].flatMap((li) => {
      const label = li.querySelector<HTMLElement>(':is(a, summary) > span:last-child');
      if (!label) return [];
      const a = label.getBoundingClientRect();
      const cell = li.getBoundingClientRect();
      return label.scrollWidth > label.clientWidth || a.left < cell.left - 0.5 || a.right > cell.right + 0.5 ? [label.textContent ?? ''] : [];
    });
    const deadlines = [...document.querySelectorAll<HTMLElement>('main li span')]
      .filter((el) => el.children.length === 0 && /vence en|venció/.test(el.textContent ?? ''))
      .flatMap((el) => (el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 1 ? [el.textContent ?? ''] : []));
    return { width: document.documentElement.scrollWidth, cut, deadlines };
  });
  expect(r.width, `${where}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(r.cut, `${where}: etiquetas cortadas en la barra`).toEqual([]);
  expect(r.deadlines, `${where}: plazos cortados`).toEqual([]);
}

for (const [email, home] of Object.entries(HOMES)) {
  test(`el inicio de ${email} cabe en el teléfono, también en «Modo sol»`, async ({ page }) => {
    await loginAs(page, email);
    await page.goto(home);
    await fitsThePhone(page, home);
    // «Modo sol» lives in this phone's storage (src/components/shell/sun-mode-core.ts).
    await page.evaluate(() => localStorage.setItem('fb:sun', '1'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await fitsThePhone(page, `${home} (modo sol)`);
  });
}

test('las páginas de un evento abren para cada rol', async ({ page }) => {
  for (const email of ['admin@demo.test', 'redes@demo.test', 'jefe@demo.test']) {
    await loginAs(page, email);
    await page.goto('/agenda');
    const link = page.locator('a[href^="/eventos/"]').first();
    const href = await link.getAttribute('href');
    for (const tab of ['ficha', 'storyboard', 'material', 'piezas']) {
      await page.goto(`${href!.split('?')[0]}?tab=${tab}`);
      await expect(page.getByRole('heading', { name: 'Algo no cargó' })).toHaveCount(0);
    }
    await page.context().clearCookies();
  }
});

// Administración's settings at 360 px: «Franjas para tweets» used to be 24 px wider than the phone (the two time
// inputs and the trash button in one row).
test('los ajustes de Administración caben en el teléfono', async ({ page }) => {
  await loginAs(page, 'admin@demo.test');
  for (const p of ['/ajustes/horarios', '/ajustes/equipo', '/ajustes/redes']) {
    await page.goto(p);
    await expect(page.getByRole('heading', { name: 'Algo no cargó' }), p).toHaveCount(0);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, `${p}: se desplaza hacia los lados`).toBeLessThanOrEqual(page.viewportSize()!.width);
    // The trash button of each tweet slot is whole on the screen (it used to be cut at the right edge).
    if (p === '/ajustes/horarios') await expect(page.getByRole('button', { name: 'Quitar franja' }).first()).toBeInViewport({ ratio: 1 });
  }
});

// The tweet screens wrote «8:07 a. m.» with a no-break space on the server and a plain one in the browser: React's
// hydration error #418 on every role that opens them (the boss too, from his Redes hub).
test('las pantallas de tweets no dan error al cargar (la hora sale igual en el servidor y en el teléfono)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (/#418|#423|#425|hydrat/i.test(e.message)) errors.push(e.message);
  });
  for (const email of ['jefe@demo.test', 'redes@demo.test', 'admin@demo.test']) {
    await loginAs(page, email);
    for (const p of email === 'admin@demo.test' ? ['/tweets', '/aprobar?tab=tweets'] : ['/tweets']) {
      await page.goto(p);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors, `${email} ${p}`).toEqual([]);
    }
    await page.context().clearCookies();
  }
});
