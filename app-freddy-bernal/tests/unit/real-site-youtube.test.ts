// The governor's channel (scripts/real-site/youtube.ts) on an INVENTED feed (tests/fixtures/real-site/feed.xml): its
// entries, its channel, and which configured accounts its descriptions link, however each network writes an address.
// Then where the program's videos come from when a source does not serve (sources.ts): the list of long videos, the
// channel's own feed (only the program's titles), the official API only with a key (tests/fixtures/real-site/
// youtube-api.ts, invented answers), and the key never in an address, a log line, an error or the snapshot.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REAL_SITE, accountKeyOf } from '@/lib/web/real-site';
import { buildSnapshot } from '../../scripts/real-site/build';
import { prebuild } from '../../scripts/real-site/prebuild';
import { Deadline, USER_AGENT, networkSources } from '../../scripts/real-site/sources';
import {
  feedFromApi, isConfiguredFeed, isProgramTitle, isoMinutes, linkedAccountKeys, minutesFromApi, parseFeed, programVideos, thumbnailUrls, verifiedKeys,
} from '../../scripts/real-site/youtube';
import { CHANNEL_FEED_XML, DEMO_ACCOUNTS, DEMO_REAL_CONFIG, FEED_XML, demoClientConfig, fakeFetcher, type FakeSiteOptions } from '../fixtures/real-site/site';
import { API_PLAYLIST, API_VIDEOS, DEMO_CLAVE } from '../fixtures/real-site/youtube-api';

describe('la lista de videos largos del canal', () => {
  it('sus entradas, la más nueva primero, con su título como está; una entrada sin id de YouTube queda fuera', () => {
    const feed = parseFeed(FEED_XML);
    expect(feed.channelId).toBe('UCdemoCanalDePrueba00001');
    expect(feed.playlistId).toBe('UULFdemoCanalDePrueba00001');
    expect(feed.entries.map((e) => [e.videoId, e.published.slice(0, 10)])).toEqual([
      ['demoVideo01', '2026-10-31'], ['demoVideo02', '2026-10-31'], ['demoVideo03', '2026-10-24'], ['demo_Video4', '2026-10-17'],
    ]);
    expect(feed.entries[2].title).toBe('PROGRAMA DEMO N°11 // VIERNES DE PRUEBA & MÁS (demo)');
    expect(feed.entries[2].description).toBe('Otra descripción inventada (demo) con <etiquetas> & signos.');
    expect(isConfiguredFeed(feed, DEMO_REAL_CONFIG.youtube)).toBe(true);
    expect(isConfiguredFeed(feed, { ...DEMO_REAL_CONFIG.youtube, channelId: 'UCotroCanalDePrueba000001' })).toBe(false);
    expect(parseFeed('<html>404 (demo)</html>')).toEqual({ channelId: null, playlistId: null, entries: [] });
    expect(thumbnailUrls('demoVideo01')).toEqual({ url: 'https://i.ytimg.com/vi/demoVideo01/maxresdefault.jpg', fallbackUrl: 'https://i.ytimg.com/vi/demoVideo01/hqdefault.jpg' });
  });

  it('las cuentas configuradas que enlazan sus descripciones (y solo esas)', () => {
    const linked = linkedAccountKeys(parseFeed(FEED_XML).entries.map((e) => e.description));
    expect(verifiedKeys(DEMO_ACCOUNTS, linked)).toEqual(['facebook:100000000000001', 'instagram:cuenta_demo', 'x:cuenta_demo', 'youtube:canaldemo.oficial']);
    expect(verifiedKeys(DEMO_ACCOUNTS, new Set())).toEqual([]);
  });
});

