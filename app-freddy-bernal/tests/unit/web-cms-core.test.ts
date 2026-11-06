// The website administrator's pure pieces (src/lib/web/cms): the editor's markup ⇄ structured text (never HTML, links
// only through safeHref), the drafts (how a new item starts, what is missing in plain words), the diff the publisher
// reads, the chips of an item's state, scheduling in the Táchira's time zone, the social card, which old addresses a
// redirect can serve and the server's checks of an uploaded file.
import { describe, expect, it } from 'vitest';
import { textNode, type TextNode } from '@/lib/web/blocks';
import { SNAPSHOT, WEB_KINDS, parseSnapshot } from '@/lib/web/schema';
import { editToNodes, inlineToMarkup, markupToInline, markupToRuns, nodesToEdit, plainText, runsToMarkup } from '@/lib/web/cms/markup';
import { dayIn, draftProblems, emptyDraft, fieldPath, mediaIdsIn, readinessIssues, snapshotIssues } from '@/lib/web/cms/drafts';
import { describe as describeValue, diffSnapshots, stable } from '@/lib/web/cms/diff';
import { flowChips, hasPendingChanges, isLive, isScheduled, type ItemFlow } from '@/lib/web/cms/status';
import { inputToIso, isoToInput, localToUtc, suggestedMoment, utcToLocal } from '@/lib/web/cms/schedule';
import { socialCard } from '@/lib/web/cms/seo';
import { redirectableFrom } from '@/lib/web/cms/paths';
import { checkWebMediaFile, maxMediaBytes, sameSite } from '@/lib/web/cms/media-file';
import { ADMIN_WEB, KIND_SECTIONS, sectionBySlug, sectionOf } from '@/lib/web/cms/kinds';
import { pngOf } from './fixtures/web-png';

const TZ = 'America/Caracas';
const UUID = '6f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';
const UUID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4d';

