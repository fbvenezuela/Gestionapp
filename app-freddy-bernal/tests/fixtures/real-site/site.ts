// An INVENTED official site, YouTube channel (its feeds and its official API) and Drive file behind a fake `fetch`, for
// the real-site build's tests (scripts/real-site): the real network code (PoliteHttp, its redirects and checks) runs
// against it, nothing leaves the machine. Every text is made up and marked (demo); the photos are drawn here (tests/unit/fixtures/web-png.ts) and the
// PDF is written here: nothing real in the repository (D-95, design §0).
import fs from 'node:fs';
import path from 'node:path';
import { getClientConfig, type ClientConfig } from '../../../src/lib/client-config';
import { textPdf } from '../../../src/lib/participation/pdf';
import { buildSnapshot, type BuildResult } from '../../../scripts/real-site/build';
import type { RealSiteConfig } from '../../../scripts/real-site/settings';
import { Deadline, networkSources } from '../../../scripts/real-site/sources';
import type { Fetcher } from '../../../scripts/web-import/wp-client';
import { pngOf } from '../../unit/fixtures/web-png';
import { WP } from './wp';
import { API_PLAYLIST, API_VIDEOS, DEMO_CLAVE } from './youtube-api';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const HOME_HTML = fs.readFileSync(path.join(HERE, 'home.html'), 'utf8');
export const FEED_XML = fs.readFileSync(path.join(HERE, 'feed.xml'), 'utf8');
export const CHANNEL_FEED_XML = fs.readFileSync(path.join(HERE, 'channel-feed.xml'), 'utf8');

export const DEMO_HOST = 'sitio-oficial.test';
export const DEMO_DRIVE_ID = 'ArchivoDePruebaDemo0001';

export const DEMO_REAL_CONFIG: RealSiteConfig = {
  source: DEMO_HOST,
  bioPostId: 9301,
  officePostIds: [9401, 9402],
  heroMediaId: 7101,
  bioMediaId: 7102,
  maxNews: 48,
  maxOpinion: 8,
  maxEpisodes: 12,
  semanarioName: 'Semanario de prueba (demo)',
  youtube: { channelId: 'UCdemoCanalDePrueba00001', playlistId: 'UULFdemoCanalDePrueba00001', handle: '@CanalDemo.oficial' },
};

/** The invented accounts the config «knows» (one the channel does not link: TikTok). */
export const DEMO_ACCOUNTS = [
  { network: 'youtube', label: 'YouTube', handle: '@CanalDemo.oficial', url: 'https://www.youtube.com/@CanalDemo.oficial', verified: false, active: true, note: 'Nota interna (demo).' },
  { network: 'instagram', label: 'Instagram', handle: '@cuenta_demo', url: 'https://www.instagram.com/cuenta_demo/', verified: false, active: true, note: 'Nota interna (demo).' },
  { network: 'x', label: 'X', handle: '@cuenta_demo', url: 'https://x.com/cuenta_demo', verified: false, active: true },
  { network: 'tiktok', label: 'TikTok', handle: '@cuenta_demo', url: 'https://www.tiktok.com/@cuenta_demo', verified: false, active: true },
  { network: 'facebook', label: 'Facebook', handle: 'Persona Demo', url: 'https://www.facebook.com/Persona-Demo-100000000000001', verified: false, active: true },
  { network: 'youtube', label: 'YouTube (anterior)', handle: '@CanalViejoDemo', url: 'https://www.youtube.com/@CanalViejoDemo', verified: false, active: false },
];

/** The client's config with the invented official site, accounts and program in place of the real ones. */
export function demoClientConfig(): ClientConfig {
  const cfg = structuredClone(getClientConfig()) as unknown as { web: { realSite: unknown; settings: Record<string, unknown> }; brand: Record<string, unknown> };
  cfg.web.realSite = DEMO_REAL_CONFIG;
  cfg.web.settings['site.social_accounts'] = DEMO_ACCOUNTS;
  cfg.web.settings['site.youtube_channel'] = { label: 'Canal (demo)', handle: '@CanalDemo.oficial', url: 'https://www.youtube.com/@CanalDemo.oficial', verified: false, note: 'Nota interna (demo).' };
  cfg.brand = { ...cfg.brand, programName: 'Programa Demo 2.0', clientName: 'Persona Demo' };
  return cfg as unknown as ClientConfig;
}

