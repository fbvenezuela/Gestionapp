// Small pictures of a file (Biblioteca, Resultados, the material list). Pure: the browser makes them
// (src/lib/media/thumbnail.ts) and the server checks them before keeping one (src/lib/storage/thumbs.ts).
// media_thumbs keeps at most 256 KB of JPEG, PNG or WebP per file (20261026001200_drive.sql). A thumbnail made at
// upload is always a JPEG of at most 320 px a side (Safari's canvas cannot write WebP); the bytes come from a
// team member's browser, so the server reads them, never trusts the name or the declared type.

export const THUMB_MAX_BYTES = 262_144;
export const THUMB_MAX_SIDE = 320;
/** Longest base64 text a THUMB_MAX_BYTES file can be. */
export const THUMB_MAX_BASE64 = Math.ceil(THUMB_MAX_BYTES / 3) * 4;

export type ThumbMime = 'image/jpeg' | 'image/png' | 'image/webp';

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

/** What picture the first bytes say this is (only the three types media_thumbs keeps). */
export function sniffThumb(b: Uint8Array): ThumbMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/** Width and height from a JPEG's frame header (SOF0–SOF15 but DHT, JPG and DAC), or null if it cannot be read. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (sniffThumb(b) !== 'image/jpeg') return null;
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Markers with no length: TEM, RST0–7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = (b[at + 2] << 8) | b[at + 3];
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 9 > b.length) return null;
      const height = (b[at + 5] << 8) | b[at + 6];
      const width = (b[at + 7] << 8) | b[at + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    at += 2 + len;
  }
  return null;
}

export type ThumbCheck = { ok: true; mime: 'image/jpeg' } | { ok: false; why: 'empty' | 'too_big' | 'not_jpeg' | 'unreadable' | 'too_wide' };

/** A thumbnail made at upload: a whole JPEG (starts with SOI, ends with EOI), at most 256 KB and 320 px a side. */
export function checkUploadThumb(b: Uint8Array): ThumbCheck {
  if (!b.length) return { ok: false, why: 'empty' };
  if (b.length > THUMB_MAX_BYTES) return { ok: false, why: 'too_big' };
  if (sniffThumb(b) !== 'image/jpeg' || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return { ok: false, why: 'not_jpeg' };
  const size = jpegSize(b);
  if (!size) return { ok: false, why: 'unreadable' };
  if (size.width > THUMB_MAX_SIDE || size.height > THUMB_MAX_SIDE) return { ok: false, why: 'too_wide' };
  return { ok: true, mime: 'image/jpeg' };
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Bytes from the base64 text the browser sends, or null when it is not base64 or is too long. */
export function thumbFromBase64(s: string): Uint8Array | null {
  if (typeof s !== 'string' || !s.length || s.length > THUMB_MAX_BASE64 || s.length % 4 !== 0 || !B64.test(s)) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function thumbToBase64(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The size to draw a w×h picture at: the long side at most `max`, never enlarged, never 0. */
export function thumbBox(w: number, h: number, max = THUMB_MAX_SIDE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Where to take a video's picture: about a second in (past a black first frame), earlier in a very short clip. */
export function thumbSeekTime(durationS: number): number {
  if (!Number.isFinite(durationS) || durationS <= 0) return 0;
  return Math.min(1, durationS / 3);
}