describe('una cuenta, se escriba como se escriba', () => {
  it('con o sin www, con o sin @, el perfil de Facebook por su número, YouTube por su @ o su canal', () => {
    expect(accountKeyOf('https://www.instagram.com/cuenta_demo/?hl=es')).toBe('instagram:cuenta_demo');
    expect(accountKeyOf('https://instagram.com/Cuenta_Demo')).toBe('instagram:cuenta_demo');
    expect(accountKeyOf('https://twitter.com/cuenta_demo')).toBe('x:cuenta_demo');
    expect(accountKeyOf('https://x.com/cuenta_demo/status/1')).toBe('x:cuenta_demo');
    expect(accountKeyOf('https://www.tiktok.com/@cuenta_demo')).toBe('tiktok:cuenta_demo');
    expect(accountKeyOf('https://www.tiktok.com/cuenta_demo')).toBeNull();
    expect(accountKeyOf('https://www.threads.net/@cuenta_demo')).toBe('threads:cuenta_demo');
    expect(accountKeyOf('https://www.facebook.com/p/Persona-Demo-100000000000001/?locale=es_LA')).toBe('facebook:100000000000001');
    expect(accountKeyOf('https://m.facebook.com/profile.php?id=100000000000001')).toBe('facebook:100000000000001');
    expect(accountKeyOf('https://www.facebook.com/PaginaDemo')).toBe('facebook:paginademo');
    expect(accountKeyOf('https://www.youtube.com/@CanalDemo.oficial?sub_confirmation=1')).toBe('youtube:canaldemo.oficial');
    expect(accountKeyOf('https://www.youtube.com/channel/UCdemoCanalDePrueba00001')).toBe('youtube:channel:ucdemocanaldeprueba00001');
    expect(accountKeyOf('https://www.youtube.com/redirect?q=https%3A%2F%2Fx.com%2Fcuenta_demo')).toBe('x:cuenta_demo');
    expect(accountKeyOf('https://otro-sitio.test/cuenta_demo')).toBeNull();
    expect(accountKeyOf('javascript:alert(1)')).toBeNull();
    expect(accountKeyOf('no es una dirección')).toBeNull();
  });
});

const instant = () => Promise.resolve();

