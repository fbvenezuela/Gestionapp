// The cards of Redes (R4, WP-C1, D-61 to D-70), rendered on the server as the section page does: the same header in the
// six formats (the thumbnail outside what folds, the day without an hour, the chips), what each role sees («Eliminar»
// only the boss), «Ya lo publiqué» off without the approval and with the design held, «Enviar a aprobación» with what is
// missing, what goes out read-only on an approved piece behind «Editar (vuelve al jefe)», the boss's disapproval
// read-only for Redes, the ten stars in two rows of five on the phone, and every tutorial anchor once. Invented data.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/redes/posts' }));
vi.mock('@/lib/actions/redes', () => ({
  saveDetails: vi.fn(), saveShots: vi.fn(), saveSlideTexts: vi.fn(), saveTitle: vi.fn(), shotsFromStoryboard: vi.fn(), setPillar: vi.fn(), setRating: vi.fn(),
  setDesign: vi.fn(), addNotice: vi.fn(), resolveNotice: vi.fn(), movePieceToMonth: vi.fn(), reorderPiece: vi.fn(), duplicatePiece: vi.fn(), removePiece: vi.fn(),
  quickCreate: vi.fn(), chooseMonth: vi.fn(), createMonth: vi.fn(), renameMonth: vi.fn(), deleteMonth: vi.fn(),
}));
vi.mock('@/lib/actions/pieces', () => ({ saveCopy: vi.fn(), sendToReview: vi.fn(), addVersion: vi.fn(), setSlides: vi.fn(), reviewPiece: vi.fn() }));
vi.mock('@/lib/actions/publications', () => ({ markPublishedNow: vi.fn() }));

const { PieceCard } = await import('@/components/redes/card/piece-card');
const { reviewHref } = await import('@/components/redes/card/review-row');
const core = await import('@/components/redes/card/card-core');
const { DESIGN_HELD, NO_APPROVAL, FORMATS, FORMAT } = await import('@/lib/domain/redes');
import type { CardData } from '@/lib/data/redes';
import type { SectionCtx } from '@/components/redes/card/card-core';
import type { Format } from '@/lib/domain/redes';

const M1 = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const M2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ID = '11111111-2222-4333-8444-555555555555';
const THUMB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function card(over: Partial<CardData> = {}): CardData {
  return {
    id: ID, format: 'post', title: 'Tips para cuidar el agua (prueba)', status: 'draft', displayState: 'draft', ready: false, changes: false,
    chip: { label: 'Borrador', tone: 'neutral' }, reviewLevel: 'amarillo', revision: 3, approvedVersion: null, createdDay: '26 oct 2026',
    pillar: 'servicios', sortOrder: 0, rating: null, design: { status: null, note: '', by: null, byBoss: false, at: null }, designHold: false,
    monthId: M1, event: null,
    details: {
      rev: 2, art_overline: 'Tips', art_headline: 'Cuida el agua', art_seals: '', art_fine_print: '', visual_concept: '', hook: '', cta: 'Comparte',
      hashtags: '#Tachira', publication_notes: '', sticker: null, sticker_text: '', sticker_url: '', on_screen: '', follow_up: '', idea: '', links: '',
      post_ratio: '4:5', reference_asset_id: null, shots: [], slides: [],
    },
    version: { n: 1, mediaId: THUMB, mediaMime: 'image/jpeg', w: 1080, h: 1350, coverId: null, slideIds: [], slideDims: [] },
    thumbIds: [THUMB], copies: { long: '¡Saludos, Táchira! Copy de prueba.', medium: '', short: '' }, notices: [], pubs: [], feed: null,
    blockers: [], warnings: [],
    ...over,
  };
}

const ctx = (over: Partial<SectionCtx> = {}): SectionCtx => ({
  format: 'post', monthId: M1, monthLabel: 'Mes 1',
  months: [{ id: M1, label: 'Mes 1', ordinal: 1 }, { id: M2, label: 'Mes 2', ordinal: 2 }],
  pillars: [{ key: 'servicios', name: 'Servicios públicos', tone: 'info' }],
  perms: { boss: false, admin: false, mark: true }, demo: false, userId: 'u-redes', manualOrder: true,
  ...over,
});
const REDES = ctx();
const BOSS = ctx({ perms: { boss: true, admin: false, mark: true } });
const ADMIN = ctx({ perms: { boss: false, admin: true, mark: false } });

