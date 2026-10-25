// Photos never leave the phone with their EXIF (GPS location). JPEG, PNG and WebP lose their
// metadata without re-encoding (same pixels, never bigger); only a photo larger than maxSide, or
// one that cannot be parsed (HEIC), goes through the canvas, and the smaller clean result wins.
// The photo is recognized by its bytes when File.type is empty or generic. Real photo bytes
// (tests/unit/fixtures/photos.ts); the browser's decoder and canvas are stubbed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { compressImage, PHOTO_BUSY, UNCLEANABLE_PHOTO } from '@/lib/media/probe';
import { SECRET, contains, heicHead, jpegWithGps, png, webpExtended } from './fixtures/photos';

let decodable = true;
let context = true;
let encodes: string[] = [];
let encodedSize = 4000;
let encodeAs: (want: string) => string | null = (want) => want;
let closed = 0;
const canvases: { width: number; height: number }[] = [];

beforeEach(() => {
  decodable = true;
  context = true;
  encodes = [];
  encodedSize = 4000;
  encodeAs = (want) => want;
  closed = 0;
  canvases.length = 0;
  vi.stubGlobal('createImageBitmap', async () => {
    if (!decodable) throw new Error('cannot decode');
    return { width: 1200, height: 900, close: () => closed++ };
  });
  vi.stubGlobal('document', {
    createElement: () => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => (context ? { drawImage: () => {} } : null),
        toBlob: (cb: (b: Blob | null) => void, want: string) => {
          encodes.push(want);
          const type = encodeAs(want);
          cb(type ? new Blob([new Uint8Array(encodedSize)], { type }) : null);
        },
      };
      canvases.push(c);
      return c;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const file = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string) => new File([bytes], name, { type, lastModified: 1_792_886_137_889 });
const bytesOf = async (f: Blob) => new Uint8Array(await f.arrayBuffer());

describe('compressImage: sin recodificar', () => {
  it('JPEG con GPS: sale sin ubicación, sin pasar por el canvas, más liviana y con su fecha de archivo', async () => {
    const original = file(jpegWithGps(), 'foto.jpg', 'image/jpeg');
    const out = await compressImage(original);
    expect(encodes).toEqual([]);
    expect(contains(await bytesOf(out), SECRET)).toBe(false);
    expect(out.size).toBeLessThan(original.size);
    expect(out).toMatchObject({ name: 'foto.jpg', type: 'image/jpeg', lastModified: original.lastModified });
  });

  it('PNG y WebP con metadatos: limpias y en su formato', async () => {
    for (const [bytes, name, type] of [[png(true), 'captura.png', 'image/png'], [webpExtended(true), 'arte.webp', 'image/webp']] as const) {
      const out = await compressImage(file(bytes, name, type));
      expect(contains(await bytesOf(out), SECRET), name).toBe(false);
      expect(out.type).toBe(type);
    }
    expect(encodes).toEqual([]);
  });

  it('sin metadatos devuelve el mismo archivo', async () => {
    const clean = file(png(), 'logo.png', 'image/png');
    expect(await compressImage(clean)).toBe(clean);
  });

  it('dos intentos con la misma foto dan el mismo archivo (la subida que se corta sigue donde iba)', async () => {
    const original = file(jpegWithGps(), 'foto.jpg', 'image/jpeg');
    const [a, b] = [await compressImage(original), await compressImage(original)];
    expect([a.name, a.type, a.size, a.lastModified]).toEqual([b.name, b.type, b.size, b.lastModified]);
  });
});

describe('compressImage: sin tipo o con tipo genérico', () => {
  it('reconoce la foto por sus bytes y la limpia', async () => {
    const out = await compressImage(file(jpegWithGps(), 'IMG_1234', ''));
    expect(contains(await bytesOf(out), SECRET)).toBe(false);
    expect(out).toMatchObject({ name: 'IMG_1234.jpg', type: 'image/jpeg' });
    const generic = await compressImage(file(png(true), 'compartida', 'application/octet-stream'));
    expect(contains(await bytesOf(generic), SECRET)).toBe(false);
    expect(generic).toMatchObject({ name: 'compartida.png', type: 'image/png' });
  });

  it('un HEIC sin tipo se recodifica a JPEG, o se rechaza si el teléfono no lo abre', async () => {
    const heic = await compressImage(file(heicHead(), 'IMG_0001', ''));
    expect(heic).toMatchObject({ name: 'IMG_0001.jpg', type: 'image/jpeg' });
    decodable = false;
    await expect(compressImage(file(heicHead(), 'IMG_0002.HEIC', ''))).rejects.toThrow(UNCLEANABLE_PHOTO);
  });

  it('lo que no es foto (un PDF sin tipo) pasa como está', async () => {
    const pdf = file(new TextEncoder().encode('%PDF-1.7 ...'), 'documento', '');
    expect(await compressImage(pdf)).toBe(pdf);
    expect(encodes).toEqual([]);
  });
});

describe('compressImage: más grande que maxSide', () => {
  it('nunca sale más pesada que la original limpia', async () => {
    const original = file(png(true), 'pantalla.png', 'image/png');
    encodedSize = 100_000; // re-encoding would make it bigger
    const out = await compressImage(original, 2);
    expect(encodes).toEqual(['image/png']);
    expect(out.size).toBeLessThan(original.size);
    expect(contains(await bytesOf(out), SECRET)).toBe(false);
  });

  it('si la recodificada es más liviana, gana ella', async () => {
    encodedSize = 10;
    const out = await compressImage(file(jpegWithGps(), 'grande.jpg', 'image/jpeg'), 2);
    expect(out.size).toBe(10);
    expect(out.lastModified).toBe(1_792_886_137_889);
  });

  it('suelta la imagen y el canvas después de usarlos', async () => {
    await compressImage(file(jpegWithGps(), 'grande.jpg', 'image/jpeg'), 2);
    expect(closed).toBe(1);
    expect(canvases.map((c) => [c.width, c.height])).toEqual([[0, 0]]);
  });

  it('sin memoria para el canvas: la original limpia, aunque sea grande', async () => {
    context = false;
    const out = await compressImage(file(jpegWithGps(), 'grande.jpg', 'image/jpeg'), 2);
    expect(contains(await bytesOf(out), SECRET)).toBe(false);
    expect(closed).toBe(1);
  });
});

describe('compressImage: cuando hay que recodificar sí o sí', () => {
  // Bytes it cannot parse, labeled as a photo.
  const opaque = (type: string, name: string) => file(new Uint8Array(50_000), name, type);

  it('mensajes claros: sin memoria para el canvas, o una foto que no abre', async () => {
    context = false;
    await expect(compressImage(file(png(true, 6), 'girada.png', 'image/png'))).rejects.toThrow(PHOTO_BUSY);
    context = true;
    decodable = false;
    await expect(compressImage(file(png(true, 6), 'girada.png', 'image/png'))).rejects.toThrow(PHOTO_BUSY);
    await expect(compressImage(opaque('image/heic', 'IMG_0003.HEIC'))).rejects.toThrow(UNCLEANABLE_PHOTO);
  });

  it('nombra el archivo según lo que entregó el navegador cuando no sabe hacer WebP', async () => {
    encodeAs = (want) => (want === 'image/webp' ? 'image/png' : want);
    const out = await compressImage(file(webpExtended(true, 6), 'a.webp', 'image/webp'));
    expect(out).toMatchObject({ type: 'image/png', name: 'a.png' });
  });

  it('rechaza la que no puede codificar en vez de mandar la original', async () => {
    encodeAs = () => null;
    await expect(compressImage(opaque('image/jpeg', 'rara.jpg'))).rejects.toThrow(UNCLEANABLE_PHOTO);
  });

  it('deja quietos los videos, GIF y SVG', async () => {
    for (const f of [opaque('video/mp4', 'v.mp4'), opaque('image/gif', 'a.gif'), opaque('image/svg+xml', 'l.svg')]) {
      expect(await compressImage(f)).toBe(f);
    }
    expect(encodes).toEqual([]);
  });
});