describe('el texto con formato: el marcado del editor y los párrafos de la web', () => {
  it('negrita, cursiva y enlaces pasan a partes con su estilo, y vuelven igual', () => {
    const runs = markupToRuns('Hola **mundo** y *más* con [un enlace](https://ejemplo.test/a) y ***todo***.');
    expect(runs).toEqual([
      { text: 'Hola ' },
      { text: 'mundo', bold: true },
      { text: ' y ' },
      { text: 'más', italic: true },
      { text: ' con ' },
      { text: 'un enlace', href: 'https://ejemplo.test/a' },
      { text: ' y ' },
      { text: 'todo', bold: true, italic: true },
      { text: '.' },
    ]);
    expect(markupToRuns(runsToMarkup(runs))).toEqual(runs);
  });

  it('un signo que abre y no cierra es texto; la barra invertida deja un signo como es', () => {
    expect(markupToInline('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(markupToInline('**sin cerrar')).toBe('**sin cerrar');
    expect(markupToInline('precio \\*especial\\* y \\[nota\\]')).toBe('precio *especial* y [nota]');
    expect(markupToInline(inlineToMarkup('a * b [c] \\ d'))).toBe('a * b [c] \\ d');
  });

  it('el estilo cruzado y un enlace en negrita sobreviven a la ida y vuelta', () => {
    for (const runs of [
      [{ text: 'a', bold: true }, { text: 'b', italic: true }],
      [{ text: 'a', italic: true }, { text: 'b', bold: true }],
      [{ text: 'a', bold: true, italic: true }, { text: 'b', bold: true }],
      [{ text: 'Ver', bold: true, href: '/gestion' }, { text: ' ahora' }],
      [{ text: 'un ) raro', href: 'https://ejemplo.test/x(1)' }],
    ]) {
      const back = markupToRuns(runsToMarkup(runs));
      expect(back.map((r) => r.text).join('')).toBe(runs.map((r) => r.text).join(''));
      expect(back.map((r) => [!!r.bold, !!r.italic, !!r.href])).toEqual(runs.map((r) => [!!r.bold, !!r.italic, !!r.href]));
    }
  });

  it('nunca HTML: lo que parece una etiqueta queda como texto, y un enlace javascript: no pasa el esquema', () => {
    const nodes = editToNodes([{ type: 'paragraph', text: '<script>alert(1)</script> [clic](javascript:alert(1))' }]);
    expect(JSON.stringify(nodes)).toContain('<script>');
    expect(textNode.safeParse(nodes[0]).success).toBe(false);
    expect(textNode.safeParse(editToNodes([{ type: 'paragraph', text: '[clic](https://ejemplo.test)' }])[0]).success).toBe(true);
    expect(textNode.safeParse(editToNodes([{ type: 'paragraph', text: '[escribe](mailto:prensa@ejemplo.test)' }])[0]).success).toBe(true);
  });

  it('las cajas del editor: párrafos, títulos, listas, citas y «por completar», sin las vacías', () => {
    const nodes = editToNodes([
      { type: 'h2', text: 'Un título\ncon salto' },
      { type: 'paragraph', text: 'Texto **fuerte**' },
      { type: 'paragraph', text: '   ' },
      { type: 'list', text: 'uno\n\n*dos*' },
      { type: 'olist', text: 'primero' },
      { type: 'quote', text: 'Una frase', cite: 'Alguien (demo)' },
      { type: 'pending', text: 'La biografía' },
    ]);
    expect(nodes).toEqual([
      { type: 'heading', level: 2, text: 'Un título con salto' },
      { type: 'paragraph', runs: [{ text: 'Texto ' }, { text: 'fuerte', bold: true }] },
      { type: 'list', items: ['uno', [{ text: 'dos', italic: true }]] },
      { type: 'list', ordered: true, items: ['primero'] },
      { type: 'quote', text: 'Una frase', cite: 'Alguien (demo)' },
      { type: 'pending', text: 'La biografía' },
    ]);
    for (const n of nodes) expect(textNode.safeParse(n).success, JSON.stringify(n)).toBe(true);
    expect(editToNodes(nodesToEdit(nodes))).toEqual(nodes);
  });

  it('lo guardado a medias o roto se lee sin romper el editor', () => {
    expect(nodesToEdit(null)).toEqual([]);
    expect(nodesToEdit([{ type: 'raro' }, 7, { type: 'paragraph' }, { type: 'heading', level: 3, text: 'Sub' }])).toEqual([
      { type: 'paragraph', text: '' },
      { type: 'h3', text: 'Sub' },
    ]);
    expect(plainText([{ type: 'paragraph', runs: [{ text: 'Hola ' }, { text: 'mundo' }] }, { type: 'list', items: ['a', 'b'] }])).toBe('Hola mundo a · b');
  });
});

describe('los borradores', () => {
  it('cada tipo que se crea empieza guardable y con su forma; a los que piden algo les falta solo eso', () => {
    const now = new Date('2026-11-06T15:00:00Z');
    for (const kind of WEB_KINDS) {
      const d = emptyDraft(kind, 'Un título (demo)', { tz: TZ, now });
      expect(d.title).toBe('Un título (demo)');
      const issues = snapshotIssues(kind, d).map((i) => i.path);
      if (kind === 'notice') expect(issues).toEqual(['Texto del aviso']);
      else if (kind === 'faq') expect(issues).toEqual(['Respuesta']);
      else expect(issues, kind).toEqual([]);
    }
    expect(emptyDraft('news', 'x', { tz: TZ, now }).date).toBe('2026-11-06');
    expect(dayIn(TZ, new Date('2026-11-07T02:00:00Z'))).toBe('2026-11-06');
  });

  it('lo que falta se dice en palabras, con el lugar (también dentro de un bloque)', () => {
    const page = { title: '', blocks: [{ id: 'portada', type: 'hero', visible: true, data: { title: '' } }, { id: 'boton', type: 'cta', visible: true, data: { title: 'Ven', label: 'Ir', href: 'javascript:alert(1)' } }] };
    const issues = snapshotIssues('page', page);
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: 'Título', message: 'Falta el título.' },
        { path: 'Bloque 1 (Portada con foto) · título', message: 'No puede quedar vacío.' },
        expect.objectContaining({ path: 'Bloque 2 (Llamado a la acción) · enlace', message: expect.stringMatching(/^El enlace va a una página/) }),
      ]),
    );
    for (const i of issues) expect(i.message, i.message).not.toMatch(/Invalid|expected|Too small/);
    expect(fieldPath('news', ['sources', 0, 'url'])).toBe('Fuentes · 1 · enlace');
  });

  it('las reglas de la web: un indicador sin fuente, un documento sin PDF, un aviso que vence antes de actualizarse', () => {
    const ind = emptyDraft('indicator', 'Viviendas (demo)', { tz: TZ });
    expect(readinessIssues('indicator', ind).map((i) => i.path)).toEqual(['Fuente']);
    expect(draftProblems('indicator', { ...ind, source: { label: 'Informe (demo)' } })).toEqual([]);
    expect(draftProblems('document', emptyDraft('document', 'Informe (demo)')).map((i) => i.path)).toEqual(['Archivo PDF']);
    const notice = { ...emptyDraft('notice', 'Corte (demo)', { now: new Date('2026-11-06T12:00:00Z') }), body: 'Sin agua (demo).', expiresAt: '2026-11-06T11:00:00.000Z' };
    expect(draftProblems('notice', notice).map((i) => i.path)).toEqual(['Vence']);
    // The schema first: an incomplete notice says what the schema misses before the site's rules.
    expect(draftProblems('notice', { ...notice, body: '' }).map((i) => i.path)).toEqual(['Texto del aviso']);
  });

  it('una inversión o un avance sin su fuente no pasan', () => {
    const p = emptyDraft('project', 'Obra (demo)');
    expect(snapshotIssues('project', { ...p, investment: { amount: 100, currency: 'USD', source: { label: '' } } }).map((i) => i.path)).toEqual(['Inversión · fuente · nombre']);
    expect(snapshotIssues('project', { ...p, progress: { percent: 40 } }).map((i) => i.path)).toEqual(['Avance · fuente']);
    expect(snapshotIssues('project', { ...p, investment: { amount: 100, currency: 'USD', source: { label: 'Gaceta (demo)' } } })).toEqual([]);
  });

  it('los ids de la biblioteca que nombra un borrador, a cualquier profundidad', () => {
    expect(mediaIdsIn({ coverId: UUID, blocks: [{ data: { mediaIds: [UUID2, UUID] } }], seo: { imageId: null }, x: 'no' }).sort()).toEqual([UUID, UUID2].sort());
  });
});