const render = (c: CardData, x: SectionCtx = REDES, first = true) =>
  renderToStaticMarkup(
    createElement(PieceCard, { card: c, ctx: { ...x, format: c.format }, first, target: false, canUp: true, canDown: true, announce: () => {}, onGone: () => {}, onDuplicated: () => {} }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const button = (html: string, name: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${name}`, 's').exec(html)?.[0] ?? '';
// The attribute itself (class names say «disabled:opacity-50» too).
const OFF = /\sdisabled=""/;
const TIME = /\b\d{1,2}:\d{2}\b|\b[ap]\.\s?m\./i;

const FEED_CHIP: Record<Format, string> = { reel: 'Reel #7', post: 'Post #7', carousel: 'Carrusel #7', story: 'Historia', youtube: 'Video de YouTube', month_end: 'Pieza de fin de mes' };

describe('la cabecera, igual en los seis formatos', () => {
  for (const f of FORMATS) {
    it(`${FORMAT[f].plural}: miniatura fuera de lo que se pliega, número, estado, día sin hora, pilar y «En Feed»`, () => {
      const placed = f === 'reel' || f === 'post' || f === 'carousel';
      const html = render(card({ format: f, feed: placed ? { monthId: M1, month: 'Mes 1', num: 7 } : null }), { ...REDES, format: f });
      const body = html.indexOf(`id="pieza-${ID}-body"`);
      expect(body).toBeGreaterThan(0);
      // The thumbnail is in the header, before the body that folds.
      expect(html.indexOf(`/api/media/${THUMB}/thumb`)).toBeGreaterThan(0);
      expect(html.indexOf(`/api/media/${THUMB}/thumb`)).toBeLessThan(body);
      const head = text(html.slice(0, body));
      expect(head).toContain(FEED_CHIP[f]);
      expect(head).toContain('Borrador');
      expect(head).toContain('Creada el 26 oct 2026');
      expect(head).toContain('Servicios públicos');
      expect(head).not.toMatch(TIME);
      if (placed) {
        expect(html).toContain(`href="/redes/feed?mes=${M1}#espacio-7"`);
        expect(head).toContain('En Feed · Mes 1 #7');
      }
      // The article is named by the title and reached by #pieza-<id>.
      expect(html).toMatch(new RegExp(`<article id="pieza-${ID}" aria-labelledby="pieza-${ID}-title"`));
      expect(html).toContain('aria-label="Plegar"');
      expect(html).toContain('aria-expanded="true"');
    });
  }

  it('sin espacio en el feed: «Post · Sin programar»; y sin mes ni hora en ningún lado', () => {
    const t = text(render(card()));
    expect(t).toContain('Post · Sin programar');
    expect(t).not.toMatch(TIME);
  });

  it('en el teléfono empiezan plegadas, menos la primera (el tutorial siempre la encuentra)', () => {
    const first = render(card(), REDES, true);
    const other = render(card(), REDES, false);
    expect(first).not.toContain('max-[599px]:hidden');
    expect(other).toMatch(new RegExp(`id="pieza-${ID}-body"[^>]*max-\\[599px\\]:hidden`));
  });
});

describe('quién ve qué', () => {
  it('«Eliminar» solo el jefe; Redes y administración no', () => {
    expect(text(render(card(), BOSS))).toContain('Eliminar');
    expect(text(render(card(), REDES))).not.toContain('Eliminar');
    expect(text(render(card(), ADMIN))).not.toContain('Eliminar');
  });

  it('el menú: abrir la pieza, duplicar, subir, bajar y mover a otro mes', () => {
    const html = render(card());
    expect(html).toContain(`href="/piezas/${ID}"`);
    for (const label of ['Abrir la pieza', 'Duplicar', 'Subir', 'Bajar', 'Mover a otro mes']) expect(text(html)).toContain(label);
    // With one month only, there is nowhere to move it.
    expect(text(render(card(), { ...REDES, months: [{ id: M1, label: 'Mes 1', ordinal: 1 }] }))).not.toContain('Mover a otro mes');
  });

  it('administración no marca el diseño ni pone estrellas ni avisos', () => {
    const html = render(card(), ADMIN);
    expect(button(html, 'Diseño aprobado')).toMatch(OFF);
    expect(html).not.toContain('Agregar aviso');
    expect(html.match(/role="radio"[^>]*disabled/g)?.length).toBe(10);
  });
});

describe('la fila de revisión', () => {
  it('borrador: «Enviar a aprobación» apagado con lo que falta, y «Generar copies» a la pieza', () => {
    const html = render(card({ blockers: ['Sube la imagen 4:5.', 'Falta el copy largo.'] }));
    expect(button(html, 'Enviar a aprobación')).toMatch(OFF);
    const t = text(html);
    expect(t).toContain('Falta para enviarla: Sube la imagen 4:5. Falta el copy largo.');
    expect(html).toContain(`href="/piezas/${ID}#copies"`);
    expect(button(render(card()), 'Enviar a aprobación')).not.toMatch(OFF);
  });

  it('cambios pedidos: lo dice y deja enviarla de nuevo', () => {
    const t = text(render(card({ status: 'changes_requested', changes: true, chip: { label: 'Borrador', tone: 'warn' } })));
    expect(t).toContain('Pidieron cambios');
    expect(t).toContain('Enviar a aprobación');
  });

  it('en revisión: el jefe «Revisar» con la vuelta a esta tarjeta; Redes «Espera al jefe»', () => {
    const c = card({ status: 'in_review', displayState: 'in_review', chip: { label: 'En revisión', tone: 'info' } });
    const boss = render(c, BOSS);
    const href = reviewHref(ID, 'posts', M1);
    expect(href).toBe(`/aprobar/${ID}?volver=${encodeURIComponent(`/redes/posts?mes=${M1}#pieza-${ID}`)}`);
    expect(boss).toContain(`href="${href.replace(/&/g, '&amp;')}"`);
    expect(text(boss)).toContain('Revisar');
    expect(text(render(c, REDES))).toContain('Espera al jefe');
    expect(text(render(c, REDES))).not.toContain('Revisar');
  });

  it('«Ya lo publiqué» apagado sin la aprobación y con el diseño desaprobado después de aprobar; si no, encendido', () => {
    const draft = render(card());
    expect(button(draft, 'Ya lo publiqué')).toMatch(OFF);
    expect(text(draft)).toContain(`${NO_APPROVAL}.`);
    const approved = card({ status: 'approved', displayState: 'in_review', ready: true, chip: { label: 'En revisión · ✓ Lista', tone: 'ok' }, approvedVersion: 1 });
    const held = render({ ...approved, designHold: true, design: { status: 'disapproved', note: 'La foto está oscura.', by: 'Jefe', byBoss: true, at: '2026-10-20T10:00:00.000Z' } });
    expect(button(held, 'Ya lo publiqué')).toMatch(OFF);
    expect(text(held)).toContain(`${DESIGN_HELD}.`);
    const ok = render(approved);
    expect(button(ok, 'Ya lo publiqué')).not.toMatch(OFF);
    expect(text(ok)).toContain('Revisado y listo para publicar');
    expect(text(ok)).toContain('En revisión · ✓ Lista');
  });

  it('publicada: la tarjeta en verde con sus links, sin «Ya lo publiqué»', () => {
    const html = render(card({
      status: 'approved', displayState: 'published', ready: true, chip: { label: 'Publicado', tone: 'ok' },
      pubs: [{ id: 'p1', network: 'instagram', status: 'published', url: 'https://example.org/demo/post', evidenceId: null }],
    }));
    expect(html).toContain('ring-ok');
    expect(html).toContain('href="https://example.org/demo/post"');
    expect(text(html)).toContain('Publicado');
    expect(text(html)).not.toContain('Ya lo publiqué');
  });
});

describe('lo que sale, en lectura en una aprobada (F7)', () => {
  const approved = (f: Format, over: Partial<CardData> = {}) =>
    card({ format: f, status: 'approved', displayState: 'in_review', ready: true, chip: { label: 'En revisión · ✓ Lista', tone: 'ok' }, approvedVersion: 1, ...over });

  it('post: el caption en lectura con «Editar (vuelve al jefe)»; el texto del arte sigue libre', () => {
    const html = render(approved('post'));
    expect(text(html)).toContain(core.LOCK_BUTTON);
    expect(html).not.toContain(`id="pieza-${ID}-copy-long"`);
    expect(text(html)).toContain('¡Saludos, Táchira! Copy de prueba.');
    expect(html).toContain(`id="pieza-${ID}-art_headline"`);
    // The title of a post does not go out: it stays editable.
    expect(html).not.toMatch(/aria-label="Título"[^>]*readOnly/i);
    // A draft: everything open.
    const draft = render(card());
    expect(draft).toContain(`id="pieza-${ID}-copy-long"`);
    expect(text(draft)).not.toContain(core.LOCK_BUTTON);
  });

  it('reel y YouTube: el título (sale como título del Short / con el video) en lectura', () => {
    for (const [f, label] of [['reel', 'Título (sale como título del Short)'], ['youtube', 'Título (sale con el video)']] as const) {
      const html = render(approved(f), { ...REDES, format: f });
      expect(text(html)).toContain(label);
      expect(html).toMatch(/<input[^>]*aria-label="Título"[^>]*readOnly=""/);
      expect(text(html)).toContain(core.LOCK_BUTTON);
    }
  });

  it('historia: el texto en pantalla y el sticker en lectura; la idea original libre', () => {
    const html = render(approved('story', { details: { ...card().details, on_screen: 'Vota aquí', sticker: 'poll', sticker_text: '¿Qué obra quieres ver?' } }), { ...REDES, format: 'story' });
    const t = text(html);
    expect(t).toContain('Texto en pantalla');
    expect(t).toContain('Vota aquí');
    expect(t).toContain('Formato del sticker: Encuesta');
    expect(html).not.toContain(`id="pieza-${ID}-on_screen"`);
    expect(html).not.toContain(`id="pieza-${ID}-sticker_text"`);
    expect(html).toContain(`id="pieza-${ID}-idea"`);
    // In the order of the reference: «Idea original» first.
    expect(t.indexOf('Idea original')).toBeLessThan(t.indexOf('Texto en pantalla'));
  });
});

describe('diseño, receptividad y avisos', () => {
  const bossBad = card({ design: { status: 'disapproved', note: 'El titular se lee pequeño.', by: 'Jefe de prueba', byBoss: true, at: '2026-10-20T10:00:00.000Z' } });

  it('la desaprobación del jefe: Redes la lee («Desaprobó: el jefe») y no la cambia; el jefe sí', () => {
    const redes = render(bossBad, REDES);
    expect(text(redes)).toMatch(/Desaprobó: el jefe/);
    expect(text(redes)).toContain('El titular se lee pequeño.');
    expect(button(redes, 'Diseño desaprobado')).toMatch(OFF);
    expect(button(redes, 'Diseño desaprobado')).toContain('aria-pressed="true"');
    expect(text(redes)).toContain('solo él la quita');
    const boss = render(bossBad, BOSS);
    expect(button(boss, 'Diseño desaprobado')).not.toMatch(OFF);
    expect(boss).toContain(`id="pieza-${ID}-design-note"`);
  });

  it('diez estrellas como un grupo de radios de 44 px, en dos filas de cinco debajo de 600 px', () => {
    const html = render(card({ rating: 7 }));
    expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*grid-cols-5[^"]*min-\[600px\]:grid-cols-10/);
    const radios = html.match(/role="radio"[^>]*/g) ?? [];
    expect(radios.length).toBe(10);
    expect(radios.every((r) => /h-11 w-11/.test(r))).toBe(true);
    expect(html).toContain('aria-label="7 de 10"');
    expect(html.match(/aria-checked="true"/g)?.length).toBe(1);
    expect(text(html)).toContain('Receptividad del público (1 a 10)');
    expect(text(html)).toContain('7/10 · Receptividad media');
    // Not on stories, YouTube or Fin de mes.
    for (const f of ['story', 'youtube', 'month_end'] as const) expect(render(card({ format: f }), { ...REDES, format: f })).not.toContain('role="radiogroup"');
  });

  it('la banda «Antes de publicar:» con sus avisos y «Resuelto»', () => {
    const html = render(card({ notices: [{ id: 'n1', kind: 'testimonial', body: 'Falta la autorización escrita (prueba).', by: 'Redes', at: '2026-10-20T10:00:00.000Z' }] }));
    const t = text(html);
    expect(t).toContain('Antes de publicar:');
    expect(t).toContain('Tono de testimonio: Falta la autorización escrita (prueba).');
    expect(t).toContain('Resuelto');
    expect(html).toContain('bg-warn-soft');
  });
});

describe('las anclas de los tutoriales salen una sola vez en la sección', () => {
  it('piece-card, card-checks, design-checks, rating y notice-band: solo en la primera tarjeta', () => {
    const html = [true, false, false].map((first, i) => render(card({ id: `${ID.slice(0, -1)}${i}` }), REDES, first)).join('');
    for (const a of ['piece-card', 'card-checks', 'design-checks', 'rating', 'notice-band']) {
      expect(html.match(new RegExp(`data-tour="${a}"`, 'g'))?.length, a).toBe(1);
    }
  });
});

describe('textos de las tarjetas', () => {
  it('el número del feed, la vuelta del chip y «Poner en el copy»', () => {
    expect(core.numberChip('reel', { num: 3 })).toBe('Reel #3');
    expect(core.numberChip('carousel', null)).toBe('Carrusel · Sin programar');
    expect(core.numberChip('story', null)).toBe('Historia');
    expect(core.feedCellHref(M1, 12)).toBe(`/redes/feed?mes=${M1}#espacio-12`);
    expect(core.withCtaAndHashtags('Copy.', 'Comparte', '#Tachira')).toBe('Copy.\n\nComparte\n\n#Tachira');
    expect(core.withCtaAndHashtags('Copy.\n\nComparte', 'Comparte', '')).toBe('Copy.\n\nComparte');
  });

  it('los límites del copy son los de los copies (sin cargar twitter-text en la tarjeta)', async () => {
    const { LIMITS, copyLength } = await import('@/lib/domain/copies');
    expect(core.COPY_LIMITS).toEqual(LIMITS);
    expect(core.plainLength('¡Saludos, Táchira! 👋')).toBe(copyLength('long', '¡Saludos, Táchira! 👋'));
  });

  it('tiempos relativos, nunca una hora', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(core.agoText('2026-10-29T11:55:00Z', now)).toBe('hace 5 min');
    expect(core.agoText('2026-10-29T10:00:00Z', now)).toBe('hace 2 h');
    expect(core.agoText('2026-10-26T12:00:00Z', now)).toBe('hace 3 días');
    expect(core.agoText(null, now)).toBe('');
  });

  it('qué se bloquea en una aprobada: solo lo que sale', () => {
    expect(core.isLocked('approved', 'reel', 'title')).toBe(true);
    expect(core.isLocked('approved', 'post', 'title')).toBe(false);
    expect(core.isLocked('approved', 'story', 'on_screen')).toBe(true);
    expect(core.isLocked('in_review', 'story', 'on_screen')).toBe(false);
  });

  it('láminas: rellenar, mover y su papel sugerido', () => {
    expect(core.padImages(['a'], 3)).toEqual(['a', null, null]);
    expect(core.padTexts([], 2).map((t) => t.role)).toEqual(['cover', 'cta']);
    expect(core.moveSlide(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(core.moveSlide(['a', 'b'], 0, -1)).toBeNull();
    expect([0, 1, 2, 3].map((i) => core.roleLabel(i, 4))).toEqual(['Portada', 'Desarrollo', 'Resumen', 'CTA']);
  });
});
