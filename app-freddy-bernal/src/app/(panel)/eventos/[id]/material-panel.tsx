import { Download, Film, Image as ImageIcon } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Uploader } from '@/components/media/uploader';
import { DownloadAll } from '@/components/media/download-all';
import { DrivePicker } from '@/components/media/drive-picker';
import { DriveDownload } from '@/components/media/drive-download';
import { MediaThumb } from '@/components/media/media-thumb';
import { MEDIA_KIND } from '@/lib/data/labels';
import { RemoveMedia } from './remove-media';
import { mediaLockChip } from '@/lib/domain/media-lock';

// lock = why it cannot be removed (media-lock.ts), or null.
// bucket 'drive' = kept in Google Drive (STORAGE_PROVIDER=drive): downloads in pieces. Thumbnails for every storage.
type Media = { id: string; kind: string; label: string; size_bytes: number; duration_s: number | null; width: number | null; height: number | null; status: string; mime: string; bucket?: string; lock?: string | null };

const RAW: { kind: string; hint: string }[] = [
  { kind: 'boss', hint: 'Lo que dice el jefe a cámara' },
  { kind: 'drone', hint: 'Tomas aéreas' },
  { kind: 'broll', hint: 'Tomas de apoyo para el video' },
  { kind: 'other', hint: 'Lo que no entra en lo anterior' },
];

function size(b: number) {
  return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;
}
function dur(s: number | null) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

// canPick = «Elegir de Drive» (Administración, with Drive connected).
export function MaterialPanel({ eventId, media, canUpload, canRemove = false, canPick = false }: { eventId: string; eventCode: string; media: Media[]; canUpload: boolean; canRemove?: boolean; canPick?: boolean }) {
  const ready = media.filter((m) => m.status === 'ready');
  const rawReady = ready.filter((m) => RAW.some((r) => r.kind === m.kind));
  return (
    <div className="flex flex-col gap-4">
      {canUpload ? (
        <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-[15px] text-info">
          Sube el material <b>ya limpio</b> (sin tiempos ni tomas muertas), en el archivo original. Si se va la señal, la subida sigue sola cuando vuelva.
        </p>
      ) : null}
      <div className="flex justify-end">
        <DownloadAll
          ids={rawReady.map((m) => m.id)}
          drive={rawReady.filter((m) => m.bucket === 'drive').map((m) => ({ id: m.id, label: m.label, size: Number(m.size_bytes) }))}
          label="Descargar todo el material"
        />
      </div>
      {RAW.map((r) => {
        const list = media.filter((m) => m.kind === r.kind);
        return (
          <Card key={r.kind}>
            <CardHeader title={MEDIA_KIND[r.kind]} subtitle={r.hint} action={list.length ? <Chip tone="ok">{list.length}</Chip> : <Chip>Vacío</Chip>} />
            <div className="flex flex-col gap-2 p-4">
              {list.map((m) => <MediaRow key={m.id} m={m} canRemove={canRemove} />)}
              {canUpload ? <Uploader eventId={eventId} kind={r.kind} label={`Subir ${MEDIA_KIND[r.kind].toLowerCase()}`} accept="video/*,image/*,audio/*" compact={list.length > 0} /> : null}
              {canPick ? <DrivePicker eventId={eventId} kind={r.kind} compact={list.length > 0} /> : null}
              {!list.length && !canUpload ? <p className="text-[15px] text-text-2">Todavía no hay archivos.</p> : null}
            </div>
          </Card>
        );
      })}
      {media.some((m) => !RAW.some((r) => r.kind === m.kind)) ? (
        <Card>
          <CardHeader title="Finales y portadas" />
          <div className="flex flex-col gap-2 p-4">
            {media.filter((m) => !RAW.some((r) => r.kind === m.kind)).map((m) => <MediaRow key={m.id} m={m} canRemove={canRemove} />)}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

// The small picture made in the phone at upload time (any storage) or Drive's; the type icon when there is none.
export function MediaRow({ m, canRemove }: { m: Media; canRemove: boolean }) {
  const Icon = m.mime.startsWith('image/') ? ImageIcon : Film;
  const drive = m.bucket === 'drive';
  const pictured = m.status === 'ready' && (m.mime.startsWith('image/') || m.mime.startsWith('video/') || drive);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-border px-3 py-2">
      {pictured ? <MediaThumb ids={[m.id]} mime={m.mime} /> : <Icon className="h-5 w-5 shrink-0 text-text-2" aria-hidden />}
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
