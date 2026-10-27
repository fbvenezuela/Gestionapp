'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { addVersion, attachVoiceLine, sendToReview } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { LEVELS, type Level } from '@/lib/domain/review';
import { Uploader } from '@/components/media/uploader';
import { DrivePicker } from '@/components/media/drive-picker';

const LEVEL_OPTIONS: { value: Level; text: string }[] = [
  { value: 'verde', text: '🟢 Verde: rutina' },
  { value: 'amarillo', text: '🟡 Amarillo: normal' },
  { value: 'rojo', text: '🔴 Rojo: sensible' },
];

export function SendToReview({ pieceId, level: saved, locked }: { pieceId: string; level: Level; locked: boolean }) {
  const { run, pending } = useAction();
  const [level, setLevel] = useState<Level>(saved);
  // Once it went through review, it can go up but not down (only the boss or admin lower it;
  // the database enforces it). A red piece stays red.
  const rank = (l: Level) => LEVEL_OPTIONS.findIndex((o) => o.value === l);
  const options = locked || saved === 'rojo' ? LEVEL_OPTIONS.filter((o) => rank(o.value) >= rank(saved)) : LEVEL_OPTIONS;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Select aria-label="Nivel de aprobación" title={LEVELS[level].hint} value={level} onChange={(e) => setLevel(e.target.value as Level)} className="w-full sm:w-auto">
        {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
      </Select>
      <Button disabled={pending} onClick={() => run(() => sendToReview({ pieceId, level }), { success: 'Enviada al jefe para aprobar.' })}>
        <Send className="h-4 w-4" aria-hidden /> Enviar a aprobación
      </Button>
    </div>
  );
}

// canPick = «Elegir de Drive» too (Administración, with Drive connected): one file, kept as the new version.
export function VersionUpload({ pieceId, eventId, kind, canPick = false }: { pieceId: string; eventId: string | null; kind: string; canPick?: boolean }) {
  const { run } = useAction();
  const [, setN] = useState(0);
  const isImage = kind === 'cover' || kind === 'photo' || kind === 'carousel';
  const newVersion = (id: string) => run(() => addVersion({ pieceId, mediaId: id, coverId: null }), { success: 'Nueva versión guardada.', onOk: () => setN((x) => x + 1) });
  const newCover = (id: string) => run(() => addVersion({ pieceId, mediaId: null, coverId: id, notes: 'Portada nueva' }), { success: 'Portada guardada.' });
  return (
    <div className="flex flex-col gap-2">
      <Uploader
        eventId={eventId}
        kind={isImage ? 'cover' : 'final'}
        multiple={false}
        accept={isImage ? 'image/*' : 'video/*'}
        label={isImage ? 'Subir imagen final (nueva versión)' : 'Subir video final (nueva versión)'}
        hint="Si ya estaba aprobada, vuelve a revisión."
        compact
        onUploaded={(a) => newVersion(a.id)}
      />
      {canPick ? <DrivePicker eventId={eventId} kind={isImage ? 'cover' : 'final'} multiple={false} label={isImage ? 'Elegir la imagen de Drive' : 'Elegir el video de Drive'} compact onPicked={(a) => newVersion(a.id)} /> : null}
      {!isImage ? (
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
      {!isImage && canPick ? <DrivePicker eventId={eventId} kind="cover" multiple={false} label="Elegir la portada de Drive" compact onPicked={(a) => newCover(a.id)} /> : null}
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