describe('qué cambia si se publica', () => {
  it('campo por campo, con antes y ahora; la primera vez todo es nuevo', () => {
    expect(diffSnapshots('news', null, { title: 'A' }).first).toBe(true);
    const d = diffSnapshots('news', { title: 'Antes (demo)', excerpt: 'Igual', category: 'noticia', topics: ['agua'] }, { title: 'Ahora (demo)', excerpt: 'Igual', category: 'comunicado', topics: [], seo: { title: 'Para Google' } });
    expect(d.fields.map((f) => [f.label, f.kind])).toEqual([
      ['Título', 'changed'],
      ['Categoría', 'changed'],
      ['Temas', 'removed'],
      ['Buscadores y redes: título para buscadores', 'added'],
    ]);
    expect(d.fields[0]).toMatchObject({ before: '«Antes (demo)»', after: '«Ahora (demo)»' });
    expect(d.same).toBe(false);
    expect(diffSnapshots('news', { title: 'X', excerpt: '' }, { title: 'X' }).same).toBe(true);
  });

  it('una página: bloques nuevos, quitados, cambiados, ocultos y el orden', () => {
    const before = { title: 'Inicio', blocks: [
      { id: 'portada', type: 'hero', visible: true, data: { title: 'Hola (demo)' } },
      { id: 'avisos', type: 'notices', visible: true, data: { title: 'Avisos de servicio' } },
      { id: 'noticias', type: 'news', visible: true, data: { title: 'Actualidad' } },
      { id: 'viejo', type: 'channels', visible: true, data: {} },
    ] };
    const after = { title: 'Inicio', blocks: [
      { id: 'portada', type: 'hero', visible: true, data: { title: 'Hola de nuevo (demo)' } },
      { id: 'noticias', type: 'news', visible: false, data: { title: 'Actualidad' } },
      { id: 'avisos', type: 'notices', visible: true, data: { title: 'Avisos de servicio' } },
      { id: 'cta-1', type: 'cta', visible: true, data: { title: 'Ven', label: 'Ir', href: '/atencion' } },
    ] };
    const d = diffSnapshots('page', before, after);
    expect(d.blocks.map((b) => [b.id, b.kind])).toEqual([['portada', 'changed'], ['noticias', 'hidden'], ['cta-1', 'added'], ['viejo', 'removed']]);
    expect(d.blocks[0].details).toEqual(['título: «Hola (demo)» → «Hola de nuevo (demo)»']);
    expect(d.reordered?.before).toEqual(['Portada con foto «Hola (demo)» (1)', 'Avisos de servicio (2)', 'Noticias «Actualidad» (3)']);
    expect(d.reordered?.after).toEqual(['Portada con foto «Hola de nuevo (demo)» (1)', 'Noticias «Actualidad» (2)', 'Avisos de servicio (3)']);
  });

  it('describe valores para una persona (texto, fotos, listas, cifras con fuente)', () => {
    expect(describeValue('body', [{ type: 'paragraph', text: 'Un texto' }])).toBe('Un texto');
    expect(describeValue('coverId', UUID)).toBe('una foto o archivo de la biblioteca');
    expect(describeValue('galleryIds', [UUID, UUID2])).toBe('2 elementos de la biblioteca');
    expect(describeValue('investment', { amount: 1500, currency: 'USD', source: { label: 'Gaceta (demo)' } })).toBe('1.500 USD (fuente: Gaceta (demo))');
    expect(describeValue('x', null)).toBe('(vacío)');
    expect(stable({ b: 1, a: '' })).toBe(stable({ b: 1 }));
  });
});

