import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CardData } from '@/lib/data/redes';
import type { SectionCtx } from '@/components/redes/card/card-core';
import { QUICK_REASONS, hasReason, toggleReason } from '@/lib/domain/review-reasons';
import { copyPreview, type SpecRow } from '@/lib/domain/copy-preview';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { homeFor } from '@/lib/roles';

// The review room, the piece in big, «Nueva pieza» and Cupo y pilares (R4, WP-C2) render on the server with their
// actions stubbed: nothing here calls a server.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/piezas/x' }));
vi.mock('@/lib/actions/redes', () => ({
  saveDetails: vi.fn(), saveShots: vi.fn(), saveSlideTexts: vi.fn(), saveTitle: vi.fn(), shotsFromStoryboard: vi.fn(), setPillar: vi.fn(), setRating: vi.fn(),
  setDesign: vi.fn(), addNotice: vi.fn(), resolveNotice: vi.fn(), movePieceToMonth: vi.fn(), reorderPiece: vi.fn(), duplicatePiece: vi.fn(), removePiece: vi.fn(),
  restorePiece: vi.fn(), quickCreate: vi.fn(), chooseMonth: vi.fn(),
}));
vi.mock('@/lib/actions/pieces', () => ({
  saveCopy: vi.fn(), sendToReview: vi.fn(), addVersion: vi.fn(), setSlides: vi.fn(), reviewPiece: vi.fn(), addComment: vi.fn(), requestVoiceLine: vi.fn(),
  setReviewLevel: vi.fn(), attachVoiceLine: vi.fn(), createPiece: vi.fn(), generateCopies: vi.fn(),
}));
vi.mock('@/lib/actions/publications', () => ({ markPublishedNow: vi.fn() }));
vi.mock('@/lib/actions/settings', () => ({ saveSetting: vi.fn() }));
vi.mock('@/components/media/uploader', () => ({ Uploader: ({ label }: { label: string }) => createElement('span', null, label) }));
vi.mock('@/components/media/drive-picker', () => ({ DrivePicker: () => null }));

describe('pedir cambios: motivos rápidos', () => {
  it('están los siete motivos pedidos', () => {
    expect([...QUICK_REASONS]).toEqual(['Muy largo', 'Falta la fuente de una cifra', 'Revisar ortografía', 'Cambiar la portada', 'Subtítulos', 'Se oye bajo', 'Dice fecha u hora']);
  });

  it('un toque agrega la frase al comentario y otro la quita', () => {
    let c = toggleReason('', 'Muy largo');
    expect(c).toBe('Muy largo.');
    c = toggleReason(c, 'Se oye bajo');
    expect(c).toBe('Muy largo. Se oye bajo.');
    expect(hasReason(c, 'Se oye bajo')).toBe(true);
    c = toggleReason(c, 'Muy largo');
    expect(c).toBe('Se oye bajo.');
    expect(hasReason(c, 'Muy largo')).toBe(false);
    c = toggleReason(c, 'Se oye bajo');
    expect(c).toBe('');
  });

  it('respeta lo que la persona ya escribió', () => {
    expect(toggleReason('El final se corta', 'Subtítulos')).toBe('El final se corta. Subtítulos.');
    expect(toggleReason('¿Esto es así?', 'Subtítulos')).toBe('¿Esto es así? Subtítulos.');
    expect(toggleReason('[0:12] Revisar   ', 'Muy largo')).toBe('[0:12] Revisar. Muy largo.');
    const mid = 'A. Dice fecha u hora. B.';
    expect(toggleReason(mid, 'Dice fecha u hora')).toBe('A. B.');
    expect(toggleReason('Línea uno\nMuy largo.', 'Muy largo')).toBe('Línea uno');
    // A sentence that merely contains the words is not the chip.
    expect(hasReason('No es muy largo.', 'Muy largo')).toBe(false);
  });
});

