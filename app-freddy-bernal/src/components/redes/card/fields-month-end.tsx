'use client';

import { CaptionField } from './caption-field';
import { SlidesEditor } from './slides-editor';

// A piece of Fin de mes (D-72): the images of the month's close in order, each with its title and its note, and the
// copy. It goes through the boss like a carousel. No quota and no feed place.
export function FieldsMonthEnd() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SlidesEditor kind="month_end" />
      <CaptionField label="Copy (largo: Instagram, Facebook y TikTok)" />
    </div>
  );
}
