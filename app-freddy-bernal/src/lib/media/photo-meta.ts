// Photo metadata removal at the byte level (pure, so it can be tested on real files). A photo
// loses its EXIF (GPS location, camera, date), XMP, IPTC and text chunks WITHOUT re-encoding:
// the pixels and the size stay as they were. Only the EXIF rotation survives (a JPEG gets a
// minimal EXIF block with just that tag), so a portrait photo does not turn sideways.
// Anything this cannot parse returns null and the caller re-encodes it (or refuses it).

export type PhotoKind = 'jpeg' | 'png' | 'webp' | 'heif';
export const PHOTO_MIME: Record<PhotoKind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heif: 'image/heic' };

export type CleanPhoto = { bytes: Uint8Array<ArrayBuffer>; width: number; height: number; changed: boolean };

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32be = (b: Uint8Array, at: number) => b[at] * 0x1000000 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32le = (b: Uint8Array, at: number) => u24le(b, at) + b[at + 3] * 0x1000000;

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// HEIC/HEIF/AVIF brands (ISO-BMFF «ftyp»); MP4 and MOV brands are not photos.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis']);

/** What kind of photo the first bytes say this is, whatever its name or File.type claim. */
export function sniffPhoto(b: Uint8Array): PhotoKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const end = Math.min(b.length, u32be(b, 0));
    for (let at = 8; at + 4 <= end; at += at === 8 ? 8 : 4) if (HEIF_BRANDS.has(ascii(b, at, 4))) return 'heif';
  }
  return null;
}

/** EXIF orientation (1-8) from a TIFF block (with or without its «Exif\0\0» prefix), or null. */
export function exifOrientation(block: Uint8Array): number | null {
  const t = block.length >= 6 && ascii(block, 0, 4) === 'Exif' ? block.subarray(6) : block;
  if (t.length < 8) return null;
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return null;
  const u16 = (at: number) => (le ? u16le(t, at) : u16be(t, at));
  const u32 = (at: number) => (le ? u32le(t, at) : u32be(t, at));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > t.length) return null;
  for (let k = 0, n = u16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) return null;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

// The smallest EXIF a JPEG can carry: IFD0 with the orientation tag only (big-endian TIFF).
function orientationApp1(orientation: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const len = 2 + 6 + tiff.length;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
}

const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

// JPEG: keep the image segments, JFIF (APP0), the color profile (APP2 ICC_PROFILE) and Adobe's
// color transform (APP14). Every other APPn (EXIF, XMP, MPF, IPTC, maker data) and comments go,
// and so does anything after the end of the image (MPF's extra images, motion-photo videos).
function stripJpeg(b: Uint8Array): CleanPhoto | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let afterApp0 = 1;
  let ended = false;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i++; // fill byte
      continue;
    }
    if (m === 0xd9) {
      out.push(b.subarray(i, i + 2));
      ended = true;
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return null;
    const len = u16be(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    const data = b.subarray(i + 4, i + 2 + len);
    const app = m >= 0xe1 && m <= 0xef;
    const keep = m !== 0xfe && (!app || m === 0xee || (m === 0xe2 && ascii(data, 0, 12) === 'ICC_PROFILE\0'));
    if (keep) {
      out.push(b.subarray(i, i + 2 + len));
      if (m === 0xe0 && out.length === 2) afterApp0 = 2;
    } else if (m === 0xe1 && ascii(data, 0, 4) === 'Exif') {
      orientation = exifOrientation(data) ?? orientation;
    }
    if (isSof(m) && data.length >= 5) {
      height = u16be(data, 1);
      width = u16be(data, 3);
    }
    i += 2 + len;
    if (m === 0xda) {
      // Entropy-coded data runs to the next marker that is not a stuffed byte or a restart.
      let j = i;
      while (j + 1 < b.length && !(b[j] === 0xff && b[j + 1] !== 0x00 && b[j + 1] !== 0xff && (b[j + 1] < 0xd0 || b[j + 1] > 0xd7))) j++;
      if (j + 1 >= b.length) return null;
      out.push(b.subarray(i, j));
      i = j;
    }
  }
  if (!ended || !width || !height) return null;
  if (orientation !== 1) out.splice(afterApp0, 0, orientationApp1(orientation));
  const bytes = concat(out);
  return { bytes, width, height, changed: bytes.length !== b.length || bytes.some((v, k) => v !== b[k]) };
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);

// PNG: drop the EXIF and text chunks (XMP lives in iTXt). A rotation tag cannot be kept without
// rewriting a CRC: null, so the caller re-encodes with the rotation applied.
function stripPng(b: Uint8Array): CleanPhoto | null {
  if (b.length < 33 || ascii(b, 1, 3) !== 'PNG' || ascii(b, 12, 4) !== 'IHDR') return null;
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let dropped = false;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (PNG_DROP.has(type)) {
      if (type === 'eXIf' && (exifOrientation(b.subarray(i + 8, i + 8 + len)) ?? 1) !== 1) return null;
      dropped = true;
    } else {
      out.push(b.subarray(i, end));
    }
    i = end;
    if (type === 'IEND') {
      const bytes = concat(out);
      return { bytes, width: u32be(b, 16), height: u32be(b, 20), changed: dropped || end !== b.length };
    }
  }
  return null;
}

// WebP: drop the EXIF and XMP chunks, clear their flags in VP8X and fix the RIFF size. A
// rotation tag in the EXIF: null, so the caller re-encodes with the rotation applied.
function stripWebp(b: Uint8Array): CleanPhoto | null {
  const end = Math.min(b.length, 8 + u32le(b, 4));
  if (end < 20) return null;
  const out: Uint8Array[] = [];
  let i = 12;
  let width = 0;
  let height = 0;
  let dropped = false;
  while (i + 8 <= end) {
    const type = ascii(b, i, 4);
    const len = u32le(b, i + 4);
    const next = i + 8 + len + (len & 1);
    if (i + 8 + len > end) return null;
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'EXIF' || type === 'XMP ') {
      if (type === 'EXIF' && (exifOrientation(data) ?? 1) !== 1) return null;
      dropped = true;
    } else if (type === 'VP8X' && len >= 10) {
      const chunk = b.slice(i, Math.min(next, end));
      chunk[8] &= ~0x0c; // EXIF and XMP flags
      out.push(chunk);
      width = 1 + u24le(data, 4);
      height = 1 + u24le(data, 7);
    } else {
      out.push(b.subarray(i, Math.min(next, end)));
      if (!width && type === 'VP8 ' && len >= 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) {
        width = u16le(data, 6) & 0x3fff;
        height = u16le(data, 8) & 0x3fff;
      } else if (!width && type === 'VP8L' && len >= 5 && data[0] === 0x2f) {
        const bits = u32le(data, 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
    }
    i = next;
  }
  if (!width || !height) return null;
  const body = concat(out);
  const bytes = concat([Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), body]);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  return { bytes, width, height, changed: dropped || bytes.length !== b.length };
}

/**
 * The same photo without its metadata, and its size in pixels. Null when it cannot be done
 * losslessly (HEIC, a damaged or unusual file, a PNG/WebP rotation tag): re-encode it instead.
 */
export function stripPhotoMetadata(kind: PhotoKind, bytes: Uint8Array): CleanPhoto | null {
  try {
    if (kind === 'jpeg') return stripJpeg(bytes);
    if (kind === 'png') return stripPng(bytes);
    if (kind === 'webp') return stripWebp(bytes);
  } catch {
    // A file that lies about its own lengths: treat it as unparseable.
  }
  return null;
}
