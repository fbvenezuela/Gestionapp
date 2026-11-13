import { describe, it, expect } from 'vitest';
import { versionLabel } from '@/lib/data/labels';

// Words the team reads on many screens, said one way everywhere.
describe('la versión de una pieza (APP-22)', () => {
  it('«Versión N», y antes del primer archivo «Sin archivo todavía» (nunca «v1» ni «Versión —»)', () => {
    expect(versionLabel(0)).toBe('Sin archivo todavía');
    expect(versionLabel(null)).toBe('Sin archivo todavía');
    expect(versionLabel(1)).toBe('Versión 1');
    expect(versionLabel(2)).toBe('Versión 2');
  });
});
