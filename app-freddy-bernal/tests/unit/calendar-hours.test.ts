import { describe, it, expect } from 'vitest';
import { hourLabel } from '@/components/agenda/calendar';

// The hour column of the agenda's week and day views (APP-10): in Spanish, like every other time in the app, with plain
// spaces (the same text on the server and in the phone).
describe('las horas de la agenda', () => {
  it('dicen «a. m.» y «p. m.», nunca «AM» ni «PM»', () => {
    expect(hourLabel(6)).toBe('6 a. m.');
    expect(hourLabel(11)).toBe('11 a. m.');
    expect(hourLabel(12)).toBe('12 p. m.');
    expect(hourLabel(13)).toBe('1 p. m.');
    expect(hourLabel(22)).toBe('10 p. m.');
    for (let h = 6; h <= 23; h++) {
      expect(hourLabel(h), String(h)).not.toMatch(/AM|PM|[  ]/);
    }
  });
});
