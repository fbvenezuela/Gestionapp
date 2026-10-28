import { Download } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { DriveDownload } from '@/components/media/drive-download';
import { MediaThumb } from '@/components/media/media-thumb';
import { mediaLockChip } from '@/lib/domain/media-lock';
import { RemoveMedia } from './remove-media';

// One file of an event (the material list, the storyboard of Grabación). lock = why it cannot be removed
// (media-lock.ts), or null. bucket 'drive' = kept in Google Drive (STORAGE_PROVIDER=drive): downloads in pieces.
export type Media = {
  id: string; kind: string; label: string; size_bytes: number; duration_s: number | null; width: number | null; height: number | null;
  status: string; mime: string; bucket?: string; lock?: string | null; ext?: string;
};

function size(b: number) {
  // A storyboard photo weighs a few KB: «1 MB» would mislead.
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}
function dur(s: number | null) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

// Every row has the same small square: the picture made in the phone at upload time (any storage) or Drive's for a
// photo or a video that is ready; the type icon for the rest (an audio, a PDF, a file still uploading), without
// asking the server for a picture it cannot have.
export function MediaRow({ m, canRemove }: { m: Media; canRemove: boolean }) {
  const drive = m.bucket === 'drive';
  const pictured = m.status === 'ready' && (m.mime.startsWith('image/') || m.mime.startsWith('video/') || drive);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-border px-3 py-2">
      <MediaThumb ids={pictured ? [m.id] : []} mime={m.mime} />
      {/* The name asks for 11rem: on a phone the actions drop to their own line instead of
          squeezing it to a few letters. */}
      <div className="min-w-0 flex-[1_1_11rem]">
        <p className="truncate font-semibold">{m.label}</p>
        <p className="text-sm text-text-2">
          {[size(m.size_bytes), dur(m.duration_s), m.width && m.height ? `${m.width}×${m.height}` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {m.status === 'ready' && drive ? (
          <DriveDownload file={{ id: m.id, label: m.label, size: Number(m.size_bytes) }} />
        ) : m.status === 'ready' ? (
          <a href={`/api/media/${m.id}`} className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2" aria-label={`Descargar ${m.label}`}>
            <Download className="h-5 w-5" aria-hidden />
          </a>
        ) : (
          <Chip tone={m.status === 'failed' ? 'danger' : 'warn'}>{m.status === 'failed' ? 'Incompleto' : 'Subiendo'}</Chip>
        )}
        {canRemove ? (mediaLockChip(m.lock) ? <Chip tone="ok">{mediaLockChip(m.lock)}</Chip> : <RemoveMedia id={m.id} label={m.label} />) : null}
      </div>
    </div>
  );
}
