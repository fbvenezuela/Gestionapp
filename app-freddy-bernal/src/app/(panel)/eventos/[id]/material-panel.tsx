import type { ReactNode } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Uploader } from '@/components/media/uploader';
import { DownloadAllDialog } from '@/components/media/download-all';
import { DrivePicker } from '@/components/media/drive-picker';
import { MEDIA_KIND } from '@/lib/data/labels';
import { RAW_KINDS } from '@/lib/domain/media-mime';
import type { PlanNote } from '@/lib/media/download-plan';
import { MediaRow, type Media } from './media-row';

export { MediaRow };

const RAW: { kind: string; hint: string }[] = [
  { kind: 'boss', hint: 'Lo que dice el jefe a cámara' },
  { kind: 'drone', hint: 'Tomas aéreas' },
  { kind: 'broll', hint: 'Tomas de apoyo para el video' },
  { kind: 'other', hint: 'Lo que no entra en lo anterior' },
];
const isRaw = (kind: string) => (RAW_KINDS as readonly string[]).includes(kind);

// The material of an event. `handoff` = Grabación's storyboard and note for the editor (handoff-panel.tsx): first for
// whoever edits (they read it before anything), after the raw cards for the camera person (uploading comes first).
// The storyboard files live there, in their own group: never under «Finales y portadas».
// «Descargar todo» takes the raw material and the storyboard files, with a LEEME of the notes (never a date).
// canPick = «Elegir de Drive» (Administración, with Drive connected).
export function MaterialPanel({
  eventId, eventCode, eventTitle, media, canUpload, canRemove = false, canPick = false, handoff, handoffFirst = true, notes = [],
}: {
  eventId: string; eventCode: string; eventTitle: string; media: Media[]; canUpload: boolean; canRemove?: boolean; canPick?: boolean;
  handoff?: ReactNode; handoffFirst?: boolean; notes?: PlanNote[] | null;
}) {
  const ready = media.filter((m) => m.status === 'ready');
  const pauta = ready.filter((m) => isRaw(m.kind) || m.kind === 'storyboard');
  const rest = media.filter((m) => !isRaw(m.kind) && m.kind !== 'storyboard');
  return (
    <div className="flex flex-col gap-4">
      {canUpload ? (
        <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-[15px] text-info">
          Sube el material <b>ya limpio</b> (sin tiempos ni tomas muertas), en el archivo original. Si se va la señal, la subida sigue sola cuando vuelva.
        </p>
      ) : null}
      <div className="flex justify-end">
        <DownloadAllDialog
          title={eventTitle}
          code={eventCode}
          files={pauta.map((m) => ({ id: m.id, kind: m.kind, label: m.label, ext: m.ext ?? 'bin', size: Number(m.size_bytes), drive: m.bucket === 'drive' }))}
          notes={notes}
          label="Descargar todo el material"
          data-tour="download-all"
        />
      </div>
      {handoffFirst ? handoff : null}
      {RAW.map((r) => {
        const list = media.filter((m) => m.kind === r.kind);
        return (
          <Card key={r.kind} data-tour="raw-boxes">
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
      {handoffFirst ? null : handoff}
      {rest.length ? (
        <Card>
          <CardHeader title="Finales y portadas" />
          <div className="flex flex-col gap-2 p-4">
            {rest.map((m) => <MediaRow key={m.id} m={m} canRemove={canRemove} />)}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
