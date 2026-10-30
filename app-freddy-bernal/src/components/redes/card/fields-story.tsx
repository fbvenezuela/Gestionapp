'use client';

import { Select } from '@/components/ui/field';
import { STICKERS } from '@/lib/domain/redes';
import { useCard } from './card-context';
import { LockEdit, LockedText } from './lock-edit';
import { MediaSlot } from './media-slot';
import { CardText, fieldId, useLocked, useVersion } from './card-fields';

// A story (D-61, I1): «Idea original» first (the main field, as in the reference), the 9:16 photo or clip, the sticker
// (its format, its text and its https link) and the on-screen text: those go out as they are written in the app, so on
// an approved story they are read-only until «Editar (vuelve al jefe)». «Seguimiento» is planning. A story has no copy.
export function FieldsStory() {
  const { card, ctx, saver } = useCard();
  const v = useVersion();
  const mediaLocked = useLocked('media');
  const stickerId = fieldId(card.id, 'sticker');
  const d = saver.details;
  const stickerView = (
    <div className="flex flex-col gap-1">
      <p>
        <span className="font-semibold">Formato del sticker:</span> {d.sticker ? STICKERS[d.sticker] ?? 'Otro' : 'Sin sticker'}
      </p>
      {d.sticker_text ? (
        <p className="whitespace-pre-wrap break-words">
          <span className="font-semibold">Texto del sticker:</span> {d.sticker_text}
        </p>
      ) : null}
      {d.sticker_url ? (
        <p className="break-all">
          <span className="font-semibold">Enlace del sticker:</span> {d.sticker_url}
        </p>
      ) : null}
    </div>
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CardText k="idea" label="Idea original" rows={3} hint="La idea de esta historia: qué se cuenta y por qué." />
      <LockEdit part="media" label="La foto o el clip" view={<p className="text-text-2">Ya lo aprobó el jefe: cambiarlo es una versión nueva.</p>}>
        {null}
      </LockEdit>
      <MediaSlot
        label="Media"
        size="Foto o clip 9:16"
        ratio="9:16"
        video={!!card.version?.mediaMime?.startsWith('video/')}
        ids={card.thumbIds}
        uploadLabel="Subir la foto o el clip"
        accept="image/*,video/*"
        kind="final"
        eventId={card.event?.id ?? null}
        demo={ctx.demo}
        readOnly={mediaLocked}
        className="mx-auto w-full max-w-60"
        onUploaded={(a) => void v.media(a.id, 'Media guardada.')}
      />
      <LockEdit part="sticker" label="El sticker" view={stickerView}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={stickerId} className="text-sm font-semibold">
              Formato del sticker
            </label>
            <Select
              id={stickerId}
              value={d.sticker ?? ''}
              onChange={(e) => {
                saver.setField('sticker', e.target.value || null);
                void saver.flush();
              }}
            >
              <option value="">Sin sticker</option>
              {Object.entries(STICKERS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <CardText k="sticker_text" label="Texto del sticker" hint="La pregunta o las opciones." />
          <CardText k="sticker_url" label="Enlace del sticker" type="url" inputMode="url" hint="Solo enlaces que empiezan con https://" />
        </div>
      </LockEdit>
      <LockEdit part="on_screen" label="Texto en pantalla" view={<LockedText text={d.on_screen} />}>
        <CardText k="on_screen" label="Texto en pantalla" rows={2} />
      </LockEdit>
      <CardText k="follow_up" label="Seguimiento" rows={2} hint="Qué se hace después: responder, repostear, medir." />
    </div>
  );
}
