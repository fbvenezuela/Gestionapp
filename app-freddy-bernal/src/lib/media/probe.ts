'use client';

import { PHOTO_MIME, sniffPhoto, stripPhotoMetadata } from './photo-meta';

// Reads a video/image file IN THE BROWSER (nothing is uploaded) to get duration,
// size, fps, codecs and weight. Used before uploading and to validate per network.
export type Probe = {
  durationS: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  sizeBytes: number;
  mime: string;
};

type Track = Record<string, unknown> & { '@type': string };

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function probeFile(file: File): Promise<Probe> {
  const base: Probe = { durationS: null, width: null, height: null, fps: null, videoCodec: null, audioCodec: null, hasAudio: false, sizeBytes: file.size, mime: file.type };
  if (file.type.startsWith('image/')) {
    const dims = await imageSize(file).catch(() => null);
    return { ...base, width: dims?.w ?? null, height: dims?.h ?? null };
  }
  try {
    const mediaInfoFactory = await loadMediaInfo();
    const mi = await mediaInfoFactory({ format: 'object', locateFile: () => '/mediainfo/MediaInfoModule.wasm' });
    const result = await mi.analyzeData(file.size, async (size: number, offset: number) => new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()));
    mi.close();
    return fromTracks(base, result);
  } catch {
    // Fallback: the browser's own video element gives at least duration and size.
    return { ...base, ...(await videoElementProbe(file).catch(() => ({}))) };
  }
}

function fromTracks(base: Probe, result: { media?: { track?: unknown[] } }): Probe {
  const tracks = (result.media?.track ?? []) as unknown as Track[];
  const g = tracks.find((t) => t['@type'] === 'General');
  const v = tracks.find((t) => t['@type'] === 'Video');
  const a = tracks.find((t) => t['@type'] === 'Audio');
  return {
    ...base,
    durationS: num(g?.Duration) ?? num(v?.Duration),
    width: num(v?.Width),
    height: num(v?.Height),
    fps: num(v?.FrameRate),
    videoCodec: v ? String(v.Format ?? '').toLowerCase() || null : null,
    audioCodec: a ? String(a.Format ?? '').toLowerCase() || null : null,
    hasAudio: !!a,
  };
}

// A video already in Drive (picked or imported): MediaInfo reads only the parts it needs (the
// header and the index) through the platform's own ranged download, never from Google directly.
const REMOTE_READ_MAX = 32 * 1024 * 1024;

export async function probeRemote(url: string, size: number, mime: string): Promise<Probe | null> {
  const base: Probe = { durationS: null, width: null, height: null, fps: null, videoCodec: null, audioCodec: null, hasAudio: false, sizeBytes: size, mime };
  if (!mime.startsWith('video/') || !(size > 0)) return null;
  let read = 0;
  try {
    const mediaInfoFactory = await loadMediaInfo();
    const mi = await mediaInfoFactory({ format: 'object', locateFile: () => '/mediainfo/MediaInfoModule.wasm' });
    try {
      const result = await mi.analyzeData(size, async (want: number, offset: number) => {
        const out = new Uint8Array(Math.max(0, Math.min(want, size - offset)));
        let got = 0;
        while (got < out.length) {
          if (read >= REMOTE_READ_MAX) throw new Error('too much');
          const res = await fetch(url, { headers: { Range: `bytes=${offset + got}-${offset + out.length - 1}` }, cache: 'no-store' });
          if (res.status !== 206) {
            await res.body?.cancel().catch(() => {});
            throw new Error(`http ${res.status}`);
          }
          const buf = new Uint8Array(await res.arrayBuffer());
          if (!buf.length) break;
          out.set(buf.subarray(0, out.length - got), got);
          got += buf.length;
          read += buf.length;
        }
        return out.subarray(0, got);
      });
      return fromTracks(base, result);
    } finally {
      mi.close();
    }
  } catch {
    return null;
  }
}

type Factory = (opts: { format: 'object'; locateFile: () => string }) => Promise<{
  analyzeData: (size: number, read: (size: number, offset: number) => Promise<Uint8Array>) => Promise<{ media?: { track?: unknown[] } }>;
  close: () => void;
}>;

