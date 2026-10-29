// What a piece needs before «Enviar a aprobación», per format (R4, D-61, D-63, F8), and what the board counts as
// «Copy faltante» and «Imagen faltante» (D-71). Pure: the card, the section bar, the board and sendToReview read the
// same facts and get the same answer. A blocker stops the sending (the card lists it under the disabled button); a
// warning only says it. Nothing here approves anything: the boss does (review_piece).

import type { Format } from './redes';

export type Dims = { w: number | null; h: number | null };

export type PieceFacts = {
  format: Format;
  currentVersion: number;
  // The current version's file (the reel's or YouTube's video, the post's image, the story's photo or clip).
  mediaMime: string | null;
  mediaW?: number | null;
  mediaH?: number | null;
  // The current version's cover (reel, YouTube): what the feed and YouTube show.
  coverId: string | null;
  // Carousel and Fin de mes: the current version's images in order (null = a planned slide without its image).
  slides: (string | null)[];
  // Their sizes, in the same order, when known (a warning for a carousel slide that is not 1080×1350).
  slideDims?: (Dims | null)[];
  longCopy: string;
  onScreen: string; // the story's «Texto en pantalla»
  postRatio: '4:5' | '1:1';
};

const isVideo = (mime: string | null) => !!mime && mime.startsWith('video/');
const isImage = (mime: string | null) => !!mime && mime.startsWith('image/');
const blank = (s: string | null | undefined) => !s || !s.trim();

const RATIO: Record<'9:16' | '4:5' | '1:1' | '16:9', number> = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };

/** The shape of a picture or video in words: «vertical», «horizontal», «cuadrado». */
function shape(w: number, h: number): string {
  const r = w / h;
  return r > 1.05 ? 'horizontal' : r < 0.95 ? 'vertical' : 'cuadrado';
}

/** Whether w×h is the ratio, within 3 % (the tolerance of the network rules). Unknown sizes pass. */
function fits(w: number | null | undefined, h: number | null | undefined, ratio: keyof typeof RATIO): boolean {
  if (!w || !h) return true;
  return Math.abs(w / h - RATIO[ratio]) / RATIO[ratio] <= 0.03;
}

const slidesWithImage = (f: PieceFacts) => f.slides.filter((s) => !!s).length;

/** The slides without an image, as «La lámina 3 no tiene imagen.» (or the same for Fin de mes images). */
function emptySlides(f: PieceFacts, noun: 'lámina' | 'imagen'): string[] {
  const out: string[] = [];
  f.slides.forEach((s, i) => {
    if (!s) out.push(noun === 'lámina' ? `La lámina ${i + 1} no tiene imagen.` : `Falta la imagen ${i + 1}.`);
  });
  return out;
}

/** What stops «Enviar a aprobación» (D-63): the card lists it, sendToReview refuses with the first. */
export function reviewBlockers(f: PieceFacts): string[] {
  const out: string[] = [];
  const copy = blank(f.longCopy);
  switch (f.format) {
    case 'reel':
      if (!isVideo(f.mediaMime)) out.push('Sube el video final.');
      if (copy) out.push('Falta el copy largo.');
      break;
    case 'post':
      if (!isImage(f.mediaMime)) out.push(`Sube la imagen ${f.postRatio}.`);
      if (copy) out.push('Falta el copy largo.');
      break;
    case 'carousel':
      if (f.slides.length < 2 || slidesWithImage(f) < 2) out.push('Sube al menos 2 láminas con su imagen.');
      out.push(...emptySlides(f, 'lámina'));
      if (copy) out.push('Falta el copy largo.');
      break;
    case 'story':
      if (!isVideo(f.mediaMime) && !isImage(f.mediaMime)) out.push('Sube la foto o el clip 9:16.');
      break;
    case 'youtube':
      if (!isVideo(f.mediaMime)) out.push('Sube el video final.');
      if (copy) out.push('Falta la descripción.');
      break;
    case 'month_end':
      if (!f.slides.length || !slidesWithImage(f)) out.push('Sube las imágenes del cierre.');
      out.push(...emptySlides(f, 'imagen'));
      if (copy) out.push('Falta el copy largo.');
      break;
  }
  return [...new Set(out)];
}

/** What the card only warns about: it does not stop the sending. */
export function reviewWarnings(f: PieceFacts): string[] {
  const out: string[] = [];
  switch (f.format) {
    case 'reel':
      if (!f.coverId) out.push('Falta la portada 9:16: el feed muestra el título.');
      if (isVideo(f.mediaMime) && f.mediaW && f.mediaH && !fits(f.mediaW, f.mediaH, '9:16')) {
        out.push(`El video es ${shape(f.mediaW, f.mediaH)} (${f.mediaW}×${f.mediaH}): el reel va vertical 9:16, por ejemplo 1080×1920.`);
      }
      break;
    case 'post':
      if (isImage(f.mediaMime) && f.mediaW && f.mediaH && !fits(f.mediaW, f.mediaH, f.postRatio)) {
        out.push(`La imagen es de ${f.mediaW}×${f.mediaH} y elegiste ${f.postRatio}${f.postRatio === '4:5' ? ' (1080×1350)' : ' (1080×1080)'}.`);
      }
      break;
    case 'carousel':
      (f.slideDims ?? []).forEach((d, i) => {
        if (f.slides[i] && d?.w && d.h && !fits(d.w, d.h, '4:5')) out.push(`La lámina ${i + 1} es de ${d.w}×${d.h}: va 1080×1350 (4:5).`);
      });
      break;
    case 'story':
      if (blank(f.onScreen)) out.push('Falta el «Texto en pantalla».');
      if ((isVideo(f.mediaMime) || isImage(f.mediaMime)) && f.mediaW && f.mediaH && !fits(f.mediaW, f.mediaH, '9:16')) {
        out.push(`La historia es ${shape(f.mediaW, f.mediaH)} (${f.mediaW}×${f.mediaH}): va vertical 9:16.`);
      }
      break;
    case 'youtube':
      if (!f.coverId) out.push('Falta la miniatura 16:9.');
      if (isVideo(f.mediaMime) && f.mediaW && f.mediaH && !fits(f.mediaW, f.mediaH, '16:9')) {
        out.push(`El video es ${shape(f.mediaW, f.mediaH)} (${f.mediaW}×${f.mediaH}): el de YouTube va horizontal 16:9.`);
      }
      break;
    case 'month_end':
      break;
  }
  return out;
}

/** «Copy faltante» (D-71): a story has no copy, so its «Texto en pantalla» counts instead. */
export function copyMissing(f: PieceFacts): boolean {
  return f.format === 'story' ? blank(f.onScreen) : blank(f.longCopy);
}

/** «Imagen faltante» (D-71): post without its image; reel and YouTube without cover; story without its photo or clip;
 * carousel and Fin de mes without images or with one slide still empty. */
export function imageMissing(f: PieceFacts): boolean {
  switch (f.format) {
    case 'post':
      return !isImage(f.mediaMime);
    case 'reel':
    case 'youtube':
      return !f.coverId;
    case 'story':
      return !isVideo(f.mediaMime) && !isImage(f.mediaMime);
    case 'carousel':
    case 'month_end':
      return !f.slides.length || f.slides.some((s) => !s);
  }
}
