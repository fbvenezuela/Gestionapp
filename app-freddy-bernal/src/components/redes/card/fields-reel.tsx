'use client';

import { useCard } from './card-context';
import { CaptionField } from './caption-field';
import { LockEdit, LockedText } from './lock-edit';
import { MediaSlot } from './media-slot';
import { ShotsEditor } from './shots-editor';
import { useLocked, useVersion } from './card-fields';

// A reel (D-61): its title goes out as the Short's (in the header; read-only on an approved piece), the final 9:16
// video, its 9:16 cover (what the feed shows), «Referencia» (how it has to look: planning only, never in the version and
// never out), the shots one by one and the copy.
export const REEL_INFO =
  'El video es el reel ya editado y la portada es la miniatura con la que se ve en el feed. La referencia es la foto de cómo tiene que verse: locación, encuadre o pose. Es solo para planificar: no sale.';

export function TitleLock({ label }: { label: string }) {
  const { saver } = useCard();
  return (
    <LockEdit part="title" label={label} view={<LockedText text={saver.title} />}>
      {null}
    </LockEdit>
  );
}

export function FieldsReel() {
  const { card, ctx, saver } = useCard();
  const v = useVersion();
  const locked = useLocked('media');
  const version = card.version;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TitleLock label="Título (sale como título del Short)" />
      <LockEdit part="media" label="El video y la portada" view={<p className="text-text-2">Ya los aprobó el jefe: cambiarlos es una versión nueva.</p>}>
        {null}
      </LockEdit>
      <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3">
        <MediaSlot
          label="Video"
          size="Vertical 9:16"
          ratio="9:16"
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
          label="Portada"
          size="9:16"
          ratio="9:16"
          ids={version?.coverId ? [version.coverId] : []}
          uploadLabel="Subir portada"
          accept="image/*"
          kind="cover"
          eventId={card.event?.id ?? null}
          demo={ctx.demo}
          readOnly={locked}
          onUploaded={(a) => void v.cover(a.id, 'Portada guardada.')}
        />
        <MediaSlot
          label="Referencia"
          size="Cómo se ve"
          ratio="9:16"
          ids={saver.details.reference_asset_id ? [saver.details.reference_asset_id] : []}
          uploadLabel="Subir referencia"
          accept="image/*"
          kind="cover"
          demo={ctx.demo}
          onUploaded={(a) => {
            saver.setField('reference_asset_id', a.id);
            void saver.flush();
          }}
        />
      </div>
      <p className="text-sm text-text-2">{REEL_INFO}</p>
      <ShotsEditor />
      <CaptionField label="Copy (largo: Instagram, Facebook y TikTok)" />
    </div>
  );
}
