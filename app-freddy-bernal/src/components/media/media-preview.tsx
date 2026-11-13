'use client';

import { useCallback, useState } from 'react';
import { RotateCcw } from 'lucide-react';

// Private file preview through the signed download route (never a public URL). A file kept in
// Drive that cannot be played (Drive down, permission expired, this month's cap) says why
// instead of leaving a dead player. A video shows the picture kept at upload until it plays
// (`videoPoster`); in the demo, one with no file behind it says so under the player (`demo`).
export function MediaPreview({ id, mime, drive = false, demo = false }: { id: string; mime: string; drive?: boolean; demo?: boolean }) {
  const src = `/api/media/${id}?ver=1`;
  const { message, attempt, watch, onError, retry } = useMediaFailure(src, mime, drive);
  const sample = useDemoVideo(demo && !drive);
  const sampleWatch = sample.watch;
  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      watch(el);
      sampleWatch(el);
    },
    [watch, sampleWatch],
  );
  if (message) return <MediaFailure message={message} onRetry={retry} />;
  if (mime.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img key={attempt} ref={watch} src={src} alt="Vista previa" onError={onError} className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate object-contain" />;
  }
  if (mime.startsWith('audio/')) return <audio key={attempt} ref={watch} src={src} controls preload="none" onError={onError} className="w-full" />;
  return (
    <>
      <video
        key={attempt}
        ref={videoRef}
        src={src}
        poster={videoPoster(id, drive)}
        controls
        preload="metadata"
        playsInline
        onError={onError ?? sample.onError}
        className="max-h-[60vh] w-full rounded-[var(--radius-control)] bg-slate"
      />
      {sample.failed ? <p className="text-sm text-text-2">{DEMO_VIDEO_NOTE}</p> : null}
    </>
  );
}

/**
 * The picture a video shows until it plays: the frame kept at upload (/api/media/<id>/thumb, the same RLS check as the
 * file), so the player is not a black box at 0:00 (APP-40). None for a Drive file: its picture counts against the
 * month's Drive cap (src/app/api/media/[id]/thumb/route.ts).
 */
export const videoPoster = (id: string, drive: boolean) => (drive ? undefined : `/api/media/${id}/thumb`);

/** Under a demo video that cannot play: the demo's files have no video behind them, only their picture. */
export const DEMO_VIDEO_NOTE = 'Video de demostración: no hay un video real detrás.';

/** In the demo, whether the video could not load (also before the page came alive), so the line above shows. */
export function useDemoVideo(enabled: boolean) {
  const [failed, setFailed] = useState(false);
  const watch = useCallback(
    (el: HTMLMediaElement | null) => {
      if (el && enabled && el.error != null) setFailed(true);
    },
    [enabled],
  );
  return { failed: enabled && failed, watch, onError: enabled ? () => setFailed(true) : undefined };
}

/** The box shown in place of a player that could not load. */
export function MediaFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-control)] bg-surface-2 p-6 text-center" role="alert">
      <p className="text-[15px] text-text">{message}</p>
      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
        <RotateCcw className="h-4 w-4" aria-hidden /> Intentar otra vez
      </button>
    </div>
  );
}

/**
 * When a Drive file fails to load in a player, asks the platform for its first byte to learn why
 * (our own short message: Drive not connected, the cap reached...). `watch` (the element's ref)
 * also catches a failure that happened before the page came alive. Off for other files, which
 * behave as before.
 */
export function useMediaFailure(src: string, mime: string, enabled: boolean) {
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const explain = useCallback(() => void mediaFailureText(src, mime).then(setMessage), [src, mime]);
  const watch = useCallback(
    (el: HTMLImageElement | HTMLMediaElement | null) => {
      if (!el || !enabled) return;
      // (Not networkState: a fresh player passes through «no source» before it starts loading.)
      const dead = el instanceof HTMLImageElement ? el.complete && el.naturalWidth === 0 : el.error != null;
      if (dead) explain();
    },
    [enabled, explain],
  );
  return {
    message,
    attempt,
    watch,
    onError: enabled ? explain : undefined,
    retry: () => {
      setMessage(null);
      setAttempt((n) => n + 1);
    },
  };
}

export async function mediaFailureText(src: string, mime: string, fetcher: typeof fetch = fetch): Promise<string> {
  const what = mime.startsWith('image/') ? 'la imagen' : mime.startsWith('audio/') ? 'el audio' : 'el video';
  const offline = `No se pudo cargar ${what}. Revisa la señal o intenta más tarde.`;
  try {
    const res = await fetcher(src, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
    if (res.ok) {
      await res.body?.cancel().catch(() => {});
      // The file is there: this browser cannot play it.
      return `Este navegador no pudo abrir ${what}. Prueba en otro o descárgalo.`;
    }
    const t = (await res.text()).trim();
    return t && t.length <= 160 && !/[<>{}]/.test(t) ? t : offline;
  } catch {
    return offline;
  }
}
