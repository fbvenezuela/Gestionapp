// Redes por formato, the pure rules (R4, design §4.1, §7.2): the feed numbers (#1 bottom right, #24 top left), the
// labels, the computed states and their chip, what goes out per format, the hold by a disapproved design, the way back
// from «Revisar» (only /redes and its sections) and the texts. The database side is tests/rls/redes-formatos.test.ts.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUOTA,
  DEMO_NOTICE_KEY,
  FEED_COLS,
  FEED_FORMATS,
  FEED_SIZE,
  FORMAT,
  FORMATS,
  NOTICE_KINDS,
  OUTGOING,
  QUOTA_FORMATS,
  READY_CHIP,
  REDES_DEMO_NOTICE,
  STICKERS,
  alreadyIn,
  cellToNumber,
  chipFor,
  deleteMonthText,
  designHold,
  displayState,
  feedChip,
  formatFromSlug,
  monthParam,
  nextMonthLabel,
  numberToCell,
  receptivityLabel,
  safeReturn,
  sectionHref,
  spaceLabel,
  suggestedRole,
  withMonth,
} from '@/lib/domain/redes';
import { looksLikeDateTime } from '@/lib/push/text';
import { phonesIn } from '@/lib/domain/phones';

const M = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const P = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('el feed: el número es el orden de publicación', () => {
  it('24 espacios en 3 columnas: el #1 abajo a la derecha y el #24 arriba a la izquierda', () => {
    expect(FEED_SIZE).toBe(24);
    expect(FEED_COLS).toBe(3);
    expect(cellToNumber(0)).toBe(24); // top left
    expect(cellToNumber(FEED_COLS - 1)).toBe(22); // top right
    expect(cellToNumber(FEED_SIZE - FEED_COLS)).toBe(3); // bottom left
    expect(cellToNumber(FEED_SIZE - 1)).toBe(1); // bottom right
  });

  it('cellToNumber y numberToCell son inversas en los 24', () => {
    for (let cell = 0; cell < FEED_SIZE; cell++) expect(numberToCell(cellToNumber(cell))).toBe(cell);
    expect(new Set(Array.from({ length: FEED_SIZE }, (_, c) => cellToNumber(c)))).toEqual(new Set(Array.from({ length: FEED_SIZE }, (_, i) => i + 1)));
  });

  it('las etiquetas: «Espacio #07», «Ya en Mes 1 · #4», «En Feed · Mes 1 #7»', () => {
    expect(spaceLabel(7)).toBe('Espacio #07');
    expect(spaceLabel(24)).toBe('Espacio #24');
    expect(alreadyIn('Mes 1', 4)).toBe('Ya en Mes 1 · #4');
    expect(feedChip('Mes 1', 7)).toBe('En Feed · Mes 1 #7');
  });

  it('van posts, reels y carruseles; Fin de mes no tiene cupo', () => {
    expect([...FEED_FORMATS].sort()).toEqual(['carousel', 'post', 'reel']);
    expect(QUOTA_FORMATS).not.toContain('month_end');
    expect(DEFAULT_QUOTA).toEqual({ reel: 12, post: 8, carousel: 4, story: 30, youtube: 4 });
  });
});

describe('los formatos', () => {
  it('cada formato con su sección, y la dirección lleva al formato (o a ninguno)', () => {
    expect(FORMATS.map((f) => FORMAT[f].slug)).toEqual(['reels', 'posts', 'carruseles', 'historias', 'youtube', 'fin-de-mes']);
    expect(FORMATS.map((f) => FORMAT[f].plural)).toEqual(['Reels', 'Posts', 'Carruseles', 'Historias', 'YouTube', 'Fin de mes']);
    for (const f of FORMATS) expect(formatFromSlug(FORMAT[f].slug)).toBe(f);
    for (const bad of ['feed', 'buscar', 'reel', 'Reels', '', '../ajustes']) expect(formatFromSlug(bad), bad).toBeNull();
  });

  it('las historias entran en verde; el resto en amarillo (A10)', () => {
    for (const f of FORMATS) expect(FORMAT[f].defaultLevel, f).toBe(f === 'story' ? 'verde' : 'amarillo');
    expect(FORMAT.youtube.ratio).toBe('16:9');
    expect(FORMAT.post.ratio).toBe('4:5');
    expect(FORMAT.reel.ratio).toBe('9:16');
  });

  it('las claves de stickers y avisos son las de la base', () => {
    expect(Object.keys(STICKERS)).toEqual(['poll', 'quiz', 'question', 'slider', 'repost', 'tip', 'countdown', 'link', 'behind_scenes', 'other']);
    expect(Object.keys(NOTICE_KINDS)).toEqual(['written_consent', 'verify_source', 'refer_professional', 'testimonial', 'other']);
  });
});