describe('revisión: cómo saldrá cada copy', () => {
  const specs: SpecRow[] = [
    { network: 'instagram', label: 'Instagram', copy_max_chars: 2200, length_group: 'long' },
    { network: 'facebook', label: 'Facebook', copy_max_chars: 63206, length_group: 'long' },
    { network: 'youtube', label: 'YouTube', copy_max_chars: 5000, length_group: 'long' },
    { network: 'threads', label: 'Threads', copy_max_chars: 500, length_group: 'medium' },
    { network: 'x', label: 'X', copy_max_chars: 280, length_group: 'short' },
  ];

  it('agrupa las redes por largo con su máximo y avisa dónde se pasa', () => {
    const long = 'a'.repeat(2300);
    const p = copyPreview([{ length_group: 'long', body: long }, { length_group: 'short', body: 'Hola' }], specs);
    expect(p.map((g) => g.group)).toEqual(['long', 'medium', 'short']);
    expect(p[0].networks.map((n) => [n.label, n.max, n.over])).toEqual([['Instagram', 2200, 100], ['YouTube', 5000, 0], ['Facebook', 63206, 0]]);
    expect(p[1]).toMatchObject({ body: '', length: 0, networks: [{ label: 'Threads', over: 0 }] });
    expect(p[2]).toMatchObject({ length: 4, networks: [{ label: 'X', max: 280, over: 0 }] });
  });

  it('en X cuenta como X (un enlace pesa 23)', () => {
    const p = copyPreview([{ length_group: 'short', body: `${'b'.repeat(260)} https://example.com/una/ruta/muy/larga/de/verdad` }], specs);
    expect(p[2].length).toBe(260 + 1 + 23);
    expect(p[2].networks[0].over).toBe(4);
  });
});

