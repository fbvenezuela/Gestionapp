// The app's two text rules against the cases the database's copies are tested with (tests/unit/fixtures/
// privacy-text-cases.ts; the SQL side: tests/rls/privacy-hardening.test.ts). If a case changes here, it changes for
// both, and the migration that changes the SQL goes with it. All data here is invented.
import { describe, expect, it } from 'vitest';
import { phonesIn } from '@/lib/domain/phones';
import { looksLikeDateTime } from '@/lib/push/text';
import { DATETIME_CASES, PHONE_CASES, generatedTexts } from './fixtures/privacy-text-cases';

describe('las reglas de texto de la app (las mismas que revisa la base)', () => {
  it('teléfonos: phonesIn()', () => {
    for (const c of PHONE_CASES) expect(phonesIn(c.text).length > 0, JSON.stringify(c.text)).toBe(c.phone);
  });

  it('fecha, hora o teléfono: looksLikeDateTime()', () => {
    for (const c of DATETIME_CASES) expect(looksLikeDateTime(c.text), JSON.stringify(c.text)).toBe(c.datetime);
  });

  it('los textos generados son siempre los mismos y tocan los dos lados de cada regla', () => {
    const a = generatedTexts(2000);
    expect(generatedTexts(2000)).toEqual(a);
    const phones = a.filter((s) => phonesIn(s).length > 0).length;
    const dates = a.filter((s) => looksLikeDateTime(s)).length;
    for (const n of [phones, dates]) {
      expect(n).toBeGreaterThan(100);
      expect(n).toBeLessThan(1900);
    }
  });
});