describe('los estados se calculan (D-62)', () => {
  const pub = (status: string) => ({ status });
  const cases: [string, { status: string; pubs: { status: string }[] }, ReturnType<typeof displayState>][] = [
    ['borrador', { status: 'draft', pubs: [] }, { state: 'draft', ready: false, changes: false }],
    ['con cambios pedidos', { status: 'changes_requested', pubs: [] }, { state: 'draft', ready: false, changes: true }],
    ['esperando al jefe', { status: 'in_review', pubs: [] }, { state: 'in_review', ready: false, changes: false }],
    ['aprobada sin publicar', { status: 'approved', pubs: [] }, { state: 'in_review', ready: true, changes: false }],
    ['aprobada con una borrador de publicación', { status: 'approved', pubs: [pub('draft')] }, { state: 'in_review', ready: true, changes: false }],
    ['aprobada y programada', { status: 'approved', pubs: [pub('scheduled')] }, { state: 'scheduled', ready: true, changes: false }],
    ['publicada', { status: 'approved', pubs: [pub('scheduled'), pub('published')] }, { state: 'published', ready: true, changes: false }],
    ['publicada y después en revisión otra vez', { status: 'in_review', pubs: [pub('published')] }, { state: 'published', ready: false, changes: false }],
  ];
  for (const [name, input, want] of cases) it(name, () => expect(displayState(input)).toEqual(want));

  it('una programada que no está aprobada no dice «Programado»', () => {
    expect(displayState({ status: 'in_review', pubs: [pub('scheduled')] }).state).toBe('in_review');
  });

  it('el chip: «En revisión · ✓ Lista» en tono ok para una aprobada; «Publicado» verde; cambios pedidos en ámbar', () => {
    expect(chipFor(displayState({ status: 'approved', pubs: [] }))).toEqual({ label: READY_CHIP, tone: 'ok' });
    expect(READY_CHIP).toBe('En revisión · ✓ Lista');
    expect(chipFor(displayState({ status: 'in_review', pubs: [] }))).toEqual({ label: 'En revisión', tone: 'info' });
    expect(chipFor(displayState({ status: 'approved', pubs: [pub('scheduled')] }))).toEqual({ label: 'Programado', tone: 'info' });
    expect(chipFor(displayState({ status: 'approved', pubs: [pub('published')] }))).toEqual({ label: 'Publicado', tone: 'ok' });
    expect(chipFor(displayState({ status: 'draft', pubs: [] }))).toEqual({ label: 'Borrador', tone: 'neutral' });
    expect(chipFor(displayState({ status: 'changes_requested', pubs: [] }))).toEqual({ label: 'Borrador', tone: 'warn' });
  });
});

describe('lo que sale (D-61)', () => {
  it('historia: el archivo, el texto en pantalla y el sticker; reel y YouTube: el título; nadie lo de planificación', () => {
    expect(OUTGOING.story).toEqual(expect.arrayContaining(['on_screen', 'sticker', 'media']));
    expect(OUTGOING.story).not.toContain('copies');
    expect(OUTGOING.reel).toContain('title');
    expect(OUTGOING.youtube).toContain('title');
    for (const f of ['post', 'carousel', 'month_end'] as const) expect(OUTGOING[f], f).not.toContain('title');
    expect(OUTGOING.carousel).toContain('slides');
    expect(OUTGOING.month_end).toContain('slides');
    for (const f of FORMATS) if (f !== 'story') expect(OUTGOING[f], f).toContain('copies');
  });
});

describe('el diseño desaprobado después de aprobar retiene la publicación (D-64)', () => {
  const approvedAt = '2026-10-20T15:00:00Z';
  it('desaprobado después de la aprobación: retenida', () => {
    expect(designHold({ designStatus: 'disapproved', designAt: '2026-10-20T16:00:00Z', approvedAt })).toBe(true);
  });
  it('desaprobado antes de la última aprobación: el jefe la volvió a ver, sale', () => {
    expect(designHold({ designStatus: 'disapproved', designAt: '2026-10-20T14:00:00Z', approvedAt })).toBe(false);
  });
  it('sin aprobación, una desaprobación retiene (la base dice lo mismo)', () => {
    expect(designHold({ designStatus: 'disapproved', designAt: '2026-10-20T14:00:00Z', approvedAt: null })).toBe(true);
  });
  it('aprobado o sin marca: nada que retener', () => {
    expect(designHold({ designStatus: 'approved', designAt: '2026-10-20T16:00:00Z', approvedAt })).toBe(false);
    expect(designHold({ designStatus: null, designAt: null, approvedAt })).toBe(false);
    expect(designHold({ designStatus: 'disapproved', designAt: null, approvedAt })).toBe(false);
  });
  it('acepta las fechas del driver (Date)', () => {
    expect(designHold({ designStatus: 'disapproved', designAt: new Date('2026-10-21T00:00:00Z'), approvedAt: new Date(approvedAt) })).toBe(true);
  });
});

