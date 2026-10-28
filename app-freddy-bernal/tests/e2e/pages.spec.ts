import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from './helpers';

// Every page of every role opens without errors and without serious accessibility issues.
const ROLES: Record<string, string[]> = {
  'admin@demo.test': ['/hoy', '/agenda', '/agenda?vista=mes', '/agenda?vista=dia', '/redes', '/piezas', '/tweets', '/publicar', '/resultados', '/biblioteca', '/aprobar', '/aprobar?tab=tweets', '/ajustes', '/ajustes/equipo', '/ajustes/categorias', '/ajustes/formulas', '/ajustes/horarios', '/ajustes/redes', '/ajustes/marca', '/ajustes/drive', '/ajustes/buzon', '/ajustes/registro', '/avisos', '/perfil', '/buscar?q=puente', '/agenda/por-fecha', '/piezas/nueva', '/tweets/nueva', '/publicar/nueva', '/publicar/espontanea'],
  // The boss «tiene todo, hasta lo de redes»: the Redes screens open for him too.
  'jefe@demo.test': ['/jefe', '/jefe/politica', '/jefe/digital', '/redes', '/agenda', '/agenda/nuevo', '/agenda/nuevo?tipo=obra', '/agenda/por-fecha', '/resultados', '/aprobar', '/aprobar?tab=tweets', '/piezas', '/piezas/nueva', '/tweets', '/tweets/nueva', '/publicar', '/publicar/nueva', '/biblioteca', '/obras', '/obras/nueva', '/municipios', '/municipios/junin', '/reportes/nuevo'],
  'despacho@demo.test': ['/hoy', '/agenda', '/agenda/nuevo', '/agenda/nuevo?tipo=obra', '/agenda/por-fecha', '/biblioteca', '/obras', '/municipios'],
  // Fichas (§4.1 and §4.2): the IVT on its obra fichas, política on the municipalities. Both keep Hoy, Avisos and Perfil.
  'politica@demo.test': ['/municipios', '/municipios?vencidas=1', '/municipios/junin', '/municipios/torbes?tipo=event', '/reportes/nuevo', '/hoy', '/avisos', '/perfil'],
  'ivt@demo.test': ['/obras', '/obras?estado=to_schedule', '/obras/nueva', '/agenda', '/hoy', '/avisos', '/perfil'],
  'grabacion@demo.test': ['/hoy', '/agenda'],
};

for (const [email, pages] of Object.entries(ROLES)) {
  test(`páginas de ${email}`, async ({ page }) => {
    await loginAs(page, email);
    for (const p of pages) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: 'Algo no cargó' }), p).toHaveCount(0);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${p} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`);
      expect(serious, p).toEqual([]);
    }
  });
}

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
