// The snapshot of the official site (scripts/real-site/build.ts with the real network code of sources.ts) against an
// INVENTED site behind a fake fetch (tests/fixtures/real-site): what each post becomes, the photos and their alternative
// texts, the personal data that never reaches it, the episodes and the accounts the channel links, the weekly from Drive,
// the governor's page, the same file every time, polite requests only to the allowed hosts, the downloads kept between
// builds, a part that did not answer taken from the last good copy, and the schema that refuses anything the database
// or the public would not take.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { REMOVED_MARKS } from '@/lib/web/import-marks';
import { KEY_PATTERN } from '@/lib/storage/buckets';
import { REAL_SITE, mediaKey, parseRealSnapshot, realIds, type RealSnapshot } from '@/lib/web/real-site';
import { buildSnapshot, type BuildResult } from '../../scripts/real-site/build';
import { DownloadCache, readRealSnapshot } from '../../scripts/real-site/cache';
import { prebuild } from '../../scripts/real-site/prebuild';
import { Deadline, USER_AGENT, networkSources } from '../../scripts/real-site/sources';
import { DEMO_ACCOUNTS, DEMO_HOST, DEMO_REAL_CONFIG, demoClientConfig, fakeFetcher } from '../fixtures/real-site/site';

const instant = () => Promise.resolve();
const quiet = { log: () => {}, warn: () => {} };

