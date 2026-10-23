'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { addVersion, attachVoiceLine, sendToReview } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Uploader } from '@/components/media/uploader';

export function SendToReview({ pieceId }: { pieceId: string }) {
  const { run, pending } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => sendToReview({ pieceId }), { success: 'Enviada a supervisión.' })}>
      <Send className="h-4 w-4" aria-hidden /> Enviar a aprobación
    </Button>
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
