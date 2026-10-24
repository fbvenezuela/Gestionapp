import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { windowHint, windowWarnings } from '@/lib/domain/publishing-windows';
import { getClientConfig } from '@/lib/client-config';

const TZ = 'America/Caracas';
const tiktok = getClientConfig('fb').publishingWindows.tiktok;

describe('mejores horas por red', () => {
  it('resume la franja en una línea', () => {
    expect(windowHint(tiktok)).toBe('Mejor 22:00–23:59 o 07:00–11:59 · jueves, miércoles y domingo. Evitar 12:00–16:59 · martes y sábado.');
    expect(windowHint(undefined)).toBe('');
  });
  it('avisa si la hora es de las peores', () => {
    const at = DateTime.fromISO('2026-10-29T14:30', { zone: TZ }); // jueves
    expect(windowWarnings('TikTok', tiktok, at)).toEqual(['TikTok: 12:00–16:59 es de las horas que peor rinden.']);
  });
  it('avisa si el día es de los peores, y calla en la mejor hora', () => {
    expect(windowWarnings('TikTok', tiktok, DateTime.fromISO('2026-10-31T22:30', { zone: TZ }))).toEqual(['TikTok: el sábado es de los días que peor rinden.']);
    expect(windowWarnings('TikTok', tiktok, DateTime.fromISO('2026-10-29T22:30', { zone: TZ }))).toEqual([]);
  });
  it('fuera de las mejores horas, sin ser de las peores', () => {
    expect(windowWarnings('TikTok', tiktok, DateTime.fromISO('2026-10-29T18:10', { zone: TZ }))[0]).toMatch(/fuera de las mejores horas/);
  });
});
