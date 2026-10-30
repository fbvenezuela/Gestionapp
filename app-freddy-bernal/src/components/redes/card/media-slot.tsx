'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Film, ImagePlus, UploadCloud } from 'lucide-react';
import { MediaThumb } from '@/components/media/media-thumb';
import type { UploadedAsset } from '@/components/media/uploader';
import { DEMO_OTHER_SERVER_THUMB } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';

type UploaderProps = {
  eventId?: string | null; kind: string; label: string; hint?: string; accept?: string; multiple?: boolean; compact?: boolean;
  onUploaded?: (a: UploadedAsset) => void;
};

// One file of a card (the reel's video, its cover or reference, the post's image, a story's photo or clip, a slide),
// with its measure (§5.2). The uploader (tus + Supabase or Drive) is heavy: it loads only when someone taps «Subir…»,
// never one per card (§4.4), and opens the phone's file picker right away. What was just uploaded is shown from the
// phone itself until the page reloads; in the demo, a picture kept on another server says so instead of a broken image.
export type Ratio = '9:16' | '4:5' | '1:1' | '16:9';
const BOX: Record<Ratio, string> = { '9:16': 'aspect-[9/16]', '4:5': 'aspect-[4/5]', '1:1': 'aspect-square', '16:9': 'aspect-video' };

/** «Subir…»: loads the uploader on the first tap (never before) and opens the phone's file picker right away. `onFile`
 * sees the chosen picture first (for the preview from the phone itself). */
export function LazyUpload({
  uploadLabel, hint, accept, kind, eventId = null, onUploaded, onFile, replace = false,
}: {
  uploadLabel: string; hint?: string; accept: string; kind: 'final' | 'cover' | 'evidence'; eventId?: string | null;
  onUploaded?: (a: UploadedAsset) => void; onFile?: (f: File) => void; replace?: boolean;
}) {
  const [Up, setUp] = useState<ComponentType<UploaderProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // The uploader just arrived after a tap: open the phone's picker now (the tap still counts as the person's).
  useEffect(() => {
    if (Up) wrap.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  }, [Up]);
  const open = async () => {
    setLoading(true);
    try {
      const m = await import('@/components/media/uploader');
      setUp(() => m.Uploader as ComponentType<UploaderProps>);
    } finally {
      setLoading(false);
    }
  };
  if (Up) {
    return (
      <div
        ref={wrap}
        onChangeCapture={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) onFile?.(f);
        }}
      >
        <Up eventId={eventId} kind={kind} label={uploadLabel} hint={hint} accept={accept} multiple={false} compact onUploaded={onUploaded} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={loading}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2 disabled:opacity-60"
    >
      <UploadCloud className="h-4 w-4 text-accent-ink" aria-hidden /> {replace ? uploadLabel.replace(/^Subir/, 'Cambiar') : uploadLabel}
    </button>
  );
}

export function MediaSlot({
  label, size, ratio, ids, video = false, uploadLabel, accept, kind = 'final', eventId = null, demo, readOnly = false, onUploaded, className,
}: {
  label: string; // «Video», «Portada», «Referencia», «Imagen 4:5»…
  size: string; // «Vertical 9:16», «1080×1350»…
  ratio: Ratio;
  ids: readonly (string | null | undefined)[]; // what the server has, tried in order (the thumbnail route checks access)
  video?: boolean; // a video slot: once loaded it says so under its frame
  uploadLabel: string; // «Subir video», «Subir portada»…
  accept: string;
  kind?: 'final' | 'cover' | 'evidence';
  eventId?: string | null;
  demo: boolean;
  readOnly?: boolean;
  onUploaded?: (a: UploadedAsset) => void;
  className?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const list = ids.filter((x): x is string => !!x);

  // Freed when the card goes away or another picture replaces it.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const fallback = demo ? (
    <span className="px-2 text-center text-xs text-text-2">{DEMO_OTHER_SERVER_THUMB}</span>
  ) : video ? (
    <Film className="h-6 w-6 text-text-2" aria-hidden />
  ) : (
    <ImagePlus className="h-6 w-6 text-text-2" aria-hidden />
  );

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <p className="flex items-baseline justify-between gap-2">
        <span className="label-caps">{label}</span>
        <span className="text-xs text-text-2">{size}</span>
      </p>
      <div className={cn('relative grid w-full place-items-center overflow-hidden rounded-[var(--radius-control)] border border-dashed border-border bg-surface-2', BOX[ratio])}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : list.length ? (
          <MediaThumb ids={list} className="h-full w-full rounded-none bg-transparent" fallback={fallback} />
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-sm text-text-2">
            {video ? <Film className="h-6 w-6" aria-hidden /> : <ImagePlus className="h-6 w-6" aria-hidden />}
            Sin archivo
          </span>
        )}
      </div>
      {video && list.length ? <p className="text-xs text-text-2">Video cargado</p> : null}
      {readOnly ? null : (
        <LazyUpload
          uploadLabel={uploadLabel}
          hint={size}
          accept={accept}
          kind={kind}
          eventId={eventId}
          replace={list.length > 0 || !!preview}
          onFile={(f) => {
            if (f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
          }}
          onUploaded={onUploaded}
        />
      )}
    </div>
  );
}
