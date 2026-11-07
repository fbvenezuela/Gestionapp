// The real-site build when the official site misbehaves (review of 07/11), against the INVENTED site of
// tests/fixtures/real-site: a page served once as a photo is not kept, a long photo address never spoils the whole run,
// the site's name not answering, a home without its weekly, the parts of one broadcast, the automatic switch only for
// the demo's own repository, answers too big to read, hostile PDFs and feeds, nothing older than a week from an
// earlier build, AVIF photos as WebP, the pages' cache key, and the wiring that makes the real content exist on Vercel
// at all.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REAL_SITE, REAL_LAST_GOOD_MAX_MS, noteSeeded, realContentShown, realContentToken, realIds } from '@/lib/web/real-site';
import { buildSnapshot, editionTitle } from '../../scripts/real-site/build';
import { readRealSnapshot } from '../../scripts/real-site/cache';
import { carryOver, leftOut, prebuild, tooOld } from '../../scripts/real-site/prebuild';
import { driveFileId, findSemanario, pdfPageCount } from '../../scripts/real-site/semanario';
import { buildDecision } from '../../scripts/real-site/settings';
import { Deadline, avifAsWebp, networkSources } from '../../scripts/real-site/sources';
import { episodeSlugs, latestEpisodes } from '../../scripts/real-site/youtube';
import { fetchPhoto } from '../../scripts/web-import/media';
import { noPii } from '../../scripts/web-import/pii';
import { PoliteHttp } from '../../scripts/web-import/wp-client';
import { DEMO_ACCOUNTS, DEMO_HOST, DEMO_REAL_CONFIG, HOME_HTML, demoClientConfig, fakeFetcher } from '../fixtures/real-site/site';

const instant = () => Promise.resolve();
const quiet = { log: () => {}, warn: () => {} };
const APP = path.resolve(__dirname, '../..');

async function build(fetcher: ReturnType<typeof fakeFetcher> | ((u: string, i: RequestInit) => Promise<Response>)) {
  const deadline = new Deadline(60_000);
  try {
    return await buildSnapshot(
      {
        config: DEMO_REAL_CONFIG, programName: 'Programa Demo', tz: 'America/Caracas', accounts: DEMO_ACCOUNTS,
        fallbackIdentity: { name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' }, now: new Date('2026-11-06T12:00:00Z'),
      },
      networkSources({ config: DEMO_REAL_CONFIG, fetcher, deadline, cache: null, apiDelayMs: 0, fileDelayMs: 0, sleep: instant }),
    );
  } finally {
    deadline.dispose();
  }
}

/** The invented site, with some of its answers changed. */
function bent(change: (url: string, init: RequestInit, base: ReturnType<typeof fakeFetcher>) => Promise<Response | null> | null) {
  const base = fakeFetcher();
  return async (url: string, init: RequestInit) => (await change(url, init, base)) ?? base(url, init);
}

describe('una foto que una vez llegó como página', () => {
  it('no se guarda: la siguiente construcción la pide otra vez y queda bien', async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-poison-'));
    const target = `https://${DEMO_HOST}/wp-content/uploads/2026/10/cancha-1024x683.jpg`;
    let poison = true;
    const asked: string[] = [];
    const fetcher = bent((url) => {
      asked.push(url);
      return poison && url === target ? Promise.resolve(new Response('<html>Acceso restringido (demo)</html>', { status: 200, headers: { 'content-type': 'text/html' } })) : null;
    });
    const opts = { appDir: app, env: { REAL_SITE_CONTENT: '1' }, config: demoClientConfig(), ...quiet, sleep: instant, delays: { api: 0, files: 0 }, fetcher };
    const coverOf = () => {
      const s = readRealSnapshot(path.join(app, REAL_SITE.dir))!;
      const it = s.items.find((i) => i.id === realIds.news(9101))!;
      const m = s.media.find((x) => x.id === (it.draft as { coverId: string }).coverId)!;
      return `${m.width}x${m.height}`;
    };
    expect((await prebuild(opts)).status).toBe('written');
    expect(coverOf()).not.toBe('1024x683');
    poison = false;
    asked.length = 0;
    expect((await prebuild(opts)).status).toBe('written');
    expect(asked).toContain(target);
    expect(coverOf()).toBe('1024x683');
  }, 60_000);
});

