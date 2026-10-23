import { describe, it, expect } from 'vitest';
import { checkVideo } from '@/lib/domain/video-rules';
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
});
