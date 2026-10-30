// What stops «Enviar a aprobación» and what only warns, per format (R4, D-61, D-63; the table of design §4.1), and
// what the board counts as «Copy faltante» and «Imagen faltante» (D-71). Pure: no database.
import { describe, it, expect } from 'vitest';
import { copyMissing, imageMissing, reviewBlockers, reviewWarnings, type PieceFacts } from '@/lib/domain/format-rules';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base: Omit<PieceFacts, 'format'> = { currentVersion: 1, mediaMime: null, coverId: null, slides: [], longCopy: '', onScreen: '', postRatio: '4:5' };
const f = (format: PieceFacts['format'], x: Partial<PieceFacts> = {}): PieceFacts => ({ ...base, format, ...x });

describe('reel', () => {
  it('sin video y sin copy largo: no se envía, y dice las dos cosas', () => {
    expect(reviewBlockers(f('reel'))).toEqual(['Sube el video final.', 'Falta el copy largo.']);
    // An image is not the reel's video.
    expect(reviewBlockers(f('reel', { mediaMime: 'image/jpeg', longCopy: 'Copy' }))).toEqual(['Sube el video final.']);
  });
  it('con video y copy se envía; sin portada y horizontal solo avisa', () => {
    const r = f('reel', { mediaMime: 'video/mp4', mediaW: 1920, mediaH: 1080, longCopy: '¡Saludos, Táchira!' });
    expect(reviewBlockers(r)).toEqual([]);
    expect(reviewWarnings(r)).toEqual([
      'Falta la portada 9:16: el feed muestra el título.',
      'El video es horizontal (1920×1080): el reel va vertical 9:16, por ejemplo 1080×1920.',
    ]);
    expect(reviewWarnings({ ...r, coverId: ID(1), mediaW: 1080, mediaH: 1920 })).toEqual([]);
  });
});

describe('post', () => {
  it('sin imagen dice la proporción elegida', () => {
    expect(reviewBlockers(f('post', { longCopy: 'x' }))).toEqual(['Sube la imagen 4:5.']);
    expect(reviewBlockers(f('post', { longCopy: 'x', postRatio: '1:1' }))).toEqual(['Sube la imagen 1:1.']);
    expect(reviewBlockers(f('post', { mediaMime: 'image/jpeg' }))).toEqual(['Falta el copy largo.']);
  });
  it('una imagen que no es de la proporción elegida solo avisa (1:1 no avisa si es cuadrada)', () => {
    const p = f('post', { mediaMime: 'image/jpeg', mediaW: 1080, mediaH: 1080, longCopy: 'x' });
    expect(reviewBlockers(p)).toEqual([]);
    expect(reviewWarnings(p)).toEqual(['La imagen es de 1080×1080 y elegiste 4:5 (1080×1350).']);
    expect(reviewWarnings({ ...p, postRatio: '1:1' })).toEqual([]);
    expect(reviewWarnings({ ...p, mediaH: 1350 })).toEqual([]);
  });
});

describe('carrusel', () => {
  it('menos de 2 láminas con imagen, o una lámina vacía, no se envía (con su número)', () => {
    expect(reviewBlockers(f('carousel', { longCopy: 'x', slides: [ID(1)] }))).toEqual(['Sube al menos 2 láminas con su imagen.']);
    expect(reviewBlockers(f('carousel', { longCopy: 'x', slides: [ID(1), ID(2), null] }))).toEqual(['La lámina 3 no tiene imagen.']);
    expect(reviewBlockers(f('carousel', { slides: [ID(1), ID(2)] }))).toEqual(['Falta el copy largo.']);
    expect(reviewBlockers(f('carousel', { longCopy: 'x', slides: [ID(1), ID(2)] }))).toEqual([]);
  });
  it('una lámina que no es 1080×1350 solo avisa', () => {
    const c = f('carousel', { longCopy: 'x', slides: [ID(1), ID(2)], slideDims: [{ w: 1080, h: 1350 }, { w: 1080, h: 1080 }] });
    expect(reviewWarnings(c)).toEqual(['La lámina 2 es de 1080×1080: va 1080×1350 (4:5).']);
  });
});

describe('historia', () => {
  it('sin foto ni clip no se envía; no pide copy; sin texto en pantalla solo avisa', () => {
    expect(reviewBlockers(f('story'))).toEqual(['Sube la foto o el clip 9:16.']);
    const s = f('story', { mediaMime: 'image/jpeg' });
    expect(reviewBlockers(s)).toEqual([]);
    expect(reviewWarnings(s)).toEqual(['Falta el «Texto en pantalla».']);
    expect(reviewWarnings({ ...s, onScreen: '¿Qué obra quieres ver?' })).toEqual([]);
  });
});

describe('YouTube y fin de mes', () => {
  it('YouTube: sin video y sin descripción; la miniatura solo avisa', () => {
    expect(reviewBlockers(f('youtube'))).toEqual(['Sube el video final.', 'Falta la descripción.']);
    const y = f('youtube', { mediaMime: 'video/mp4', mediaW: 1920, mediaH: 1080, longCopy: 'Capítulos' });
    expect(reviewBlockers(y)).toEqual([]);
    expect(reviewWarnings(y)).toEqual(['Falta la miniatura 16:9.']);
  });
  it('fin de mes: sin imágenes o con una vacía, y sin copy', () => {
    expect(reviewBlockers(f('month_end'))).toEqual(['Sube las imágenes del cierre.', 'Falta el copy largo.']);
    expect(reviewBlockers(f('month_end', { longCopy: 'x', slides: [ID(1), null] }))).toEqual(['Falta la imagen 2.']);
    expect(reviewBlockers(f('month_end', { longCopy: 'x', slides: [ID(1)] }))).toEqual([]);
    expect(reviewWarnings(f('month_end'))).toEqual([]);
  });
});

describe('lo que cuenta el tablero', () => {
  it('copy faltante: la historia cuenta su texto en pantalla, el resto su copy largo', () => {
    expect(copyMissing(f('story', { longCopy: 'Hay copy' }))).toBe(true);
    expect(copyMissing(f('story', { onScreen: 'Texto' }))).toBe(false);
    expect(copyMissing(f('post', { onScreen: 'Texto' }))).toBe(true);
    expect(copyMissing(f('post', { longCopy: '   ' }))).toBe(true);
    expect(copyMissing(f('reel', { longCopy: 'Copy' }))).toBe(false);
  });
  it('imagen faltante: post sin imagen; reel y YouTube sin portada; historia sin media; láminas vacías', () => {
    expect(imageMissing(f('post'))).toBe(true);
    expect(imageMissing(f('post', { mediaMime: 'image/png' }))).toBe(false);
    expect(imageMissing(f('reel', { mediaMime: 'video/mp4' }))).toBe(true);
    expect(imageMissing(f('reel', { coverId: ID(1) }))).toBe(false);
    expect(imageMissing(f('youtube', { coverId: ID(1) }))).toBe(false);
    expect(imageMissing(f('story', { mediaMime: 'video/mp4' }))).toBe(false);
    expect(imageMissing(f('story'))).toBe(true);
    expect(imageMissing(f('carousel', { slides: [] }))).toBe(true);
    expect(imageMissing(f('carousel', { slides: [ID(1), null] }))).toBe(true);
    expect(imageMissing(f('month_end', { slides: [ID(1), ID(2)] }))).toBe(false);
  });
});
