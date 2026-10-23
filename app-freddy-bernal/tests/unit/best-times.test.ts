import { describe, it, expect } from 'vitest';
import { bestTimes } from '@/lib/domain/best-times';

const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h));
describe('bestTimes', () => {
  it('elige la franja con más vistas y avisa si hay pocos datos', () => {
    const r = bestTimes(
      [
        { network: 'instagram', publishedAt: at(8), views: 100, interactions: 10 },
        { network: 'instagram', publishedAt: at(20), views: 900, interactions: 50 },
        { network: 'instagram', publishedAt: at(21), views: 700, interactions: 40 },
      ],
      (d) => d.getUTCHours(),
    );
    expect(r[0].best?.band).toBe('noche');
    expect(r[0].enoughData).toBe(false);
  });
});
