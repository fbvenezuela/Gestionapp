import { Download, Film, Image as ImageIcon } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Uploader } from '@/components/media/uploader';
import { DownloadAll } from '@/components/media/download-all';
import { MEDIA_KIND } from '@/lib/data/labels';

type Media = { id: string; kind: string; label: string; size_bytes: number; duration_s: number | null; width: number | null; height: number | null; status: string; mime: string };

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

export function MaterialPanel({ eventId, media, canUpload }: { eventId: string; eventCode: string; media: Media[]; canUpload: boolean }) {
  const ready = media.filter((m) => m.status === 'ready');
  return (
    <div className="flex flex-col gap-4">
      {canUpload ? (
        <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-[15px] text-info">
          Sube el material <b>ya limpio</b> (sin tiempos ni tomas muertas), en el archivo original. Si se va la señal, la subida sigue sola cuando vuelva.
        </p>
      ) : null}
      <div className="flex justify-end">
        <DownloadAll ids={ready.filter((m) => RAW.some((r) => r.kind === m.kind)).map((m) => m.id)} label="Descargar todo el material" />
      </div>
      {RAW.map((r) => {
        const list = media.filter((m) => m.kind === r.kind);
        return (
          <Card key={r.kind}>
            <CardHeader title={MEDIA_KIND[r.kind]} subtitle={r.hint} action={list.length ? <Chip tone="ok">{list.length}</Chip> : <Chip>Vacío</Chip>} />
            <div className="flex flex-col gap-2 p-4">
              {list.map((m) => <MediaRow key={m.id} m={m} />)}
              {canUpload ? <Uploader eventId={eventId} kind={r.kind} label={`Subir ${MEDIA_KIND[r.kind].toLowerCase()}`} accept="video/*,image/*,audio/*" compact={list.length > 0} /> : null}
              {!list.length && !canUpload ? <p className="text-[15px] text-text-2">Todavía no hay archivos.</p> : null}
            </div>
          </Card>
        );
      })}
      {media.some((m) => !RAW.some((r) => r.kind === m.kind)) ? (
        <Card>
          <CardHeader title="Finales y portadas" />
          <div className="flex flex-col gap-2 p-4">
            {media.filter((m) => !RAW.some((r) => r.kind === m.kind)).map((m) => <MediaRow key={m.id} m={m} />)}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MediaRow({ m }: { m: Media }) {
  const Icon = m.mime.startsWith('image/') ? ImageIcon : Film;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border px-3 py-2">
      <Icon className="h-5 w-5 shrink-0 text-text-2" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{m.label}</p>
        <p className="text-sm text-text-2">
          {[size(m.size_bytes), dur(m.duration_s), m.width && m.height ? `${m.width}×${m.height}` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
      {m.status === 'ready' ? (
        <a href={`/api/media/${m.id}`} className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2" aria-label={`Descargar ${m.label}`}>
          <Download className="h-5 w-5" aria-hidden />
        </a>
      ) : (
        <Chip tone={m.status === 'failed' ? 'danger' : 'warn'}>{m.status === 'failed' ? 'Incompleto' : 'Subiendo'}</Chip>
      )}
    </div>
  );
}
