// Thumbnails made in the browser at upload: what the server accepts (a whole JPEG of at most 256 KB and 320 px,
// read from its bytes, never from a name or a declared type), and the browser side's sizes and its «null on
// anything unexpected».
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  checkUploadThumb, jpegSize, sniffThumb, thumbBox, thumbFromBase64, thumbSeekTime, thumbToBase64, THUMB_MAX_BASE64, THUMB_MAX_BYTES,
} from '@/lib/domain/thumb';
import { makeThumb, withTimeout } from '@/lib/media/thumbnail';
import { JPEG, WEBP_LOSSY, png } from './fixtures/photos';
import { jpegOf, jpegWithComment } from './fixtures/thumbs';
import fs from 'node:fs';
import path from 'node:path';

const text = (s: string) => Uint8Array.from(Buffer.from(s, 'latin1'));

describe('miniatura: se reconoce por sus bytes', () => {
  it('JPEG, PNG y WebP por sus primeros bytes; lo demás no es miniatura', () => {
    expect(sniffThumb(JPEG)).toBe('image/jpeg');
    expect(sniffThumb(png())).toBe('image/png');
    expect(sniffThumb(WEBP_LOSSY)).toBe('image/webp');
    for (const s of ['GIF89a....', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<!doctype html><script>x</script>', '%PDF-1.7', '']) {
      expect(sniffThumb(text(s)), s).toBeNull();
    }
    expect(sniffThumb(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });

  it('el tamaño sale del encabezado del JPEG (también de uno real)', () => {
    expect(jpegSize(JPEG)).toEqual({ width: 4, height: 3 });
    expect(jpegSize(jpegOf(320, 180))).toEqual({ width: 320, height: 180 });
    expect(jpegSize(jpegOf(120, 90, 3000))).toEqual({ width: 120, height: 90 });
    const cover = new Uint8Array(fs.readFileSync(path.join(__dirname, '../fixtures/cover.jpg')));
    expect(jpegSize(cover)).toEqual({ width: 1080, height: 1920 });
    expect(jpegSize(png())).toBeNull();
    expect(jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });
});

describe('miniatura subida: lo que el servidor guarda', () => {
  it('acepta un JPEG entero de hasta 320 px y 256 KB', () => {
    expect(checkUploadThumb(JPEG)).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(checkUploadThumb(jpegOf(320, 320))).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(checkUploadThumb(jpegOf(180, 320))).toEqual({ ok: true, mime: 'image/jpeg' });
    const big = jpegOf(320, 240, THUMB_MAX_BYTES);
    expect(big.length).toBe(THUMB_MAX_BYTES);
    expect(checkUploadThumb(big).ok).toBe(true);
  });

  it('rechaza lo vacío, lo pesado, lo grande, lo cortado y lo que no es JPEG', () => {
    expect(checkUploadThumb(new Uint8Array())).toEqual({ ok: false, why: 'empty' });
    expect(checkUploadThumb(jpegOf(320, 240, THUMB_MAX_BYTES + 1))).toEqual({ ok: false, why: 'too_big' });
    expect(checkUploadThumb(jpegOf(321, 100))).toEqual({ ok: false, why: 'too_wide' });
    expect(checkUploadThumb(jpegOf(100, 321))).toEqual({ ok: false, why: 'too_wide' });
    const cover = new Uint8Array(fs.readFileSync(path.join(__dirname, '../fixtures/cover.jpg')));
    expect(checkUploadThumb(cover)).toEqual({ ok: false, why: 'too_wide' });
    expect(checkUploadThumb(JPEG.subarray(0, JPEG.length - 2))).toEqual({ ok: false, why: 'not_jpeg' });
    for (const b of [png(), WEBP_LOSSY, text('<svg onload="x"></svg>'), text('<html><body>hola</body></html>')]) {
      expect(checkUploadThumb(b).ok).toBe(false);
    }
    // A JPEG start and end around anything else: no frame header, no size, refused.
    expect(checkUploadThumb(Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x3c, 0x73, 0xff, 0xd9]))).toEqual({ ok: false, why: 'unreadable' });
  });

  it('base64 de ida y vuelta; texto que no es base64 o es muy largo no se lee', () => {
    const b = jpegWithComment('miniatura de prueba');
    expect(thumbFromBase64(thumbToBase64(b))).toEqual(b);
    expect(thumbToBase64(b)).toBe(Buffer.from(b).toString('base64'));
    for (const bad of ['', 'no es base64!', 'abc', '====', 'A'.repeat(THUMB_MAX_BASE64 + 4), 'data:image/jpeg;base64,/9j/']) {
      expect(thumbFromBase64(bad), bad.slice(0, 30)).toBeNull();
    }
    expect(thumbFromBase64(123 as unknown as string)).toBeNull();
  });
});

describe('miniatura en el navegador', () => {
  afterEach(() => vi.useRealTimers());

  it('el lado largo queda en 320 px como mucho y nunca se agranda', () => {
    expect(thumbBox(4000, 3000)).toEqual({ width: 320, height: 240 });
    expect(thumbBox(1080, 1920)).toEqual({ width: 180, height: 320 });
    expect(thumbBox(100, 50)).toEqual({ width: 100, height: 50 });
    expect(thumbBox(1, 5000)).toEqual({ width: 1, height: 320 });
    expect(thumbBox(0, 100)).toEqual({ width: 0, height: 0 });
    expect(thumbBox(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });

  it('el cuadro del video: cerca del segundo 1, antes en un clip muy corto', () => {
    expect(thumbSeekTime(60)).toBe(1);
    expect(thumbSeekTime(1.5)).toBe(0.5);
    expect(thumbSeekTime(0)).toBe(0);
    expect(thumbSeekTime(Number.NaN)).toBe(0);
    expect(thumbSeekTime(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('sin navegador, sin imagen o con un archivo que no es foto ni video: null, nunca un error', async () => {
    expect(await makeThumb(new File([JPEG], 'foto.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(await makeThumb(new File(['%PDF'], 'storyboard.pdf', { type: 'application/pdf' }))).toBeNull();
  });

  it('pasado el tiempo, null y se limpia; un error también es null', async () => {
    vi.useFakeTimers();
    const onLate = vi.fn();
    const slow = withTimeout(new Promise<string>(() => {}), 8000, onLate);
    await vi.advanceTimersByTimeAsync(7999);
    expect(onLate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await slow).toBeNull();
    expect(onLate).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    expect(await withTimeout(Promise.resolve('listo'), 8000)).toBe('listo');
    expect(await withTimeout(Promise.reject(new Error('HEVC')), 8000)).toBeNull();
  });
});
