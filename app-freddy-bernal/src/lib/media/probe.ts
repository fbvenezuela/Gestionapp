'use client';

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
  } catch {
    // Fallback: the browser's own video element gives at least duration and size.
    return { ...base, ...(await videoElementProbe(file).catch(() => ({}))) };
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

// Shrinks photos before upload (slow data in Táchira). Videos are never re-encoded here.
export async function compressImage(file: File, maxSide = 2560, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return file;
  // Re-encoding also drops EXIF (including GPS location).
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
