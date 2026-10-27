// Thumbnail bytes for the tests: real JPEG framing (SOI, a frame header with the size, EOI), no real picture needed.
import { JPEG } from './photos';

const FRAME = (w: number, h: number) => [0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];

/** A JPEG whose frame header says w×h (only the header is read), `total` bytes long when given (comment padding). */
export function jpegOf(w: number, h: number, total?: number): Uint8Array<ArrayBuffer> {
  const head = [0xff, 0xd8];
  const tail = [...FRAME(w, h), 0xff, 0xd9];
  const pad: number[] = [];
  let left = total == null ? 0 : total - head.length - tail.length;
  if (left < 0 || (left > 0 && left < 4)) throw new Error('jpegOf: size too small');
  while (left > 0) {
    const n = Math.min(left - 4, 65000);
    pad.push(0xff, 0xfe, ((n + 2) >> 8) & 0xff, (n + 2) & 0xff, ...new Array<number>(n).fill(0x41));
    left -= n + 4;
    if (left > 0 && left < 4) throw new Error('jpegOf: size not reachable');
  }
  return Uint8Array.from([...head, ...pad, ...tail]);
}

/** The real 4×3 test JPEG with a comment after SOI: same picture, different bytes. */
export function jpegWithComment(text: string): Uint8Array<ArrayBuffer> {
  const c = Buffer.from(text, 'latin1');
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, ((c.length + 2) >> 8) & 0xff, (c.length + 2) & 0xff, ...c, ...JPEG.subarray(2)]);
}

export const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
