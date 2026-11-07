// The same content gives the same rows on every demo server (D-39): ids made from names, file keys from the file's
// bytes, the episodes' addresses from their number (scripts/real-site/youtube.ts, src/lib/web/real-site.ts). Invented.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { KEY_PATTERN } from '@/lib/storage/buckets';
import { stableId } from '@/lib/db/seed-parts/web';
import { slug as slugSchema } from '@/lib/web/schema';
import { mediaKey, realId, realIds, sha256Of, uuidFromHex } from '@/lib/web/real-site';
import { episodeNumber, episodeSlugs } from '../../scripts/real-site/youtube';

const uuid = z.string().uuid();

describe('ids y claves', () => {
  it('uuid v4 hechos de un nombre: siempre el mismo, distinto para cada nombre y tipo', () => {
    const id = realIds.news(9101);
    expect(uuid.safeParse(id).success).toBe(true);
    expect(id[14]).toBe('4');
    expect(id[19]).toBe('8');
    expect(realIds.news(9101)).toBe(id);
    expect(realId('real:item:news:9101')).toBe(id);
    const all = [realIds.news(9101), realIds.news(9102), realIds.episode('demoVideo01'), realIds.document('a'.repeat(64)), realIds.faq('x'), realIds.media('a'.repeat(64))];
    expect(new Set(all).size).toBe(all.length);
    for (const x of all) expect(uuid.safeParse(x).success).toBe(true);
    // Never one of the invented seed's ids (another name space).
    expect(all).not.toContain(stableId('item:news:9101'));
    expect(() => uuidFromHex('xyz')).toThrow();
  });

  it('la clave de un archivo sale de su contenido y tiene la forma que la base y la ruta aceptan', () => {
    const sha = sha256Of(Uint8Array.from([1, 2, 3]));
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    for (const ext of ['jpg', 'png', 'webp', 'pdf']) expect(KEY_PATTERN['web-public'].test(mediaKey(sha, ext)), ext).toBe(true);
    expect(mediaKey(sha, 'jpg')).toBe(mediaKey(sha256Of(Uint8Array.from([1, 2, 3])), 'jpg'));
    expect(mediaKey(sha, 'jpg')).not.toBe(mediaKey(sha256Of(Uint8Array.from([1, 2, 4])), 'jpg'));
    expect(realIds.media(sha)).not.toBe(mediaKey(sha, 'jpg').slice(0, 36));
  });
});

describe('las direcciones de las emisiones', () => {
  const P = 'Programa Demo';

  it('el número de la emisión, escriban como lo escriban', () => {
    expect(episodeNumber('Lo que viene | Programa Demo 261', P)).toBe(261);
    expect(episodeNumber('PROGRAMA DEMO No235 // VIERNES (demo)', P)).toBe(235);
    expect(episodeNumber('Programa Demo N°244 tema de prueba', P)).toBe(244);
    expect(episodeNumber('Programa Demo: 219', P)).toBe(219);
    expect(episodeNumber('programademo #161', P)).toBe(161);
    expect(episodeNumber('Entrevista de prueba (demo)', P)).toBeNull();
    expect(episodeNumber('Programa Demo 2', P)).toBeNull();
  });

  it('«programa-demo-N» para la primera parte, con el id del video para las otras; sin número, el título y el id', () => {
    const slugs = episodeSlugs(
      [
        { videoId: 'demoVideo01', title: 'Primera parte | Programa Demo 12' },
        { videoId: 'demoVideo02', title: 'Segunda parte | Programa Demo 12' },
        { videoId: 'demo_Video3', title: 'Tercera | Programa Demo 12' },
        { videoId: 'demoVideo04', title: 'Programa Demo N° 11' },
        { videoId: 'demoVideo05', title: 'Entrevista especial (demo)' },
      ],
      P,
    );
    expect([...slugs.values()]).toEqual([
      'programa-demo-12', 'programa-demo-12-demovideo02', 'programa-demo-12-demo-video3', 'programa-demo-11', 'entrevista-especial-demo-demovideo05',
    ]);
    for (const s of slugs.values()) expect(slugSchema.safeParse(s).success, s).toBe(true);
    // The same list, the same addresses.
    expect([...episodeSlugs([{ videoId: 'demoVideo01', title: 'Primera parte | Programa Demo 12' }], P).values()]).toEqual(['programa-demo-12']);
  });
});
