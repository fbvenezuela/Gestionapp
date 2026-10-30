'use client';

import { Select } from '@/components/ui/field';
import { useCard } from './card-context';
import { CaptionField } from './caption-field';
import { LockEdit } from './lock-edit';
import { MediaSlot } from './media-slot';
import { CardText, FieldGroup, fieldId, useLocked, useVersion } from './card-fields';

// A post (D-61): the image with its «Proporción» (4:5, or 1:1 that the feed does not crop; 9:16 not: Instagram crops it
// on the profile), the art's text with its hierarchy, the visual concept, CTA and hashtags (helpers that «Poner en el
// copy» brings into the caption), the caption (the long copy: the only text that goes out), the publication notes and
// «Enlaces / referencias». Two columns from the iPad on (the file left, the fields right), one on the phone.
export function FieldsPost() {
  const { card, ctx, saver } = useCard();
  const v = useVersion();
  const locked = useLocked('media');
  const ratio = saver.details.post_ratio;
  const ratioId = fieldId(card.id, 'post_ratio');
  return (
    <div className="grid min-w-0 gap-4 min-[600px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ratioId} className="text-sm font-semibold">
            Proporción
          </label>
          <Select
            id={ratioId}
            value={ratio}
            onChange={(e) => {
              saver.setField('post_ratio', e.target.value === '1:1' ? '1:1' : '4:5');
              void saver.flush();
            }}
          >
            <option value="4:5">4:5 (1080×1350)</option>
            <option value="1:1">1:1 (1080×1080)</option>
          </Select>
        </div>
        <LockEdit part="media" label="La imagen" view={<p className="text-text-2">Ya la aprobó el jefe: cambiarla es una versión nueva.</p>}>
          {null}
        </LockEdit>
        <MediaSlot
          label={`Imagen ${ratio}`}
          size={ratio === '1:1' ? '1080×1080' : '1080×1350'}
          ratio={ratio}
          ids={card.thumbIds}
          uploadLabel="Subir imagen"
          accept="image/*"
          kind="final"
          eventId={card.event?.id ?? null}
          demo={ctx.demo}
          readOnly={locked}
          onUploaded={(a) => void v.media(a.id, 'Imagen guardada.')}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <FieldGroup title="Texto del arte" hint="Lo que va escrito dentro de la imagen, con su jerarquía.">
          <CardText k="art_overline" label="Antetítulo" />
          <CardText k="art_headline" label="Titular" />
          <CardText k="art_seals" label="Sellos" />
          <CardText k="art_fine_print" label="Letra pequeña" rows={2} />
        </FieldGroup>
        <CardText k="visual_concept" label="Concepto visual" rows={3} />
        <CardText k="cta" label="CTA" hint="La acción que le pides a la gente. «Poner en el copy» la agrega al caption." />
        <CardText k="hashtags" label="Hashtags" />
        <CaptionField withCta />
        <CardText k="publication_notes" label="Notas de publicación" rows={2} />
        <CardText k="links" label="Enlaces / referencias" rows={2} hint="Enlaces a Drive, referencias visuales o archivos." />
      </div>
    </div>
  );
}
