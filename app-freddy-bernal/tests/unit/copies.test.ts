import { describe, it, expect } from 'vitest';
import { buildCopies, LIMITS, type CopyOptions } from '@/lib/domain/copies';
import { tweetLength } from '@/lib/domain/tweets';
import { getClientConfig } from '@/lib/client-config';

const brand = { greeting: '¡Saludos, Táchira!', closings: ['Seguimos trabajando', 'Por amor al Táchira'], hashtags: ['#Tachira', '#Demo'], name: 'Persona Demo' };
const formula = { code: 'FAB', name: 'FAB', steps: [{ key: 'feature', label: '', hint: '' }, { key: 'advantage', label: '', hint: '' }, { key: 'benefit', label: '', hint: '' }] };
const input = {
  title: 'Entrega de la cancha techada de El Mirador', place: 'Cancha El Mirador', municipality: 'Cárdenas', summary: '',
  workDescription: 'Techado y piso nuevo de la cancha comunal', ledBy: 'Dirección de obras', inCharge: '', achievements: 'Espacio techado para 3 clubes juveniles',
  keyFacts: 'Superficie: 600 m² (Dirección de obras).\nBeneficiados: 1.200 personas (ficha).', speech: '', bossLines: '', category: null,
};
const nums = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]$/, ''));
const allowed = new Set([...nums(input.keyFacts), ...nums(input.achievements)]);
const fits = (c: { long: string; medium: string; short: string }) => {
  expect([...c.long].length).toBeLessThanOrEqual(LIMITS.long);
  expect([...c.medium].length).toBeLessThanOrEqual(LIMITS.medium);
  expect(tweetLength(c.short)).toBeLessThanOrEqual(LIMITS.short);
};

describe('buildCopies', () => {
  const c = buildCopies(input, formula, brand);
  it('respeta los largos de cada red', () => fits(c));
  it('por defecto: voz del jefe (abre con su saludo) y cierre de la marca', () => {
    expect(c.long.startsWith('¡Saludos, Táchira!')).toBe(true);
    expect(c.long).toMatch(/Seguimos trabajando\.$/);
    expect(c.short).toMatch(/#Tachira/);
  });
  it('solo usa cifras de la ficha', () => {
    for (const text of [c.long, c.medium, c.short]) for (const n of nums(text)) expect(allowed.has(n), `${n} en "${text}"`).toBe(true);
  });
  it('dice qué falta', () => {
    const empty = buildCopies({ ...input, keyFacts: '', achievements: '' }, formula, brand);
    expect(empty.missing).toContain('Datos y cifras (con fuente)');
    expect(empty.missing).toContain('Qué se está logrando');
  });
});

describe('voz y cierre por pieza', () => {
  const opts = (o: Partial<CopyOptions>): CopyOptions => ({ voice: 'boss', closing: { kind: 'brand', text: 'Seguimos trabajando' }, ...o });
  it('institucional: sin saludo personal, abre con el hecho', () => {
    const c = buildCopies(input, formula, brand, opts({ voice: 'institutional' }));
    expect(c.long).not.toMatch(/Saludos/);
    expect(c.long.split('\n')[0]).toBe('Superficie: 600 m².');
  });
  it('cierre «Por amor al Táchira» solo cuando se elige', () => {
    const c = buildCopies(input, formula, brand, opts({ closing: { kind: 'brand', text: 'Por amor al Táchira' } }));
    expect(c.long).toMatch(/💛 Por amor al Táchira\.$/);
    expect(c.medium).toMatch(/Por amor al Táchira\.$/);
  });
  it('pregunta a la comunidad, destino o sin cierre', () => {
    expect(buildCopies(input, formula, brand, opts({ closing: { kind: 'question' } })).medium).toMatch(/¿Qué opinas\? Cuéntanos 👇$/);
    const d = buildCopies(input, formula, brand, opts({ closing: { kind: 'destination', text: 'Horarios en example.com/cancha' } }));
    expect(d.long).toMatch(/👉 Horarios en example\.com\/cancha$/);
    expect(d.short).toMatch(/👉 Horarios en example\.com\/cancha #/);
    const n = buildCopies(input, formula, brand, opts({ closing: { kind: 'none' } }));
    expect(n.long).not.toMatch(/Seguimos trabajando|Por amor al Táchira|¿Qué opinas/);
  });
});

describe('las nueve fórmulas del cliente', () => {
  const formulas = getClientConfig('fb').copyFormulas;
  const rich = { ...input, summary: 'Los vecinos reportaron que la cancha se inundaba con cada lluvia.', speech: '¡Saludos, Táchira! Esta cancha es de los muchachos del barrio. Son 600 m² nuevos.' };

  it('están todas', () => {
    expect(formulas.map((f) => f.code)).toEqual(['FAB', 'PAS', 'AIDA', 'GBA', 'DATO', 'DAR', 'CIFRA', 'CITA', 'HIST']);
  });
  for (const f of formulas) {
    it(`${f.code}: cabe en cada red y no inventa cifras`, () => {
      const c = buildCopies(rich, f, brand, { voice: 'institutional', closing: { kind: 'destination', text: 'Más en example.com' } });
      fits(c);
      for (const text of [c.long, c.medium, c.short]) for (const n of nums(text)) expect(allowed.has(n), `${n} en "${text}"`).toBe(true);
    });
  }
  it('CITA usa una frase textual del jefe, sin el saludo ni cifras', () => {
    const cita = formulas.find((f) => f.code === 'CITA')!;
    const c = buildCopies(rich, cita, brand, { voice: 'institutional', closing: { kind: 'none' } });
    expect(c.long).toContain('«Esta cancha es de los muchachos del barrio», Persona Demo.');
    const none = buildCopies({ ...rich, speech: 'Son 600 m² nuevos.' }, cita, brand);
    expect(none.missing.some((m) => m.startsWith('Una frase textual del jefe'))).toBe(true);
  });
  it('GBA y DATO piden un destino si el cierre no lo trae', () => {
    for (const code of ['GBA', 'DATO']) {
      const c = buildCopies(rich, formulas.find((f) => f.code === code)!, brand);
      expect(c.missing.some((m) => m.startsWith('Destino para el cierre')), code).toBe(true);
    }
  });
  it('DAR abre con lo que reportó la gente', () => {
    const c = buildCopies(rich, formulas.find((f) => f.code === 'DAR')!, brand, { voice: 'institutional', closing: { kind: 'none' } });
    expect(c.long).toMatch(/^Los vecinos reportaron que la cancha se inundaba con cada lluvia\.\n\n📍 Cancha El Mirador, Cárdenas/);
    expect(c.short.startsWith('Los vecinos reportaron')).toBe(true);
  });
});
