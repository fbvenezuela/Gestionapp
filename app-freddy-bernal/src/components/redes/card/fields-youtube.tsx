'use client';

import { useCard } from './card-context';
import { CaptionField } from './caption-field';
import { LockEdit } from './lock-edit';
import { MediaSlot } from './media-slot';
import { ShotsEditor } from './shots-editor';
import { TitleLock } from './fields-reel';
import { useLocked, useVersion } from './card-fields';

// A YouTube video (D-61): its title goes out with the video (in the header; read-only on an approved piece), the 16:9
// video and its 16:9 thumbnail, the script shot by shot and the description with chapters (the long copy).
export function FieldsYoutube() {
  const { card, ctx } = useCard();
  const v = useVersion();
  const locked = useLocked('media');
  const version = card.version;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TitleLock label="Título (sale con el video)" />
      <LockEdit part="media" label="El video y la miniatura" view={<p className="text-text-2">Ya los aprobó el jefe: cambiarlos es una versión nueva.</p>}>
        {null}
      </LockEdit>
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <MediaSlot
          label="Video"
          size="Horizontal 16:9"
          ratio="16:9"
          video
          ids={version?.mediaId ? [version.mediaId] : []}
          uploadLabel="Subir video"
          accept="video/*"
          kind="final"
          eventId={card.event?.id ?? null}
          demo={ctx.demo}
          readOnly={locked}
          onUploaded={(a) => void v.media(a.id, 'Video guardado.')}
        />
        <MediaSlot
          label="Miniatura"
          size="16:9 · 1920×1080"
          ratio="16:9"
          ids={version?.coverId ? [version.coverId] : []}
          uploadLabel="Subir miniatura"
          accept="image/*"
          kind="cover"
          eventId={card.event?.id ?? null}
          demo={ctx.demo}
          readOnly={locked}
          onUploaded={(a) => void v.cover(a.id, 'Miniatura guardada.')}
        />
      </div>
      <ShotsEditor title="Guion por tomas" />
      <CaptionField label="Descripción con capítulos (copy largo)" />
    </div>
  );
}
