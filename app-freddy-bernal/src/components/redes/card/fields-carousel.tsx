'use client';

import { CaptionField } from './caption-field';
import { CardText } from './card-fields';
import { SlidesEditor } from './slides-editor';

// A carousel (D-61): the slides in order with their suggested role (Portada → Desarrollo → Resumen → CTA), each with its
// text and its 1080×1350 image; the hook, the CTA and the hashtags (helpers), and the caption (the long copy).
export function FieldsCarousel() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SlidesEditor kind="carousel" />
      <CardText k="hook" label="Hook" hint="La entrada: lo primero que se lee." />
      <CardText k="cta" label="CTA" hint="La acción que le pides a la gente. «Poner en el copy» la agrega al caption." />
      <CardText k="hashtags" label="Hashtags" />
      <CaptionField withCta />
    </div>
  );
}
