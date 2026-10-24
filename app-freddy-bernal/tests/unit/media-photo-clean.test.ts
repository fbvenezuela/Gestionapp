// Photos never leave the phone with their EXIF (GPS location): every photo is re-encoded,
// even a small one, and one the browser cannot decode is refused instead of sent as is.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { compressImage, UNCLEANABLE_PHOTO } from '@/lib/media/probe';

let decodable = true;
let encodes: string[] = [];
let encodeAs: (want: string) => string | null = (want) => want;

beforeEach(() => {
  decodable = true;
  encodes = [];
  encodeAs = (want) => want;
  vi.stubGlobal('createImageBitmap', async () => {
    if (!decodable) throw new Error('cannot decode');
    return { width: 1200, height: 900 };
  });
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob | null) => void, want: string) => {
        encodes.push(want);
        const type = encodeAs(want);
        cb(type ? new Blob([new Uint8Array(4000)], { type }) : null);
      },
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

// A small photo with EXIF: under the old size shortcut it went up untouched.
const photo = (type: string, name = 'foto.jpg', bytes = 50_000) => new File([new Uint8Array(bytes)], name, { type });

describe('compressImage', () => {
  it('re-encodes a small JPEG even when re-encoding makes it bigger', async () => {
    const out = await compressImage(photo('image/jpeg', 'foto.jpg', 1_000));
    expect(encodes).toEqual(['image/jpeg']);
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBe(4000);
    expect(out.name).toBe('foto.jpg');
  });

  it('keeps PNG as PNG and turns HEIC into JPEG when the browser can decode it', async () => {
    expect((await compressImage(photo('image/png', 'portada.png'))).name).toBe('portada.png');
    const heic = await compressImage(photo('image/heic', 'IMG_0001.HEIC'));
    expect(heic.type).toBe('image/jpeg');
    expect(heic.name).toBe('IMG_0001.jpg');
  });

  it('names the file after what the browser produced when it cannot encode WebP', async () => {
    encodeAs = (want) => (want === 'image/webp' ? 'image/png' : want);
    const out = await compressImage(photo('image/webp', 'a.webp'));
    expect(out.type).toBe('image/png');
    expect(out.name).toBe('a.png');
  });

  it('refuses a photo it cannot decode or encode instead of sending the original', async () => {
    decodable = false;
    await expect(compressImage(photo('image/heic', 'IMG_0002.HEIC'))).rejects.toThrow(UNCLEANABLE_PHOTO);
    decodable = true;
    encodeAs = () => null;
    await expect(compressImage(photo('image/jpeg'))).rejects.toThrow(UNCLEANABLE_PHOTO);
  });

  it('leaves videos, GIF and SVG alone', async () => {
    for (const f of [photo('video/mp4', 'v.mp4'), photo('image/gif', 'a.gif'), photo('image/svg+xml', 'l.svg')]) {
      expect(await compressImage(f)).toBe(f);
    }
    expect(encodes).toEqual([]);
  });
});