async function build(fetcher = fakeFetcher(), cache: DownloadCache | null = null): Promise<BuildResult> {
  const deadline = new Deadline(60_000);
  try {
    return await buildSnapshot(
      {
        config: DEMO_REAL_CONFIG, programName: 'Programa Demo', tz: 'America/Caracas', accounts: DEMO_ACCOUNTS,
        fallbackIdentity: { name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' }, now: new Date('2026-11-06T12:00:00Z'),
      },
      networkSources({ config: DEMO_REAL_CONFIG, fetcher, deadline, cache, apiDelayMs: 0, fileDelayMs: 0, sleep: instant }),
    );
  } finally {
    deadline.dispose();
  }
}

let result: BuildResult;
let snap: RealSnapshot;
let seen: ReturnType<typeof fakeFetcher>['seen'];
const news = (wpId: number) => snap.items.find((i) => i.id === realIds.news(wpId));
const mediaOf = (id: unknown) => snap.media.find((m) => m.id === id);

beforeAll(async () => {
  const fetcher = fakeFetcher();
  result = await build(fetcher);
  snap = result.snapshot;
  seen = fetcher.seen;
}, 60_000);

describe('la foto de la web oficial (inventada)', () => {
  it('las noticias y la opinión, como las deja el importador, sin autor y con su fuente', () => {
    expect(snap.report).toMatchObject({ news: 3, opinion: 1, episodes: 4, documents: 1 });
    expect(snap.identity).toEqual({ name: 'Persona Demo', tagline: 'Persona Demo - Gobernadora de prueba (demo)' });
    const cancha = news(9101)!;
    expect(cancha).toMatchObject({ kind: 'news', slug: 'inauguran-cancha-deportiva-demo', source: { id: '9101', url: `https://${DEMO_HOST}/2026/10/inauguran-cancha-deportiva-demo/`, path: '/2026/10/inauguran-cancha-deportiva-demo' } });
    expect(cancha.draft).toMatchObject({ title: 'Inauguran cancha deportiva en el sector de prueba (demo)', date: '2026-10-30', category: 'noticia', topics: ['Táchira'], sources: [{ label: DEMO_HOST, url: cancha.source!.url }] });
    expect(cancha.draft).not.toHaveProperty('author');
    const opinion = snap.items.find((i) => i.id === realIds.news(9201))!;
    expect(opinion.draft).toMatchObject({ category: 'articulo', topics: ['Opinión'] });
    // A heading that only repeats the title goes (the importer's rule).
    expect(JSON.stringify(news(9103)!.draft.body)).not.toMatch(/"heading"/);
  });

  it('los datos personales nunca llegan: se va la frase entera; una nota con datos en el título queda fuera', () => {
    const text = JSON.stringify(snap);
    expect(text).not.toMatch(/correo\.test|0414-555/);
    for (const mark of Object.values(REMOVED_MARKS)) expect(text).not.toContain(mark);
    const body = JSON.stringify(news(9101)!.draft.body);
    expect(body).toContain('La cancha abre todos los días (demo).');
    expect(body).not.toMatch(/inscribirse/);
    expect(news(9102)).toBeUndefined();
    expect(snap.report.skipped).toContainEqual({ ref: 'post 9102', reason: 'el título tenía datos personales' });
    // A quote's author with a phone loses only the author.
    const quote = (news(9104)!.draft.body as { type: string; text?: string; cite?: string }[]).find((n) => n.type === 'quote')!;
    expect(quote).toEqual({ type: 'quote', text: 'Una cita inventada (demo).' });
    // The biography's own email sentence too.
    expect(JSON.stringify(snap.pages)).not.toMatch(/correo/);
  });

  it('fotos: la de la nota y hasta dos de su texto, de este sitio, revisadas; un AVIF no entra y la foto siguiente toma su lugar', () => {
    const cancha = news(9101)!.draft as { coverId: string; galleryIds: string[] };
    expect(cancha.galleryIds).toHaveLength(2);
    const cover = mediaOf(cancha.coverId)!;
    expect(cover).toMatchObject({ kind: 'image', mime: 'image/png', width: 1024, height: 683 });
    expect(seen.map((s) => s.url)).not.toContain(`https://${DEMO_HOST}/wp-content/uploads/2026/10/cancha-4.jpg`);
    expect(seen.some((s) => s.url.includes('otro-sitio.test'))).toBe(false);
    const vacuna = news(9103)!.draft as { coverId: string; galleryIds: string[] };
    expect(mediaOf(vacuna.coverId)).toMatchObject({ width: 640, height: 481 });
    expect(snap.report.skipped.some((s) => s.ref.includes('vacuna.avif') && /unsupported/.test(s.reason))).toBe(true);
    expect((news(9104)!.draft as { coverId: unknown }).coverId).toBeNull();
    for (const m of snap.media) {
      expect(m.key).toBe(mediaKey(m.sha256, m.mime === 'application/pdf' ? 'pdf' : m.mime.split('/')[1].replace('jpeg', 'jpg')));
      expect(KEY_PATTERN['web-public'].test(m.key)).toBe(true);
      expect(result.files.get(m.key)?.length).toBe(m.bytes);
    }
  });

  it('el texto alternativo: el de WordPress, si no su leyenda, si no el título («(foto 2)» en la galería); nunca «[Por escribir]»', () => {
    const cancha = news(9101)!.draft as { coverId: string; galleryIds: string[] };
    expect(mediaOf(cancha.coverId)!.alt).toBe('Inauguran cancha deportiva en el sector de prueba (demo)');
    expect(mediaOf(cancha.galleryIds[0])!.alt).toBe('Vecinos inventados en la cancha (demo)');
    // «photo_…_y» is only a file's name: its caption says more.
    expect(mediaOf(cancha.galleryIds[1])!).toMatchObject({ alt: 'Partido inaugural de prueba (demo)', caption: 'Partido inaugural de prueba (demo)' });
    for (const m of snap.media.filter((x) => x.kind === 'image')) {
      expect(m.alt!.length).toBeGreaterThanOrEqual(3);
      expect(m.alt!.length).toBeLessThanOrEqual(300);
      expect(m.alt).not.toMatch(/^\[Por escribir\]/);
    }
  });

  it('las emisiones del canal: título y día, la miniatura como foto nuestra, direcciones por número de emisión', () => {
    const eps = snap.items.filter((i) => i.kind === 'episode');
    // Newest first (the same day's ones in a fixed order of their own).
    expect(eps.map((e) => e.draft.date)).toEqual(['2026-10-30', '2026-10-30', '2026-10-24', '2026-10-17']);
    const byVideo = [...eps].sort((a, b) => String(a.draft.youtubeId).localeCompare(String(b.draft.youtubeId)));
    expect(byVideo.map((e) => [e.slug, e.draft.youtubeId, e.draft.date])).toEqual([
      ['entrevista-especial-de-prueba-demo-demo-video4', 'demo_Video4', '2026-10-17'],
      ['programa-demo-12', 'demoVideo01', '2026-10-30'],
      ['programa-demo-12-demovideo02', 'demoVideo02', '2026-10-30'],
      ['programa-demo-11', 'demoVideo03', '2026-10-24'],
    ]);
    expect(eps.find((e) => e.draft.youtubeId === 'demoVideo03')!.draft.title).toBe('PROGRAMA DEMO N°11 // VIERNES DE PRUEBA & MÁS (demo)');
    for (const e of eps) {
      expect(e.draft).not.toHaveProperty('excerpt');
      expect(mediaOf(e.draft.coverId)).toMatchObject({ kind: 'image', alt: e.draft.title });
    }
    // The descriptions are read, never kept.
    expect(JSON.stringify(snap)).not.toMatch(/Vecina Inventada|Síganos|Suscríbase/);
    // The big thumbnail when there is one, the small one otherwise.
    expect(seen.map((s) => s.url)).toContain('https://i.ytimg.com/vi/demoVideo02/hqdefault.jpg');
  });

  it('las cuentas configuradas que enlazan el canal del gobernador (y el canal mismo) o la portada de la web oficial', () => {
    // TikTok: only the official home links it; the home's other account is not one of the configured ones.
    expect(snap.accounts).toEqual({
      youtubeOk: true,
      verifiedHandles: ['facebook:100000000000001', 'instagram:cuenta_demo', 'tiktok:cuenta_demo', 'x:cuenta_demo', 'youtube:canaldemo.oficial'],
    });
  });

  it('el Semanario: su portada de la web oficial y su PDF de Drive, con su día; el nombre del archivo no decía nada', () => {
    const doc = snap.items.find((i) => i.kind === 'document')!;
    // Its file's name says nothing: the edition's day names it (two editions never read the same).
    expect(doc.draft).toMatchObject({ title: 'Edición del 8 de octubre de 2026', category: 'semanario', date: '2026-10-08', pages: 1 });
    expect(doc.slug).toBe('semanario-de-prueba-demo-2026-10-08');
    const named = 'Semanario de prueba (demo), edición del 8 de octubre de 2026';
    expect(mediaOf(doc.draft.fileId)).toMatchObject({ kind: 'document', mime: 'application/pdf', title: named });
    expect(mediaOf(doc.draft.coverId)).toMatchObject({ kind: 'image', width: 480, height: 640, alt: named });
    expect(doc.id).toBe(realIds.document(mediaOf(doc.draft.fileId)!.sha256));
    // Only the weekly's file: the other Drive link of the home is not asked for.
    expect(seen.some((s) => s.url.includes('OtroArchivoDemo'))).toBe(false);
    // Nothing of Drive is kept: no address, no id.
    expect(JSON.stringify(snap)).not.toMatch(/drive\.|ArchivoDePrueba/);
  });

  it('la página del gobernador: biografía sin lo «actual» de 2014, la toma de posesión con su día y las condecoraciones', () => {
    const bio = JSON.stringify(snap.pages.biography);
    expect(bio).toContain('Presidió una asociación de prueba (demo).');
    expect(bio).not.toMatch(/ctualmente/);
    expect(snap.pages.honors).toEqual([
      { type: 'list', items: ['Orden de Prueba, clase única (demo).', 'Orden Inventada, Municipio Demo.'] },
      { type: 'heading', level: 3, text: 'Distinciones locales' },
      { type: 'list', items: ['Ciudad de Prueba (demo)', 'Ciudad Inventada (demo)'] },
    ]);
    expect(snap.pages.office).toEqual([
      { type: 'heading', level: 3, text: '2 de diciembre de 2021' },
      { type: 'paragraph', text: 'En un acto de prueba, un consejo inventado entregó a Persona Demo su credencial de la elección de prueba (demo).' },
      { type: 'heading', level: 3, text: '10 de julio de 2025' },
      { type: 'paragraph', text: 'Persona Demo comenzó un período de prueba en un acto inventado (demo).' },
    ]);
    expect(snap.pages.bioSourceUrl).toBe(`https://${DEMO_HOST}/2013/03/biografia/`);
    expect(mediaOf(snap.pages.heroMediaId)).toMatchObject({ width: 1200, height: 675, alt: 'Persona Demo' });
    expect(mediaOf(snap.pages.bioMediaId)).toMatchObject({ width: 640, height: 800 });
  });

  it('las direcciones viejas llevan a las nuevas; dos notas con la misma dirección no chocan', () => {
    expect(news(9104)!.slug).toBe('inauguran-cancha-deportiva-demo-9104');
    expect(snap.redirects).toContainEqual({ from: '/2026/10/inauguran-cancha-deportiva-demo', to: '/actualidad/inauguran-cancha-deportiva-demo' });
    expect(snap.redirects).toContainEqual({ from: '/2026/10/inauguran-cancha-deportiva-d%C3%A9mo', to: '/actualidad/inauguran-cancha-deportiva-demo-9104' });
    expect(snap.redirects.map((r) => r.from)).toEqual([...snap.redirects.map((r) => r.from)].sort());
  });

  it('siempre la misma foto con el mismo contenido: ids de nombres, claves del contenido, todo ordenado', async () => {
    const again = (await build()).snapshot;
    const strip = (s: RealSnapshot) => ({ ...s, fetchedAt: '', report: { ...s.report, durationMs: 0, requests: 0 } });
    expect(JSON.stringify(strip(again))).toBe(JSON.stringify(strip(snap)));
    expect(snap.media.map((m) => m.id)).toEqual([...snap.media.map((m) => m.id)].sort());
    expect(parseRealSnapshot(snap).ok).toBe(true);
  });

  it('cortés: solo GET, su User-Agent, solo los sitios permitidos', () => {
    const hosts = new Set(seen.map((s) => new URL(s.url).hostname));
    expect([...hosts].sort()).toEqual(['drive.google.com', 'drive.usercontent.google.com', 'i.ytimg.com', DEMO_HOST, 'www.youtube.com'].sort());
    for (const s of seen) {
      expect(s.method).toBe('GET');
      expect(s.userAgent).toBe(USER_AGENT);
    }
  });
});

describe('entre construcciones', () => {
  it('los archivos bajados se guardan por su dirección; si YouTube no responde, sus emisiones salen de la copia anterior', async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-cache-'));
    const opts = { appDir: app, env: { REAL_SITE_CONTENT: '1' }, config: demoClientConfig(), ...quiet, sleep: instant, delays: { api: 0, files: 0 } };
    const first = await prebuild({ ...opts, fetcher: fakeFetcher() });
    expect(first.status).toBe('written');
    const again = fakeFetcher({ youtubeDown: true });
    const second = await prebuild({ ...opts, fetcher: again });
    expect(second.status).toBe('written');
    // No photo of the official site that passed its checks is downloaded again; the one that did not (the AVIF the fake
    // site serves is only its first bytes) is asked again, never kept.
    expect(again.seen.filter((s) => s.url.includes('/wp-content/uploads/')).map((s) => new URL(s.url).pathname)).toEqual(['/wp-content/uploads/2026/10/vacuna.avif']);
    const s = readRealSnapshot(path.join(app, REAL_SITE.dir))!;
    expect(s.report.carriedOver).toEqual(['youtube']);
    expect(s.items.filter((i) => i.kind === 'episode')).toHaveLength(4);
    expect(s.accounts.youtubeOk).toBe(true);
    for (const m of s.media) expect(fs.statSync(path.join(app, REAL_SITE.dir, REAL_SITE.media, m.key)).size).toBe(m.bytes);
    // Drive giving a page instead of the file: the weekly comes from the last copy too.
    const third = await prebuild({ ...opts, fetcher: fakeFetcher({ driveHtml: true }) });
    expect(third.status).toBe('written');
    expect(readRealSnapshot(path.join(app, REAL_SITE.dir))!.items.filter((i) => i.kind === 'document')).toHaveLength(1);
  }, 60_000);

  it('la caché de descargas: guarda, respeta su vigencia y olvida lo que ya no se usa', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-files-'));
    let now = Date.now();
    const cache = new DownloadCache(dir, () => now);
    const photo = `https://${DEMO_HOST}/wp-content/uploads/2026/10/x.jpg`;
    const thumb = 'https://i.ytimg.com/vi/demoVideo01/hqdefault.jpg';
    cache.write(photo, Uint8Array.from([1, 2, 3]));
    cache.write(thumb, Uint8Array.from([4]), { fileName: 'x (demo)' });
    expect(cache.read(photo)?.bytes).toEqual(Uint8Array.from([1, 2, 3]));
    expect(cache.read(thumb)?.meta).toEqual({ fileName: 'x (demo)' });
    // A WordPress upload is good for a week (one replaced at the same address reaches the demo), a thumbnail for three days.
    now += 5 * 86_400_000;
    expect(cache.read(photo)).not.toBeNull();
    expect(cache.read(thumb)).toBeNull();
    const fresh = new DownloadCache(dir, () => now);
    fresh.read(photo);
    expect(fresh.prune()).toBe(2);
    expect(fresh.read(photo)).not.toBeNull();
    expect(fresh.read(thumb, Infinity)).toBeNull();
    now += 3 * 86_400_000;
    expect(fresh.read(photo)).toBeNull();
    // What turned out not to be what was asked for is forgotten at once (and never pruned as «used»).
    fresh.write(photo, Uint8Array.from([5]));
    fresh.forget(photo);
    expect(fresh.read(photo, Infinity)).toBeNull();
    expect(fresh.used.size).toBe(0);
  });
});

