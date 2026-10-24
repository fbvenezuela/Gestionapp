import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { buildCopies, inventedNumbers, overLimits, LIMITS, type Closing, type CopyOptions, type Voice } from '@/lib/domain/copies';
import { tweetLength } from '@/lib/domain/tweets';
import { getClientConfig } from '@/lib/client-config';
import { checkWhen } from '@/app/(panel)/publicar/espontanea/spontaneous-form';

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

// ---------------------------------------------------------------------------
// Regressions from the review: limits, abbreviations, quotes, closings, checks
// ---------------------------------------------------------------------------
const words = (n: number) => Array.from({ length: n }, (_, i) => ['los', 'vecinos', 'decían', 'que', 'la', 'cancha', 'se', 'inundaba'][i % 8]).join(' ');
const longLink = 'https://example.com/inscripciones/para-la-cancha-techada-de-el-mirador-en-el-municipio-cardenas-del-estado';
const hugeDest = `Inscríbete en ${longLink} o en la sede de la Av. Principal de El Mirador, frente a la plaza, de lunes a viernes en la mañana, o pregunta por el coordinador de deportes de la alcaldía, que te atiende con mucho gusto y sin costo alguno para ti y tu familia`;
const tooLongForX = `${hugeDest} ${hugeDest}`;
const closings: Closing[] = [
  { kind: 'brand', text: 'Seguimos trabajando' },
  { kind: 'brand', text: '¿Seguimos?' },
  { kind: 'brand', text: '¡Por amor al Táchira!' },
  { kind: 'question' },
  { kind: 'destination', text: 'Más en example.com' },
  { kind: 'destination', text: `Horarios y requisitos en ${longLink}` },
  { kind: 'destination', text: '¡Inscríbete en la Av. Principal de El Mirador!' },
  { kind: 'destination', text: hugeDest },
  { kind: 'destination', text: tooLongForX },
  { kind: 'none' },
];
const voices: Voice[] = ['boss', 'institutional'];
const abbr = {
  ...input,
  title: 'Entrega de 120 viviendas 2026',
  place: 'Urb. Los Pinos',
  summary: 'Gracias al Sr. Pérez y a la Dra. Gómez los vecinos tienen casa. Antes vivían en riesgo.',
  workDescription: 'Construcción de viviendas en la Av. Principal',
  ledBy: 'Ing. Ramírez',
  achievements: '120 familias con casa propia',
  keyFacts: 'Beneficiados: aprox. 1.200 personas (Gob. del Táchira, oct. 2026)\nInversión: Bs. 500.000 (Edo. Táchira, ene. 2026)',
  speech: '¡Saludos, Táchira! Gracias al Sr. Pérez por estar aquí con nosotros. ¡Qué alegría estar aquí con ustedes! Son 120 casas.',
};
const huge = words(500);
const adversarial: Record<string, typeof input> = {
  base: input,
  abbr,
  summary660: { ...input, summary: words(110) },
  unpunctuated: { ...input, title: words(40), place: words(30), summary: huge, workDescription: huge, achievements: huge, keyFacts: `${huge} (fuente)`, speech: huge, bossLines: huge },
  manySentences: {
    ...abbr,
    summary: Array.from({ length: 40 }, (_, i) => `Los vecinos del sector ${['norte', 'sur', 'este'][i % 3]} pedían la obra desde hace años.`).join(' '),
    workDescription: Array.from({ length: 40 }, () => 'Se techó la cancha y se pintó el piso.').join(' '),
    achievements: Array.from({ length: 40 }, () => 'Los muchachos ya juegan bajo techo.').join('\n'),
    keyFacts: Array.from({ length: 30 }, (_, i) => `Dato ${i + 1}: ${i + 10} personas atendidas (ficha ${i + 1}).`).join('\n'),
    bossLines: 'Esta cancha es de los muchachos del barrio\n¡Qué alegría estar aquí!',
  },
  longFact: { ...input, keyFacts: `${words(120)} 600 m² (Dirección de obras)\nBeneficiados: 1.200 personas (ficha)` },
};
const dest = (c: Closing) => (c.kind === 'destination' ? `👉 ${(c.text ?? '').replace(/\.$/, '')}` : '');
// Every «…» is a whole sentence of what the boss said: textual, balanced and without figures.
const quotesOk = (text: string, i: typeof input) => {
  for (const [, q] of text.matchAll(/«([^»]*)»/g)) {
    const source = `${i.speech}\n${i.bossLines}`;
    expect(source.includes(q), `«${q}» no es textual`).toBe(true);
    expect(/\d/.test(q), `«${q}» tiene cifras`).toBe(false);
    expect(q.split('¡').length, `«${q}» desbalanceada`).toBe(q.split('!').length);
    expect(q.split('¿').length, `«${q}» desbalanceada`).toBe(q.split('?').length);
    const after = source[source.indexOf(q) + q.length];
    expect(/[!?…]$/.test(q) || after === undefined || /[.\n]/.test(after), `«${q}» cortada`).toBe(true);
  }
};