const UP = `https://${DEMO_HOST}/wp-content/uploads`;
/** The photos the invented site has (its sizes as WordPress would make them). */
const PHOTOS: Record<string, () => Uint8Array> = {
  [`${UP}/2026/10/cancha-1024x683.jpg`]: () => pngOf(1024, 683),
  [`${UP}/2026/10/cancha-2.jpg`]: () => pngOf(640, 427),
  [`${UP}/2026/10/cancha-3.jpg`]: () => pngOf(640, 480),
  [`${UP}/2026/10/cancha-4.jpg`]: () => pngOf(600, 400),
  [`${UP}/2026/10/vacuna-2.png`]: () => pngOf(640, 481),
  [`${UP}/2023/01/retrato-portada.jpg`]: () => pngOf(1098, 618),
  [`${UP}/2025/06/retrato.jpg`]: () => pngOf(640, 800),
  [`${UP}/2026/10/portada-semanario.jpg`]: () => pngOf(471, 630),
};
// An AVIF file's first bytes (the library takes JPEG, PNG and WebP only).
const AVIF = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31, 0x6d, 0x69, 0x61, 0x66]);

export function demoPdf(): Uint8Array {
  return textPdf(
    [
      { text: 'Semanario de prueba (demo)', size: 20, bold: true },
      { text: 'Edición inventada para las pruebas (demo).', gap: 12 },
    ],
    { title: 'Semanario de prueba (demo)', createdAt: new Date(Date.UTC(2026, 9, 15, 12, 0, 0)) },
  );
}

export type FakeSiteOptions = {
  /** YouTube's feeds answer 404 (as they did from the build container on 7/11). */
  youtubeDown?: boolean;
  /** Only the list of long videos answers 404 (the channel's own feed answers). */
  playlistDown?: boolean;
  /** The channel's own feed (shorts and program videos together). */
  channelFeed?: string;
  /** The official API refuses (403, as for a used-up quota or a key without the API). */
  apiDown?: boolean;
  /** The official API's request fails with an error that repeats the key it was sent. */
  apiThrows?: boolean;
  /** Drive answers with a page instead of the file. */
  driveHtml?: boolean;
  /** WordPress does not answer at all (every request fails). */
  wordpressDown?: boolean;
  /** Other videos in the feed (another week). */
  feed?: string;
};

export type Seen = { url: string; userAgent: string | null; method: string; apiKey: string | null };

