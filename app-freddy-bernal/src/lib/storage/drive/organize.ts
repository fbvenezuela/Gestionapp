// «Organizar por orden del feed» (R4, D-74): in the client's Drive, one folder per month with something in its feed
// (Feed/Mes-<n>, n = the month's position in the list, never its editable name) and the picture of each placed
// piece renamed «NN - Post.jpg» (its number in the feed, two digits, and its format in Spanish). Never the piece's
// title: titles carry places, and rule 4 keeps places out of file names. Only files the app made or was given
// (drive.file); never a public link. Off behind four keys (src/lib/actions/drive-organize.ts).
//
// Pure: it only plans. The action reads the months, the places and the Drive ids, and moves the files.

import { FORMAT, type Format } from '@/lib/domain/redes';

export const FEED_FOLDER = 'Feed';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' };

/** «01 - Post.jpg», «07 - Reel.jpg», «12 - Carrusel.png». The extension follows the picture's type (jpg by default). */
export function feedFileName(n: number, format: Format, mime?: string | null): string {
  const num = String(Math.max(1, Math.min(99, Math.floor(n)))).padStart(2, '0');
  return `${num} - ${FORMAT[format].label}.${(mime && EXT[mime.toLowerCase()]) || 'jpg'}`;
}

/** «Feed/Mes-1»: two levels, as drive_folders.path allows. */
export const feedFolderPath = (position: number) => `${FEED_FOLDER}/Mes-${Math.max(1, Math.floor(position))}`;

export type OrganizeMonth = { id: string; ordinal: number };

export type OrganizeSlot = {
  monthId: string;
  num: number;
  format: Format;
  // The picture the feed shows: the cover, or the post's own image (the action picks it).
  pictureId: string | null;
  pictureMime: string | null;
  // Its file in Drive (media_drive.file_id); null = saved outside Drive (before Drive, or in the demo).
  fileId: string | null;
};

export type OrganizeStep = { folderPath: string; fileId: string; name: string; pictureId: string };

export type OrganizePlan = {
  steps: OrganizeStep[];
  noPicture: number; // placed pieces without a picture yet
  outsideDrive: number; // pictures saved outside Drive
  summary: string[];
};

/** The steps, month by month and number by number. A file shared by two placed pieces moves once (the first). */
export function planFeedOrganize(months: OrganizeMonth[], slots: OrganizeSlot[]): OrganizePlan {
  const position = new Map([...months].sort((a, b) => a.ordinal - b.ordinal).map((m, i) => [m.id, i + 1]));
  const steps: OrganizeStep[] = [];
  const seen = new Set<string>();
  let noPicture = 0;
  let outsideDrive = 0;
  const ordered = slots
    .filter((s) => position.has(s.monthId))
    .sort((a, b) => position.get(a.monthId)! - position.get(b.monthId)! || a.num - b.num);
  for (const s of ordered) {
    if (!s.pictureId) {
      noPicture++;
      continue;
    }
    if (!s.fileId) {
      outsideDrive++;
      continue;
    }
    if (seen.has(s.fileId)) continue;
    seen.add(s.fileId);
    steps.push({ folderPath: feedFolderPath(position.get(s.monthId)!), fileId: s.fileId, name: feedFileName(s.num, s.format, s.pictureMime), pictureId: s.pictureId });
  }
  const summary: string[] = [];
  summary.push(steps.length === 1 ? '1 portada para ordenar.' : `${steps.length} portadas para ordenar.`);
  if (noPicture) summary.push(noPicture === 1 ? '1 sin portada todavía.' : `${noPicture} sin portada todavía.`);
  if (outsideDrive) summary.push(outsideDrive === 1 ? '1 guardada fuera de Drive.' : `${outsideDrive} guardadas fuera de Drive.`);
  return { steps, noPicture, outsideDrive, summary };
}
