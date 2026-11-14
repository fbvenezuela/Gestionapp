import { describe, it, expect } from 'vitest';
import { checkCarousel, checkStory, checkVideo, weightMb } from '@/lib/domain/video-rules';
import specs from '../../config/network-specs.json';

const rule = (n: string, f: string) => (specs.specs.find((s) => s.network === n)!.formats as unknown as Record<string, object>)[f];
const good = { durationS: 58, width: 1080, height: 1920, fps: 30, videoCodec: 'avc', audioCodec: 'aac', sizeBytes: 80e6 };

describe('checkVideo', () => {
  it('un reel vertical correcto pasa en Instagram y TikTok', () => {
    expect(checkVideo('Instagram', 'reel', rule('instagram', 'reel'), good)).toEqual([]);
    expect(checkVideo('TikTok', 'video', rule('tiktok', 'video'), good)).toEqual([]);
  });
  it('dice en palabras que TikTok no acepta 11 minutos', () => {
    const r = checkVideo('TikTok', 'video', rule('tiktok', 'video'), { ...good, durationS: 660 });
    expect(r[0].text).toBe('TikTok: el video dura 11 minutos y el máximo es 10 minutos. Córtalo.');
  });
  it('detecta horizontal donde va vertical', () => {
    const r = checkVideo('Instagram', 'reel', rule('instagram', 'reel'), { ...good, width: 1920, height: 1080 });
    expect(r.some((i) => i.text.includes('horizontal'))).toBe(true);
  });
  it('detecta calidad baja, peso y códec', () => {
    const r = checkVideo('Facebook', 'reel', rule('facebook', 'reel'), { ...good, width: 360, height: 640, videoCodec: 'mpeg-4 visual', sizeBytes: 2e9 });
    const t = r.map((i) => i.text).join(' | ');
    expect(t).toContain('mínimo es 540 px');
    expect(t).toContain('H.264');
    expect(t).toContain('MB');
  });
  it('Reels de Facebook: más de 90 s no', () => {
    expect(checkVideo('Facebook', 'reel', rule('facebook', 'reel'), { ...good, durationS: 120 })[0].level).toBe('error');
  });
  it('X: un video vertical 1080×1920 dice que es muy alto y qué hacer (APP-41)', () => {
    const r = checkVideo('X', 'video', rule('x', 'video'), good);
    expect(r).toEqual([{ level: 'error', text: 'X: el video es muy alto: mide 1920 px y en X el máximo es 1200 px. Exporta más pequeño.' }]);
    // The same check on a picture speaks of the picture.
    expect(checkVideo('X', 'foto', { max_height: 1200 }, { ...good, isImage: true, durationS: null, fps: null, videoCodec: null, audioCodec: null })[0].text).toBe(
      'X: la imagen es muy alta: mide 1920 px y en X el máximo es 1200 px. Exporta más pequeña.',
    );
  });
  it('una foto con la forma equivocada es «la imagen», nunca «el video» (F10)', () => {
    const photo = { ...good, width: 1920, height: 1080, isImage: true, durationS: null, fps: null, videoCodec: null, audioCodec: null, sizeBytes: 2 * 1024 * 1024 };
    expect(checkVideo('Instagram', 'photo', rule('instagram', 'photo'), photo)).toEqual([
      { level: 'error', text: 'Instagram: la imagen es horizontal (1920×1080) y en Instagram va 4:5, 1:1 o 1.91:1.' },
    ]);
    expect(checkVideo('Instagram', 'reel', rule('instagram', 'reel'), { ...good, width: 1920, height: 1080 })[0].text).toBe(
      'Instagram: el video es horizontal (1920×1080) y en Instagram va 9:16 (vertical, por ejemplo 1080×1920).',
    );
  });
});

describe('el peso, como lo lee una persona (F4)', () => {
  const MB = 1024 * 1024;
  it('con un decimal debajo de 10 MB, y nunca igual al máximo cuando se pasa', () => {
    expect(checkVideo('Facebook', 'photo', { max_size_mb: 4 }, { ...good, isImage: true, sizeBytes: 4.3 * MB })[0].text).toBe(
      'Facebook: pesa 4,3 MB y el máximo es 4 MB. Expórtalo con menos peso.',
    );
    expect(checkVideo('X', 'photo', { max_size_mb: 5 }, { ...good, isImage: true, sizeBytes: 5.2 * MB })[0].text).toBe('X: pesa 5,2 MB y el máximo es 5 MB. Expórtalo con menos peso.');
    expect(weightMb(9 * MB, 5)).toBe('9');
    expect(weightMb(4.04 * MB, 4)).toBe('4,04');
    expect(weightMb(4.001 * MB, 4)).toBe('4,01');
    expect(weightMb(300.4 * MB, 300)).toBe('300,4');
    expect(weightMb(2e9, 1024)).toBe('1907');
  });
  it('lo mismo en una historia y en una lámina de carrusel', () => {
    expect(checkStory('Instagram', { max_size_mb: 8 }, { ...good, isImage: true, width: 1080, height: 1920, sizeBytes: 8.4 * MB })[0].text).toBe(
      'Instagram: la historia pesa 8,4 MB y el máximo es 8 MB.',
    );
    expect(checkCarousel('Instagram', { max_size_mb: 8, aspects: ['4:5', '1:1'] }, [
      { ...good, isImage: true, width: 1080, height: 1350, sizeBytes: 1 * MB },
      { ...good, isImage: true, width: 1080, height: 1350, sizeBytes: 8.2 * MB },
    ])[0].text).toBe('Instagram: la lámina 2 pesa 8,2 MB y el máximo es 8 MB.');
  });
});
