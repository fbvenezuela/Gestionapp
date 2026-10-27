// Which picture a publication shows in Resultados (§6 «Resultados con miniaturas»): the piece's cover first, then
// the final file (the picture, or the video's frame), then the screenshot of the post, then an icon. The boss's own
// posts have no piece: only their screenshot. Demo ids only.
import { describe, it, expect } from 'vitest';
import { canShow, pubIcon, thumbSources, type PubThumbInput } from '@/lib/domain/thumb-source';

const f = (n: number, mime: string | null = 'image/jpeg') => ({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, mime });
const [cover, vcover, video, photo, shot] = [f(1), f(2), f(3, 'video/mp4'), f(4, 'image/png'), f(5)];

const pub = (over: Partial<PubThumbInput> = {}): PubThumbInput => ({ origin: 'piece', network: 'instagram', format: 'reel', ...over });

describe('miniatura de una publicación: en qué orden se busca', () => {
  it('portada de la publicación → portada de la versión → archivo final → captura', () => {
    expect(thumbSources(pub({ cover, versionCover: vcover, versionMedia: video, evidence: shot })).ids).toEqual([cover.id, vcover.id, video.id, shot.id]);
  });

  it('sin portada: el video final (su cuadro guardado al subirlo) va antes que la captura', () => {
    expect(thumbSources(pub({ versionMedia: video, evidence: shot })).ids).toEqual([video.id, shot.id]);
    expect(thumbSources(pub({ format: 'photo', versionMedia: photo, evidence: shot })).ids).toEqual([photo.id, shot.id]);
  });

  it('cada archivo una sola vez (la portada de la publicación suele ser la de la versión)', () => {
    expect(thumbSources(pub({ cover, versionCover: cover, versionMedia: video })).ids).toEqual([cover.id, video.id]);
  });

  it('lo del jefe por su cuenta: solo su captura, aunque hubiera otros archivos', () => {
    expect(thumbSources(pub({ origin: 'boss_spontaneous', network: 'tiktok', format: 'post', evidence: shot })).ids).toEqual([shot.id]);
    expect(thumbSources(pub({ origin: 'boss_spontaneous', cover, versionMedia: video })).ids).toEqual([]);
  });

  it('un archivo que la persona no puede leer (sin tipo), un PDF o un audio nunca se intentan', () => {
    expect(canShow(f(6, null))).toBe(false);
    expect(canShow({ id: null, mime: 'image/jpeg' })).toBe(false);
    expect(canShow(f(7, 'application/pdf'))).toBe(false);
    expect(canShow(f(8, 'audio/mpeg'))).toBe(false);
    expect(canShow(video)).toBe(true);
    expect(thumbSources(pub({ cover: f(6, null), versionMedia: f(7, 'application/pdf'), evidence: shot })).ids).toEqual([shot.id]);
  });

  it('sin ningún archivo: lista vacía y el ícono del formato', () => {
    expect(thumbSources(pub())).toEqual({ ids: [], icon: 'video' });
  });
});

describe('el ícono cuando no hay miniatura', () => {
  it('por el formato', () => {
    for (const format of ['reel', 'video', 'short', 'story']) expect(pubIcon({ network: 'instagram', format }), format).toBe('video');
    expect(pubIcon({ network: 'instagram', format: 'carousel' })).toBe('carousel');
    expect(pubIcon({ network: 'instagram', format: 'photo' })).toBe('image');
  });

  it('una «publicación» sin más: por el archivo final, y si no hay, por la red', () => {
    expect(pubIcon({ network: 'x', format: 'post', versionMedia: video })).toBe('video');
    expect(pubIcon({ network: 'x', format: 'post', versionMedia: photo })).toBe('image');
    expect(pubIcon({ network: 'x', format: 'post' })).toBe('text');
    expect(pubIcon({ network: 'threads', format: 'post' })).toBe('text');
    expect(pubIcon({ network: 'tiktok', format: 'post' })).toBe('video');
    expect(pubIcon({ network: 'facebook', format: 'post' })).toBe('image');
  });
});