let loading: Promise<Factory> | null = null;
function loadMediaInfo(): Promise<Factory> {
  loading ??= new Promise<Factory>((resolve, reject) => {
    const w = window as unknown as { MediaInfo?: { mediaInfoFactory: Factory } };
    if (w.MediaInfo) return resolve(w.MediaInfo.mediaInfoFactory);
    const s = document.createElement('script');
    s.src = '/mediainfo/mediainfo.min.js';
    s.onload = () => (w.MediaInfo ? resolve(w.MediaInfo.mediaInfoFactory) : reject(new Error('mediainfo')));
    s.onerror = () => {
      loading = null;
      reject(new Error('mediainfo'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function videoElementProbe(file: File): Promise<Partial<Probe>> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ durationS: v.duration, width: v.videoWidth, height: v.videoHeight });
      URL.revokeObjectURL(v.src);
    };
    v.onerror = reject;
    v.src = URL.createObjectURL(file);
  });
}

export const UNCLEANABLE_PHOTO = 'Esta foto no se puede limpiar en este teléfono y podría llevar la ubicación. Pásala a JPG y vuelve a subirla.';
// A JPEG, PNG or WebP the browser should open but could not: almost always memory.
export const PHOTO_BUSY = 'No se pudo preparar la foto. Si subiste varias, intenta con menos a la vez.';

const PHOTO_EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// No photo leaves the phone with its EXIF (GPS location), XMP or text metadata. The photo is
// recognized by its bytes, not by File.type (empty for a file without an extension or an unknown
// one). JPEG, PNG and WebP lose their metadata without re-encoding (photo-meta.ts): same pixels.
// They are re-encoded only when larger than maxSide, and then the smaller clean result is kept.
// HEIC and anything that cannot be parsed are re-encoded; one the browser cannot open either is
// refused rather than sent with its EXIF. GIF and SVG carry no camera location and pass as they
// are, and so do videos (never re-encoded here) and files that are not photos. The result keeps
// the original lastModified, so a resumed upload has the same fingerprint (tus).
export async function compressImage(file: File, maxSide = 2560, quality = 0.85): Promise<File> {
  const declared = file.type.toLowerCase();
  if (/^(video|audio)\//.test(declared) || declared === 'image/gif' || declared === 'image/svg+xml') return file;
  const kind = sniffPhoto(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!kind && !declared.startsWith('image/')) return file;
  const mime = kind ? PHOTO_MIME[kind] : declared;
  const stripped = kind ? stripPhotoMetadata(kind, new Uint8Array(await file.arrayBuffer())) : null;
  if (stripped && !stripped.changed && Math.max(stripped.width, stripped.height) <= maxSide && file.type === mime) return file;
  let best: Blob | null = stripped ? new Blob([stripped.bytes], { type: mime }) : null;
  if (!stripped || Math.max(stripped.width, stripped.height) > maxSide) {
    // PNG and WebP keep their format (transparency); everything else becomes JPEG.
    const want = mime === 'image/png' || mime === 'image/webp' ? mime : 'image/jpeg';
    const native = kind === 'jpeg' || kind === 'png' || kind === 'webp';
    const encoded = await reencode(file, want, maxSide, quality, native ? PHOTO_BUSY : UNCLEANABLE_PHOTO).catch((e) => {
      if (!best) throw e;
      return null; // too big but clean: better big than not at all
    });
    if (encoded && (!best || encoded.size < best.size)) best = encoded;
  }
  // A browser that cannot encode WebP hands back PNG: name the file after what it got.
  const type = PHOTO_EXT[best!.type] ? best!.type : 'image/jpeg';
  return new File([best!], file.name.replace(/\.\w+$/, '') + PHOTO_EXT[type], { type, lastModified: file.lastModified });
}

// Decodes (rotation applied), scales down to maxSide and encodes. The bitmap and the canvas are
// released right away: phones run out of canvas memory quickly.
async function reencode(src: Blob, want: string, maxSide: number, quality: number, failure: string): Promise<Blob> {
  const bitmap = await createImageBitmap(src).catch(() => null);
  if (!bitmap) throw new Error(failure);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(PHOTO_BUSY);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, want, quality));
    if (!blob) throw new Error(failure);
    return blob;
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
