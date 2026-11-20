// The real-content fixture of the e2e (wave 0 of the new website): an INVENTED official site (tests/fixtures/real-site/
// snapshot-site.ts and its drawings) that the app's own build code turns into a folder laid out like the .real-site/ a
// demo build writes; a server reads it through REAL_SITE_DIR (the Playwright project «real-fixture» makes it and starts
// one). Made here into a temporary folder, with the build code of the day: everything must be invented and marked, small,
// and exactly what the app's schema accepts.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { REAL_SITE, parseRealSnapshot, realSiteDirFromEnv, type RealSnapshot } from '@/lib/web/real-site';
import { writeRealSite } from '../../scripts/real-site/cache';
import { programNameOf } from '../../scripts/real-site/settings';
import { FIXTURE_HOST, FIXTURE_NOW, fixtureSnapshot } from '../fixtures/real-site/snapshot-site';

const cfg = getClientConfig();
let DIR = '';
let parsed: ReturnType<typeof parseRealSnapshot>;
let snap: RealSnapshot;
let hosts: string[] = [];

beforeAll(async () => {
  DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-real-fixture-test-'));
  const made = await fixtureSnapshot(cfg);
  hosts = made.hosts;
  writeRealSite(DIR, made.snapshot, made.files);
  // Read back as a server reads it: the file's text, checked again by the app's schema.
  parsed = parseRealSnapshot(JSON.parse(fs.readFileSync(path.join(DIR, REAL_SITE.file), 'utf8')));
  snap = (parsed.ok ? parsed.snapshot : null) as RealSnapshot;
}, 120_000);
afterAll(() => {
  if (DIR) fs.rmSync(DIR, { recursive: true, force: true });
});

describe('el contenido real de prueba (inventado) que lee REAL_SITE_DIR', () => {
  it('lo acepta el esquema de la app, tal como lo lee un servidor; nada se pidió fuera de los sitios inventados', () => {
    expect(parsed.ok ? 'ok' : parsed.error).toBe('ok');
    expect(snap.fetchedAt).toBe(FIXTURE_NOW.toISOString());
    expect(new URL(snap.source).hostname).toBe(FIXTURE_HOST);
    expect(snap.report.skipped).toEqual([]);
    for (const h of hosts) expect([FIXTURE_HOST, 'www.youtube.com', 'i.ytimg.com', 'drive.google.com', 'drive.usercontent.google.com'], h).toContain(h);
  });

  it('cada archivo está con sus bytes y su huella, y no hay otros; todo junto pesa menos de 1 MB', () => {
    const files = fs.readdirSync(path.join(DIR, REAL_SITE.media)).sort();
    expect(files).toEqual(snap.media.map((m) => m.key).sort());
    let total = fs.statSync(path.join(DIR, REAL_SITE.file)).size;
    for (const m of snap.media) {
      const bytes = fs.readFileSync(path.join(DIR, REAL_SITE.media, m.key));
      expect(bytes.length, m.key).toBe(m.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), m.key).toBe(m.sha256);
      total += bytes.length;
    }
    expect(total).toBeLessThan(1024 * 1024);
  });

  it('trae lo que las pantallas del modo real muestran: la foto de portada, noticias con foto, opinión, emisiones en partes y el Semanario', () => {
    const kinds = (k: string) => snap.items.filter((i) => i.kind === k);
    const news = kinds('news').map((i) => i.draft as { category?: string; coverId?: string });
    expect(snap.pages.heroMediaId).toBeTruthy();
    expect(snap.pages.bioMediaId).toBeTruthy();
    expect(news.filter((d) => d.category === 'noticia' && d.coverId).length).toBeGreaterThanOrEqual(4);
    expect(news.filter((d) => d.category === 'articulo').length).toBe(2);
    const episodes = kinds('episode').map((i) => i.slug);
    const program = programNameOf(cfg.brand.programName).toLowerCase().replace(/\s+/g, '-');
    expect(episodes).toEqual([`${program}-42`, `${program}-42-fixtemisi2b`, `${program}-41`]);
    expect(kinds('document')).toHaveLength(1);
  });

  it('todo está marcado (demo), sin nombre de nadie, sin cuentas reales y con direcciones que no existen', () => {
    for (const it of snap.items) expect(String((it.draft as { title?: unknown }).title), it.slug).toMatch(/\(demo\)$/);
    for (const part of ['biography', 'office', 'honors'] as const) {
      expect(snap.pages[part].length, part).toBeGreaterThan(0);
      for (const node of snap.pages[part]) {
        // The build heads each note of the office page with its date («30 de mayo de 2025»): the rest says (demo).
        const n = node as { type: string; text?: string };
        if (n.type === 'heading' && /^\d{1,2} de [a-z]+ de \d{4}$/.test(n.text ?? '')) continue;
        expect(JSON.stringify(node), part).toMatch(/\(demo\)/);
      }
    }
    // The client's name is only the site's identity (from the config); the program's name only in its episodes' titles.
    const program = programNameOf(cfg.brand.programName);
    const text = JSON.stringify([snap.items, snap.pages, snap.media, snap.redirects])
      .replaceAll(program, '')
      .replaceAll(program.toLowerCase().replace(/\s+/g, '-'), '');
    for (const word of cfg.brand.clientName.split(/\s+/).filter((w) => w.length >= 4)) expect(text.toLowerCase(), word).not.toContain(word.toLowerCase());
    expect(snap.identity.name).toBe(cfg.brand.clientName);
    expect(snap.accounts.verifiedHandles).toEqual([]);
    for (const it of snap.items) {
      const id = (it.draft as { youtubeId?: string }).youtubeId;
      if (id) expect(id).toMatch(/^fixt/);
      if (it.source) expect(new URL(it.source.url).hostname).toBe(FIXTURE_HOST);
    }
  });
});

describe('REAL_SITE_DIR', () => {
  it('sin la variable no hay carpeta propia (se lee .real-site/); con ella, su ruta absoluta', () => {
    expect(realSiteDirFromEnv({})).toBeNull();
    expect(realSiteDirFromEnv({ REAL_SITE_DIR: '   ' })).toBeNull();
    expect(realSiteDirFromEnv({ REAL_SITE_DIR: 'tests/fixtures/real-site' })).toBe(path.join(process.cwd(), 'tests', 'fixtures', 'real-site'));
    expect(realSiteDirFromEnv({ REAL_SITE_DIR: DIR })).toBe(DIR);
  });

  it('el servidor del proyecto «real-fixture» de Playwright hace el contenido de prueba y lo lee con REAL_SITE_DIR', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'playwright.config.ts'), 'utf8');
    expect(config).toContain('npx tsx tests/fixtures/real-site/make-snapshot.mts');
    expect(config).toMatch(/REAL_SITE_DIR: fixtureDir/);
  });
});
