// npm run capturas — our half of the side-by-side screenshots of Redes (R4, design §8, D-78): the same scenes as the
// reference, from OUR demo (invented data only), into docs/capturas/mila-vs-fb/NN-escena-fb-{1366,360}.jpg.
// The reference half is not made here: those images come from the clean template of the other project and are only
// copied into the folder (docs/capturas/mila-vs-fb/README.md says how).
//
// Needs a production build (npm run build). With no CAPTURAS_URL it starts its own demo server with the testing
// shortcuts on (one tap per role, no code, no 2FA; never with DATABASE_URL) on CAPTURAS_PORT (3290) and stops it at the
// end. Uses Playwright's Chromium: set PW_CHROMIUM_PATH=/opt/pw-browsers/chromium in Claude's container.
// Window-size JPEGs (quality 75), except the feed (the whole page, its 24 places). Nothing is saved or changed in the
// demo: dialogs are opened and closed, never confirmed. Writes only inside docs/capturas/mila-vs-fb.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type Page } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'docs', 'capturas', 'mila-vs-fb');
const PORT = Number(process.env.CAPTURAS_PORT ?? 3290);
const BASE = process.env.CAPTURAS_URL ?? `http://localhost:${PORT}`;
const SIZES = [
  { w: 1366, h: 900 },
  { w: 360, h: 780 },
] as const;
type Size = (typeof SIZES)[number];
type Who = 'redes' | 'jefe';

// One scene: who opens it, how to get there, and whether the shot is the whole page (only the feed).
type Scene = { nn: string; name: string; who: Who; full?: boolean; go: (page: Page, size: Size) => Promise<void> };

