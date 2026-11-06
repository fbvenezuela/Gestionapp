// What each kind of web content holds and what a page's blocks may say (design §3): the skeleton pages of the client's
// config fit; text is structured (no HTML block exists, a link goes only to https, http, mailto or a path of this site);
// block ids do not repeat; no figure without its source (investment, progress, an indicator shown); notices expire;
// addresses come from titles.
import { describe, expect, it } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { BLOCK_LABEL, BLOCK_TYPES, block, blocks, internalPath, richText, safeHref } from '@/lib/web/blocks';
import { SNAPSHOT, WEB_KINDS, WEB_KIND_LABEL, indicatorShown, isoDate, noticeActive, parseSnapshot, slug, slugFromTitle } from '@/lib/web/schema';

const UUID = '0b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3';

describe('las páginas base del cliente', () => {
  it('cada una cabe en el esquema de página (bloques, SEO, textos «por completar»)', () => {
    for (const p of getClientConfig().web.pages) {
      const r = parseSnapshot('page', p.draft);
      expect(r.ok ? 'ok' : r.error, p.slug).toBe('ok');
    }
  });

  it('cada tipo de bloque tiene su nombre; cada tipo de contenido, el suyo', () => {
    expect(BLOCK_TYPES.sort()).toEqual(Object.keys(BLOCK_LABEL).sort());
    expect(BLOCK_TYPES).toHaveLength(15);
    expect(Object.keys(SNAPSHOT).sort()).toEqual([...WEB_KINDS].sort());
    for (const k of WEB_KINDS) expect(WEB_KIND_LABEL[k], k).toMatch(/^[A-ZÁÉÍÓÚ]/);
  });
});