describe('los chips del estado', () => {
  const base: ItemFlow = { status: 'draft', hasPublished: false, publishAt: null, archivedAt: null, draftVersion: 1, publishedVersion: null, reviewNote: null };
  const now = new Date('2026-11-06T12:00:00Z');
  const labels = (f: Partial<ItemFlow>) => flowChips({ ...base, ...f }, now).map((c) => c.label);

  it('borrador, en revisión, programado, publicado, archivado y lo que además importa', () => {
    expect(labels({})).toEqual(['Borrador']);
    expect(labels({ status: 'in_review' })).toEqual(['En revisión']);
    expect(labels({ status: 'scheduled', hasPublished: true, publishAt: '2026-11-07T12:00:00Z', publishedVersion: 1 })).toEqual(['Programado']);
    expect(labels({ status: 'published', hasPublished: true, publishAt: '2026-11-01T12:00:00Z', publishedVersion: 1 })).toEqual(['Publicado']);
    expect(labels({ status: 'draft', hasPublished: true, publishAt: '2026-11-01T12:00:00Z', publishedVersion: 1, draftVersion: 2 })).toEqual(['Publicado', 'Cambios sin publicar']);
    expect(labels({ status: 'in_review', hasPublished: true, publishAt: '2026-11-01T12:00:00Z', publishedVersion: 1, draftVersion: 2 })).toEqual(['Publicado', 'En revisión']);
    expect(labels({ status: 'draft', reviewNote: 'Falta la fuente' })).toEqual(['Borrador', 'Devuelto con comentario']);
    expect(labels({ status: 'archived', archivedAt: '2026-11-02T00:00:00Z', hasPublished: true, publishAt: '2026-11-01T12:00:00Z' })).toEqual(['Archivado']);
  });

  it('lo programado cuenta como publicado apenas llega su hora, aunque el reloj del servidor no lo haya marcado', () => {
    const f = { ...base, status: 'scheduled' as const, hasPublished: true, publishAt: '2026-11-06T11:59:00Z', publishedVersion: 1 };
    expect(isLive(f, now)).toBe(true);
    expect(isScheduled(f, now)).toBe(false);
    expect(hasPendingChanges({ hasPublished: true, draftVersion: 3, publishedVersion: 3 })).toBe(false);
  });
});

describe('programar en la hora del Táchira', () => {
  it('día y hora del formulario ⇄ el momento en UTC', () => {
    expect(localToUtc({ date: '2026-11-07', time: '08:00' }, TZ)).toBe('2026-11-07T12:00:00.000Z');
    expect(utcToLocal('2026-11-07T12:00:00.000Z', TZ)).toEqual({ date: '2026-11-07', time: '08:00' });
    expect(localToUtc({ date: '2026-02-30', time: '08:00' }, TZ)).toBeNull();
    expect(localToUtc({ date: '2026-11-07', time: '8:00' }, TZ)).toBeNull();
    expect(suggestedMoment(TZ, new Date('2026-11-06T23:30:00Z'))).toEqual({ date: '2026-11-07', time: '08:00' });
    expect(inputToIso('2026-11-07T08:30', TZ)).toBe('2026-11-07T12:30:00.000Z');
    expect(isoToInput('2026-11-07T12:30:00.000Z', TZ)).toBe('2026-11-07T08:30');
    expect(isoToInput(null, TZ)).toBe('');
  });
});

describe('la tarjeta al compartir', () => {
  it('el título y la descripción de buscadores, si no los propios; la imagen para redes, si no la portada o la foto de la portada', () => {
    const base = 'https://web.ejemplo.test';
    expect(socialCard('news', 'una-nota', { title: 'Nota (demo)', excerpt: 'Resumen', coverId: UUID }, base)).toEqual({
      title: 'Nota (demo)', description: 'Resumen', imageId: UUID, url: `${base}/actualidad/una-nota`, path: '/actualidad/una-nota',
    });
    expect(socialCard('news', 'una-nota', { title: 'Nota', seo: { title: 'SEO', description: 'Desc', imageId: UUID2, canonical: '/actualidad/otra' } }, base)).toMatchObject({
      title: 'SEO', description: 'Desc', imageId: UUID2, url: `${base}/actualidad/otra`,
    });
    expect(socialCard('page', 'inicio', { title: 'Inicio', blocks: [{ type: 'hero', visible: true, data: { mediaId: UUID } }] }, base)).toMatchObject({ imageId: UUID, url: `${base}/` });
  });
});

