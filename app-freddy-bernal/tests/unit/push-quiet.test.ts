import { describe, it, expect } from 'vitest';
import { inQuietHours, pushDecision, quietHours, QUIET_DEFAULT } from '@/lib/push/quiet';

// Caracas is UTC-4 all year.
const at = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00-04:00`);

describe('horas de silencio', () => {
  it('vienen activas por defecto de 21:00 a 07:00', () => {
    expect(quietHours({})).toEqual({ on: true, from: QUIET_DEFAULT.from, to: QUIET_DEFAULT.to });
    expect(quietHours(null)).toEqual({ on: true, from: '21:00', to: '07:00' });
    expect(quietHours({ quiet: false }).on).toBe(false);
    expect(quietHours({ quiet_from: '22:30', quiet_to: '06:15' })).toEqual({ on: true, from: '22:30', to: '06:15' });
    expect(quietHours({ quiet_from: '25:00', quiet_to: 'x' })).toEqual({ on: true, from: '21:00', to: '07:00' });
  });

  it('cruzan la medianoche en hora de Caracas', () => {
    const q = quietHours({});
    expect(inQuietHours(at('20:59'), q)).toBe(false);
    expect(inQuietHours(at('21:00'), q)).toBe(true);
    expect(inQuietHours(at('23:30'), q)).toBe(true);
    expect(inQuietHours(at('00:00'), q)).toBe(true);
    expect(inQuietHours(at('06:59'), q)).toBe(true);
    expect(inQuietHours(at('07:00'), q)).toBe(false);
    expect(inQuietHours(at('12:00'), q)).toBe(false);
  });

  it('una ventana de día también funciona; desde = hasta nunca silencia', () => {
    const q = { on: true, from: '13:00', to: '15:00' };
    expect(inQuietHours(at('12:59'), q)).toBe(false);
    expect(inQuietHours(at('14:00'), q)).toBe(true);
    expect(inQuietHours(at('15:00'), q)).toBe(false);
    expect(inQuietHours(at('14:00'), { on: true, from: '10:00', to: '10:00' })).toBe(false);
    expect(inQuietHours(at('23:00'), { on: false, from: '21:00', to: '07:00' })).toBe(false);
  });

  it('usa la zona de la app, no la del servidor', () => {
    // 02:00 UTC = 22:00 in Caracas (quiet); in UTC it would be inside too, so check 12:00 UTC = 08:00 Caracas.
    expect(inQuietHours(new Date('2026-10-24T12:00:00Z'), quietHours({}))).toBe(false);
    expect(inQuietHours(new Date('2026-10-24T10:30:00Z'), quietHours({}))).toBe(true); // 06:30 Caracas
  });
});

describe('decisión de aviso al teléfono', () => {
  it('de noche solo salen los críticos', () => {
    expect(pushDecision('review_pending', {}, false, at('23:00'))).toBe('quiet');
    expect(pushDecision('changes_requested', {}, true, at('23:00'))).toBe('send');
    expect(pushDecision('review_pending', {}, false, at('10:00'))).toBe('send');
    expect(pushDecision('review_pending', { quiet: false }, false, at('23:00'))).toBe('send');
  });

  it('respeta lo que la persona apagó, salvo los críticos', () => {
    expect(pushDecision('material_ready', { material_ready: false }, false, at('10:00'))).toBe('kind_off');
    expect(pushDecision('event_assigned', { event_assigned: false }, true, at('10:00'))).toBe('send');
  });
});