/** The real build against the invented sites; what it asked, what it said. */
async function run(o: FakeSiteOptions, youtubeApiKey?: string) {
  const fetcher = fakeFetcher(o);
  const deadline = new Deadline(60_000);
  const lines: string[] = [];
  try {
    const result = await buildSnapshot(
      {
        config: DEMO_REAL_CONFIG, programName: 'Programa Demo', tz: 'America/Caracas', accounts: DEMO_ACCOUNTS,
        fallbackIdentity: { name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' }, now: new Date('2026-11-06T12:00:00Z'), log: (l) => lines.push(l),
      },
      networkSources({ config: DEMO_REAL_CONFIG, fetcher, deadline, cache: null, youtubeApiKey, apiDelayMs: 0, fileDelayMs: 0, sleep: instant, log: (l) => lines.push(l) }),
    );
    const episodes = result.snapshot.items.filter((i) => i.kind === 'episode');
    return { result, episodes, seen: fetcher.seen, lines };
  } finally {
    deadline.dispose();
  }
}
const asked = (seen: { url: string }[], part: string) => seen.filter((x) => x.url.includes(part)).length;

describe('las emisiones del programa en lo que da cada fuente', () => {
  it('el nombre del programa, como lo escriban los títulos', () => {
    expect(isProgramTitle('Avance de la semana / PROGRAMA DEMO 13', 'Programa Demo')).toBe(true);
    expect(isProgramTitle('PROGRAMADEMO N°13 (demo)', 'Programa Demo')).toBe(true);
    expect(isProgramTitle('programa   demo especial (demo)', 'Programa Demo')).toBe(true);
    expect(isProgramTitle('Un corto de prueba sobre una obra (demo)', 'Programa Demo')).toBe(false);
    expect(isProgramTitle('Demo del programa (demo)', 'Programa Demo')).toBe(false);
    expect(isProgramTitle('Cualquier título (demo)', '  ')).toBe(false);
  });

  it('la lista de videos largos da todas sus entradas; el canal, solo las del programa; otro canal, nada', () => {
    const cfg = DEMO_REAL_CONFIG.youtube;
    const list = programVideos(parseFeed(FEED_XML), 'playlist', cfg, 'Programa Demo')!;
    expect(list.entries.map((e) => e.videoId)).toEqual(['demoVideo01', 'demoVideo02', 'demoVideo03', 'demo_Video4']);
    const channel = programVideos(parseFeed(CHANNEL_FEED_XML), 'channel', cfg, 'Programa Demo')!;
    expect(channel.entries.map((e) => e.videoId)).toEqual(['demoVideo05', 'demoVideo02']);
    // The accounts are read from every video of the channel, the shorts too.
    expect(channel.descriptions).toHaveLength(4);
    expect(verifiedKeys(DEMO_ACCOUNTS, linkedAccountKeys(channel.descriptions))).toEqual(['instagram:cuenta_demo', 'tiktok:cuenta_demo']);
    expect(programVideos(parseFeed(CHANNEL_FEED_XML), 'channel', { ...cfg, channelId: 'UCotroCanalDePrueba000001' }, 'Programa Demo')).toBeNull();
    expect(programVideos(parseFeed(CHANNEL_FEED_XML), 'channel', cfg, 'Otro Programa')).toBeNull();
    expect(programVideos(parseFeed('<html>404 (demo)</html>'), 'playlist', cfg, 'Programa Demo')).toBeNull();
  });

  it('la API: solo los videos públicos de un canal, el más nuevo primero, y cuánto dura cada uno', () => {
    const feed = feedFromApi(API_PLAYLIST);
    expect(feed.channelId).toBe('UCdemoCanalDePrueba00001');
    expect(feed.playlistId).toBe('UULFdemoCanalDePrueba00001');
    expect(feed.entries.map((e) => [e.videoId, e.published.slice(0, 10)])).toEqual([['demoVideo01', '2026-10-31'], ['demoVideo03', '2026-10-24']]);
    expect(isConfiguredFeed(feed, DEMO_REAL_CONFIG.youtube)).toBe(true);
    // Videos of two channels: no channel can be told, so it is not the configured one.
    const mixed = structuredClone(API_PLAYLIST);
    mixed.items[0].snippet.videoOwnerChannelId = 'UCotroCanalDePrueba000001';
    expect(feedFromApi(mixed).channelId).toBeNull();
    expect(feedFromApi({ error: { code: 403 } })).toEqual({ channelId: null, playlistId: null, entries: [] });
    expect(feedFromApi('no es JSON (demo)')).toEqual({ channelId: null, playlistId: null, entries: [] });
    expect([...minutesFromApi(API_VIDEOS)]).toEqual([['demoVideo01', 4], ['demoVideo03', 110]]);
    expect(['PT1H50M26S', 'PT4M25S', 'PT30S', 'PT1H', 'P1DT1H', 'P0D', 'PT0S', '', 'una hora', null].map(isoMinutes)).toEqual([110, 4, 1, 60, 1500, null, null, null, null, null]);
  });
});

describe('si una fuente de YouTube no sirve, la siguiente', () => {
  it('la lista de videos largos no responde: se pide otra vez una sola vez y las emisiones salen del canal, solo las del programa', async () => {
    const { result, episodes, seen, lines } = await run({ playlistDown: true });
    expect(asked(seen, 'playlist_id=')).toBe(2);
    expect(asked(seen, 'channel_id=')).toBe(1);
    expect(asked(seen, 'googleapis')).toBe(0);
    expect(episodes.map((e) => [e.slug, e.draft.youtubeId])).toEqual([['programa-demo-13', 'demoVideo05'], ['programa-demo-12', 'demoVideo02']]);
    expect(result.snapshot.accounts).toEqual({ youtubeOk: true, verifiedHandles: ['instagram:cuenta_demo', 'tiktok:cuenta_demo'] });
    expect(result.failed).toEqual([]);
    expect(lines.some((l) => l.includes('las emisiones salen de los videos del canal'))).toBe(true);
  }, 30_000);

  it('sin las listas públicas y sin clave: la API nunca se pregunta y YouTube cuenta como caído (sale de la copia anterior)', async () => {
    const { result, episodes, seen } = await run({ youtubeDown: true });
    expect([asked(seen, 'playlist_id='), asked(seen, 'channel_id='), asked(seen, 'googleapis')]).toEqual([2, 2, 0]);
    expect(episodes).toEqual([]);
    expect(result.failed).toContain('youtube');
    const why = result.snapshot.report.skipped.find((x) => x.ref === 'YouTube')!.reason;
    expect(why).toMatch(/la lista de videos largos: no respondió/);
    expect(why).toMatch(/los videos del canal \(solo los del programa\): no respondió/);
    expect(result.snapshot.accounts).toEqual({ verifiedHandles: [], youtubeOk: false });
  }, 30_000);

  it('con la clave: la API oficial da la misma lista y los minutos; la clave va solo en su cabecera, nunca en una dirección ni en la foto', async () => {
    const { result, episodes, seen, lines } = await run({ youtubeDown: true }, DEMO_CLAVE);
    const google = seen.filter((x) => new URL(x.url).hostname === 'www.googleapis.com');
    expect(google.map((x) => new URL(x.url).pathname)).toEqual(['/youtube/v3/playlistItems', '/youtube/v3/videos']);
    expect(new URL(google[0].url).searchParams.get('playlistId')).toBe(DEMO_REAL_CONFIG.youtube.playlistId);
    expect(new URL(google[1].url).searchParams.get('id')).toBe('demoVideo01,demoVideo03');
    for (const x of google) expect([x.apiKey, x.userAgent, x.method]).toEqual([DEMO_CLAVE, USER_AGENT, 'GET']);
    for (const x of seen.filter((y) => !google.includes(y))) expect(x.apiKey).toBeNull();
    for (const x of seen) expect(x.url).not.toContain(DEMO_CLAVE);
    expect(episodes.map((e) => [e.draft.youtubeId, e.draft.minutes])).toEqual([['demoVideo01', 4], ['demoVideo03', 110]]);
    expect(result.snapshot.accounts).toEqual({ youtubeOk: true, verifiedHandles: ['x:cuenta_demo', 'youtube:canaldemo.oficial'] });
    expect(result.failed).toEqual([]);
    expect(JSON.stringify(result.snapshot)).not.toContain(DEMO_CLAVE);
    expect(lines.join('\n')).not.toContain(DEMO_CLAVE);
    expect(lines.some((l) => l.includes('las emisiones salen de la API de YouTube'))).toBe(true);
  }, 30_000);

  it('la API rechaza la clave o falla diciéndola: YouTube cuenta como caído y la clave no queda en ningún mensaje', async () => {
    const refused = await run({ youtubeDown: true, apiDown: true }, DEMO_CLAVE);
    expect(refused.result.failed).toContain('youtube');
    expect(refused.result.snapshot.report.skipped.find((x) => x.ref === 'YouTube')!.reason).toMatch(/la API de YouTube: .*403/);
    const loud = await run({ youtubeDown: true, apiThrows: true }, DEMO_CLAVE);
    expect(loud.result.failed).toContain('youtube');
    const why = loud.result.snapshot.report.skipped.find((x) => x.ref === 'YouTube')!.reason;
    expect(why).toContain('[clave]');
    for (const r of [refused, loud]) {
      expect(JSON.stringify(r.result.snapshot)).not.toContain(DEMO_CLAVE);
      expect(r.lines.join('\n')).not.toContain(DEMO_CLAVE);
    }
  }, 30_000);

  it('la construcción con YOUTUBE_API_KEY: ni el registro ni lo que escribe en .real-site guardan la clave', async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'real-site-yt-'));
    const said: string[] = [];
    const r = await prebuild({
      appDir: app, env: { REAL_SITE_CONTENT: '1', YOUTUBE_API_KEY: DEMO_CLAVE }, config: demoClientConfig(), fetcher: fakeFetcher({ youtubeDown: true }),
      log: (l) => said.push(l), warn: (l) => said.push(l), sleep: instant, delays: { api: 0, files: 0 },
    });
    expect(r.status).toBe('written');
    const written = fs.readFileSync(path.join(app, REAL_SITE.dir, REAL_SITE.file), 'utf8');
    expect(JSON.parse(written).items.filter((i: { kind: string }) => i.kind === 'episode')).toHaveLength(2);
    expect(written).not.toContain(DEMO_CLAVE);
    expect(said.join('\n')).not.toContain(DEMO_CLAVE);
    expect(said.some((l) => l.includes('con la API, si hace falta'))).toBe(true);
  }, 60_000);
});
