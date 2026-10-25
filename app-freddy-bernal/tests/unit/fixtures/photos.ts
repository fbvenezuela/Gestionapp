// Real minimal photos for the metadata tests, plus builders that add what phones and editors
// write into them: EXIF with the GPS position, XMP, Photoshop/IPTC, comments, text chunks and
// data after the end of the image. The pixels were made with Pillow (4×3, invented colors).
import { crc32 } from 'node:zlib';
import { deflateSync } from 'node:zlib';

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const text = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

export function concat(...parts: (Uint8Array | number[])[]): Uint8Array<ArrayBuffer> {
  const all = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** True when `needle` (latin1 text) appears anywhere in the bytes. */
export const contains = (bytes: Uint8Array, needle: string) => Buffer.from(bytes).includes(Buffer.from(needle, 'latin1'));

// What the tests look for: none of it may survive cleaning.
export const SECRET = 'GPSPHONE-7.7706N';

// Baseline JPEG, 4×3, JFIF APP0 only.
export const JPEG = b64(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDhWJZizEkk5JPeiiivjz9dSSVkf//Z',
);
// Lossless (VP8L) and lossy (VP8) WebP, 4×3, no metadata.
export const WEBP_LOSSLESS = b64('UklGRiQAAABXRUJQVlA4TBcAAAAvA4AAAA9wMOQr+N6Dff4jDXd4iOh/GAA=');
export const WEBP_LOSSY = b64('UklGRkYAAABXRUJQVlA4IDoAAADwAQCdASoEAAMAAUAmJbACdLoB+AAETAAA/vDXnO9vPv4X/zBK/IN2of/dr0fDkYBM9xn+4z/5EAAA');

/**
 * A phone's EXIF block (TIFF, little-endian): camera make, orientation and a GPS IFD with
 * latitude and longitude. `prefix` adds the «Exif\0\0» header that JPEG's APP1 uses.
 */
export function gpsExif(orientation = 1, prefix = true): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(172);
  const v = new DataView(b.buffer);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    v.setUint16(at, tag, true);
    v.setUint16(at + 2, type, true);
    v.setUint32(at + 4, count, true);
    if (type === 3) v.setUint16(at + 8, value, true);
    else v.setUint32(at + 8, value, true);
  };
  b.set(text('II'), 0);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  // IFD0 at 8: Make, Orientation, GPS pointer.
  v.setUint16(8, 3, true);
  entry(10, 0x010f, 2, SECRET.length + 1, 50);
  entry(22, 0x0112, 3, 1, orientation);
  entry(34, 0x8825, 4, 1, 70);
  b.set(text(`${SECRET}\0`), 50);
  // GPS IFD at 70: N 7°46'14.16", W 72°13'56.78" (invented).
  v.setUint16(70, 4, true);
  entry(72, 0x0001, 2, 2, 0x4e);
  entry(84, 0x0002, 5, 3, 124);
  entry(96, 0x0003, 2, 2, 0x57);
  entry(108, 0x0004, 5, 3, 148);
  [7, 1, 46, 1, 1416, 100, 72, 1, 13, 1, 5678, 100].forEach((n, k) => v.setUint32(124 + k * 4, n, true));
  return prefix ? concat(text('Exif\0\0'), b) : b;
}

const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:Description exif:GPSLatitude="7,46.236N" tiff:Make="${SECRET}"/></x:xmpmeta>`;

const segment = (marker: number, payload: Uint8Array) => concat([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff], payload);

/** The JPEG above as a phone would save it: metadata after JFIF, and an extra image after the end. */
export function jpegWithGps(orientation = 1): Uint8Array<ArrayBuffer> {
  const app0End = 20; // SOI + APP0 (JFIF, 16 bytes)
  return concat(
    JPEG.subarray(0, app0End),
    segment(0xe1, gpsExif(orientation)),
    segment(0xe1, concat(text('http://ns.adobe.com/xap/1.0/\0'), text(XMP))),
    segment(0xe2, concat(text('MPF\0'), text(SECRET))),
    segment(0xed, concat(text('Photoshop 3.0\x008BIM'), text(SECRET))),
    segment(0xfe, text(SECRET)),
    JPEG.subarray(app0End),
    // MPF's second image (a thumbnail with its own EXIF) after the end of the first.
    [0xff, 0xd8],
    segment(0xe1, gpsExif()),
    [0xff, 0xd9],
  );
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const body = concat(text(type), data);
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(body, 4);
  v.setUint32(8 + data.length, crc32(body) >>> 0);
  return out;
}

/** A valid 4×3 RGB PNG; with `meta`, the text, XMP and EXIF chunks editors and phones add. */
export function png(meta = false, orientation = 1): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, 4);
  v.setUint32(4, 3);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array(3 * (1 + 4 * 3)).map((_, k) => (k % 13 === 0 ? 0 : (k * 37) % 256));
  const parts: Uint8Array[] = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  if (meta) {
    parts.push(chunk('tEXt', text(`Comment\0${SECRET}`)));
    parts.push(chunk('iTXt', concat(text('XML:com.adobe.xmp\0\0\0\0\0'), text(XMP))));
    parts.push(chunk('zTXt', concat(text('Location\0\0'), deflateSync(Buffer.from(SECRET)))));
    parts.push(chunk('eXIf', gpsExif(orientation, false)));
  }
  parts.push(chunk('IDAT', deflateSync(Buffer.from(rows))));
  parts.push(chunk('IEND', new Uint8Array(0)));
  if (meta) parts.push(text(SECRET)); // data after the end
  return concat(...parts);
}

function riffChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = new Uint8Array(8);
  head.set(text(type), 0);
  new DataView(head.buffer).setUint32(4, data.length, true);
  return concat(head, data, data.length & 1 ? [0] : []);
}

function riff(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const body = concat(text('WEBP'), ...chunks);
  const head = concat(text('RIFF'), [0, 0, 0, 0]);
  new DataView(head.buffer).setUint32(4, body.length, true);
  return concat(head, body);
}

/** Extended WebP (VP8X) around the lossless image; with `meta`, its EXIF (GPS) and XMP chunks. */
export function webpExtended(meta = false, orientation = 1): Uint8Array<ArrayBuffer> {
  const vp8x = new Uint8Array(10);
  vp8x[0] = meta ? 0x0c : 0;
  vp8x.set([3, 0, 0, 2, 0, 0], 4); // canvas 4×3, stored minus one
  const image = WEBP_LOSSLESS.subarray(12);
  return meta
    ? riff(riffChunk('VP8X', vp8x), image, riffChunk('EXIF', gpsExif(orientation, false)), riffChunk('XMP ', text(XMP)))
    : riff(riffChunk('VP8X', vp8x), image);
}

/** The first bytes of a HEIC file (ISO-BMFF «ftyp» box). */
export function heicHead(major = 'heic', compatible = ['mif1', 'heic']): Uint8Array<ArrayBuffer> {
  const box = concat([0, 0, 0, 16 + 4 * compatible.length], text('ftyp'), text(major), [0, 0, 0, 0], ...compatible.map(text));
  return concat(box, new Uint8Array(200));
}
