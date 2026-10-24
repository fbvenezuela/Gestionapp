'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { addVersion, attachVoiceLine, sendToReview } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { LEVELS, type Level } from '@/lib/domain/review';
import { Uploader } from '@/components/media/uploader';

const LEVEL_OPTIONS: { value: Level; text: string }[] = [
  { value: 'verde', text: '🟢 Verde: rutina' },
  { value: 'amarillo', text: '🟡 Amarillo: normal, 60 min' },
  { value: 'rojo', text: '🔴 Rojo: sensible, la aprueba el jefe' },
];

export function SendToReview({ pieceId, level: saved }: { pieceId: string; level: Level }) {
  const { run, pending } = useAction();
  const [level, setLevel] = useState<Level>(saved);
  // A red piece stays red unless the boss or admin lower it (the database enforces it).
  const options = saved === 'rojo' ? LEVEL_OPTIONS.filter((o) => o.value === 'rojo') : LEVEL_OPTIONS;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Nivel de aprobación" title={LEVELS[level].hint} value={level} onChange={(e) => setLevel(e.target.value as Level)} className="w-auto">
        {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
      </Select>
      <Button disabled={pending} onClick={() => run(() => sendToReview({ pieceId, level }), { success: level === 'rojo' ? 'Enviada al jefe y a supervisión.' : 'Enviada a supervisión.' })}>
        <Send className="h-4 w-4" aria-hidden /> Enviar a aprobación
      </Button>
    </div>
  );
}

export function VersionUpload({ pieceId, eventId, kind }: { pieceId: string; eventId: string | null; kind: string }) {
  const { run } = useAction();
  const [, setN] = useState(0);
  const isImage = kind === 'cover' || kind === 'photo' || kind === 'carousel';
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
        onUploaded={(a) => run(() => addVersion({ pieceId, mediaId: a.id, coverId: null }), { success: 'Nueva versión guardada.', onOk: () => setN((x) => x + 1) })}
      />
      {!isImage ? (
        <Uploader
          eventId={eventId}
          kind="cover"
          multiple={false}
          accept="image/*"
          label="Subir portada"
          compact
          onUploaded={(a) => run(() => addVersion({ pieceId, mediaId: null, coverId: a.id, notes: 'Portada nueva' }), { success: 'Portada guardada.' })}
        />
      ) : null}
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