describe('pantallas que no son del rol', () => {
  it('lleva a cada quien a su inicio con el aviso', () => {
    expect(noPermissionUrl(homeFor(['boss']))).toBe('/jefe?sin-permiso=1');
    expect(noPermissionUrl(homeFor(['camera']))).toBe('/hoy?sin-permiso=1');
    expect(noPermissionUrl(homeFor(['boss', 'admin']))).toBe('/hoy?sin-permiso=1');
    expect(noPermissionUrl('/hoy?x=1')).toBe('/hoy?x=1&sin-permiso=1');
  });
  it('requireRole ya no manda a todos a /hoy y el aviso está montado en el panel', () => {
    const session = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
    expect(session).toContain('redirect(noPermissionUrl(homeFor(s.roles)))');
    expect(session).not.toContain("redirect('/hoy')");
    expect(fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/layout.tsx'), 'utf8')).toContain('<NoPermissionBanner />');
    expect(fs.readFileSync(path.join(process.cwd(), 'src/components/shell/no-permission-banner.tsx'), 'utf8')).toContain('Esa pantalla no es de tu rol.');
  });
});

describe('sin ventanas nativas del navegador', () => {
  it('no quedan confirm() ni alert() en revisión, aprobar y copies', () => {
    for (const f of ['src/app/(panel)/aprobar/[id]/review-room.tsx', 'src/app/(panel)/aprobar/approve-green.tsx', 'src/app/(panel)/piezas/[id]/copies-editor.tsx']) {
      const code = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      // The native ones take a string; useConfirm's confirm takes an options object.
      expect(code, f).not.toMatch(/(^|[^.\w])(window\.)?(confirm|alert)\(\s*['"`]/m);
      if (f.endsWith('copies-editor.tsx')) expect(code, f).toContain('useConfirm()');
    }
  });

  it('«Aprobar todas las verdes» es un solo toque: sin diálogo de confirmación (cambios del 27/10)', () => {
    const code = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/aprobar/approve-green.tsx'), 'utf8');
    expect(code).not.toContain('useConfirm');
    expect(code).toContain('Aprobar todas las verdes (');
  });
});

describe('resultados en el teléfono', () => {
  it('tarjetas bajo 640 px y nunca un enlace a «#»', () => {
    const code = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/resultados/page.tsx'), 'utf8');
    expect(code).toContain('sm:hidden');
    expect(code).toContain('hidden sm:block');
    expect(code).not.toMatch(/['"]#['"]/);
    expect(code).toMatch(/target="_blank" rel="noreferrer"/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// R4, WP-C2: the review room, the piece in big, «Nueva pieza» and Cupo y pilares
// ---------------------------------------------------------------------------------------------------------------
const { FormatView, NoticesBand, afterReview, backLabel, OUT_IN_APP } = await import('@/app/(panel)/aprobar/[id]/format-view');
const { ReviewRoom, NOTICES_READ, STORY_CHECK } = await import('@/app/(panel)/aprobar/[id]/review-room');
const { PieceBig } = await import('@/app/(panel)/piezas/[id]/piece-big');
const { FINAL_FILE, levelOptions } = await import('@/app/(panel)/piezas/[id]/piece-client');
const { NewPieceForm } = await import('@/app/(panel)/piezas/nueva/new-piece-form');
const { ContentSettings, DeletedPieces, pillarKey, pillarsToSave } = await import('@/app/(panel)/ajustes/contenido/content-settings');
const { COPIES_BELOW } = await import('@/components/redes/card/caption-field');
const { FORMATS, FORMAT } = await import('@/lib/domain/redes');

const M1 = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const ID = '11111111-2222-4333-8444-555555555555';
const SLIDE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

function piece(over: Partial<CardData> = {}): CardData {
  return {
    id: ID, format: 'post', title: 'Tips para cuidar el agua (prueba)', status: 'draft', displayState: 'draft', ready: false, changes: false,
    chip: { label: 'Borrador', tone: 'neutral' }, reviewLevel: 'amarillo', revision: 3, approvedVersion: null, createdDay: '26 oct 2026',
    pillar: null, sortOrder: 0, rating: null, design: { status: null, note: '', by: null, byBoss: false, at: null }, designHold: false,
    monthId: M1, event: null,
    details: {
      rev: 1, art_overline: 'Tips', art_headline: 'Cuida el agua', art_seals: '', art_fine_print: 'Datos de la ficha (prueba)', visual_concept: 'Gota sobre fondo claro',
      hook: '', cta: '', hashtags: '', publication_notes: '', sticker: null, sticker_text: '', sticker_url: '', on_screen: '', follow_up: '', idea: '', links: '',
      post_ratio: '4:5', reference_asset_id: null, shots: [], slides: [],
    },
    version: null, thumbIds: [], copies: { long: '', medium: '', short: '' }, notices: [], pubs: [], feed: null, blockers: [], warnings: [],
    ...over,
  };
}

describe('la sala de revisión (R4): vuelve a la tarjeta solo dentro de Redes', () => {
  it('?volver= pasa por safeReturn: una sección de Redes sí; otro sitio u otra pantalla, «Por aprobar»', () => {
    const back = `/redes/posts?mes=${M1}#pieza-${ID}`;
    expect(afterReview(back)).toBe(back);
    expect(afterReview('/redes')).toBe('/redes');
    for (const bad of ['https://example.org', '//example.org', '/ajustes', '/redes/../ajustes', 'javascript:alert(1)', `/aprobar/${ID}`, '', null, undefined]) {
      expect(afterReview(bad), String(bad)).toBe('/aprobar');
    }
    expect(backLabel(back)).toBe('Posts');
    expect(backLabel(`/redes/historias?mes=${M1}`)).toBe('Historias');
    expect(backLabel('/redes')).toBe('Redes');
    expect(backLabel('/aprobar')).toBe('Por aprobar');
  });

  it('la página lee ?volver= con afterReview y la sala va ahí al decidir (nunca a una dirección fija)', () => {
    const page = read('src/app/(panel)/aprobar/[id]/page.tsx');
    expect(page).toContain('const back = afterReview(volver);');
    expect(page).toContain('back={back}');
    const room = read('src/app/(panel)/aprobar/[id]/review-room.tsx');
    expect(room).not.toContain("router.push('/aprobar')");
    expect(room.match(/router\.push\(back\)/g)?.length).toBe(2);
  });
});

describe('la sala de revisión (R4): lo que el jefe aprueba de cada formato', () => {
  it('historia: «Lo que sale en la app» con el texto en pantalla, el sticker, su texto y su enlace', () => {
    const details = { ...piece().details, on_screen: 'Lee el reporte completo', sticker: 'link', sticker_text: 'Lee el reporte', sticker_url: 'https://example.org/demo/reporte', idea: 'Llevar a la gente al reporte.' };
    const t = text(html(createElement(FormatView, { card: piece({ format: 'story', details }) })));
    expect(t).toContain(OUT_IN_APP);
    for (const s of ['Texto en pantalla Lee el reporte completo', 'Formato del sticker Enlace', 'Texto del sticker Lee el reporte', 'Enlace del sticker https://example.org/demo/reporte', 'Idea original Llevar a la gente al reporte.']) {
      expect(t).toContain(s);
    }
  });

  it('historia sin sticker: lo dice, y no inventa texto ni enlace', () => {
    const t = text(html(createElement(FormatView, { card: piece({ format: 'story' }) })));
    expect(t).toContain('Texto en pantalla Vacío');
    expect(t).toContain('Formato del sticker Sin sticker');
    expect(t).not.toContain('Enlace del sticker');
  });

  it('post: el texto del arte con su jerarquía y la proporción; reel: el título que sale y las tomas', () => {
    const post = text(html(createElement(FormatView, { card: piece() })));
    expect(post).toContain('Texto del arte');
    expect(post).toContain('Proporción 4:5');
    expect(post).toContain('Antetítulo Tips');
    expect(post).toContain('Titular Cuida el agua');
    expect(post).toContain('Letra pequeña Datos de la ficha (prueba)');
    expect(post).not.toContain('Sellos');
    const shots = [{ says: 'Así quedó la cancha.', action: 'Toma abierta', on_screen: 'Así quedó' }];
    const reel = text(html(createElement(FormatView, { card: piece({ format: 'reel', details: { ...piece().details, shots } }) })));
    expect(reel).toContain('Título (sale como título del Short) Tips para cuidar el agua (prueba)');
    expect(reel).toContain('Toma 1 Lo que dice Así quedó la cancha. La acción Toma abierta Texto en pantalla Así quedó');
  });

  it('carrusel: las láminas en orden con su papel, y la que no tiene imagen lo dice', () => {
    const c = piece({
      format: 'carousel',
      version: { n: 2, mediaId: SLIDE, mediaMime: 'image/jpeg', w: 1080, h: 1350, coverId: SLIDE, slideIds: [SLIDE, null, SLIDE, SLIDE], slideDims: [] },
      details: { ...piece().details, slides: [{ role: 'cover', title: 'Cómo pedir un operativo', text: '' }, { role: 'body', title: 'Paso 1', text: 'Escribe la solicitud.' }] },
    });
    const h = html(createElement(FormatView, { card: c }));
    const t = text(h);
    expect(t).toContain('Láminas en orden');
    expect(t).toContain('4 láminas');
    expect(t).toMatch(/Lámina 1 · Portada Cómo pedir un operativo.*Lámina 2 · Desarrollo Sin imagen Paso 1 Escribe la solicitud\..*Lámina 3 · Resumen.*Lámina 4 · CTA/);
    expect(h.match(new RegExp(`/api/media/${SLIDE}/thumb`, 'g'))?.length).toBe(3);
  });

  it('los avisos van arriba de «Antes de aprobar» y la casilla «Leí los avisos de cumplimiento» se exige', () => {
    const notices = [{ id: 'n1', kind: 'written_consent', body: 'Falta la autorización escrita (prueba).', by: 'Redes', at: '2026-10-20T12:00:00Z' }];
    const props = { pieceId: ID, revision: 3, canApprove: true, canRequestChanges: true, canAskVoice: false, note: '', media: null, back: '/aprobar' };
    const withNotices = html(createElement(ReviewRoom, { ...props, band: createElement(NoticesBand, { notices }), noticeCount: 1 }));
    const band = withNotices.indexOf('Antes de publicar:');
    const list = withNotices.indexOf('Antes de aprobar');
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(list);
    expect(text(withNotices)).toContain('Necesita autorización escrita: Falta la autorización escrita (prueba). · Redes');
    // Inside the same group as the four checks: «Aprobar» stays off until every box is marked.
    const group = withNotices.slice(withNotices.indexOf('<fieldset'), withNotices.indexOf('</fieldset>'));
    expect(group).toContain(NOTICES_READ);
    expect(group.match(/type="checkbox"/g)?.length).toBe(5);
    expect(text(withNotices)).toContain('Marca la lista para aprobar');
    // Without notices, no band and no fifth box.
    const plain = html(createElement(ReviewRoom, { ...props, band: createElement(NoticesBand, { notices: [] }), noticeCount: 0 }));
    expect(plain).not.toContain('Antes de publicar:');
    expect(plain).not.toContain(NOTICES_READ);
  });

  it('«Antes de aprobar» de una historia revisa el texto en pantalla y el sticker, no copies que no tiene', () => {
    const props = { pieceId: ID, revision: 1, canApprove: true, canRequestChanges: true, canAskVoice: false, note: '', media: null, back: '/aprobar' };
    const story = text(html(createElement(ReviewRoom, { ...props, format: 'story' })));
    expect(story).toContain(STORY_CHECK);
    expect(story).not.toContain('Los tres copies están revisados');
    const post = text(html(createElement(ReviewRoom, { ...props, format: 'post' })));
    expect(post).toContain('Los tres copies están revisados');
    expect(post).not.toContain(STORY_CHECK);
  });

  it('administración ve los avisos aunque no apruebe', () => {
    const notices = [{ id: 'n1', kind: 'verify_source', body: 'Verificar la cifra (prueba).', by: null, at: '2026-10-20T12:00:00Z' }];
    const h = html(createElement(ReviewRoom, {
      pieceId: ID, revision: 1, canApprove: false, canRequestChanges: false, canAskVoice: true, note: 'La aprueba el jefe.', media: null,
      band: createElement(NoticesBand, { notices }), noticeCount: 1,
    }));
    expect(text(h)).toContain('Verificar la fuente y la fecha del dato: Verificar la cifra (prueba).');
    expect(h).not.toContain(NOTICES_READ);
  });
});

describe('la pieza en grande (R4): la misma tarjeta, con los copies abajo y el nivel al enviar', () => {
  const ctx: Omit<SectionCtx, 'page'> = {
    format: 'post', monthId: M1, monthLabel: 'Mes 1', months: [{ id: M1, label: 'Mes 1', ordinal: 1 }], pillars: [],
    perms: { boss: false, admin: false, mark: true }, demo: false, userId: 'u-redes', manualOrder: false,
  };
  const big = (c: CardData) =>
    html(createElement(PieceBig, { card: c, ctx: { ...ctx, format: c.format }, sectionHref: `/redes/posts?mes=${M1}#pieza-${ID}`, level: 'amarillo', sentBefore: false }));

  it('la tarjeta de su sección, abierta, sin «Abrir la pieza» (ya está aquí) y con el caption que manda a «Copies»', () => {
    const h = big(piece({ blockers: ['Sube la imagen 4:5.'] }));
    expect(h).toMatch(new RegExp(`<article id="pieza-${ID}"`));
    expect(h).not.toContain('max-[599px]:hidden');
    expect(text(h)).not.toContain('Abrir la pieza');
    expect(text(h)).toContain(COPIES_BELOW);
    expect(h).toContain('href="#copies"');
    expect(h).not.toContain('Caption (copy largo');
  });

  it('«Enviar a aprobación» con su «Nivel de aprobación», una sola vez, apagado con lo que falta', () => {
    const h = big(piece({ blockers: ['Sube la imagen 4:5.'] }));
    expect(h.match(/Enviar a aprobación/g)?.length).toBe(1);
    expect(h.match(/aria-label="Nivel de aprobación"/g)?.length).toBe(1);
    expect(h.match(/data-tour="send-review"/g)?.length).toBe(1);
    const send = /<button[^>]*data-tour="send-review"[^>]*>/.exec(h)![0];
    expect(send).toMatch(/\sdisabled=""/);
    expect(send).toContain(`aria-describedby="pieza-${ID}-blockers"`);
    expect(h).toContain(`id="pieza-${ID}-blockers"`);
    expect(text(h)).toContain('Sube la imagen 4:5.');
    // Ready to send: on.
    expect(/<button[^>]*data-tour="send-review"[^>]*>/.exec(big(piece()))![0]).not.toMatch(/\sdisabled=""/);
  });

  it('el nivel ya revisado sube pero no baja; un rojo se queda rojo', () => {
    expect(levelOptions('amarillo', false).map((o) => o.value)).toEqual(['verde', 'amarillo', 'rojo']);
    expect(levelOptions('amarillo', true).map((o) => o.value)).toEqual(['amarillo', 'rojo']);
    expect(levelOptions('rojo', false).map((o) => o.value)).toEqual(['rojo']);
  });

  it('«Archivo final» por formato: video y portada, imagen, foto o clip; el carrusel por láminas en la tarjeta', () => {
    expect(FINAL_FILE.reel?.label).toBe('Subir video final (nueva versión)');
    expect(FINAL_FILE.reel?.cover).toBe(true);
    expect(FINAL_FILE.youtube?.cover).toBe(true);
    expect(FINAL_FILE.post?.label).toBe('Subir imagen final (nueva versión)');
    expect(FINAL_FILE.story?.accept).toBe('image/*,video/*');
    expect(FINAL_FILE.carousel).toBeNull();
    expect(FINAL_FILE.month_end).toBeNull();
  });

  it('la página: «Copies» con su ancla #copies, el archivo final y, en la demo, la pieza de otro servidor', () => {
    const page = read('src/app/(panel)/piezas/[id]/page.tsx');
    expect(page).toContain('id="copies"');
    expect(page).toContain('data-tour="final-file"');
    expect(page).not.toMatch(/event_schedule|event_calendar|done_on|e\.\*/);
    const nf = read('src/app/(panel)/piezas/[id]/not-found.tsx');
    expect(nf).toContain('DEMO_OTHER_SERVER_PIECE');
    expect(nf).toContain('isDemo()');
  });
});

describe('«Nueva pieza» desde un evento (R4): «Formato» y «Mes»', () => {
  const events = [{ id: 'e1', title: 'Jornada de salud (prueba)', category_id: null, pieceTitle: 'Jornada de salud (prueba)' }];
  const months = [{ id: M1, label: 'Mes 1', ordinal: 1 }, { id: 'm2', label: 'Mes 2', ordinal: 2 }];

  it('seis formatos con su ayuda como botones grandes, el elegido marcado, y el mes abierto', () => {
    const h = html(createElement(NewPieceForm, { categories: [], events, eventId: 'e1', months, monthId: 'm2', format: 'post' }));
    const t = text(h);
    expect(t).toContain('Formato');
    expect(h.match(/type="radio"/g)?.length).toBe(6);
    for (const f of FORMATS) expect(t).toContain(`${FORMAT[f].label} ${FORMAT[f].hint}`);
    expect(h.match(/<input type="radio"[^>]*checked=""[^>]*>/g)).toEqual([expect.stringContaining('value="post"')]);
    expect(h).toMatch(/<option value="m2" selected="">Mes 2<\/option>/);
    expect(h).toMatch(/<input[^>]*id="pt"[^>]*value="Jornada de salud \(prueba\)"/);
  });

  it('un evento con fecha u hora en su título no se ofrece como título de la pieza', () => {
    const page = read('src/app/(panel)/piezas/nueva/page.tsx');
    expect(page).toContain("pieceTitle: hasConcreteDateTime(e.title) ? '' : e.title");
    const h = html(createElement(NewPieceForm, { categories: [], events: [{ ...events[0], pieceTitle: '' }], eventId: 'e1', months, monthId: M1, format: 'reel' }));
    expect(h).toMatch(/<input[^>]*id="pt"[^>]*value=""/);
  });

  it('sin meses (una base vieja), no pide el mes: va al primero', () => {
    expect(text(html(createElement(NewPieceForm, { categories: [], events, eventId: '', months: [], monthId: '', format: 'reel' })))).not.toContain('Mes ');
  });
});

describe('Ajustes → Cupo y pilares (R4)', () => {
  it('el cupo de los cinco formatos con cupo (Fin de mes no tiene) y los pilares con su color', () => {
    const t = text(html(createElement(ContentSettings, { quotas: { reel: 12, post: 8, carousel: 4, story: 30, youtube: 4 }, pillars: [{ key: 'obras', name: 'Obras que se ven', tone: 'accent' }] })));
    for (const l of ['Cupo del mes', 'Reels', 'Posts', 'Carruseles', 'Historias', 'YouTube', 'Guardar cupo', 'Pilares', 'Pilar 1', 'Color', 'Agregar pilar', 'Guardar pilares']) expect(t).toContain(l);
  });

  it('la clave de un pilar nuevo sale de su nombre, sin acentos ni repetirse; las viejas no cambian', () => {
    expect(pillarKey('Cultura y tradición', [])).toBe('cultura-y-tradicion');
    expect(pillarKey('Obras', ['obras'])).toBe('obras-2');
    expect(pillarKey('¡¡!!', [])).toBe('pilar');
    expect(pillarKey('x'.repeat(60), [])).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
    const saved = pillarsToSave([{ key: 'obras', name: 'Obras del estado ', tone: 'accent' }, { key: null, name: 'Obras', tone: 'ok' }, { key: null, name: 'Obras', tone: 'info' }]);
    expect(saved).toEqual([
      { key: 'obras', name: 'Obras del estado', tone: 'accent' },
      { key: 'obras-2', name: 'Obras', tone: 'ok' },
      { key: 'obras-3', name: 'Obras', tone: 'info' },
    ]);
  });

  it('«Piezas eliminadas»: título, formato, mes, hace cuánto y «Recuperar»; o que no hay', () => {
    const t = text(html(createElement(DeletedPieces, { pieces: [{ id: ID, title: 'Nuestro café de altura', format: 'Post', month: 'Mes 1', ago: 'hace 2 días' }] })));
    expect(t).toContain('Nuestro café de altura Post · Mes 1 · Eliminada hace 2 días');
    expect(t).toContain('Recuperar');
    expect(text(html(createElement(DeletedPieces, { pieces: [] })))).toContain('No hay piezas eliminadas.');
  });

  it('Ajustes tiene el enlace «Cupo y pilares»', () => {
    expect(read('src/app/(panel)/ajustes/page.tsx')).toContain("{ href: '/ajustes/contenido', label: 'Cupo y pilares'");
  });
});