const json = (data: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8', 'x-wp-total': String(Array.isArray(data) ? data.length : 1), 'x-wp-totalpages': '1', ...extra } });
const notFound = () => new Response('No encontrado (demo)', { status: 404, headers: { 'content-type': 'text/html' } });

/** The snapshot of the invented site, built by the real code (build.ts + sources.ts) against the fake fetch. */
export async function demoSnapshot(o: FakeSiteOptions = {}, run: { youtubeApiKey?: string } = {}): Promise<BuildResult> {
  const deadline = new Deadline(60_000);
  try {
    return await buildSnapshot(
      {
        config: DEMO_REAL_CONFIG, programName: 'Programa Demo', tz: 'America/Caracas', accounts: DEMO_ACCOUNTS,
        fallbackIdentity: { name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' }, now: new Date('2026-11-06T12:00:00Z'),
      },
      networkSources({ config: DEMO_REAL_CONFIG, fetcher: fakeFetcher(o), deadline, cache: null, youtubeApiKey: run.youtubeApiKey, apiDelayMs: 0, fileDelayMs: 0, sleep: () => Promise.resolve() }),
    );
  } finally {
    deadline.dispose();
  }
}

/** A fetch that answers as the invented sites would, and remembers what it was asked. */
export function fakeFetcher(o: FakeSiteOptions = {}): Fetcher & { seen: Seen[] } {
  const seen: Seen[] = [];
  const fetcher = (async (raw: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    seen.push({ url: raw, userAgent: headers.get('user-agent'), method: init.method ?? 'GET', apiKey: headers.get('x-goog-api-key') });
    const u = new URL(raw);
    if (u.hostname === DEMO_HOST || u.hostname === `www.${DEMO_HOST}`) {
      if (o.wordpressDown) throw new TypeError('fetch failed (demo)');
      if (u.pathname === '/wp-json/' || u.pathname === '/wp-json') return json(WP.root);
      if (u.pathname === '/wp-json/wp/v2/categories') return json(WP.categories);
      if (u.pathname === '/wp-json/wp/v2/posts') {
        const include = u.searchParams.get('include');
        if (include) {
          const ids = include.split(',').map(Number);
          return json([...WP.pages, ...WP.news, ...WP.opinion].filter((p: { id: number }) => ids.includes(p.id)));
        }
        const cats = u.searchParams.get('categories');
        if (cats) return json(WP.opinion.filter((p: { categories: number[] }) => p.categories.some((c) => cats.split(',').map(Number).includes(c))));
        const without = (u.searchParams.get('categories_exclude') ?? '').split(',').filter(Boolean).map(Number);
        const perPage = Number(u.searchParams.get('per_page') ?? 10);
        return json(WP.news.filter((p: { categories: number[] }) => !p.categories.some((c) => without.includes(c))).slice(0, perPage));
      }
      if (u.pathname === '/wp-json/wp/v2/media') {
        const ids = (u.searchParams.get('include') ?? '').split(',').map(Number);
        return json(WP.media.filter((m: { id: number }) => ids.includes(m.id)));
      }
      if (u.pathname === '/') return new Response(HOME_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
      const clean = `${u.origin}${u.pathname}`;
      if (clean.endsWith('.avif')) return new Response(AVIF, { status: 200, headers: { 'content-type': 'image/avif' } });
      const photo = PHOTOS[clean];
      return photo ? new Response(photo() as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'image/png' } }) : notFound();
    }
    if (u.hostname === 'www.youtube.com') {
      if (o.youtubeDown || u.pathname !== '/feeds/videos.xml') return notFound();
      const xml = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/xml; charset=UTF-8' } });
      if (u.searchParams.get('playlist_id')) return o.playlistDown ? notFound() : xml(o.feed ?? FEED_XML);
      if (u.searchParams.get('channel_id')) return xml(o.channelFeed ?? CHANNEL_FEED_XML);
      return notFound();
    }
    if (u.hostname === 'www.googleapis.com') {
      const key = headers.get('x-goog-api-key');
      if (o.apiThrows) throw new TypeError(`fetch failed (demo, ${key})`);
      const refuse = () => new Response(JSON.stringify({ error: { code: 403, message: 'La API no responde a esta clave (demo).' } }), { status: 403, headers: { 'content-type': 'application/json' } });
      if (key !== DEMO_CLAVE || o.apiDown) return refuse();
      if (u.pathname === '/youtube/v3/playlistItems' && u.searchParams.get('playlistId') === DEMO_REAL_CONFIG.youtube.playlistId) return json(API_PLAYLIST);
      if (u.pathname === '/youtube/v3/videos') {
        const ids = (u.searchParams.get('id') ?? '').split(',');
        return json({ ...API_VIDEOS, items: API_VIDEOS.items.filter((v) => ids.includes(v.id)) });
      }
      return notFound();
    }
    if (u.hostname === 'i.ytimg.com') {
      // The big thumbnail exists for some videos only: the small one always.
      if (u.pathname.endsWith('/maxresdefault.jpg') && !u.pathname.includes('demoVideo01')) return notFound();
      // A different picture for each video (one of the same bytes would be one file in the library).
      const n = [...u.pathname].reduce((a, c) => a + c.charCodeAt(0), 0) % 40;
      return new Response(pngOf(480, 360 + n) as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (u.hostname === 'drive.google.com' && u.pathname === '/uc') {
      return new Response(null, { status: 303, headers: { location: `https://drive.usercontent.google.com/download?id=${u.searchParams.get('id')}&export=download` } });
    }
    if (u.hostname === 'drive.usercontent.google.com' && u.pathname === '/download') {
      if (o.driveHtml) return new Response('<html>Confirme la descarga (demo)</html>', { status: 200, headers: { 'content-type': 'text/html' } });
      if (u.searchParams.get('id') !== DEMO_DRIVE_ID) return notFound();
      return new Response(demoPdf() as Uint8Array<ArrayBuffer>, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="1_0000000000000000001.pdf"' },
      });
    }
    if (u.hostname === 'drive.google.com' && u.pathname.startsWith('/file/d/')) {
      return new Response('<html><head><title>1_0000000000000000001.pdf - Google Drive</title></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return notFound();
  }) as Fetcher & { seen: Seen[] };
  fetcher.seen = seen;
  return fetcher;
}
