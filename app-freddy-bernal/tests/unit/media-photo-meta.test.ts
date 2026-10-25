// Removing a photo's metadata without re-encoding it, on real JPEG, PNG and WebP bytes that carry
// a GPS position (tests/unit/fixtures/photos.ts): the location goes, the pixels stay byte for byte.
import { describe, it, expect } from 'vitest';
import { exifOrientation, sniffPhoto, stripPhotoMetadata } from '@/lib/media/photo-meta';
import { JPEG, SECRET, WEBP_LOSSLESS, WEBP_LOSSY, concat, contains, gpsExif, heicHead, jpegWithGps, png, webpExtended } from './fixtures/photos';

const GONE = [SECRET, 'Exif', 'xmpmeta', '8BIM', 'MPF'];
const leftovers = (b: Uint8Array) => GONE.filter((s) => contains(b, s));

describe('sniffPhoto: lo que dicen los bytes, no el nombre', () => {
  it('reconoce JPEG, PNG, WebP y HEIC/HEIF', () => {
    expect(sniffPhoto(JPEG)).toBe('jpeg');
    expect(sniffPhoto(png())).toBe('png');
    expect(sniffPhoto(WEBP_LOSSY)).toBe('webp');
    expect(sniffPhoto(heicHead())).toBe('heif');
    expect(sniffPhoto(heicHead('mif1', ['heic']))).toBe('heif');
  });

  it('un video MP4, un GIF o un PDF no son fotos', () => {
    expect(sniffPhoto(heicHead('isom', ['mp41', 'avc1']))).toBeNull();
    expect(sniffPhoto(new TextEncoder().encode('GIF89a....'))).toBeNull();
    expect(sniffPhoto(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffPhoto(new Uint8Array(0))).toBeNull();
  });
});

describe('exifOrientation', () => {
  it('lee el giro del bloque EXIF, con o sin su encabezado', () => {
    expect(exifOrientation(gpsExif(6))).toBe(6);
    expect(exifOrientation(gpsExif(1, false))).toBe(1);
    expect(exifOrientation(new Uint8Array(20))).toBeNull();
  });
});

describe('JPEG', () => {
  it('quita EXIF con GPS, XMP, MPF, Photoshop, comentarios y lo que viene después del final: la imagen queda igual', () => {
    const dirty = jpegWithGps();
    expect(leftovers(dirty)).toEqual(GONE);
    const r = stripPhotoMetadata('jpeg', dirty)!;
    expect(r).toMatchObject({ width: 4, height: 3, changed: true });
    expect(leftovers(r.bytes)).toEqual([]);
    expect(Buffer.from(r.bytes).equals(Buffer.from(JPEG))).toBe(true);
  });

  it('una foto en vertical conserva solo su giro (un EXIF mínimo, sin GPS)', () => {
    const r = stripPhotoMetadata('jpeg', jpegWithGps(6))!;
    expect(contains(r.bytes, SECRET)).toBe(false);
    expect(contains(r.bytes, 'Exif')).toBe(true);
    expect(r.bytes.length).toBe(JPEG.length + 36);
    // Right after JFIF, as APP1.
    expect([r.bytes[20], r.bytes[21]]).toEqual([0xff, 0xe1]);
    expect(exifOrientation(r.bytes.subarray(24, 56))).toBe(6);
    expect(Buffer.from(r.bytes.subarray(56)).equals(Buffer.from(JPEG.subarray(20)))).toBe(true);
  });

  it('conserva el perfil de color (ICC) y el segmento Adobe', () => {
    const icc = concat([0xff, 0xe2, 0, 18], new TextEncoder().encode('ICC_PROFILE\0'), [1, 1, 0, 0]);
    const adobe = concat([0xff, 0xee, 0, 14], new TextEncoder().encode('Adobe'), [0, 100, 0, 0, 0, 0, 1]);
    const withColor = concat(JPEG.subarray(0, 20), icc, adobe, JPEG.subarray(20));
    const r = stripPhotoMetadata('jpeg', withColor)!;
    expect(Buffer.from(r.bytes).equals(Buffer.from(withColor))).toBe(true);
    expect(r.changed).toBe(false);
  });

  it('sin metadatos no cambia nada', () => {
    expect(stripPhotoMetadata('jpeg', JPEG)).toMatchObject({ changed: false, width: 4, height: 3 });
  });

  it('un archivo cortado o que miente en sus largos no se limpia a medias: null', () => {
    expect(stripPhotoMetadata('jpeg', JPEG.subarray(0, JPEG.length - 40))).toBeNull();
    const bad = JPEG.slice();
    bad[4] = 0xff; // APP0 says it runs past the end
    expect(stripPhotoMetadata('jpeg', bad)).toBeNull();
  });
});

describe('PNG', () => {
  it('quita eXIf, tEXt, iTXt (XMP), zTXt y lo que viene después de IEND', () => {
    const dirty = png(true);
    expect(contains(dirty, SECRET)).toBe(true);
    const r = stripPhotoMetadata('png', dirty)!;
    expect(r).toMatchObject({ width: 4, height: 3, changed: true });
    expect(leftovers(r.bytes)).toEqual([]);
    expect(Buffer.from(r.bytes).equals(Buffer.from(png()))).toBe(true);
  });

  it('sin metadatos no cambia nada', () => {
    expect(stripPhotoMetadata('png', png())).toMatchObject({ changed: false });
  });

  it('con giro en su EXIF hay que recodificarla (null)', () => {
    expect(stripPhotoMetadata('png', png(true, 6))).toBeNull();
  });
});

describe('WebP', () => {
  it('quita los bloques EXIF y XMP, apaga sus banderas y corrige el tamaño RIFF', () => {
    const dirty = webpExtended(true);
    expect(contains(dirty, SECRET)).toBe(true);
    const r = stripPhotoMetadata('webp', dirty)!;
    expect(r).toMatchObject({ width: 4, height: 3, changed: true });
    expect(leftovers(r.bytes)).toEqual([]);
    expect(Buffer.from(r.bytes).equals(Buffer.from(webpExtended()))).toBe(true);
    expect(new DataView(r.bytes.buffer).getUint32(4, true)).toBe(r.bytes.length - 8);
  });

  it('la WebP simple (sin metadatos) queda igual y da su tamaño', () => {
    expect(stripPhotoMetadata('webp', WEBP_LOSSY)).toMatchObject({ width: 4, height: 3, changed: false });
    expect(stripPhotoMetadata('webp', WEBP_LOSSLESS)).toMatchObject({ width: 4, height: 3, changed: false });
  });

  it('con giro en su EXIF hay que recodificarla (null)', () => {
    expect(stripPhotoMetadata('webp', webpExtended(true, 8))).toBeNull();
  });
});

it('HEIC no se puede limpiar sin recodificar (null)', () => {
  expect(stripPhotoMetadata('heif', heicHead())).toBeNull();
});
