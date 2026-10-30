// Publicar validates by the piece's format (R4, D-73): a reel as reel/short/video, a post as a photo, a carousel and
// Fin de mes slide by slide, a story as a story (a clip up to 60 s), YouTube as a video; a network that does not take
// the format says so. The words of video-rules for stories and carousels. Pure: the context is built by hand.
import { describe, it, expect } from 'vitest';
import { formatsFor, validateFor, type PublishContext } from '@/lib/data/publish';
import { checkCarousel, checkStory, type FormatRule } from '@/lib/domain/video-rules';
import type { Format } from '@/lib/domain/redes';

const SPECS = [
  {
    network: 'instagram', label: 'Instagram', length_group: 'long' as const, copy_max_chars: 2200,
    formats: {
      reel: { max_duration_s: 900, aspects: ['9:16'], aspect_tolerance: 0.02 },
      photo: { aspects: ['4:5', '1:1', '1.91:1'], aspect_tolerance: 0.03, max_size_mb: 8 },
      story: { max_duration_s: 60, aspects: ['9:16'], aspect_tolerance: 0.02 },
      carousel: { aspects: ['4:5', '1:1'], aspect_tolerance: 0.03, max_items: 20 },
    } as Record<string, FormatRule>,
  },
  {
    network: 'facebook', label: 'Facebook', length_group: 'long' as const, copy_max_chars: 63206,
    formats: { reel: { max_duration_s: 90, aspects: ['9:16'] }, video: {}, story: { max_duration_s: 60, aspects: ['9:16'] }, carousel: { aspects: ['4:5', '1:1'], max_items: 10 } } as Record<string, FormatRule>,
  },
  { network: 'tiktok', label: 'TikTok', length_group: 'long' as const, copy_max_chars: 2200, formats: { video: { max_duration_s: 600, aspects: ['9:16'] } } as Record<string, FormatRule> },
  { network: 'x', label: 'X', length_group: 'short' as const, copy_max_chars: 280, formats: { video: { max_duration_s: 140 } } as Record<string, FormatRule> },
  { network: 'youtube', label: 'YouTube', length_group: 'long' as const, copy_max_chars: 5000, formats: { short: { max_duration_s: 180, aspects: ['9:16', '1:1'] }, video: { max_duration_s: 43200 } } as Record<string, FormatRule> },
];

type Media = NonNullable<PublishContext['media']>;
const video = (x: Partial<Media> = {}): Media => ({ mime: 'video/mp4', duration_s: 30, width: 1080, height: 1920, fps: 30, video_codec: 'avc1', audio_codec: 'mp4a', size_bytes: 10_000_000, ...x });
const image = (w = 1080, h = 1350): Media => ({ mime: 'image/jpeg', duration_s: null, width: w, height: h, fps: null, video_codec: null, audio_codec: null, size_bytes: 300_000 });

function ctx(format: Format, x: Partial<Pick<PublishContext, 'media' | 'slides' | 'copies'>> = {}): PublishContext {
  return {
    piece: { id: 'p', title: 'Pieza de prueba', status: 'approved', kind: 'video', format, current_version: 1, approved_version: 1, design_status: null, design_at: null, approved_at: null },
    version: { media_asset_id: 'm', cover_asset_id: null, slide_asset_ids: [] },
    media: null,
    slides: [],
    copies: [{ length_group: 'long', body: '¡Saludos, Táchira! Copy de prueba.' }, { length_group: 'short', body: 'Corto.' }],
    specs: SPECS,
    collaborators: [],
    windows: {},
    notices: [],
    ...x,
  };
}

const errors = (c: ReturnType<typeof validateFor>) => c.issues.filter((i) => i.level === 'error').map((i) => i.text);