describe('el texto y los enlaces: nada de HTML ni de scripts', () => {
  it('un enlace va a https, http, mailto o a una dirección de esta web', () => {
    for (const ok of ['https://ejemplo.test/a?b=1', 'http://ejemplo.test', 'mailto:prensa@ejemplo.test', '/gestion', '/atencion/nueva?tipo=reporte', '/']) {
      expect(safeHref.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//otro.test/x', '/\\otro.test', 'ftp://x.test', 'https://', 'https://a b.test', 'mailto:', ' javascript:alert(1)']) {
      expect(safeHref.safeParse(bad).success, bad).toBe(false);
    }
    expect(internalPath.safeParse('/gestion/obra-1').success).toBe(true);
    expect(internalPath.safeParse('https://otro.test').success).toBe(false);
    expect(internalPath.safeParse('//otro.test').success).toBe(false);
  });

  it('no hay bloque de HTML; un texto con etiquetas es solo texto (el sitio lo escapa); un enlace malo no pasa', () => {
    expect(block.safeParse({ id: 'x', type: 'html', visible: true, data: { html: '<script>alert(1)</script>' } }).success).toBe(false);
    expect(block.safeParse({ id: 'x', type: 'text', visible: true, data: { content: [{ type: 'html', html: '<b>x</b>' }] } }).success).toBe(false);
    const runs = (href: string) => ({ id: 't', type: 'text', visible: true, data: { content: [{ type: 'paragraph', runs: [{ text: 'clic', href }] }] } });
    expect(block.safeParse(runs('javascript:alert(1)')).success).toBe(false);
    expect(block.safeParse(runs('https://ejemplo.test')).success).toBe(true);
    expect(block.safeParse({ id: 'c', type: 'cta', visible: true, data: { title: 'Participa', label: 'Ir', href: 'javascript:void(0)' } }).success).toBe(false);
    expect(block.safeParse({ id: 'h', type: 'hero', visible: true, data: { title: 'Hola', ctaHref: 'data:x' } }).success).toBe(false);
    // Text with tags is allowed as TEXT: it is never interpreted.
    expect(richText.safeParse([{ type: 'paragraph', text: '<script>alert(1)</script>' }]).success).toBe(true);
    // A paragraph has its text or its runs, not both, not neither.
    expect(richText.safeParse([{ type: 'paragraph' }]).success).toBe(false);
    expect(richText.safeParse([{ type: 'paragraph', text: 'a', runs: [{ text: 'b' }] }]).success).toBe(false);
    expect(richText.safeParse([{ type: 'heading', level: 1, text: 'H1 no' }]).success).toBe(false);
  });

  it('los ids de los bloques no se repiten y van en minúsculas; un video de YouTube es su código de 11', () => {
    const b = (id: string) => ({ id, type: 'channels', visible: true, data: {} });
    expect(blocks.safeParse([b('a'), b('b')]).success).toBe(true);
    expect(blocks.safeParse([b('a'), b('a')]).success).toBe(false);
    expect(blocks.safeParse([b('Mayúscula')]).success).toBe(false);
    expect(block.safeParse({ id: 'v', type: 'video', visible: true, data: { youtubeId: 'abcdefghijk' } }).success).toBe(true);
    expect(block.safeParse({ id: 'v', type: 'video', visible: true, data: { youtubeId: 'https://youtu.be/x' } }).success).toBe(false);
    expect(block.safeParse({ id: 'g', type: 'gallery', visible: true, data: { mediaIds: [] } }).success).toBe(false);
  });
});

describe('cada tipo de contenido', () => {
  const base = { title: 'Algo (demo)', date: '2026-11-01' };

  it('una obra: estado de la lista; la inversión y el avance solo con su fuente', () => {
    const obra = { ...base, category: 'vialidad', state: 'en_ejecucion', municipalityId: UUID };
    expect(parseSnapshot('project', obra).ok).toBe(true);
    expect(parseSnapshot('project', { ...obra, state: '80 %' }).ok).toBe(false);
    expect(parseSnapshot('project', { ...obra, investment: { amount: 1000, currency: 'USD' } }).ok).toBe(false);
    expect(parseSnapshot('project', { ...obra, investment: { amount: 1000, currency: 'USD', source: { label: 'Presupuesto aprobado (demo)' } } }).ok).toBe(true);
    expect(parseSnapshot('project', { ...obra, progress: { percent: 45 } }).ok).toBe(false);
    expect(parseSnapshot('project', { ...obra, progress: { percent: 145, source: { label: 'Informe (demo)' } } }).ok).toBe(false);
  });

  it('un indicador se muestra solo con su fuente', () => {
    const ind = { ...base, value: 1250, unit: 'viviendas', source: null };
    const r = parseSnapshot('indicator', ind);
    expect(r.ok).toBe(true);
    expect(indicatorShown(r.ok ? r.data : ind)).toBe(false);
    expect(indicatorShown({ source: { label: 'Cifra inventada (demo)' } })).toBe(true);
    expect(parseSnapshot('indicator', { ...ind, value: 'muchas' }).ok).toBe(false);
  });

  it('un aviso vence; un episodio sin video todavía; un documento sin archivo; una pregunta con su respuesta', () => {
    const notice = { ...base, category: 'agua', body: 'Corte por mantenimiento (demo).', updatedAt: '2026-11-01T09:00:00-04:00', expiresAt: '2026-11-03T18:00:00-04:00' };
    expect(parseSnapshot('notice', notice).ok).toBe(true);
    expect(noticeActive(notice, new Date('2026-11-02T12:00:00-04:00'))).toBe(true);
    expect(noticeActive(notice, new Date('2026-11-04T12:00:00-04:00'))).toBe(false);
    expect(noticeActive({ expiresAt: null })).toBe(true);
    expect(parseSnapshot('episode', { ...base, youtubeId: null }).ok).toBe(true);
    expect(parseSnapshot('document', { ...base, category: 'semanario', fileId: null }).ok).toBe(true);
    expect(parseSnapshot('document', { ...base, category: 'chisme', fileId: null }).ok).toBe(false);
    expect(parseSnapshot('faq', { ...base, category: 'atencion', answer: [] }).ok).toBe(false);
    expect(parseSnapshot('faq', { ...base, category: 'atencion', answer: [{ type: 'paragraph', text: 'Sí.' }] }).ok).toBe(true);
  });

  it('el título es obligatorio, la fecha existe, la fuente de una noticia es https; el error dice dónde', () => {
    const r = parseSnapshot('news', { title: '', category: 'noticia' });
    expect(r).toEqual({ ok: false, error: 'Falta el título. (title)' });
    expect(isoDate.safeParse('2026-02-30').success).toBe(false);
    expect(isoDate.safeParse('2026-02-28').success).toBe(true);
    expect(parseSnapshot('news', { ...base, category: 'noticia', sources: [{ label: 'Fuente', url: 'javascript:alert(1)' }] }).ok).toBe(false);
    expect(parseSnapshot('news', { ...base, category: 'noticia', sources: [{ label: 'Fuente (demo)' }] }).ok).toBe(true);
  });
});

describe('las direcciones', () => {
  it('desde el título: sin tildes, minúsculas, guiones, hasta 80 caracteres cortando en un guion', () => {
    expect(slugFromTitle('Huecos en la avenida (demo)')).toBe('huecos-en-la-avenida-demo');
    expect(slugFromTitle('¿Cómo sigo mi solicitud?')).toBe('como-sigo-mi-solicitud');
    expect(slugFromTitle('!!!')).toBe('contenido');
    const long = slugFromTitle('Rehabilitación integral de la avenida principal con drenajes aceras alumbrado y señalización nueva (demo)');
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long).not.toMatch(/-$/);
    expect(slug.safeParse(long).success).toBe(true);
    expect(slug.safeParse('Con Mayúscula').success).toBe(false);
  });
});
