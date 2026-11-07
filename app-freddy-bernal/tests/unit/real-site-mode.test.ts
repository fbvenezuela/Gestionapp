// «Contenido real» on or off (design §1): at build time only for the demo (no DATABASE_URL) with the official site in
// the config, by REAL_SITE_CONTENT or by Vercel's production deployment, never in GitHub's CI; at runtime only with the
// snapshot next to the app, outside the tests and unless REAL_SITE_CONTENT=0 (Playwright). Off, the prebuild removes any
// stale .real-site/ at once; when the official site does not answer it keeps the last good copy, or writes nothing.
// Everything here is invented: the «official site» is a fake fetch (tests/fixtures/real-site/site.ts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { REAL_SITE, loadRealSnapshot, realModeAtRuntime, switchOf } from '@/lib/web/real-site';
import { readRealSnapshot } from '../../scripts/real-site/cache';
import { buildDecision, programNameOf, readRealSiteConfig } from '../../scripts/real-site/settings';
import { prebuild } from '../../scripts/real-site/prebuild';
import { demoClientConfig, fakeFetcher } from '../fixtures/real-site/site';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-mode-'));
const instant = () => Promise.resolve();
const quiet = { log: () => {}, warn: () => {} };

describe('el interruptor al construir', () => {
  const on = (env: Record<string, string | undefined>, source = true) => buildDecision(env, source).on;

  it('se enciende con REAL_SITE_CONTENT=1/true, o solo en el despliegue de producción de Vercel', () => {
    expect(on({ REAL_SITE_CONTENT: '1' })).toBe(true);
    expect(on({ REAL_SITE_CONTENT: 'true' })).toBe(true);
    expect(on({ REAL_SITE_CONTENT: ' TRUE ' })).toBe(true);
    expect(on({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
    expect(on({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
    expect(on({ VERCEL: '1', VERCEL_ENV: 'development' })).toBe(false);
    expect(on({})).toBe(false);
  });

  it('nunca con la base real, sin el sitio en la configuración, con REAL_SITE_CONTENT=0 ni en el CI de GitHub', () => {
    expect(on({ REAL_SITE_CONTENT: '1', DATABASE_URL: 'postgres://demo' })).toBe(false);
    expect(on({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: 'postgres://demo' })).toBe(false);
    expect(on({ REAL_SITE_CONTENT: '1' }, false)).toBe(false);
    expect(on({ VERCEL: '1', VERCEL_ENV: 'production', REAL_SITE_CONTENT: '0' })).toBe(false);
    expect(on({ VERCEL: '1', VERCEL_ENV: 'production', REAL_SITE_CONTENT: 'false' })).toBe(false);
    expect(on({ CI: 'true', GITHUB_ACTIONS: 'true' })).toBe(false);
    expect(buildDecision({ CI: 'true', GITHUB_ACTIONS: 'true' }, true).why).toMatch(/sin REAL_SITE_CONTENT/);
  });

  it('el bloque web.realSite de la configuración: solo identificadores públicos, bien formados', () => {
    const r = readRealSiteConfig((getClientConfig().web as { realSite?: unknown }).realSite);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({ bioPostId: 1902, officePostIds: [10346, 25270], heroMediaId: 14671, bioMediaId: 25275, maxNews: 48, maxOpinion: 8, maxEpisodes: 12 });
    expect(r.config.source).not.toMatch(/^https?:/);
    expect(JSON.stringify(r.config)).not.toMatch(/drive\.google|docs\.google/i);
    expect(r.config.youtube.playlistId).toBe(`UULF${r.config.youtube.channelId.slice(2)}`);
    expect(readRealSiteConfig(undefined)).toEqual({ ok: false, error: null });
    expect(readRealSiteConfig({ source: 'https://otro.test' })).toMatchObject({ ok: false });
    expect(programNameOf('Programa Demo 2.0')).toBe('Programa Demo');
    expect(programNameOf('Programa Demo')).toBe('Programa Demo');
  });
});

describe('el interruptor al arrancar', () => {
  it('solo con el archivo, sin DATABASE_URL, fuera de las pruebas y sin REAL_SITE_CONTENT=0', () => {
    expect(realModeAtRuntime({}, true)).toBe(true);
    expect(realModeAtRuntime({ REAL_SITE_CONTENT: '1' }, true)).toBe(true);
    expect(realModeAtRuntime({}, false)).toBe(false);
    expect(realModeAtRuntime({ DATABASE_URL: 'postgres://demo' }, true)).toBe(false);
    expect(realModeAtRuntime({ VITEST: 'true' }, true)).toBe(false);
    expect(realModeAtRuntime({ REAL_SITE_CONTENT: '0' }, true)).toBe(false);
    expect(realModeAtRuntime({ REAL_SITE_CONTENT: 'false' }, true)).toBe(false);
    expect(switchOf(undefined)).toBeNull();
    expect(switchOf('quizás')).toBeNull();
  });
});

describe('el prebuild', () => {
  afterEach(() => vi.restoreAllMocks());

  it('apagado: borra un .real-site/ viejo, no pide nada a nadie y termina enseguida', async () => {
    const app = tmp();
    fs.mkdirSync(path.join(app, REAL_SITE.dir, REAL_SITE.media), { recursive: true });
    fs.writeFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.file), '{"viejo":true}');
    const fetcher = fakeFetcher();
    const t0 = Date.now();
    const r = await prebuild({ appDir: app, env: {}, config: demoClientConfig(), fetcher, ...quiet });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r).toMatchObject({ status: 'off' });
    expect(fs.existsSync(path.join(app, REAL_SITE.dir))).toBe(false);
    expect(fetcher.seen).toEqual([]);
    // With the real database it is off too, whatever the switch says.
    fs.mkdirSync(path.join(app, REAL_SITE.dir), { recursive: true });
    expect(await prebuild({ appDir: app, env: { REAL_SITE_CONTENT: '1', DATABASE_URL: 'postgres://demo' }, config: demoClientConfig(), fetcher, ...quiet })).toMatchObject({ status: 'off' });
    expect(fs.existsSync(path.join(app, REAL_SITE.dir))).toBe(false);
  });

  it('sin la web oficial y sin copia anterior: no escribe nada (la demo sale inventada) y avisa fuerte', async () => {
    const app = tmp();
    const warn = vi.fn();
    const r = await prebuild({
      appDir: app, env: { REAL_SITE_CONTENT: '1' }, config: demoClientConfig(), fetcher: fakeFetcher({ wordpressDown: true }),
      log: () => {}, warn, sleep: instant, delays: { api: 0, files: 0 },
    });
    expect(r.status).toBe('none');
    expect(fs.existsSync(path.join(app, REAL_SITE.dir))).toBe(false);
    expect(warn.mock.calls.join(' ')).toMatch(/INVENTADO/);
  });

  it('con la web oficial caída usa la última copia buena; si tarda demasiado, se corta a tiempo', async () => {
    const app = tmp();
    const env = { REAL_SITE_CONTENT: '1' };
    const first = await prebuild({ appDir: app, env, config: demoClientConfig(), fetcher: fakeFetcher(), ...quiet, sleep: instant, delays: { api: 0, files: 0 } });
    expect(first.status).toBe('written');
    const before = fs.readFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.file), 'utf8');
    fs.rmSync(path.join(app, REAL_SITE.dir), { recursive: true });

    const down = await prebuild({ appDir: app, env, config: demoClientConfig(), fetcher: fakeFetcher({ wordpressDown: true }), ...quiet, sleep: instant, delays: { api: 0, files: 0 } });
    expect(down.status).toBe('reused');
    expect(fs.readFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.file), 'utf8')).toBe(before);
    expect(readRealSnapshot(path.join(app, REAL_SITE.dir))).not.toBeNull();

    // A site that never answers: the time budget ends the run and the last good copy stays.
    const hanging = (async (_u: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('cortado (demo)'))))) as Parameters<typeof prebuild>[0]['fetcher'];
    const t0 = Date.now();
    const slow = await prebuild({ appDir: app, env: { ...env, REAL_SITE_BUDGET_S: '1' }, config: demoClientConfig(), fetcher: hanging, ...quiet, delays: { api: 0, files: 0 } });
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(slow.status).toBe('reused');
  }, 60_000);
});