describe('el formato de la red sale del formato de la pieza', () => {
  it('reel: reel en Instagram y Facebook, short en YouTube, video en TikTok', () => {
    const c = ctx('reel', { media: video() });
    expect(validateFor(c, 'instagram').format).toBe('reel');
    expect(validateFor(c, 'youtube').format).toBe('short');
    expect(validateFor(c, 'youtube').formats).toEqual(['short', 'video']);
    expect(validateFor(c, 'tiktok').format).toBe('video');
    expect(validateFor(c, 'facebook', 'video').format).toBe('video');
    // A format the piece cannot go out as is ignored.
    expect(validateFor(c, 'instagram', 'carousel').format).toBe('reel');
  });

  it('post: foto; las redes sin foto lo dicen', () => {
    const c = ctx('post', { media: image() });
    expect(validateFor(c, 'instagram')).toMatchObject({ format: 'photo', formats: ['photo'] });
    expect(errors(validateFor(c, 'instagram'))).toEqual([]);
    expect(errors(validateFor(c, 'tiktok'))).toEqual(['TikTok: esta red no recibe posts.']);
  });

  it('historia: sin copy no avisa; un clip de 75 s no pasa; TikTok no recibe historias', () => {
    const c = ctx('story', { media: video({ duration_s: 75 }), copies: [] });
    const ig = validateFor(c, 'instagram');
    expect(ig.format).toBe('story');
    expect(ig.issues).toEqual([{ level: 'error', text: 'La historia dura 75 s: Instagram deja hasta 60 s.' }]);
    expect(validateFor(ctx('story', { media: video({ duration_s: 20 }), copies: [] }), 'facebook').issues).toEqual([]);
    expect(validateFor(ctx('story', { media: image(1080, 1920), copies: [] }), 'instagram').issues).toEqual([]);
    expect(errors(validateFor(c, 'tiktok'))).toEqual(['TikTok: esta red no recibe historias.']);
  });

  it('YouTube: video, con su descripción como copy largo', () => {
    const c = ctx('youtube', { media: video({ width: 1920, height: 1080, duration_s: 600 }) });
    const yt = validateFor(c, 'youtube');
    expect(yt).toMatchObject({ format: 'video', formats: ['video'] });
    expect(yt.copy).toBe('¡Saludos, Táchira! Copy de prueba.');
    expect(errors(validateFor(c, 'instagram'))).toEqual(['Instagram: esta red no recibe videos de YouTube.']);
  });
});

describe('carrusel y fin de mes: lámina por lámina', () => {
  const four = [image(), image(), image(), image()];
  it('cuatro láminas 4:5 pasan en Instagram y Facebook', () => {
    expect(errors(validateFor(ctx('carousel', { slides: four }), 'instagram'))).toEqual([]);
    expect(validateFor(ctx('month_end', { slides: four }), 'facebook').format).toBe('carousel');
  });
  it('Facebook deja hasta 10; una lámina vacía o apaisada se dice con su número', () => {
    const twelve = Array.from({ length: 12 }, () => image());
    expect(errors(validateFor(ctx('carousel', { slides: twelve }), 'facebook'))).toEqual(['Facebook deja hasta 10 imágenes: este carrusel tiene 12.']);
    expect(errors(validateFor(ctx('carousel', { slides: [image(), null, image(1920, 1080)] }), 'instagram'))).toEqual([
      'Instagram: la lámina 2 no tiene imagen.',
      'Instagram: la lámina 3 es horizontal (1920×1080) y aquí va 4:5 o 1:1.',
    ]);
  });
  it('X no recibe carruseles', () => {
    expect(errors(validateFor(ctx('carousel', { slides: four }), 'x'))).toEqual(['X: esta red no recibe carruseles.']);
    expect(formatsFor(ctx('carousel'), SPECS[3])).toEqual([]);
  });
});

describe('las reglas en palabras', () => {
  it('historia sin reglas guardadas: revisar a mano; horizontal: no pasa', () => {
    expect(checkStory('Instagram', undefined, { durationS: 10, width: 1080, height: 1920, fps: 30, videoCodec: null, audioCodec: null, sizeBytes: 1 })).toEqual([
      { level: 'warn', text: 'Instagram: no hay reglas guardadas para las historias. Revísalo a mano.' },
    ]);
    expect(checkStory('Facebook', { aspects: ['9:16'] }, { durationS: 10, width: 1920, height: 1080, fps: 30, videoCodec: null, audioCodec: null, sizeBytes: 1 })[0].text).toBe(
      'Facebook: la historia es horizontal (1920×1080) y va vertical 9:16, por ejemplo 1080×1920.',
    );
  });
  it('carrusel de una sola imagen: al menos 2', () => {
    expect(checkCarousel('Instagram', { aspects: ['4:5'] }, [{ durationS: null, width: 1080, height: 1350, fps: null, videoCodec: null, audioCodec: null, sizeBytes: 1, isImage: true }])).toEqual([
      { level: 'error', text: 'Instagram: un carrusel lleva al menos 2 imágenes y este tiene 1.' },
    ]);
  });
});