describe('direcciones con el mes abierto (F2, F5)', () => {
  it('sectionHref lleva ?mes= y #pieza-', () => {
    expect(sectionHref('posts', M, P)).toBe(`/redes/posts?mes=${M}#pieza-${P}`);
    expect(sectionHref('reels', M)).toBe(`/redes/reels?mes=${M}`);
    expect(sectionHref('reels', null)).toBe('/redes/reels');
    expect(sectionHref('reels', null, P)).toBe(`/redes/reels#pieza-${P}`);
    expect(withMonth('/redes/feed', M)).toBe(`/redes/feed?mes=${M}`);
    expect(withMonth('/redes', null)).toBe('/redes');
  });

  it('el mes de la dirección solo si es un id', () => {
    expect(monthParam(M)).toBe(M);
    expect(monthParam(M.toUpperCase())).toBe(M);
    for (const bad of ['x', '', `${M}&a=1`, ['a'], undefined, null]) expect(monthParam(bad), String(bad)).toBeNull();
  });

  it('safeReturn acepta solo /redes y sus secciones, con ?mes=<uuid> y #pieza-<uuid>', () => {
    for (const ok of [`/redes/posts?mes=${M}#pieza-${P}`, '/redes', `/redes?mes=${M}`, `/redes/fin-de-mes?mes=${M}`, `/redes/reels#pieza-${P}`]) {
      expect(safeReturn(ok), ok).toBe(ok);
    }
    for (const bad of [
      '//x.org',
      'https://example.org/redes',
      '/aprobar',
      '/redes/../ajustes',
      '/redes/posts/../../ajustes',
      'javascript:alert(1)',
      '/redes/feed?mes=x',
      `/redes/posts?mes=${M}&otra=1`,
      '/redes/otra',
      `/redes/posts?mes=${M}#pieza-x`,
      ' /redes',
      '',
      null,
      undefined,
    ]) {
      expect(safeReturn(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });
});

describe('textos', () => {
  it('papel sugerido de cada lámina: portada, desarrollo, resumen (con 4 o más) y CTA', () => {
    expect([0, 1, 2, 3, 4].map((i) => suggestedRole(i, 5))).toEqual(['cover', 'body', 'body', 'summary', 'cta']);
    expect([0, 1, 2, 3].map((i) => suggestedRole(i, 4))).toEqual(['cover', 'body', 'summary', 'cta']);
    expect([0, 1, 2].map((i) => suggestedRole(i, 3))).toEqual(['cover', 'body', 'cta']);
    expect([0, 1].map((i) => suggestedRole(i, 2))).toEqual(['cover', 'cta']);
    expect(suggestedRole(0, 1)).toBe('cover');
  });

  it('receptividad: alta, media, baja o sin evaluar (nunca 0)', () => {
    expect(receptivityLabel(10)).toBe('Alta receptividad');
    expect(receptivityLabel(8)).toBe('Alta receptividad');
    expect(receptivityLabel(7)).toBe('Receptividad media');
    expect(receptivityLabel(5)).toBe('Receptividad media');
    expect(receptivityLabel(4)).toBe('Baja receptividad');
    expect(receptivityLabel(1)).toBe('Baja receptividad');
    expect(receptivityLabel(null)).toBe('Sin evaluar');
  });

  it('el mes nuevo y la pregunta de borrar un mes dicen qué pasa con sus piezas', () => {
    expect(nextMonthLabel(3)).toBe('Mes 4');
    expect(nextMonthLabel(0)).toBe('Mes 1');
    expect(deleteMonthText('Mes 2', 5, 3, 'Mes 1')).toBe('¿Borrar «Mes 2»? Tiene 5 piezas (3 en el feed). No se borra ninguna: pasan a «Mes 1» y las del feed quedan «Sin programar».');
    expect(deleteMonthText('Mes 2', 2, 0, 'Mes 1')).toBe('¿Borrar «Mes 2»? Tiene 2 piezas. No se borra ninguna: pasan a «Mes 1».');
    expect(deleteMonthText('Mes 2', 3, 1, 'Mes 1')).toBe('¿Borrar «Mes 2»? Tiene 3 piezas (1 en el feed). No se borra ninguna: pasan a «Mes 1» y la del feed queda «Sin programar».');
    expect(deleteMonthText('Mes 2', 1, 1, 'Mes 1')).toBe('¿Borrar «Mes 2»? Tiene 1 pieza (en el feed). No se borra: pasa a «Mes 1» y queda «Sin programar».');
    expect(deleteMonthText('Mes 3', 0, 0, 'Mes 1')).toBe('¿Borrar «Mes 3»? No tiene piezas.');
  });

  it('el aviso de la demo, una vez por persona, sin fecha, hora ni teléfono', () => {
    expect(DEMO_NOTICE_KEY('u-1')).toBe('fb:redes:demo-notice:u-1');
    expect(looksLikeDateTime(REDES_DEMO_NOTICE)).toBe(false);
    expect(phonesIn(REDES_DEMO_NOTICE)).toEqual([]);
  });
});