describe('las secciones del administrador', () => {
  it('una por tipo, con su dirección; las páginas no se crean', () => {
    expect(KIND_SECTIONS.map((s) => s.kind).sort()).toEqual([...WEB_KINDS].sort());
    expect(sectionBySlug('noticias')?.kind).toBe('news');
    expect(sectionBySlug('nada')).toBeNull();
    expect(sectionOf('page').create).toBeNull();
    expect(ADMIN_WEB.list('notice')).toBe('/admin/web/contenido/avisos');
    expect(ADMIN_WEB.preview('x', 3)).toBe('/admin/web/vista-previa/x?version=3');
  });
});

describe('las redirecciones', () => {
  it('solo desde una dirección que la web no contesta, o desde una noticia u obra que ya no está', () => {
    for (const p of ['/2024/05/una-nota', '/categoria/salud', '/?p=123', '/feed', '/actualidad/nota-vieja', '/gestion/obra-vieja']) expect(redirectableFrom(p), p).toBe(true);
    for (const p of ['/gestion', '/actualidad', '/actualidad/semanario', '/atencion/nueva', '/hoy', '/admin/web']) expect(redirectableFrom(p), p).toBe(false);
  });
});

describe('el servidor revisa cada archivo de la biblioteca', () => {
  it('una foto de verdad pasa, sin sus metadatos y con su tamaño', () => {
    const r = checkWebMediaFile({ kind: 'image', bytes: pngOf(320, 200) }, undefined);
    expect(r).toMatchObject({ ok: true, kind: 'image', mime: 'image/png', ext: 'png', width: 320, height: 200 });
    if (r.ok) expect(Buffer.from(r.bytes).includes(Buffer.from('GPS'))).toBe(false);
  });

  it('el tipo lo dicen los bytes; muy pequeña, vacía, muy pesada o un PDF que no lo es: no', () => {
    expect(checkWebMediaFile({ kind: 'image', bytes: new TextEncoder().encode('<svg onload=alert(1)>') })).toMatchObject({ ok: false, status: 415 });
    expect(checkWebMediaFile({ kind: 'image', bytes: pngOf(100, 100) })).toMatchObject({ ok: false, status: 422 });
    expect(checkWebMediaFile({ kind: 'image', bytes: new Uint8Array() })).toMatchObject({ ok: false, status: 422 });
    expect(checkWebMediaFile({ kind: 'document', bytes: pngOf(320, 200) })).toMatchObject({ ok: false, status: 415 });
    expect(checkWebMediaFile({ kind: 'document', bytes: new TextEncoder().encode('%PDF-1.4\n%demo') })).toMatchObject({ ok: true, mime: 'application/pdf', ext: 'pdf' });
    const big = new Uint8Array(maxMediaBytes('image', undefined) + 1);
    big.set(pngOf(320, 200));
    expect(checkWebMediaFile({ kind: 'image', bytes: big }, undefined)).toMatchObject({ ok: false, status: 413 });
    expect(maxMediaBytes('document', '1')).toBe(4 * 1024 * 1024);
  });

  it('solo desde la misma web (Origin o Sec-Fetch-Site)', () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    expect(sameSite(h({ origin: 'https://web.test', host: 'web.test' }), 'https://web.test/x')).toBe(true);
    expect(sameSite(h({ origin: 'https://otro.test', host: 'web.test' }), 'https://web.test/x')).toBe(false);
    expect(sameSite(h({ 'sec-fetch-site': 'cross-site' }), 'https://web.test/x')).toBe(false);
    expect(sameSite(h({}), 'https://web.test/x')).toBe(true);
  });
});

describe('cada tipo nuevo que el editor guarda pasa el esquema de la web al completarse', () => {
  it('un borrador con lo mínimo de cada tipo es lo que la web pública sabe dibujar', () => {
    const fill: Record<string, Record<string, unknown>> = { notice: { body: 'Texto (demo)' }, faq: { answer: [{ type: 'paragraph', text: 'Sí (demo).' } satisfies TextNode] } };
    for (const kind of WEB_KINDS) {
      const d = { ...emptyDraft(kind, 'Título (demo)'), ...(fill[kind] ?? {}) };
      expect(parseSnapshot(kind, d).ok, kind).toBe(true);
      expect(SNAPSHOT[kind].safeParse(d).success, kind).toBe(true);
    }
  });
});