describe('lo que quedó fuera nunca tumba la foto entera', () => {
  it('una foto saltada con un nombre muy largo: la razón y la referencia se cortan, la foto se arma', async () => {
    const oldUrl = `https://${DEMO_HOST}/wp-content/uploads/2026/10/vacuna.avif`;
    const longUrl = `https://${DEMO_HOST}/wp-content/uploads/2026/10/${'nota-inventada-de-prueba-demo-'.repeat(9)}foto.avif`;
    const fetcher = bent(async (url, init, base) => {
      if (url === longUrl) return base(oldUrl, init);
      if (new URL(url).pathname !== '/wp-json/wp/v2/media') return null;
      const res = await base(url, init);
      return new Response((await res.text()).split(oldUrl).join(longUrl), { status: 200, headers: res.headers });
    });
    const r = await build(fetcher);
    expect(r.snapshot.report.news).toBe(3);
    const refs = r.snapshot.report.skipped.map((s) => s.ref);
    expect(refs.some((x) => x.includes('nota-inventada-de-prueba'))).toBe(true);
    for (const s of r.snapshot.report.skipped) {
      expect(s.ref.length).toBeLessThanOrEqual(300);
      expect(s.reason.length).toBeLessThanOrEqual(300);
    }
  }, 30_000);

  it('el nombre del sitio no responde (401): el del cliente, y lo demás igual', async () => {
    const fetcher = bent((url) => (new URL(url).pathname.startsWith('/wp-json/') && !new URL(url).pathname.startsWith('/wp-json/wp/') ? Promise.resolve(new Response('no (demo)', { status: 401 })) : null));
    const r = await build(fetcher);
    expect(r.snapshot.identity).toEqual({ name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' });
    expect(r.snapshot.report.news).toBe(3);
    expect(r.snapshot.report.skipped.some((s) => s.ref === '/wp-json/')).toBe(true);
  }, 30_000);

  it('una portada sin su Semanario (o que no responde) cuenta como el Semanario caído: sale de la copia anterior', async () => {
    const gone = bent((url) => (new URL(url).pathname === '/' ? Promise.resolve(new Response('No (demo)', { status: 404 })) : null));
    const r = await build(gone);
    expect(r.failed).toContain('semanario');
    const redesigned = bent((url) => (new URL(url).pathname === '/' ? Promise.resolve(new Response('<html><h2>Otra cosa (demo)</h2></html>', { status: 200, headers: { 'content-type': 'text/html' } })) : null));
    expect((await build(redesigned)).failed).toContain('semanario');
    // A heading that starts with the word, and Drive's download address, still count.
    const html = HOME_HTML.replace('<h2>Semanario</h2>', '<h2>Semanario El Informativo (demo)</h2>').replace(
      'https://drive.google.com/file/d/ArchivoDePruebaDemo0001/view?usp=sharing',
      'https://drive.usercontent.google.com/download?id=ArchivoDePruebaDemo0001&amp;export=download',
    );
    expect(findSemanario(html, `https://${DEMO_HOST}`)?.driveId).toBe('ArchivoDePruebaDemo0001');
    expect(driveFileId('https://drive.usercontent.google.com/download?id=ArchivoDePruebaDemo0001')).toBe('ArchivoDePruebaDemo0001');
    expect(driveFileId('https://otro.test/download?id=ArchivoDePruebaDemo0001')).toBeNull();
  }, 60_000);

  it('el registro de la construcción cuenta lo que quedó fuera en singular y en plural', () => {
    expect([leftOut(0), leftOut(1), leftOut(4)]).toEqual(['nada quedó fuera', '1 cosa quedó fuera', '4 cosas quedaron fuera']);
  });

  it('el título del Semanario cuando su archivo no dice nada: el día de la edición', () => {
    expect(editionTitle('2026-03-02')).toBe('Edición del 2 de marzo de 2026');
  });
});

describe('las emisiones', () => {
  const P = 'Programa Demo';
  it('las partes de una emisión cuentan una vez; la dirección simple es de la primera que se subió, o de la más larga', () => {
    const parts = [
      { videoId: 'demoParte003', title: 'Tercera parte | Programa Demo 12', published: '2026-10-30T18:15:09.000Z' },
      { videoId: 'demoParte001', title: 'Programa Demo 12 completo', published: '2026-10-30T18:15:00.000Z' },
      { videoId: 'demoParte002', title: 'Segunda parte | Programa Demo 12', published: '2026-10-30T18:15:05.000Z' },
      { videoId: 'demoVideo011', title: 'Programa Demo 11', published: '2026-10-23T18:00:00.000Z' },
      { videoId: 'demoVideo010', title: 'Programa Demo 10', published: '2026-10-16T18:00:00.000Z' },
    ];
    expect(latestEpisodes(parts, 2, P).map((e) => e.videoId)).toEqual(['demoParte003', 'demoParte001', 'demoParte002', 'demoVideo011']);
    const slugs = episodeSlugs(parts, P);
    expect(slugs.get('demoParte001')).toBe('programa-demo-12');
    expect(slugs.get('demoParte002')).toBe('programa-demo-12-demoparte002');
    // A later part never takes the broadcast's address.
    expect(episodeSlugs([{ videoId: 'demoParte009', title: 'Otra parte | Programa Demo 12', published: '2026-10-31T10:00:00.000Z' }, ...parts], P).get('demoParte001')).toBe('programa-demo-12');
    // With the lengths (the official API), the longest is the broadcast.
    const timed = parts.map((e) => ({ ...e, minutes: e.videoId === 'demoParte002' ? 95 : 4 }));
    expect(episodeSlugs(timed, P).get('demoParte002')).toBe('programa-demo-12');
  });
});

describe('el interruptor automático, solo para el repositorio de la demo', () => {
  const prod = { VERCEL: '1', VERCEL_ENV: 'production' };
  it('el despliegue de producción de otra copia del repositorio no lo enciende; REAL_SITE_CONTENT=1 sí', () => {
    expect(buildDecision({ ...prod, VERCEL_GIT_REPO_OWNER: 'organizacion-demo', VERCEL_GIT_REPO_SLUG: 'Repo-Demo' }, true, 'organizacion-demo/repo-demo').on).toBe(true);
    const fork = buildDecision({ ...prod, VERCEL_GIT_REPO_OWNER: 'otra-persona', VERCEL_GIT_REPO_SLUG: 'Repo-Demo' }, true, 'organizacion-demo/repo-demo');
    expect(fork.on).toBe(false);
    expect(fork.why).toMatch(/otra-persona\/Repo-Demo/);
    expect(buildDecision({ ...prod }, true, 'organizacion-demo/repo-demo').on).toBe(false);
    expect(buildDecision({ ...prod, REAL_SITE_CONTENT: '1', VERCEL_GIT_REPO_OWNER: 'otra-persona' }, true, 'organizacion-demo/repo-demo').on).toBe(true);
  });

  it('apagado dice qué vio de las variables de Vercel (ninguna es secreta)', () => {
    expect(buildDecision({ VERCEL: '1', VERCEL_ENV: 'preview' }, true).why).toMatch(/VERCEL=1, VERCEL_ENV=preview/);
    expect(buildDecision({}, true).why).toMatch(/VERCEL=\(vacía\), VERCEL_ENV=\(vacía\)/);
  });

  it('la configuración del cliente nombra su repositorio', () => {
    const cfg = demoClientConfig() as unknown as { web: { realSite: { vercelRepo?: string } } };
    expect(JSON.parse(fs.readFileSync(path.join(APP, 'config/clients/fb.json'), 'utf8')).web.realSite.vercelRepo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(cfg.web.realSite.vercelRepo).toBeUndefined();
  });
});

describe('respuestas demasiado grandes y archivos hostiles', () => {
  it('un JSON más grande que su tope se rechaza antes de leerlo entero', async () => {
    const big = new Response(`[${'"x",'.repeat(300_000)}"x"]`, { status: 200, headers: { 'content-type': 'application/json' } });
    const http = new PoliteHttp({ fetcher: async () => big, allowedHosts: [DEMO_HOST], delayMs: 0, sleep: instant });
    await expect(http.json(`https://${DEMO_HOST}/wp-json/`, 64 * 1024)).rejects.toThrow(/demasiados datos/);
  });

  it('las páginas de un PDF hostil se cuentan de una pasada; las de uno normal, bien', () => {
    const t0 = Date.now();
    expect(pdfPageCount(new TextEncoder().encode('%PDF-1.4 ' + '/Count 1 '.repeat(250_000)))).toBeNull();
    expect(pdfPageCount(new TextEncoder().encode('%PDF-1.4 ' + '/Type/Pages '.repeat(250_000)))).toBeNull();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(pdfPageCount(new TextEncoder().encode('%PDF-1.4\n17 0 obj\n<</Count 5/Kids[22 0 R 1 0 R 5 0 R 9 0 R 13 0 R]/Type/Pages>>\nendobj\n'))).toBe(5);
    expect(pdfPageCount(new TextEncoder().encode('%PDF-1.4\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj'))).toBe(1);
  });
});

describe('nada de más de una semana vuelve de una construcción anterior', () => {
  it('la copia anterior vieja no se usa: la demo sale con lo inventado', async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-old-'));
    const opts = { appDir: app, env: { REAL_SITE_CONTENT: '1' }, config: demoClientConfig(), ...quiet, sleep: instant, delays: { api: 0, files: 0 } };
    const day = (d: string) => () => new Date(`${d}T12:00:00Z`);
    expect((await prebuild({ ...opts, fetcher: fakeFetcher(), now: day('2026-11-01') })).status).toBe('written');
    // Five days later the site is down: the copy is used.
    expect((await prebuild({ ...opts, fetcher: fakeFetcher({ wordpressDown: true }), now: day('2026-11-06') })).status).toBe('reused');
    // Ten days later it is too old.
    const late = await prebuild({ ...opts, fetcher: fakeFetcher({ wordpressDown: true }), now: day('2026-11-11') });
    expect(late.status).toBe('none');
    expect(fs.existsSync(path.join(app, REAL_SITE.dir))).toBe(false);
  }, 60_000);

  it('una parte traída de antes conserva el día en que se leyó, y pasada la semana ya no se trae', async () => {
    const first = await build(fakeFetcher());
    const last = { snapshot: first.snapshot, dir: os.tmpdir() };
    const down = await build(fakeFetcher({ youtubeDown: true }));
    expect(down.failed).toContain('youtube');
    const files = new Map(first.files);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-last-'));
    fs.mkdirSync(path.join(dir, REAL_SITE.media), { recursive: true });
    for (const m of first.snapshot.media) fs.writeFileSync(path.join(dir, REAL_SITE.media, m.key), files.get(m.key)!);
    const soon = carryOver(down, { ...last, dir }, new Date('2026-11-08T12:00:00Z'));
    expect(soon.snapshot.report.carriedOver).toEqual(['youtube']);
    expect(soon.snapshot.report.partsSince?.youtube).toBe(first.snapshot.fetchedAt);
    // The episodes' accounts stay verified; the home's too.
    expect(soon.snapshot.accounts.verifiedHandles).toEqual(first.snapshot.accounts.verifiedHandles);
    const later = carryOver(down, { snapshot: soon.snapshot, dir }, new Date('2026-11-14T12:00:00Z'));
    expect(later.snapshot.report.carriedOver ?? []).toEqual([]);
    expect(later.snapshot.items.filter((i) => i.kind === 'episode')).toEqual([]);
    expect(tooOld(new Date(Date.now() - REAL_LAST_GOOD_MAX_MS - 1000).toISOString(), new Date())).toBe(true);
  }, 60_000);
});

describe('las fotos en AVIF', () => {
  it('salen en WebP, sin metadatos, y pasan los controles de la biblioteca', async (ctx) => {
    const sharp = await import('sharp').then((m) => m.default).catch(() => null);
    if (!sharp) return ctx.skip();
    const avif = new Uint8Array(await sharp({ create: { width: 320, height: 200, channels: 3, background: '#6b7a3a' } }).avif({ quality: 50 }).toBuffer());
    const webp = await avifAsWebp(avif);
    expect(webp && new TextDecoder('latin1').decode(webp.subarray(8, 12))).toBe('WEBP');
    expect(await avifAsWebp(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    const photo = await fetchPhoto({ bytes: async () => webp }, { key: 'url:x', url: `https://${DEMO_HOST}/wp-content/uploads/2026/10/x.avif`, fallbackUrl: null, oldPath: null, alt: 'Foto de prueba (demo)', caption: '', altMissing: false, bytes: null, external: false, pii: noPii() });
    expect(photo).toMatchObject({ ok: true, mime: 'image/webp', width: 320, height: 200 });
  });
});

describe('lo que hace que el contenido real exista en Vercel', () => {
  it('vercel.json corre npm run build, package.json su prebuild, y next.config manda la foto y sus archivos', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(APP, 'vercel.json'), 'utf8'));
    expect(vercel.buildCommand).toBe('npm run build');
    const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
    expect(pkg.scripts.prebuild).toBe('tsx scripts/real-site/snapshot.mts');
    expect(pkg.scripts.build).toBe('next build');
    const next = fs.readFileSync(path.join(APP, 'next.config.ts'), 'utf8');
    expect(next).toContain(`'./.real-site/snapshot.json'`);
    expect(next).toMatch(/'\/api\/archivos\/web\/\*': \['\.\/\.real-site\/media\/\*'\]/);
    expect(fs.readFileSync(path.join(APP, '.gitignore'), 'utf8')).toMatch(/^\/?\.real-site\/?$/m);
  });
});

describe('la clave de la caché de las páginas', () => {
  const g = globalThis as unknown as { __fbRealSnapshot?: { value: unknown }; __fbRealSeeded?: string; __fbProcessToken?: string };
  const before = { snap: g.__fbRealSnapshot, seeded: g.__fbRealSeeded, token: g.__fbProcessToken };
  afterEach(() => {
    vi.unstubAllEnvs();
    g.__fbRealSnapshot = before.snap;
    g.__fbRealSeeded = before.seeded;
    g.__fbProcessToken = before.token;
  });

  it('sigue lo que se sembró, no el archivo; con el contenido real, cada servidor y cada despliegue tienen la suya', () => {
    g.__fbRealSnapshot = { value: null };
    expect(realContentToken()).toBe('invented');
    // The loader is off under the tests: its memo stands in for a server with the real content.
    g.__fbRealSnapshot = { value: { fetchedAt: '2026-11-06T12:00:00.000Z', media: [], items: [] } };
    delete g.__fbRealSeeded;
    delete g.__fbProcessToken;
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    const one = realContentToken();
    expect(one).toMatch(/^real:2026-11-06T12:00:00\.000Z:[0-9a-f]{12}$/);
    expect(realContentToken()).toBe(one);
    // Another server process: its own entries, so what someone edits in one demo database never reaches the others.
    delete g.__fbProcessToken;
    const other = realContentToken();
    expect(other).not.toBe(one);
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_Demo/123');
    expect(realContentToken()).toBe(other.replace('Z:', 'Z:dpl_Demo123:'));
    // The seed fell back to the invented content: the keys (and the locked settings) follow it.
    noteSeeded('invented');
    expect(realContentToken()).toBe('invented');
    expect(realContentShown()).toBe(false);
    noteSeeded('real');
    expect(realContentShown()).toBe(true);
  });
});