async function waitForServer(url: string, ms = 120_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${url}/entrar`);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`El servidor de la demo no respondió en ${url}`);
}

function startServer(): ChildProcess | null {
  if (process.env.CAPTURAS_URL) return null;
  if (process.env.DATABASE_URL) throw new Error('Las capturas son de la demo: quita DATABASE_URL.');
  const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: root,
    env: { ...process.env, DEMO_SHORTCUTS: 'true' },
    stdio: 'ignore',
  });
  return child;
}

// The page itself (not the loading skeleton), then a moment for the client parts to come alive.
async function settled(page: Page) {
  await page.locator('main').waitFor();
  await page.locator('main [aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

async function go(page: Page, href: string) {
  await page.goto(href);
  await settled(page);
}

// A month of the tabs by its position (Mes 1, Mes 2, Mes 3 in the seed).
async function monthId(page: Page, index: number): Promise<string> {
  const tabs = page.getByRole('navigation', { name: 'Meses de contenido' }).getByRole('link');
  await tabs.first().waitFor();
  const hrefs = await tabs.evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).searchParams.get('mes') ?? ''));
  return hrefs.filter(Boolean)[index];
}

const card = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });

// Opens a card (cards after the first start folded on the phone) and puts its top under the bar.
async function openCard(page: Page, title: string) {
  const c = card(page, title);
  await c.waitFor();
  const unfold = c.getByRole('button', { name: 'Desplegar' });
  if (await unfold.count()) await unfold.click();
  await c.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 }));
  await page.waitForTimeout(400);
  return c;
}

async function openPieceMenu(page: Page, title: string) {
  const c = await openCard(page, title);
  await c.getByRole('button', { name: 'Opciones de la pieza' }).or(c.locator('summary[aria-label="Opciones de la pieza"]')).first().click();
  await page.waitForTimeout(300);
  return c;
}

const SCENES: Scene[] = [
  { nn: '01', name: 'tablero', who: 'jefe', go: (p) => go(p, '/redes') },
  { nn: '02', name: 'tablero-trimestre', who: 'jefe', go: (p) => go(p, '/redes?vista=trimestre') },
  {
    nn: '03',
    name: 'salto-desde-un-numero',
    who: 'jefe',
    go: async (p) => {
      await go(p, '/redes');
      await p.getByRole('link', { name: /^Reels, Imagen faltante: \d+\. Ir a la siguiente$/ }).first().click();
      await p.waitForURL(/\/redes\/reels/);
      await settled(p);
    },
  },
  { nn: '04', name: 'reels', who: 'redes', go: (p) => go(p, '/redes/reels') },
  {
    nn: '05',
    name: 'posts',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/posts');
      await openCard(p, 'Tips para ahorrar agua');
    },
  },
  {
    nn: '06',
    name: 'carrusel',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/carruseles');
      const first = p.locator('main article').first();
      await first.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 }));
    },
  },
  { nn: '07', name: 'historia', who: 'redes', go: (p) => go(p, '/redes/historias') },
  { nn: '08', name: 'youtube', who: 'redes', go: (p) => go(p, '/redes/youtube') },
  { nn: '09', name: 'fin-de-mes', who: 'jefe', go: (p) => go(p, '/redes/fin-de-mes') },
  { nn: '10', name: 'feed', who: 'redes', full: true, go: (p) => go(p, '/redes/feed') },
  {
    nn: '11',
    name: 'selector-formatos',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/feed');
      await p.locator('main li[data-num]:not([data-piece]) button').first().click();
      await p.getByRole('dialog').waitFor();
      await p.waitForTimeout(400);
    },
  },
  {
    nn: '12',
    name: 'selector-titulos',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/feed');
      await p.locator('main li[data-num]:not([data-piece]) button').first().click();
      const sheet = p.getByRole('dialog');
      await sheet.waitFor();
      await sheet.getByRole('button', { name: /^Posts/ }).click();
      await p.waitForTimeout(400);
    },
  },
  {
    nn: '13',
    name: 'publicado-en-verde',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/reels');
      await openCard(p, 'Cancha techada de El Mirador');
    },
  },
  {
    nn: '14',
    name: 'meses-con-cupo',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/posts');
      await go(p, `/redes/posts?mes=${await monthId(p, 2)}`);
    },
  },
  {
    nn: '15',
    name: 'mover-a-otro-mes',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/posts');
      const c = await openPieceMenu(p, 'Tips para ahorrar agua');
      await c.getByRole('button', { name: 'Mover a otro mes' }).click();
      await p.getByRole('dialog', { name: 'Mover a otro mes' }).waitFor();
      await p.waitForTimeout(400);
    },
  },
  {
    nn: '16',
    name: 'borrar-un-mes',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/posts');
      await go(p, `/redes/posts?mes=${await monthId(p, 1)}`);
      const menu = p.locator('summary[aria-label^="Opciones de Mes 2"]');
      await menu.click();
      await p.getByRole('button', { name: 'Borrar este mes' }).first().click();
      await p.getByRole('dialog').or(p.getByRole('alertdialog')).first().waitFor();
      await p.waitForTimeout(400);
    },
  },
  {
    nn: '17',
    name: 'diseno-desaprobado',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/posts');
      const c = await openCard(p, 'Nuestro café de altura');
      await c.getByText('¿Qué no le gustó del diseño?').first().scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 120));
    },
  },
  {
    nn: '18',
    name: 'tarjeta-plegada',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/reels');
      const c = card(p, 'Cancha techada de El Mirador');
      const fold = c.getByRole('button', { name: 'Plegar' });
      if (await fold.count()) await fold.click();
      await c.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 }));
      await p.waitForTimeout(400);
    },
  },
  {
    nn: '19',
    name: 'antes-de-publicar',
    who: 'redes',
    go: async (p) => {
      await go(p, '/redes/posts');
      const c = await openCard(p, 'La vecina que volvió a tener agua');
      await c.getByText('Antes de publicar:').first().evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120 }));
      await p.waitForTimeout(300);
    },
  },
  { nn: '20', name: 'busqueda', who: 'redes', go: (p) => go(p, '/redes/buscar?q=agua') },
  { nn: '21', name: 'crear', who: 'redes', go: async (p) => { await go(p, '/redes?crear=1'); await p.getByRole('dialog').waitFor(); await p.waitForTimeout(400); } },
  { nn: '22', name: 'barra-de-secciones', who: 'redes', go: (p) => go(p, '/redes/posts') },
];

// Every context: 360's offer of tutorials off, the tips and the demo notice already seen on this «phone» (they are part
// of the app, but they would cover what each scene compares).
async function newSession(browser: Browser, who: Who, size: Size): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: size.w, height: size.h }, locale: 'es-VE', timezoneId: 'America/Caracas', deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === 'fb:360:oferta:off') return '1';
      if (key.startsWith('fb:tip:') || key.startsWith('fb:redes:demo-notice:')) return 'done';
      return get.call(this, key);
    };
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/entrar`);
  const label = who === 'jefe' ? 'El jefe' : 'Redes';
  await page.getByRole('button', { name: new RegExp(`^Entrar como ${label}`) }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 30_000 });
  return page;
}

async function main() {
  const only = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer();
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
    try {
      for (const size of SIZES) {
        const sessions = new Map<Who, Page>();
        for (const scene of SCENES) {
          if (only.length && !only.includes(scene.nn)) continue;
          if (!sessions.has(scene.who)) sessions.set(scene.who, await newSession(browser, scene.who, size));
          const page = sessions.get(scene.who)!;
          await page.keyboard.press('Escape').catch(() => {});
          const file = path.join(OUT, `${scene.nn}-${scene.name}-fb-${size.w}.jpg`);
          try {
            await scene.go(page, size);
            await page.screenshot({ path: file, type: 'jpeg', quality: 75, fullPage: !!scene.full });
            console.log('Escrita:', path.relative(root, file));
          } catch (e) {
            console.error(`No se pudo la escena ${scene.nn} (${scene.name}) a ${size.w}:`, (e as Error).message.split('\n')[0]);
          }
        }
        for (const page of sessions.values()) await page.context().close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server?.kill();
  }
}

await main();