describe('a prueba de todo: 9 fórmulas × 2 voces × todos los cierres', () => {
  const formulas = getClientConfig('fb').copyFormulas;
  for (const [name, i] of Object.entries(adversarial)) {
    it(`${name}: cabe, no inventa cifras, no corta destinos ni citas`, () => {
      for (const f of formulas)
        for (const voice of voices)
          for (const closing of closings) {
            const c = buildCopies(i, f, brand, { voice, closing });
            const label = `${name} ${f.code} ${voice} ${closing.kind}:${(closing.text ?? '').slice(0, 20)}`;
            expect(overLimits(c), label).toEqual([]);
            const own = nums(closing.text ?? '');
            expect(inventedNumbers(c, i).filter((n) => !own.includes(n)), label).toEqual([]);
            for (const text of [c.long, c.medium, c.short]) {
              quotesOk(text, i);
              expect(text, label).not.toMatch(/[!?]\./); // no "¿Seguimos?." nor "¡…!."
              expect(text, label).not.toMatch(/#\S*\d/); // no figures in hashtags
              expect(text, label).not.toMatch(/\((ficha|fuente|Gob\.|Edo\.|Dirección)/); // no sources
            }
            const d = dest(closing);
            if (d) {
              const noX = c.missing.some((m) => m.startsWith('El destino del cierre no cabe en X'));
              expect(noX || c.short.includes(d), `${label} short sin destino: ${c.short}`).toBe(true);
              expect(noX, label).toBe(closing.text === tooLongForX);
              expect(c.medium.includes(d) || c.missing.some((m) => m.includes('copy mediano')), label).toBe(true);
              expect(c.long.includes(d), label).toBe(true);
            }
            if (name === 'abbr' || name === 'manySentences' || name === 'base') {
              // Punctuated input: never a sentence cut with "…".
              expect(`${c.long}${c.medium}`, label).not.toContain('…');
              // X may drop words only when the destination leaves no room for a whole sentence.
              if (closing.text !== hugeDest && closing.text !== tooLongForX) expect(c.short, label).not.toContain('…');
            }
          }
    });
  }
});

describe('X: siempre 280 y con el destino entero', () => {
  const pas = getClientConfig('fb').copyFormulas.find((f) => f.code === 'PAS')!;
  const longTitle = { ...input, title: 'Inauguración de la cancha techada de El Mirador con la comunidad deportiva del municipio Cárdenas y los clubes juveniles del sector' };
  it('si no caben las etiquetas, salen las etiquetas antes que el destino', () => {
    const d = `Horarios, requisitos y planillas en ${longLink} y en la Av. Principal de El Mirador, frente a la plaza, de lunes a viernes`;
    const c = buildCopies(longTitle, pas, brand, { voice: 'boss', closing: { kind: 'destination', text: d } });
    expect(tweetLength(c.short)).toBeLessThanOrEqual(280);
    expect(c.short).toContain(`👉 ${d}`);
  });
  it('si ni el título cabe con el destino, queda el destino solo y se avisa', () => {
    const c = buildCopies(longTitle, pas, brand, { voice: 'boss', closing: { kind: 'destination', text: hugeDest } });
    expect(tweetLength(c.short)).toBeLessThanOrEqual(280);
    expect(c.short).toContain(`👉 ${hugeDest}`);
    expect(c.missing.some((m) => m.includes('muy largo para X'))).toBe(true);
  });
  it('quita palabras enteras del inicio, nunca del destino', () => {
    const c = buildCopies({ ...input, title: words(60), summary: words(80) }, pas, brand, { voice: 'boss', closing: { kind: 'destination', text: `Más en ${longLink}` } });
    expect(tweetLength(c.short)).toBeLessThanOrEqual(280);
    expect(c.short).toMatch(new RegExp(`^Los vecinos .*… 👉 Más en ${longLink.replace(/[./-]/g, '\\$&')}$`));
  });
});

describe('frases: abreviaturas y fuentes', () => {
  const formulas = getClientConfig('fb').copyFormulas;
  const by = (code: string) => formulas.find((f) => f.code === code)!;
  const inst = { voice: 'institutional' as const, closing: { kind: 'none' as const } };
  it('no corta en «Sr.», «aprox.» ni en la fuente con «Gob.» y «oct.»', () => {
    const c = buildCopies(abbr, formula, brand, inst);
    expect(c.long.split('\n')[0]).toBe('Beneficiados: aprox. 1.200 personas.');
    expect(c.long).toContain('Inversión: Bs. 500.000.');
    expect(c.long).not.toMatch(/Gob\.|oct\.|ene\.|Táchira,/);
    const pas = buildCopies(abbr, by('PAS'), brand, inst);
    expect(pas.long.split('\n')[0]).toBe('Gracias al Sr. Pérez y a la Dra. Gómez los vecinos tienen casa.');
  });
  it('la cita es la frase entera, con su «¡…!»', () => {
    const c = buildCopies(abbr, by('CITA'), brand, inst);
    expect(c.long).toContain('«Gracias al Sr. Pérez por estar aquí con nosotros», Persona Demo.');
    const joy = buildCopies({ ...abbr, speech: '¡Saludos, Táchira! ¡Qué alegría estar aquí con ustedes! Son 120 casas.' }, by('CITA'), brand, inst);
    expect(joy.long).toContain('«¡Qué alegría estar aquí con ustedes!», Persona Demo.');
    const wrong = buildCopies({ ...abbr, speech: '¡Qué alegría estar aquí con ustedes.' }, by('CITA'), brand, inst);
    expect(wrong.long).not.toContain('«');
  });
  it('salta pedazos cortados en una abreviatura que no conoce', () => {
    const c = buildCopies({ ...abbr, speech: 'Gracias al pro. Pérez por venir. Esta cancha es de los muchachos.' }, by('CITA'), brand, inst);
    expect(c.long).toContain('«Esta cancha es de los muchachos», Persona Demo.');
    const known = buildCopies({ ...abbr, speech: 'Gracias al Cap. Pérez por venir. Esta cancha es de los muchachos.' }, by('CITA'), brand, inst);
    expect(known.long).toContain('«Gracias al Cap. Pérez por venir», Persona Demo.');
  });
  it('una frase partida en dos líneas se cita entera', () => {
    const c = buildCopies({ ...abbr, speech: 'Esta cancha es de los muchachos\ndel barrio y de nadie más.' }, by('CITA'), brand, inst);
    expect(c.long).toContain('«Esta cancha es de los muchachos del barrio y de nadie más», Persona Demo.');
  });
});

describe('mediano y largo: nunca pasan del límite', () => {
  const formulas = getClientConfig('fb').copyFormulas;
  it('un resumen de 660 caracteres sin puntos: el copy abre con el dato y se avisa', () => {
    const i = { ...input, summary: words(110) };
    expect(i.summary.length).toBeGreaterThan(600);
    for (const code of ['PAS', 'DAR', 'HIST']) {
      const c = buildCopies(i, formulas.find((f) => f.code === code)!, brand, { voice: 'institutional', closing: { kind: 'brand', text: 'Seguimos trabajando' } });
      expect([...c.medium].length, code).toBeLessThanOrEqual(500);
      expect(c.medium.startsWith('Superficie: 600 m².'), code).toBe(true);
      expect(c.missing, code).toContain('El resumen es una sola frase muy larga: pártelo en frases cortas');
    }
  });
  it('un primer dato larguísimo también se avisa', () => {
    const c = buildCopies(adversarial.longFact, formula, brand, { voice: 'institutional', closing: { kind: 'none' } });
    expect([...c.medium].length).toBeLessThanOrEqual(500);
    expect(c.missing.some((m) => m.startsWith('El primer dato es una sola frase muy larga'))).toBe(true);
  });
  it('quita frases enteras del final, no a mitad de frase', () => {
    const c = buildCopies(adversarial.manySentences, formulas.find((f) => f.code === 'DAR')!, brand, { voice: 'institutional', closing: { kind: 'none' } });
    expect([...c.medium].length).toBeLessThanOrEqual(500);
    expect(c.medium).toMatch(/[.!?]$/);
    expect(c.medium).not.toContain('…');
  });
});

describe('cierres con su propia puntuación', () => {
  const opts = (text: string): CopyOptions => ({ voice: 'boss', closing: { kind: 'brand', text } });
  it('«¿Seguimos?» y «¡Por amor al Táchira!» quedan como se escribieron', () => {
    const q = buildCopies(input, formula, brand, opts('¿Seguimos?'));
    expect(q.long).toMatch(/💛 ¿Seguimos\?$/);
    expect(q.medium).toMatch(/\n¿Seguimos\?$/);
    expect(q.short).toMatch(/ ¿Seguimos\? #/);
    const e = buildCopies(input, formula, brand, opts('¡Por amor al Táchira!'));
    expect(e.long).toMatch(/💛 ¡Por amor al Táchira!$/);
    expect(e.medium).toMatch(/\n¡Por amor al Táchira!$/);
    expect(e.short).toContain('¡Por amor al Táchira! #');
    expect(buildCopies(input, formula, brand, opts('Seguimos trabajando.')).long).toMatch(/💛 Seguimos trabajando\.$/);
  });
});

describe('etiquetas sin cifras', () => {
  it('«Entrega de viviendas 2026» → #EntregaViviendas', () => {
    const c = buildCopies({ ...input, title: 'Entrega de viviendas 2026' }, formula, brand);
    expect(c.short).toContain('#EntregaViviendas ');
    expect(c.short).not.toMatch(/#\S*\d/);
  });
});

describe('revisión de copies escritos por la IA', () => {
  const set = (long: string, medium = '', short = '') => ({ long, medium, short });
  it('inventedNumbers: cifras que no están en la ficha', () => {
    expect(inventedNumbers(set('Superficie: 600 m². Beneficiados: 1200 personas.', '3 clubes', '1,200'), input)).toEqual([]);
    expect(inventedNumbers(set('Son 1.500 personas.', 'Y 600 m² y 45 árboles.', 'Son 1.500.'), input)).toEqual(['1.500', '45']);
  });
  it('inventedNumbers: ignora etiquetas y enlaces', () => {
    expect(inventedNumbers(set('#Tachira2030 Más en example.com/obra/987 y https://example.com/x?id=55'), input)).toEqual([]);
  });
  it('inventedNumbers: mira todos los campos de la ficha', () => {
    const i = { ...input, title: 'Entrega de 120 viviendas', speech: 'Son 35 años', bossLines: 'Llegamos a 7 parroquias', category: 'Obras 2026' };
    expect(inventedNumbers(set('120 viviendas, 35 años, 7 parroquias, 2026.'), i)).toEqual([]);
  });
  it('overLimits: dice cuál pasa y por cuánto', () => {
    expect(overLimits(set('a'.repeat(2200), 'b'.repeat(612), 'c'.repeat(280)))).toEqual(['medium 612/500']);
    expect(overLimits(set('a'.repeat(2201), '', `${'c'.repeat(256)} ${longLink}`))).toEqual(['long 2201/2200']);
    expect(overLimits(set('', '', 'c'.repeat(281)))).toEqual(['short 281/280']);
  });
});

// ---------------------------------------------------------------------------
// Regressions from the second review: abbreviations, quotes, sources, X cuts
// ---------------------------------------------------------------------------
describe('segunda revisión', () => {
  const formulas = getClientConfig('fb').copyFormulas;
  const by = (code: string) => formulas.find((f) => f.code === code)!;
  const inst = { voice: 'institutional' as const, closing: { kind: 'none' as const } };
  const all = (c: { long: string; medium: string; short: string }) => [c.long, c.medium, c.short];
  // The quote of a CITA copy, or '' when there is none.
  const quoteOf = (text: string) => text.match(/«([^»]*)»/)?.[1] ?? '';
  const cita = (o: Partial<typeof input>, voice: Voice = 'institutional') => buildCopies({ ...input, ...o }, by('CITA'), brand, { voice, closing: { kind: 'none' } });
  const oneSpace = (s: string) => s.replace(/\s+/g, ' ');

  it('cita: no se corta en abreviaturas que no estaban en la lista (Cmdte., Alcde., Tcnel., Coord.)', () => {
    for (const speech of [
      'Como decía el Cmdte. Chávez, la patria se construye con trabajo.',
      'Gracias al Alcde. Pérez por todo su apoyo a esta obra.',
      'Gracias al Tcnel. Ramírez por su apoyo a esta obra.',
      'Le agradezco a la Coord. Martínez por su apoyo en esta obra.',
    ]) {
      const c = cita({ speech });
      for (const text of all(c)) expect(quoteOf(text), text).toBe(speech.replace(/\.$/, ''));
    }
  });

  it('texto público: no se corta en Mpio., Dip., Cra., Coord., Ref. ni Km.', () => {
    const open = (code: string, o: Partial<typeof input>) => buildCopies({ ...input, ...o }, by(code), brand, inst);
    for (const [code, summary] of [
      ['PAS', 'Los vecinos del Mpio. Cárdenas pedían el techado desde hace años.'],
      ['DAR', 'El Dip. Pérez recibió las quejas de los vecinos por las goteras.'],
      ['PAS', 'La cancha de la Cra. 5 se inundaba con cada lluvia.'],
      ['PAS', 'La Coord. Martínez recibió la denuncia de los vecinos del sector.'],
    ]) {
      const c = open(code, { summary });
      for (const text of all(c)) expect(text.startsWith(summary), `${code}: ${text}`).toBe(true);
    }
    const fab = open('FAB', { keyFacts: 'Beneficiados: 1.200 personas del Mpio. Cárdenas (ficha)' });
    expect(fab.long.split('\n')[0]).toBe('Beneficiados: 1.200 personas del Mpio. Cárdenas.');
    expect(fab.long).not.toMatch(/^Cárdenas\.$/m);
    const cifra = open('CIFRA', { keyFacts: 'Inversión: Ref. 25.000 (Dirección de obras)' });
    for (const text of all(cifra)) expect(text).toContain('Inversión: Ref. 25.000.');
    const dato = open('DATO', { keyFacts: 'Asfaltado: del Km. 5 al Km. 12 de la Troncal 5 (Vialidad)' });
    for (const text of all(dato)) expect(text).toContain('Asfaltado: del Km. 5 al Km. 12 de la Troncal 5.');
  });

  it('cita: una frase que sigue en la otra línea se cita entera (después de «:», «de» o con mayúscula)', () => {
    for (const speech of [
      'Les quiero decir algo muy importante:\nesta cancha es de ustedes.',
      'Gracias a todos los vecinos de\nEl Mirador por la paciencia que tuvieron.',
      'Quiero darle las gracias a toda la gente de\nSan Cristóbal por su apoyo en esta obra.',
    ]) {
      const c = cita({ speech });
      for (const text of all(c)) expect(quoteOf(text), text).toBe(oneSpace(speech).replace(/\.$/, ''));
    }
  });

  it('cita: nunca un pedazo de frase ni un «;» convertido en punto', () => {
    // A line that doesn't end its sentence and can't be joined for sure: neither half is quoted.
    const c = cita({ speech: 'Esta cancha es de los muchachos\nGracias a todos por venir.' });
    expect(c.long).not.toContain('«');
    const etc = cita({ speech: 'Trajimos cemento, cabillas, bloques, etc.;\nlos vecinos pusieron la mano de obra.' });
    expect(quoteOf(etc.long)).toBe('Trajimos cemento, cabillas, bloques, etc.; los vecinos pusieron la mano de obra');
    expect(etc.long).not.toContain('..');
  });

  it('cita: las líneas del storyboard son bloques aparte, nunca se juntan', () => {
    const c = cita({ bossLines: 'Hoy cumplimos con la comunidad\nesto es para los muchachos del barrio' });
    for (const text of all(c)) expect(quoteOf(text)).toBe('Hoy cumplimos con la comunidad');
    // A block that ends on "de" was cut: neither it nor the next one is quoted.
    const cut = cita({ bossLines: 'Esta cancha es para los muchachos de\nEl Mirador y de todo Cárdenas' }, 'boss');
    expect(cut.long).not.toContain('«');
    expect(cut.missing.some((m) => m.startsWith('Una frase textual del jefe'))).toBe(true);
  });

  it('cita: «¡…!» y «¿…?» completos, nunca el final de una exclamación más larga', () => {
    for (const speech of ['¡Esto es para ustedes. Disfruten esta cancha nueva!', 'Qué alegría estar aquí con ustedes!', '¿Saben qué? Esto es de ustedes?']) {
      expect(cita({ speech }).long, speech).not.toContain('«');
    }
    expect(quoteOf(cita({ speech: '¡Esto es para ustedes. Disfruten! Esta cancha es de los muchachos.' }).long)).toBe('Esta cancha es de los muchachos');
  });

  it('cita: sin el saludo aunque venga pegado a la frase o con otras palabras', () => {
    for (const speech of [
      '¡Saludos, Táchira! hoy cumplimos con los muchachos del barrio.',
      '¡Saludos, Táchira!, hoy estamos en la cancha de los muchachos.',
      '¡Saludos, mi Táchira querido! Buenos días a todos los presentes.',
    ]) {
      for (const voice of voices) {
        const c = cita({ speech }, voice);
        for (const text of all(c)) expect(quoteOf(text), `${voice}: ${text}`).toBe('');
      }
    }
    expect(quoteOf(cita({ speech: '¡Saludos, mi Táchira querido! Esta cancha es de ustedes.' }).long)).toBe('Esta cancha es de ustedes');
  });

  it('cita: sin acotaciones como «(aplausos)»', () => {
    const c = cita({ speech: 'Esta cancha es de los muchachos del barrio (aplausos). Gracias a todos por venir.' });
    expect(quoteOf(c.long)).toBe('Gracias a todos por venir');
  });

  it('fuentes: ningún paréntesis ni «Fuente:» llega al texto público', () => {
    const lead = (keyFacts: string, code = 'FAB') => buildCopies({ ...input, keyFacts }, by(code), brand, inst).long.split('\n')[0];
    expect(lead('600 m² de techo (Dirección de obras); 1.200 beneficiados (ficha)', 'CIFRA')).toBe('600 m² de techo; 1.200 beneficiados.');
    expect(lead('Beneficiados: 1.200 personas (ficha técnica), de ellos 300 niños (censo)')).toBe('Beneficiados: 1.200 personas, de ellos 300 niños.');
    expect(lead('Beneficiados: 1.200 personas (ficha técnica')).toBe('Beneficiados: 1.200 personas.');
    const wrapped = buildCopies({ ...input, keyFacts: 'Beneficiados: 1.200 personas (Gob. del\nTáchira, oct. 2026)' }, formula, brand, inst);
    expect(wrapped.long.split('\n')[0]).toBe('Beneficiados: 1.200 personas.');
    for (const text of all(wrapped)) expect(text).not.toMatch(/2026|Gob\.|oct\./);
    const named = buildCopies({ ...input, keyFacts: 'Beneficiados: 1.200 personas. Fuente: ficha técnica de la Dirección de Obras' }, formula, brand, inst);
    for (const text of all(named)) expect(text).not.toMatch(/Fuente|ficha técnica/);
  });

  it('listas numeradas: «1.» y «2.» no son frases', () => {
    const keyFacts = '1. Superficie: 600 m² (Dirección de obras)\n2. Beneficiados: 1.200 personas (ficha)';
    const fab = buildCopies({ ...input, keyFacts }, formula, brand, inst);
    expect(fab.long.split('\n')[0]).toBe('Superficie: 600 m².');
    for (const text of all(fab)) expect(text).not.toMatch(/(^|\s)[12]\.(\s|$)/);
    const cifra = buildCopies({ ...input, keyFacts }, by('CIFRA'), brand, inst);
    expect(cifra.long.split('\n')[0]).toBe('Superficie: 600 m².');
    const pas = buildCopies({ ...input, summary: '1. Los vecinos pedían el techado.\n2. La cancha se inundaba.' }, by('PAS'), brand, inst);
    expect(pas.long.split('\n')[0]).toBe('Los vecinos pedían el techado.');
  });

  it('una línea partida a mitad de frase no se corta ni lleva un punto en medio', () => {
    const pas = buildCopies({ ...input, summary: 'Los vecinos reportaron que la cancha\nse inundaba con cada lluvia y no se podía jugar.' }, by('PAS'), brand, inst);
    for (const text of all(pas)) expect(text.startsWith('Los vecinos reportaron que la cancha se inundaba con cada lluvia y no se podía jugar.'), text).toBe(true);
    const aida = buildCopies({ ...input, workDescription: 'Se colocó el techo de la cancha\ny se pintó el piso con material antideslizante.' }, by('AIDA'), brand, inst);
    for (const text of all(aida)) {
      expect(text).toContain('Se colocó el techo de la cancha y se pintó el piso con material antideslizante.');
      expect(text).not.toContain('cancha. y');
    }
  });

  it('una cifra negativa conserva su signo', () => {
    const c = buildCopies({ ...input, keyFacts: '-15% en el tiempo de viaje (estudio de Vialidad)' }, by('CIFRA'), brand, inst);
    for (const text of all(c)) expect(text).toMatch(/(^|\s)-15% en el tiempo de viaje\./);
  });

  it('X: nunca corta una cifra ni un teléfono, y avisa que cortó', () => {
    const dest = 'Inscríbete en la sede de la Av. Principal de El Mirador, frente a la plaza, de lunes a viernes en la mañana, o pregunta por el coordinador de deportes de la alcaldía de Cárdenas y del estado Táchira';
    expect(dest.length).toBeLessThanOrEqual(200);
    const title = 'Inauguración de la cancha techada de El Mirador con la comunidad deportiva del municipio Cárdenas';
    let cuts = 0;
    for (const [keyFacts, figure] of [
      ['Con el apoyo de toda la comunidad organizada del sector se invirtieron 15 millones de bolívares en la obra (ficha)', /15/],
      ['La inversión en el techado de la cancha comunal de El Mirador fue de Bs. 500 millones para los muchachos (Dirección de obras)', /500|Bs\./],
      ['Inscripciones para los 3 clubes juveniles de El Mirador: llama al 0276 555 12 34 de lunes a viernes (ficha)', /0276|555/],
    ] as const) {
      for (const voice of voices) {
        const c = buildCopies({ ...input, title, keyFacts }, formula, brand, { voice, closing: { kind: 'destination', text: dest } });
        expect(tweetLength(c.short)).toBeLessThanOrEqual(280);
        expect(c.short).toContain(`👉 ${dest}`);
        const lead = c.short.slice(0, c.short.indexOf('👉'));
        if (lead.includes('…')) {
          cuts++;
          expect(lead, voice).not.toMatch(figure);
          expect(lead, voice).not.toMatch(/\d\S*(\s\S+){0,2}…/);
          expect(c.missing.some((m) => m.startsWith('En X el inicio quedó cortado')), voice).toBe(true);
        }
      }
    }
    expect(cuts).toBeGreaterThan(0);
  });

  it('sin punto doble en «C.A.», «Cárdenas.» ni «Edo. Táchira.»', () => {
    const c = buildCopies({ ...input, ledBy: 'Constructora Los Andes, C.A.', municipality: 'Cárdenas.', keyFacts: '' }, formula, brand, inst);
    for (const text of all(c)) expect(text).not.toContain('..');
    expect(c.long).toContain('A cargo: Constructora Los Andes, C.A.');
    expect(c.long).toContain('Cancha El Mirador, Cárdenas.');
    const boss = buildCopies({ ...input, municipality: 'Cárdenas.' }, formula, brand);
    expect(boss.long).toContain('📍 Cancha El Mirador, Cárdenas\n');
    const dato = buildCopies({ ...input, ledBy: 'Dirección de Obras del Edo. Táchira.' }, by('DATO'), brand, inst);
    for (const text of all(dato)) expect(text).not.toContain('..');
  });

  it('un cierre elegido pero vacío no desaparece sin avisar', () => {
    for (const code of ['FAB', 'AIDA', 'PAS', 'DAR', 'CIFRA', 'CITA', 'HIST']) {
      for (const text of ['', '  ', '…', '👍']) {
        const c = buildCopies(input, by(code), brand, { voice: 'boss', closing: { kind: 'destination', text } });
        expect(c.missing, `${code} «${text}»`).toContain('Destino para el cierre (enlace, teléfono o dirección)');
      }
      const b = buildCopies(input, by(code), brand, { voice: 'boss', closing: { kind: 'brand', text: '' } });
      expect(b.missing.some((m) => m.startsWith('El cierre elegido está vacío')), code).toBe(true);
    }
    expect(buildCopies(input, formula, brand, { voice: 'boss', closing: { kind: 'none' } }).missing.some((m) => /cierre/i.test(m))).toBe(false);
  });

  it('sin el lugar ni el título repetidos cuando aún no hay datos', () => {
    const c = buildCopies({ ...input, keyFacts: '' }, formula, brand, inst);
    expect(c.long.split('\n')[0]).toBe('Entrega de la cancha techada de El Mirador en Cancha El Mirador, Cárdenas.');
    expect(c.long).not.toContain('📍');
    const bare = buildCopies({ ...input, keyFacts: '', workDescription: '', achievements: '' }, formula, brand, inst);
    for (const text of all(bare)) expect(text.split('Entrega de la cancha techada de El Mirador').length - 1, text).toBe(1);
    expect(bare.short.startsWith('Entrega de la cancha techada de El Mirador en Cancha El Mirador, Cárdenas. #')).toBe(true);
  });

  it('etiquetas: la ñ se queda y no se repiten', () => {
    const tag = (title: string) => buildCopies({ ...input, title }, formula, brand).short;
    expect(tag('Celebración de los años del liceo')).toContain('#CelebracionAñosLiceo ');
    expect(tag('Juguetes para los niños de Lobatera')).toContain('#JuguetesParaNiños ');
    expect(tag('Táchira 2030')).toMatch(/ #Tachira #Demo$/);
  });

  it('inventedNumbers: 2,5 no es 25; «#7» es una cifra; m2, correos y el destino no cuentan', () => {
    const set = (long: string) => ({ long, medium: '', short: '' });
    expect(inventedNumbers(set('Asfaltamos 25 km de vías.'), { ...input, keyFacts: 'Vialidad: 2,5 km asfaltados (ficha)' })).toEqual(['25']);
    expect(inventedNumbers(set('Asfaltamos 2,5 km de vías.'), { ...input, keyFacts: 'Vialidad: 2,5 km asfaltados (ficha)' })).toEqual([]);
    expect(inventedNumbers(set('Se invirtieron 15 millones. Y 1,2 millones más.'), { ...input, keyFacts: 'Inversión: 1,5 millones (ficha)\nAtendidas: 12 escuelas' })).toEqual(['15', '1,2']);
    expect(inventedNumbers(set('Somos el estado #7 en producción de café.'), input)).toEqual(['7']);
    expect(inventedNumbers(set('Son 600 m2 de techo.'), input)).toEqual([]);
    const d = 'Escribe a obras2027@gmail.com o llama al 0276-5551234.';
    expect(inventedNumbers(set(`Superficie: 600 m². 👉 ${d}`), input, d)).toEqual([]);
  });

  it('un cierre con emoji no lleva punto después', () => {
    const c = buildCopies(input, formula, brand, { voice: 'boss', closing: { kind: 'brand', text: 'Seguimos trabajando 💪' } });
    expect(c.long).toMatch(/💛 Seguimos trabajando 💪$/);
    expect(c.medium).toMatch(/\nSeguimos trabajando 💪$/);
  });

  it('un dato no se repite aunque «Bs.» no deje partir la frase', () => {
    const c = buildCopies({ ...input, keyFacts: 'Inversión: 500 mil Bs. (ficha)\nBeneficiados: 1.200 personas (ficha)' }, formula, brand, inst);
    expect(c.long.split('Inversión: 500 mil Bs.').length - 1).toBe(1);
    expect(c.long).toContain('Beneficiados: 1.200 personas.');
  });

  it('X: nunca solo etiquetas y nunca una cita partida', () => {
    const c = buildCopies({ ...input, title: '', place: '', municipality: '', workDescription: '', achievements: '', keyFacts: '' }, by('CITA'), brand, inst);
    expect(c.short).not.toMatch(/^#/);
    const q = buildCopies({ ...input, speech: 'Gracias a Dios. Hoy cumplimos con los muchachos del barrio.' }, by('CITA'), brand, inst);
    for (const text of all(q)) expect(count(text, '«'), text).toBe(count(text, '»'));
  });
});

// ---------------------------------------------------------------------------
// Regressions from the third review: wrapped sources, cut quotes, abbreviations at line ends
// ---------------------------------------------------------------------------
describe('tercera revisión', () => {
  const formulas = getClientConfig('fb').copyFormulas;
  const by = (code: string) => formulas.find((f) => f.code === code)!;
  const none = { kind: 'none' as const };
  const all = (c: { long: string; medium: string; short: string }) => [c.long, c.medium, c.short];
  const make = (code: string, o: Partial<typeof input>, voice: Voice = 'institutional', closing: Closing = none) =>
    buildCopies({ ...input, ...o }, by(code), brand, { voice, closing });
  const quoteOf = (text: string) => text.match(/«([^»]*)»/)?.[1] ?? '';
  // Every quote is a whole sentence of the speech or the storyboard (lines joined by a space).
  const wholeQuote = (text: string, source: string) => {
    const q = quoteOf(text);
    if (!q) return;
    const flat = source.replace(/\s*\n\s*/g, ' ');
    expect(flat.includes(q), `«${q}» no es textual`).toBe(true);
    expect(/^[¡¿«"“]*\p{Lu}/u.test(q), `«${q}» empieza a mitad de frase`).toBe(true);
    const after = flat[flat.indexOf(q) + q.length];
    expect(/[!?…]$/.test(q) || after === undefined || after === '.', `«${q}» cortada`).toBe(true);
  };

  it('una fuente partida en varias líneas, con () o [], nunca llega al texto', () => {
    for (const keyFacts of [
      'Beneficiados: 1.200 personas (Gobernación del\nTáchira, Dirección de\nObras, 2026)',
      'Beneficiados: 1.200 personas [Gobernación\nTáchira, 2026]',
      'Beneficiados: 1.200 personas (Gob. del\n\nTáchira, 2026)',
    ])
      for (const voice of voices) {
        const c = make('FAB', { keyFacts }, voice);
        // "Táchira," only: the boss's greeting says "¡Saludos, Táchira!".
        for (const text of all(c)) expect(text, `${voice}: ${keyFacts}`).not.toMatch(/Táchira,|Obras|2026|Gob/);
        expect(c.long, voice).toContain('Beneficiados: 1.200 personas.');
      }
    // A "(" that never closes eats nothing after it.
    const open = make('FAB', { keyFacts: 'Beneficiados: 1.200 personas (ficha técnica\nInversión: Bs. 500.000 (ficha)' });
    expect(open.long).toContain('Beneficiados: 1.200 personas.');
    expect(open.long).toContain('Inversión: Bs. 500.000.');
  });

  it('cita: una línea que termina en abreviatura o sigue en minúscula se une, nunca se cita a medias', () => {
    const cases: [string, string][] = [
      ['Quiero agradecer al Ing.\nRamírez y a su equipo por esta obra.', 'Quiero agradecer al Ing. Ramírez y a su equipo por esta obra'],
      ['Trajimos cemento, cabillas, bloques, etc.\ny los vecinos pusieron la mano de obra.', 'Trajimos cemento, cabillas, bloques, etc. y los vecinos pusieron la mano de obra'],
      ['Tenemos 600 m² nuevos. ¿Saben qué?\nesta cancha es de ustedes.', '¿Saben qué? esta cancha es de ustedes'],
    ];
    for (const [speech, quote] of cases)
      for (const voice of voices) {
        const c = make('CITA', { speech }, voice);
        for (const text of all(c)) {
          expect(quoteOf(text), `${voice}: ${text}`).toBe(quote);
          wholeQuote(text, speech);
        }
      }
    for (const speech of ['Pusimos 600 m² de techo, etc.\ny los vecinos pusieron la mano de obra.', 'Gracias al Ing. Ramírez por los 600 m².\nde verdad que los muchachos lo merecen.'])
      for (const voice of voices) for (const text of all(make('CITA', { speech }, voice))) expect(quoteOf(text), text).toBe('');
  });

  it('cita: un bloque del storyboard que empieza en minúscula es resto del anterior', () => {
    const bossLines = 'Hoy entregamos 600 m² de cancha techada a los muchachos\ndel barrio El Mirador y de todo Cárdenas.';
    for (const voice of voices) {
      const c = make('CITA', { bossLines }, voice);
      for (const text of all(c)) expect(quoteOf(text), text).toBe('');
      expect(c.missing.some((m) => m.startsWith('Una frase textual del jefe'))).toBe(true);
    }
    // The block before is cut too when the next one opens with "del", "y", "para"…
    const cut = make('CITA', { bossLines: 'Hoy entregamos la cancha techada a los muchachos\ndel barrio El Mirador y de todo Cárdenas.' });
    for (const text of all(cut)) expect(quoteOf(text), text).toBe('');
  });

  it('texto público: una línea que termina en abreviatura sigue en la próxima', () => {
    const summary = 'Los vecinos de la Urb.\nLos Pinos pedían el techado desde hace años.';
    for (const text of all(make('PAS', { summary }))) expect(text.startsWith('Los vecinos de la Urb. Los Pinos pedían el techado desde hace años.'), text).toBe(true);
    for (const text of all(make('CIFRA', { keyFacts: 'Beneficiados: aprox.\n1.200 personas (ficha)' }))) expect(text.startsWith('Beneficiados: aprox. 1.200 personas.'), text).toBe(true);
    // "12 km." may end a fact: the next fact stays apart.
    const km = make('FAB', { keyFacts: 'Asfaltado: 12 km.\nBeneficiados: 1.200 personas (ficha)' });
    expect(km.long.split('\n')[0]).toBe('Asfaltado: 12 km.');
  });

  it('datos: una línea en minúscula o una cifra sola en la próxima línea siguen el mismo dato', () => {
    const fab = make('FAB', { keyFacts: 'Beneficiados: 1.200 personas de la parroquia San Juan Bautista\ny de la parroquia La Concordia (ficha)' });
    expect(fab.long.split('\n')[0]).toBe('Beneficiados: 1.200 personas de la parroquia San Juan Bautista y de la parroquia La Concordia.');
    expect(fab.long).not.toMatch(/^y de la parroquia/m);
    for (const text of all(make('CIFRA', { keyFacts: 'Inversión total en la obra\nBs. 500.000 (ficha)' }))) expect(text.startsWith('Inversión total en la obra Bs. 500.000.'), text).toBe(true);
  });

  it('«fuentes:» como palabra (agua) no se borra; «Fuente:» como etiqueta sí', () => {
    for (const [keyFacts, lead] of [
      ['Se rehabilitaron 3 fuentes: El Valle, La Mulera y Rubio (Hidrosuroeste)', 'Se rehabilitaron 3 fuentes: El Valle, La Mulera y Rubio.'],
      ['Se recuperaron 4 fuentes: 2 pozos y 2 manantiales (Hidrológica del Táchira)', 'Se recuperaron 4 fuentes: 2 pozos y 2 manantiales.'],
      ['Beneficiados: 1.200 personas; fuente: ficha técnica', 'Beneficiados: 1.200 personas.'],
      ['Beneficiados: 1.200 personas, Fuentes: ficha y censo', 'Beneficiados: 1.200 personas.'],
    ])
      for (const text of all(make('CIFRA', { keyFacts }))) expect(text.startsWith(lead), text).toBe(true);
  });

  it('cita: nunca una cita interna abierta («“Estudia siempre»)', () => {
    for (const speech of [
      'Mi mamá me decía: “Estudia siempre. Nunca te rindas.” Por eso hicimos esta escuela de 3 pisos.',
      'Mi mamá me decía: "Estudia siempre, hijo. Nunca te rindas." Por eso hicimos esta escuela de 3 pisos.',
    ])
      for (const text of all(make('CITA', { speech }))) expect(quoteOf(text), text).toBe('');
    const whole = make('CITA', { speech: 'Mi mamá me decía: “Estudia siempre, hijo”. Por eso estamos aquí.' });
    expect(quoteOf(whole.long)).toBe('Mi mamá me decía: “Estudia siempre, hijo”');
  });

  it('el saludo no se cita ni abre el copy, diga lo que diga', () => {
    for (const speech of ['Muy buenos días a todos los presentes.', 'Un saludo muy especial a todo el pueblo tachirense.', 'Buen día a todos los presentes.', 'Bienvenidos todos a esta fiesta del barrio.'])
      for (const voice of voices) for (const text of all(make('CITA', { speech }, voice))) expect(quoteOf(text), `${voice}: ${text}`).toBe('');
    const pas = make('PAS', { summary: '¡Saludos, Táchira! Los vecinos reportaron que la cancha se inundaba.' });
    for (const text of all(pas)) expect(text.startsWith('Los vecinos reportaron que la cancha se inundaba.'), text).toBe(true);
  });

  it('un teléfono con código de área entre paréntesis queda entero', () => {
    for (const code of ['FAB', 'CIFRA'])
      for (const text of all(make(code, { keyFacts: 'Inscripciones al (0276) 356-1234 de lunes a viernes (ficha)' })))
        expect(text.startsWith('Inscripciones al (0276) 356-1234 de lunes a viernes.'), `${code}: ${text}`).toBe(true);
  });

  it('una abreviatura en minúscula antes de una cifra no corta («cel.», «info.», «p. ej.»)', () => {
    for (const keyFacts of ['Inscripciones al cel. 0414-555-1234 (ficha)\nBeneficiados: 1.200 personas (ficha)', 'Más info. 0276-555-1234 (ficha)'])
      for (const text of all(make('FAB', { keyFacts }))) expect(text, text).toMatch(/0414-555-1234|0276-555-1234/);
    const ej = make('FAB', { keyFacts: 'Sectores con agua, p. ej. La Concordia y Barrio Obrero: 1.200 familias (Hidrológica)' });
    for (const text of all(ej)) expect(text.startsWith('Sectores con agua, p. ej. La Concordia y Barrio Obrero: 1.200 familias.'), text).toBe(true);
  });

  it('«Dato (fuente).» sin puntuación doble', () => {
    for (const [keyFacts, lead] of [
      ['Inversión: 500 mil Bs. (Dirección de obras).', 'Inversión: 500 mil Bs.'],
      ['Ejecutó: Constructora Los Andes, C.A. (Dirección de obras).', 'Ejecutó: Constructora Los Andes, C.A.'],
      ['¿Sabías que se atendieron 1.200 personas? (ficha).', '¿Sabías que se atendieron 1.200 personas?'],
      ['¡Récord de 1.200 asistentes! (Protección Civil).', '¡Récord de 1.200 asistentes!'],
      ['Y vienen 3 canchas más... (Dirección de obras).', 'Y vienen 3 canchas más...'],
    ])
      for (const text of all(make('CIFRA', { keyFacts }))) {
        expect(text.split('\n')[0].startsWith(lead), text).toBe(true);
        expect(text, text).not.toMatch(/[!?]\./);
        expect(text, text).not.toMatch(/(^|[^.])\.\.($|[^.])|\.{4}/);
      }
  });

  it('una frase repetida entre dos campos sale una sola vez (GBA, PAS)', () => {
    const o = { workDescription: 'Se asfaltaron las vías principales del municipio.', achievements: 'Se asfaltaron las vías principales del municipio. El transporte público ya pasa por ellas.' };
    for (const code of ['GBA', 'PAS']) {
      const c = make(code, o);
      for (const text of [c.long, c.medium]) expect(text.split('Se asfaltaron las vías principales del municipio.').length - 1, `${code}: ${text}`).toBe(1);
      expect(c.long, code).toContain('El transporte público ya pasa por ellas.');
    }
    // GBA keeps its blocks as paragraphs.
    expect(make('GBA', o).long).toContain('Se asfaltaron las vías principales del municipio.\n\nEl transporte público ya pasa por ellas.');
  });

  it('el municipio no se repite cuando el lugar ya lo dice', () => {
    for (const place of ['Cancha El Mirador, Cárdenas', 'Cancha El Mirador, municipio Cárdenas', 'Cancha El Mirador en Cárdenas']) {
      const boss = make('FAB', { place }, 'boss');
      expect(boss.long, place).toContain(`📍 ${place}\n`);
      const inst = make('FAB', { place, keyFacts: '' });
      for (const text of all(inst)) expect(text.split('Cárdenas').length - 1, text).toBe(1);
    }
    expect(make('FAB', { place: 'Liceo Simón Bolívar', municipality: 'Bolívar' }, 'boss').long).toContain('📍 Liceo Simón Bolívar, Bolívar\n');
  });

  it('«Según…» con cifra se queda (sin «Según X,»); sin cifra o al final, es la fuente y sale', () => {
    const c = make('CIFRA', { keyFacts: 'Según el censo, 1.200 familias se benefician (INE)' });
    for (const text of all(c)) expect(text.startsWith('1.200 familias se benefician.'), text).toBe(true);
    expect(c.missing).not.toContain('Datos y cifras (con fuente)');
    const trailing = make('FAB', { keyFacts: 'Beneficiados: 1.200 personas. Según la ficha técnica de 2026.' });
    for (const text of all(trailing)) expect(text).not.toMatch(/Según|2026/);
  });

  it('sin título: el primer dato largo va entero si el copy cabe', () => {
    const keyFacts = 'Vialidad: 12 km en La Florida, 9 km en Palmira, 7 km en Táriba, 11 km en San Josecito, 8 km en Cordero, 6 km en Rubio, 10 km en Michelena, 5 km en Lobatera, 13 km en Seboruco y 14 km en Colón (Dirección de Vialidad)';
    const fact = 'Vialidad: 12 km en La Florida, 9 km en Palmira, 7 km en Táriba, 11 km en San Josecito, 8 km en Cordero, 6 km en Rubio, 10 km en Michelena, 5 km en Lobatera, 13 km en Seboruco y 14 km en Colón.';
    for (const code of ['FAB', 'DATO']) {
      const c = make(code, { title: '', keyFacts });
      fits(c);
      expect(c.long, code).toContain(fact);
      expect(c.medium, code).toContain(fact);
      expect(`${c.long}${c.medium}`, code).not.toContain('…');
    }
  });

  it('cierres y títulos con su puntuación (abreviatura final, coma final, «¡» en minúscula, cierre repetido)', () => {
    const d = 'Atención de lunes a viernes de 8 a.m. a 4 p.m.';
    const dest = make('FAB', {}, 'boss', { kind: 'destination', text: d });
    expect(dest.long).toMatch(/👉 Atención de lunes a viernes de 8 a\.m\. a 4 p\.m\.$/);
    expect(dest.short).toContain(`👉 ${d} #`);
    const comma = make('FAB', { title: 'Entrega de la cancha techada,', keyFacts: '' }, 'boss', { kind: 'brand', text: 'Seguimos trabajando,' });
    expect(comma.short).toContain('Seguimos trabajando #');
    for (const text of all(comma)) expect(text).not.toContain('techada, en');
    for (const text of all(make('FAB', { title: '¡entrega de la cancha techada!', keyFacts: '' }))) expect(text.startsWith('¡Entrega de la cancha techada!'), text).toBe(true);
    const twice = make('FAB', { achievements: 'Vías nuevas para el transporte público. Seguimos trabajando.' }, 'boss', { kind: 'brand', text: 'Seguimos trabajando' });
    for (const text of [twice.long, twice.medium]) expect(text.split('Seguimos trabajando').length - 1, text).toBe(1);
  });

  it('cita: sin cifras de otro alfabeto («¾») y con «¡…!» en orden', () => {
    expect(quoteOf(make('CITA', { speech: 'Ya llevamos ¾ partes de la obra lista para los muchachos.' }).long)).toBe('');
    expect(quoteOf(make('CITA', { speech: 'Esto es grande! dijo la gente, ¡y lo es de verdad.' }).long)).toBe('');
  });

  it('inventedNumbers: signo, fracciones, cifras dentro de correos o m2 de la ficha, «1 200»', () => {
    const set = (long: string) => ({ long, medium: '', short: '' });
    expect(inventedNumbers(set('Llevamos ¾ de la obra.'), { ...input, achievements: '' })).toEqual(['3', '4']);
    expect(inventedNumbers(set('Bajó -15% el tiempo.'), { ...input, keyFacts: '15% más rápido' })).toEqual(['-15']);
    expect(inventedNumbers(set('Son 2 canchas.'), { ...input, keyFacts: '600 m2' })).toEqual(['2']);
    expect(inventedNumbers(set('Terminamos en 2027.'), { ...input, speech: 'Escriban a obras2027@gmail.com' })).toEqual(['2027']);
    expect(inventedNumbers(set('Atendimos a 4.501.La obra sigue.'), input)).toEqual(['4.501']);
    expect(inventedNumbers(set('Son 1.200 personas.'), { ...input, keyFacts: '1 200 personas' })).toEqual([]);
    expect(inventedNumbers(set('-15% en el tiempo de viaje.'), { ...input, keyFacts: '-15% en el tiempo de viaje (estudio)' })).toEqual([]);
  });

  it('un token larguísimo no bloquea la generación', () => {
    const link = `https://maps.google.com/${'a'.repeat(5000)}`;
    const t = Date.now();
    make('GBA', { workDescription: `Se hizo la obra. Ver ${link}. Luego se pintó la cancha. Y se techó.`, speech: `Gracias. ${link}. Esta cancha es de ustedes.` });
    expect(Date.now() - t).toBeLessThan(1000);
  });
});

describe('publicación espontánea: el día vacío no es hoy', () => {
  const now = DateTime.fromISO('2026-10-24T03:28:00', { zone: 'America/Caracas' });
  it('un día borrado o a medio escribir es un error, nunca se guarda como hoy', () => {
    const empty = checkWhen('', '02:58', now);
    expect(empty.dateError).toBe('Pon el día en que salió.');
    expect(empty.at).toBeNull();
    expect(checkWhen('', '', now).dateError).toBe('Pon el día en que salió.');
  });
  it('hoy sin hora vale (= ahora); otro día pide la hora', () => {
    expect(checkWhen('2026-10-24', '', now)).toMatchObject({ dateError: undefined, timeError: undefined, at: null });
    expect(checkWhen('2026-10-23', '', now).timeError).toBe('Pon la hora: no salió hoy.');
    const ok = checkWhen('2026-10-23', '18:00', now);
    expect(ok.dateError).toBeUndefined();
    expect(ok.at?.toUTC().toISO()).toBe('2026-10-23T22:00:00.000Z');
  });
});

const count = (s: string, ch: string) => s.split(ch).length - 1;