describe('el esquema de la foto', () => {
  const broken = (mutate: (s: RealSnapshot) => void) => {
    const s = structuredClone(snap);
    mutate(s);
    return parseRealSnapshot(s);
  };

  it('rechaza lo que la base o el público no aceptarían', () => {
    expect(broken((s) => (s.media[0].key = s.media[1].key)).ok).toBe(false);
    expect(broken((s) => (s.media.find((m) => m.kind === 'image')!.alt = 'ab')).ok).toBe(false);
    expect(broken((s) => (s.media.find((m) => m.kind === 'image')!.alt = '[Por escribir] Foto traída de la web vieja.')).ok).toBe(false);
    expect(broken((s) => (s.media.find((m) => m.kind === 'image')!.caption = `Llamar al ${REMOVED_MARKS.phone}`)).ok).toBe(false);
    expect(broken((s) => (s.media.find((m) => m.kind === 'image')!.sha256 = 'f'.repeat(64))).ok).toBe(false);
    expect(broken((s) => delete s.media.find((m) => m.kind === 'image')!.width).ok).toBe(false);
    expect(broken((s) => ((s.items[0].draft.body as unknown[]).push({ type: 'paragraph', text: `Escriba a ${REMOVED_MARKS.email}.` }))).ok).toBe(false);
    expect(broken((s) => (s.items[1].slug = s.items[0].slug)).ok).toBe(false);
    expect(broken((s) => (s.items[0].slug = 'Con Espacios')).ok).toBe(false);
    expect(broken((s) => (s.items[0].draft.title = '')).ok).toBe(false);
    expect(broken((s) => (s.items[0].draft.coverId = realIds.media('0'.repeat(64)))).ok).toBe(false);
    expect(broken((s) => (s.pages.heroMediaId = realIds.media('1'.repeat(64)))).ok).toBe(false);
    expect(broken((s) => s.redirects.push({ from: '/2026/10/a', to: '//otro.test/x' })).ok).toBe(false);
    expect(broken((s) => s.redirects.push({ ...s.redirects[0] })).ok).toBe(false);
    expect(broken((s) => (s.pages.bioSourceUrl = 'javascript:alert(1)')).ok).toBe(false);
    expect(broken((s) => ((s.pages.biography as unknown[]).push({ type: 'html', html: '<script>' }))).ok).toBe(false);
    expect(broken(() => {}).ok).toBe(true);
  });
});
