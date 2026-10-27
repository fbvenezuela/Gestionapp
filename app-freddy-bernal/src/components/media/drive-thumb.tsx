'use client';

import { MediaThumb } from './media-thumb';

// Small picture of one file (kept in Google Drive or anywhere else): MediaThumb with a single candidate.
// When there is none yet (a video just uploaded to Drive takes a while), the type icon shows instead.
export function DriveThumb({ id, mime, className }: { id: string; mime: string; className?: string }) {
  return <MediaThumb ids={[id]} mime={mime} className={className} />;
}
