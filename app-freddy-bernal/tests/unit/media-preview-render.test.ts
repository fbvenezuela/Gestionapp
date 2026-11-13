// The preview of a file (src/components/media/media-preview.tsx), rendered on the server as the piece page does
// (APP-40): a video shows the picture kept at upload until it plays (its /thumb, behind the same RLS check), never for
// a Drive file (that picture counts against the month's Drive cap); an image and an audio take no poster; and the
// demo's line is not there before the player says it could not load. Invented ids.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_VIDEO_NOTE, MediaPreview, videoPoster } from '@/components/media/media-preview';

const ID = '11111111-2222-4333-8444-555555555555';
const html = (p: { mime: string; drive?: boolean; demo?: boolean }) => renderToStaticMarkup(createElement(MediaPreview, { id: ID, ...p }));

describe('la vista previa de un archivo', () => {
  it('un video muestra su miniatura mientras no se reproduce, también en la demo', () => {
    for (const demo of [false, true]) expect(html({ mime: 'video/mp4', demo })).toContain(`poster="/api/media/${ID}/thumb"`);
    expect(videoPoster(ID, false)).toBe(`/api/media/${ID}/thumb`);
  });

  it('un video de Drive no la pide (su miniatura cuenta contra el cupo del mes de Drive)', () => {
    expect(html({ mime: 'video/mp4', drive: true, demo: true })).not.toContain('poster=');
    expect(videoPoster(ID, true)).toBeUndefined();
  });

  it('una imagen o un audio no llevan portada, y la línea de la demo no sale antes de que el video falle', () => {
    expect(html({ mime: 'image/jpeg', demo: true })).not.toContain('poster=');
    expect(html({ mime: 'audio/mpeg' })).not.toContain('poster=');
    expect(html({ mime: 'video/mp4', demo: true })).not.toContain(DEMO_VIDEO_NOTE);
    expect(DEMO_VIDEO_NOTE).toBe('Video de demostración: no hay un video real detrás.');
  });
});
