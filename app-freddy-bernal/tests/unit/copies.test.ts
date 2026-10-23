import { describe, it, expect } from 'vitest';
import { buildCopies, LIMITS } from '@/lib/domain/copies';
import { tweetLength } from '@/lib/domain/tweets';

const brand = { greeting: '¡Saludos, Táchira!', closings: ['Seguimos trabajando', 'Por amor al Táchira'], hashtags: ['#Táchira', '#Demo'] };
const formula = { code: 'FAB', name: 'FAB', steps: [{ key: 'feature', label: '', hint: '' }, { key: 'advantage', label: '', hint: '' }, { key: 'benefit', label: '', hint: '' }] };
const input = {
  title: 'Entrega de la cancha techada de El Mirador', place: 'Cancha El Mirador', municipality: 'Cárdenas', summary: '',
  workDescription: 'Techado y piso nuevo de la cancha comunal', ledBy: 'Dirección de obras', achievements: 'Espacio techado para 3 clubes juveniles',
  keyFacts: 'Superficie: 600 m² (Dirección de obras).\nBeneficiados: 1.200 personas (ficha).', speech: '', category: null,
};

describe('buildCopies', () => {
  const c = buildCopies(input, formula, brand);
  it('respeta los largos de cada red', () => {
    expect([...c.long].length).toBeLessThanOrEqual(LIMITS.long);
    expect([...c.medium].length).toBeLessThanOrEqual(LIMITS.medium);
    expect(tweetLength(c.short)).toBeLessThanOrEqual(LIMITS.short);
  });
  it('abre con el saludo y cierra con la frase de la marca', () => {
    expect(c.long.startsWith('¡Saludos, Táchira!')).toBe(true);
    expect(c.long).toMatch(/Por amor al Táchira\.$/);
    expect(c.short).toMatch(/#Táchira/);
  });
  it('solo usa cifras de la ficha', () => {
    const nums = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]$/, ''));
    const allowed = new Set([...nums(input.keyFacts), ...nums(input.achievements)]);
    for (const text of [c.long, c.medium, c.short]) for (const n of nums(text)) expect(allowed.has(n), `${n} en "${text}"`).toBe(true);
  });
  it('dice qué falta', () => {
    const empty = buildCopies({ ...input, keyFacts: '', achievements: '' }, formula, brand);
    expect(empty.missing).toContain('Datos y cifras (con fuente)');
    expect(empty.missing).toContain('Qué se está logrando');
  });
});