describe('la lectura al arrancar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { __fbRealSnapshot?: unknown }).__fbRealSnapshot;
  });

  it('dentro de las pruebas nunca lee la foto, aunque esté junto a la app (y lo recuerda por proceso)', async () => {
    const app = tmp();
    await prebuild({ appDir: app, env: { REAL_SITE_CONTENT: '1' }, config: demoClientConfig(), fetcher: fakeFetcher(), ...quiet, sleep: instant, delays: { api: 0, files: 0 } });
    expect(readRealSnapshot(path.join(app, REAL_SITE.dir))).not.toBeNull();
    vi.spyOn(process, 'cwd').mockReturnValue(app);
    expect(process.env.VITEST).toBeTruthy();
    expect(loadRealSnapshot()).toBeNull();
    // Memoized: a second read does not look at the disk again.
    const exists = vi.spyOn(fs, 'existsSync');
    expect(loadRealSnapshot()).toBeNull();
    expect(exists).not.toHaveBeenCalled();
  });

  it('una foto rota o con otra forma no se usa: la demo sigue inventada', () => {
    const app = tmp();
    fs.mkdirSync(path.join(app, REAL_SITE.dir));
    fs.writeFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.file), '{"version":1');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(readRealSnapshot(path.join(app, REAL_SITE.dir))).toBeNull();
    fs.writeFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.file), JSON.stringify({ version: 1, items: [] }));
    expect(readRealSnapshot(path.join(app, REAL_SITE.dir))).toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
    expect(readRealSnapshot(path.join(app, 'no-existe'))).toBeNull();
  });
});
