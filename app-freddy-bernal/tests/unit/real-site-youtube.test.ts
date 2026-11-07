// The governor's channel (scripts/real-site/youtube.ts) on an INVENTED feed (tests/fixtures/real-site/feed.xml): its
// entries, its channel, and which configured accounts its descriptions link, however each network writes an address.
import { describe, expect, it } from 'vitest';
import { accountKeyOf } from '@/lib/web/real-site';
import { isConfiguredFeed, linkedAccountKeys, parseFeed, thumbnailUrls, verifiedKeys } from '../../scripts/real-site/youtube';
import { DEMO_ACCOUNTS, DEMO_REAL_CONFIG, FEED_XML } from '../fixtures/real-site/site';

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
