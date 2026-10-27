'use client';

import { checkUploadThumb, thumbBox, thumbSeekTime, thumbToBase64, THUMB_MAX_BYTES } from '../domain/thumb';

// The small picture of a photo or a video, made IN THE BROWSER while the file uploads, so Biblioteca and Resultados
// show it whatever the storage (Supabase has no thumbnails of its own; Drive's take a while). Best effort: a JPEG
// of at most 320 px, or null on anything unexpected (HEVC or ProRes that this browser cannot decode, a broken file,
// no canvas, more than THUMB_TIMEOUT_MS). It never blocks or slows the upload. Canvas code paints no colors of its
// own: it only scales the file's pixels.

export const THUMB_TIMEOUT_MS = 8000;
const QUALITIES = [0.7, 0.5, 0.35];

/** `p`, or null when it takes longer than `ms` (then `onLate` cleans up) or fails. */
export async function withTimeout<T>(p: Promise<T>, ms: number, onLate?: () => void): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      onLate?.();
      resolve(null);
    }, ms);
  });
  try {
    return await Promise.race([p.catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}

function canvasFor(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', q));

// JPEG bytes as base64 (the server checks them again), or null when the browser wrote something else or too much.
async function encode(c: HTMLCanvasElement): Promise<string | null> {
  for (const q of QUALITIES) {
    const blob = await toBlob(c, q);
    if (!blob) return null;
    if (blob.size > THUMB_MAX_BYTES) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return checkUploadThumb(bytes).ok ? thumbToBase64(bytes) : null;
  }
  return null;
}

async function draw(src: CanvasImageSource, w: number, h: number): Promise<string | null> {
  const box = thumbBox(w, h);
  if (!box.width) return null;
  const c = canvasFor(box.width, box.height);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, box.width, box.height);
  return encode(c);
}

async function imageThumb(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  try {
    return await draw(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

function once(el: HTMLMediaElement, ok: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      el.removeEventListener(ok, done);
      el.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      el.removeEventListener(ok, done);
      el.removeEventListener('error', fail);
      reject(new Error('video'));
    };
    el.addEventListener(ok, done);
    el.addEventListener('error', fail);
  });
}

function videoThumb(file: File): { run: Promise<string | null>; stop: () => void } {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'metadata';
  const stop = () => {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  };
  const run = (async () => {
    try {
      const meta = once(v, 'loadedmetadata');
      v.src = url;
      await meta;
      // Always seek (a hair in when the length is unknown): «seeked» is what makes a phone decode a frame without
      // playing the video.
      const seeked = once(v, 'seeked');
      v.currentTime = Math.max(thumbSeekTime(v.duration), 0.05);
      await seeked;
      return await draw(v, v.videoWidth, v.videoHeight);
    } finally {
      stop();
    }
  })();
  return { run, stop };
}

/** Base64 JPEG of at most 320 px for a photo or a video, or null. Never throws. */
export async function makeThumb(file: File, timeoutMs = THUMB_TIMEOUT_MS): Promise<string | null> {
  try {
    if (typeof document === 'undefined') return null;
    if (file.type.startsWith('image/') && typeof createImageBitmap === 'function') return await withTimeout(imageThumb(file), timeoutMs);
    if (file.type.startsWith('video/')) {
      const job = videoThumb(file);
      return await withTimeout(job.run, timeoutMs, job.stop);
    }
    return null;
  } catch {
    return null;
  }
}
