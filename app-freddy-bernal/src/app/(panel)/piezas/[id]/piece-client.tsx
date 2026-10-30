'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { addVersion, attachVoiceLine, sendToReview } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { LEVELS, type Level } from '@/lib/domain/review';
import type { Format } from '@/lib/domain/redes';
import { Uploader } from '@/components/media/uploader';
import { DrivePicker } from '@/components/media/drive-picker';

const LEVEL_OPTIONS: { value: Level; text: string }[] = [
  { value: 'verde', text: '🟢 Verde: rutina' },
  { value: 'amarillo', text: '🟡 Amarillo: normal' },
  { value: 'rojo', text: '🔴 Rojo: sensible' },
];

/** The levels a person may pick when sending: once it went through review, it can go up but not down (only the boss
 * or admin lower it; the database enforces it). A red piece stays red. */
export function levelOptions(saved: Level, locked: boolean) {
  const rank = (l: Level) => LEVEL_OPTIONS.findIndex((o) => o.value === l);
  return locked || saved === 'rojo' ? LEVEL_OPTIONS.filter((o) => rank(o.value) >= rank(saved)) : LEVEL_OPTIONS;
}

// «Enviar a aprobación» with its «Nivel de aprobación» (the card in big puts it in its review row). Off while something
// is missing: the list the card shows right under it (`describedBy`), the same one sendToReview checks.
export function SendToReview({ pieceId, level: saved, locked, blockers = [], describedBy }: { pieceId: string; level: Level; locked: boolean; blockers?: string[]; describedBy?: string }) {
  const { run, pending } = useAction();
  const [level, setLevel] = useState<Level>(saved);
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Select aria-label="Nivel de aprobación" title={LEVELS[level].hint} value={level} onChange={(e) => setLevel(e.target.value as Level)} className="w-full sm:w-auto">
        {levelOptions(saved, locked).map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
      </Select>
      <Button
        disabled={pending || blockers.length > 0}
        aria-describedby={blockers.length ? describedBy : undefined}
        data-tour="send-review"
        className="w-full sm:w-auto"
        onClick={() => run(() => sendToReview({ pieceId, level }), { success: 'Enviada al jefe para aprobar.' })}
      >
        <Send className="h-4 w-4" aria-hidden /> Enviar a aprobación
      </Button>
    </div>
  );
}

// What «Archivo final» uploads for each format: one file is the next version (an approved piece goes back to review).
// A carousel and Fin de mes have their images slide by slide in the card, never one file here.
type FileKind = { label: string; accept: string; image: boolean; cover: boolean };
export const FINAL_FILE: Record<Format, FileKind | null> = {
  reel: { label: 'Subir video final (nueva versión)', accept: 'video/*', image: false, cover: true },
  youtube: { label: 'Subir video final (nueva versión)', accept: 'video/*', image: false, cover: true },
  post: { label: 'Subir imagen final (nueva versión)', accept: 'image/*', image: true, cover: false },
  story: { label: 'Subir la foto o el clip (nueva versión)', accept: 'image/*,video/*', image: false, cover: false },
  carousel: null,
  month_end: null,
};

// canPick = «Elegir de Drive» too (Administración, with Drive connected): one file, kept as the new version.
export function VersionUpload({ pieceId, eventId, format, canPick = false }: { pieceId: string; eventId: string | null; format: Format; canPick?: boolean }) {
  const { run } = useAction();
  const [, setN] = useState(0);
  const file = FINAL_FILE[format];
  if (!file) return <p className="text-sm text-text-2">Las imágenes se suben en la tarjeta, lámina por lámina: cada cambio es una versión nueva.</p>;
  const newVersion = (id: string) => run(() => addVersion({ pieceId, mediaId: id, coverId: null }), { success: 'Nueva versión guardada.', onOk: () => setN((x) => x + 1) });
  const newCover = (id: string) => run(() => addVersion({ pieceId, mediaId: null, coverId: id, notes: 'Portada nueva' }), { success: 'Portada guardada.' });
  return (
    <div className="flex flex-col gap-2">
      <Uploader
        eventId={eventId}
        kind={file.image ? 'cover' : 'final'}
        multiple={false}
        accept={file.accept}
        label={file.label}
        hint="Si ya estaba aprobada, vuelve a revisión."
        compact
        onUploaded={(a) => newVersion(a.id)}
      />
      {canPick ? <DrivePicker eventId={eventId} kind={file.image ? 'cover' : 'final'} multiple={false} label={file.image ? 'Elegir la imagen de Drive' : 'Elegir el video de Drive'} compact onPicked={(a) => newVersion(a.id)} /> : null}
      {file.cover ? (
        <Uploader
          eventId={eventId}
          kind="cover"
          multiple={false}
          accept="image/*"
          label="Subir portada"
          compact
          onUploaded={(a) => newCover(a.id)}
        />
      ) : null}
      {file.cover && canPick ? <DrivePicker eventId={eventId} kind="cover" multiple={false} label="Elegir la portada de Drive" compact onPicked={(a) => newCover(a.id)} /> : null}
    </div>
  );
}

export function VoiceLineUpload({ requestId, eventId }: { requestId: string; eventId: string | null }) {
  const { run } = useAction();
  return (
    <Uploader
      eventId={eventId}
      kind="voice_line"
      multiple={false}
      accept="audio/*,video/*"
      label="Subir el audio del jefe"
      compact
      onUploaded={(a) => run(() => attachVoiceLine({ requestId, mediaId: a.id }), { success: 'Audio guardado.' })}
    />
  );
}
