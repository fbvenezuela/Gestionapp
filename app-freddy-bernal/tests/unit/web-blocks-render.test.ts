// The public website's renderer (design §3, §7): every block type has its component, text is escaped (no HTML or script
// an editor writes ever runs), links go only through safeHref, photos come from what the item froze with their alt, focal
// point and sizes, indicators only with a source, notices only while active, the attended cases with no personal data,
// and no dangerouslySetInnerHTML anywhere but the escaped JSON-LD. No scaffolding reaches the public (F1): a missing
// photo, video or file and a «por completar» text draw nothing there; only the administrator's preview shows them.
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BLOCK_DATA, BLOCK_TYPES, type Block, type TextNode } from '@/lib/web/blocks';
import { newsSnapshot, parseSnapshot } from '@/lib/web/schema';
import { normalizeSite } from '@/lib/web/site-settings';
import type { FrozenMedia } from '@/lib/web/public';
import type { AttendedItem, WebItem } from '@/lib/web/cache';
import { publicNodes, RichText } from '@/components/web/rich-text';
import { ExternalText, SafeLink } from '@/components/web/ui';
import { BlockView, opensWithHero } from '@/components/web/blocks';
import { CtaBlock, GalleryBlock, HeroBlock, ImageBlock, SafeButton, TextBlock, isPendingText } from '@/components/web/blocks/simple';
import { AttendedView, FaqView, IndicatorsView, NoticesView, indicatorListHref } from '@/components/web/blocks/views';
import { focalPosition, PLACEHOLDER_TEXT } from '@/components/web/media';
import { DocumentRow, NewsCard, NewsFeature, newsLabel, Topics } from '@/components/web/cards';
import { VideoFrame } from '@/components/web/blocks/data';
import { NewsArticle, ProjectFicha } from '@/components/web/item-views';
import { StatsView, STAT_DEFINITIONS } from '@/components/web/stats';
import { ChannelPills, orderedChannels } from '@/components/web/channels';
import { DemoBanner } from '@/components/web/public-chrome';
import { SiteHeader } from '@/components/web/site-header';
import { ParticipationActions } from '@/components/web/participation-actions';

const site = normalizeSite({}, { demo: true, indexable: false, baseUrl: 'https://web.prueba.test' });
const KEY = '0b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3';
const PHOTO: FrozenMedia = {
  key: `${KEY}.jpg`, kind: 'image', mime: 'image/jpeg', bytes: 50_000, width: 1600, height: 1000, alt: 'Cuadrilla en la avenida',
  caption: 'La cuadrilla de la mañana', credit: 'Prensa', title: '', focalX: 0.3, focalY: 0.7,
};
const ctx = (media: Record<string, FrozenMedia> = {}) => ({ site, media, heading: 'h2' as const, first: false });
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);

const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)>';

describe('el texto estructurado: escapado siempre', () => {
  it('ningún texto de un editor sale como HTML ni como script', () => {
    const nodes = [
      { type: 'heading', level: 2, text: EVIL },
      { type: 'paragraph', text: EVIL },
      { type: 'paragraph', runs: [{ text: EVIL, bold: true }, { text: ' y un enlace', href: '/gestion' }] },
      { type: 'list', items: [EVIL, [{ text: EVIL, italic: true }]] },
      { type: 'quote', text: EVIL, cite: EVIL },
      { type: 'pending', text: EVIL },
    ] as TextNode[];
    // The administrator's preview draws everything, the «por completar» slot too: escaped all the same.
    const out = html(h(RichText, { nodes, preview: true }));
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toMatch(/<a [^>]*href="\/gestion"/);
    expect(out).toContain('Por completar');
    const pub = html(h(RichText, { nodes }));
    expect(pub).not.toContain('<script');
    expect(pub).not.toContain('Por completar');
  });

  it('un enlace que no pasa safeHref (aunque se cuele) sale como texto, sin href', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', '//otro.test', 'vbscript:x']) {
      const out = html(h(RichText, { nodes: [{ type: 'paragraph', runs: [{ text: 'clic', href: bad }] }] as TextNode[] }));
      expect(out, bad).not.toContain('href');
      expect(out, bad).toContain('clic');
    }
    expect(html(h(SafeLink, { href: 'https://fuente.test/a', children: 'fuente' }))).toBe('<a href="https://fuente.test/a" rel="noopener noreferrer">fuente</a>');
    expect(html(h(SafeLink, { href: 'mailto:prensa@ejemplo.test', children: 'correo' }))).toContain('href="mailto:prensa@ejemplo.test"');
  });

  it('los saltos de línea de un párrafo quedan, sin HTML', () => {
    expect(html(h(RichText, { nodes: [{ type: 'paragraph', text: 'uno\ndos' }] as TextNode[] }))).toContain('uno<br/>dos');
  });
});

describe('cada tipo de bloque', () => {
  it('el renderer tiene un componente para cada tipo de src/lib/web/blocks.ts', () => {
    expect(BLOCK_TYPES).toHaveLength(Object.keys(BLOCK_DATA).length);
    const sample: Record<string, unknown> = {
      hero: { title: 'T' }, text: { content: [] }, image: { mediaId: KEY }, gallery: { mediaIds: [KEY] }, video: { latestEpisode: true },
      documents: { ids: [] }, faq: {}, indicators: { ids: [] }, projects: {}, news: {}, cta: { title: 'T', label: 'L', href: '/' },
      notices: {}, channels: {}, participation: {}, attended: {},
    };
    for (const type of BLOCK_TYPES) {
      const el = BlockView({ block: { id: 'b', type, visible: true, data: sample[type] } as Block, ctx: ctx() });
      expect(el, type).not.toBeNull();
    }
  });

  it('la portada sin foto: en la web, solo el texto a lo ancho; en la vista previa, el espacio de la foto; con foto, la foto con su alt, su punto de enfoque y sus tamaños', () => {
    const empty = html(h(HeroBlock, { data: { title: 'Nombre (prueba)', text: 'Cargo (prueba)' }, ctx: { ...ctx(), heading: 'h1' } }));
    expect(empty).toContain('<h1');
    expect(empty).toContain('Cargo (prueba)');
    expect(empty).not.toContain(PLACEHOLDER_TEXT);
    expect(empty).not.toContain('<img');
    expect(empty).not.toContain('lg:grid-cols-12');
    const previewed = html(h(HeroBlock, { data: { title: 'Nombre (prueba)' }, ctx: { ...ctx(), heading: 'h1', preview: true } }));
    expect(previewed).toContain(PLACEHOLDER_TEXT);
    expect(previewed).toContain('lg:grid-cols-12');
    const full = html(h(HeroBlock, { data: { title: 'T', mediaId: KEY }, ctx: { ...ctx({ [KEY]: PHOTO }), first: true } }));
    expect(full).toContain('alt="Cuadrilla en la avenida"');
    expect(full).toContain('object-position:30% 70%');
    expect(full).toMatch(/sizes="\(min-width: 1152px\) 540px/);
    expect(full).toContain(encodeURIComponent(`/api/archivos/web/${KEY}.jpg`));
    expect(full).toMatch(/srcSet="[^"]*\/_next\/image\?url=/);
    expect(full).toContain('fetchPriority="high"');
    expect(full).not.toContain(PLACEHOLDER_TEXT);
    expect(focalPosition({ focalX: 2, focalY: -1 })).toBe('100% 0%');
  });

  it('un texto «Por completar» de la portada: la web no lo muestra; la vista previa, como el espacio vacío que es', () => {
    expect(isPendingText('Por completar desde el administrador: un mensaje corto.')).toBe(true);
    expect(isPendingText('Un mensaje del gobernador.')).toBe(false);
    const data = { title: 'T', text: 'Por completar desde el administrador: un mensaje corto.' };
    const out = html(h(HeroBlock, { data, ctx: ctx() }));
    expect(out).not.toContain('Por completar');
    expect(out).not.toContain('un mensaje corto');
    expect(html(h(HeroBlock, { data, ctx: { ...ctx(), preview: true } }))).toContain('Por completar · </span>un mensaje corto.');
  });

  it('una foto que no es una imagen congelada por el ítem no se pinta; una galería sin fotos no sale', () => {
    expect(html(h(ImageBlock, { data: { mediaId: KEY }, ctx: ctx() }))).toBe('');
    expect(html(h(ImageBlock, { data: { mediaId: KEY }, ctx: { ...ctx(), preview: true } }))).toContain(PLACEHOLDER_TEXT);
    expect(html(h(GalleryBlock, { data: { mediaIds: [KEY] }, ctx: ctx() }))).toBe('');
    const doc = { ...PHOTO, kind: 'document' as const, mime: 'application/pdf' };
    expect(html(h(ImageBlock, { data: { mediaId: KEY }, ctx: ctx({ [KEY]: doc }) }))).not.toContain('<img');
    const gallery = html(h(GalleryBlock, { data: { mediaIds: [KEY], title: 'Fotos' }, ctx: ctx({ [KEY]: PHOTO }) }));
    expect(gallery).toContain('La cuadrilla de la mañana');
    expect(gallery).toContain('(Prensa)');
  });

  it('llamado a la acción y botones: solo con un enlace permitido', () => {
    expect(html(h(SafeButton, { href: 'javascript:alert(1)', label: 'Clic' }))).toBe('');
    const cta = html(h(CtaBlock, { data: { title: 'Participa', label: 'Hacer un reporte', href: '/atencion/nueva?tipo=reporte' }, ctx: ctx() }));
    expect(cta).toContain('href="/atencion/nueva?tipo=reporte"');
    expect(html(h(TextBlock, { data: { title: 'Sobre', content: [{ type: 'paragraph', text: 'Hola' }] }, ctx: ctx() }))).toContain('<h2');
  });

  it('opensWithHero: el primer bloque visible', () => {
    const b = (type: string, visible = true) => ({ id: type, type, visible, data: {} }) as unknown as Block;
    expect(opensWithHero([b('hero', false), b('text')])).toBe(false);
    expect(opensWithHero([b('hero')])).toBe(true);
  });
});

const item = <K extends WebItem['kind']>(kind: K, data: unknown, id = `${kind}-1`): WebItem<K> =>
  ({ id, kind, slug: id, data, media: {}, version: 1, publishedAt: '2026-11-01T12:00:00.000Z', liveSince: '2026-11-01T12:00:00.000Z', municipalityId: null, category: null, state: null, date: null }) as unknown as WebItem<K>;

describe('las reglas de los datos', () => {
  it('un indicador sin fuente no se muestra; con fuente, con su fuente', () => {
    const out = html(h(IndicatorsView, {
      items: [
        item('indicator', { title: 'Viviendas entregadas', value: 1250, unit: 'viviendas', source: { label: 'Informe de vivienda' }, asOf: '2026-11-01' }, 'a'),
        item('indicator', { title: 'Sin fuente', value: 99, source: null }, 'b'),
      ],
    }));
    expect(out).toContain('1.250');
    expect(out).toContain('Fuente: Informe de vivienda');
    expect(out).not.toContain('Sin fuente');
    expect(html(h(IndicatorsView, { items: [item('indicator', { title: 'X', value: 1, source: null })] }))).toBe('');
  });

  it('una cifra que cuenta la plataforma lleva a su lista; una escrita a mano no lleva a ninguna parte', () => {
    expect(indicatorListHref('projects_concluded')).toBe('/gestion?estado=concluido');
    expect(indicatorListHref('attended_requests')).toBe('/atencion/atendido');
    expect(indicatorListHref(null)).toBeNull();
    const counted = html(h(IndicatorsView, { items: [item('indicator', { title: 'Obras concluidas', value: 42, source: { label: 'Gestión' }, computedFrom: 'projects_concluded' }, 'c')] }));
    expect(counted).toContain('href="/gestion?estado=concluido"');
    expect(counted).toContain('Ver la lista');
    const manual = html(h(IndicatorsView, { items: [item('indicator', { title: 'Prótesis', value: 320, source: { label: 'Informe' } }, 'd')] }));
    expect(manual).not.toContain('Ver la lista');
  });

  it('un aviso vencido no sale; uno vigente dice cuándo se actualizó y hasta cuándo', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const notice = (title: string, expiresAt: string | null) =>
      item('notice', { title, body: 'Detalle', category: 'agua', municipalityIds: [], updatedAt: '2026-11-05T13:00:00Z', expiresAt }, title);
    const out = html(h(NoticesView, { items: [notice('Vigente', '2026-11-09T22:00:00Z'), notice('Vencido', '2026-11-01T22:00:00Z'), notice('Sin fin', null)], munis: new Map(), now }));
    expect(out).toContain('Vigente');
    expect(out).toContain('Sin fin');
    expect(out).not.toContain('Vencido');
    expect(out).toContain('Actualizado el');
    expect(out).toContain('Vigente hasta el');
    expect(out).toContain('Sin fecha de fin');
    expect(out).toContain('Todo el estado');
  });

  it('lo atendido: el resumen, el municipio y las iniciales; ningún otro dato', () => {
    const a: AttendedItem = { id: 'x', type: 'reporte', categoryId: 'c', municipalityId: 'm', summary: 'Se cambió el poste (demo).', displayName: 'V. P.', resolvedOn: '2026-10-23', publishedAt: '2026-10-24T10:00:00Z' };
    const out = html(h(AttendedView, { items: [a], names: { munis: new Map([['m', 'Lobatera']]), categories: new Map([['c', 'Electricidad']]) } }));
    expect(out).toContain('Se cambió el poste (demo).');
    expect(out).toContain('Lobatera');
    expect(out).toMatch(/V\. P\.<\/span> · Lobatera · Resuelto el <time dateTime="2026-10-23">23 de octubre de 2026<\/time>/);
    expect(out).not.toContain('—');
    expect(out).toContain('Atendido · Reporte · Electricidad');
    expect(Object.keys(a).sort()).toEqual(['categoryId', 'displayName', 'id', 'municipalityId', 'publishedAt', 'resolvedOn', 'summary', 'type']);
  });

  it('las preguntas frecuentes en su orden, con la respuesta escapada', () => {
    const out = html(h(FaqView, {
      items: [
        item('faq', { title: 'Segunda', category: 'atencion', answer: [{ type: 'paragraph', text: EVIL }], order: 2 }, 'b'),
        item('faq', { title: 'Primera', category: 'atencion', answer: [{ type: 'paragraph', text: 'Sí' }], order: 1 }, 'a'),
      ],
    }));
    expect(out.indexOf('Primera')).toBeLessThan(out.indexOf('Segunda'));
    expect(out).not.toContain('<script');
    expect(out).toContain('<details');
  });

  it('las cifras públicas: con su definición; las denuncias nunca por lugar ni por tema', () => {
    const out = html(h(StatsView, {
      stats: {
        from: '2000-01-01', to: '2026-11-06', received: 58, resolved: 16, pending: 39, overdue: 5, avgFirstResponseHours: 3, avgResolutionHours: 96,
        byType: { reporte: 23, denuncia: 8 }, byState: { recibido: 11 }, byCategory: [{ id: 'c', name: 'Vialidad', count: 8 }], byMunicipality: [{ id: 'm', name: 'Junín', count: 5 }],
      },
    }));
    expect(out).toContain('Desde el inicio hasta el 6 de noviembre de 2026.');
    expect(out).toContain('Por categoría (sin denuncias)');
    expect(out).toContain('4 días');
    expect(STAT_DEFINITIONS.map((d) => d.term)).toEqual(expect.arrayContaining(['Recibidas', 'Resueltas', 'Pendientes', 'Vencidas']));
  });
});

// F1: what is still missing never reaches the public. Every piece of scaffolding the site can draw, and where it may
// still appear (only in the administrator's preview, /admin/web/vista-previa, which passes `preview`).
const SCAFFOLDING = [/Por completar/i, new RegExp(PLACEHOLDER_TEXT), /Video por enlazar/, /Imagen del episodio por subir/, /Archivo por subir/, /versión \d/];
const scaffoldIn = (out: string) => SCAFFOLDING.filter((re) => re.test(out)).map(String);

const parsed = <K extends 'news' | 'project' | 'document'>(kind: K, data: unknown) => {
  const r = parseSnapshot(kind, data);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const news = (extra: Record<string, unknown> = {}) =>
  ({ ...item('news', parsed('news', { title: 'Nota (prueba)', category: 'noticia', date: '2026-11-02', body: [{ type: 'paragraph', text: 'Texto (prueba).' }], ...extra }), 'nota-prueba'), date: '2026-11-02' }) as WebItem<'news'>;

describe('el andamio no llega al público (F1)', () => {
  it('el texto: sin espacios «por completar» ni títulos que se quedan sin nada debajo', () => {
    const nodes: TextNode[] = [
      { type: 'heading', level: 2, text: 'Biografía' },
      { type: 'pending', text: 'Por completar: la biografía.' },
      { type: 'heading', level: 2, text: 'Trayectoria' },
      { type: 'heading', level: 3, text: 'Cargos' },
      { type: 'paragraph', text: 'Un cargo (prueba).' },
      { type: 'heading', level: 2, text: 'Al final' },
    ];
    expect(publicNodes(nodes).map((n) => (n.type === 'heading' || n.type === 'paragraph' ? n.text : n.type))).toEqual(['Trayectoria', 'Cargos', 'Un cargo (prueba).']);
    const onlyPending: TextNode[] = [nodes[0], nodes[1]];
    expect(html(h(TextBlock, { data: { title: 'Biografía', content: onlyPending }, ctx: ctx() }))).toBe('');
    const preview = html(h(TextBlock, { data: { title: 'Biografía', content: onlyPending }, ctx: { ...ctx(), preview: true } }));
    // The slot says «Por completar» once, not «Por completar · Por completar: …».
    expect(preview).toContain('Por completar · </span>la biografía.');
    expect(preview.match(/Por completar/g)).toHaveLength(1);
  });

  it('el video: sin código no hay marco; con código y sin imagen, el botón sobre un fondo liso', () => {
    expect(html(h(VideoFrame, { youtubeId: null, title: 'Emisión (prueba)', poster: null }))).toBe('');
    const bare = html(h(VideoFrame, { youtubeId: 'Abc_def-123', title: 'Emisión (prueba)', poster: null }));
    expect(bare).toContain('Ver el video');
    expect(scaffoldIn(bare)).toEqual([]);
    expect(html(h(VideoFrame, { youtubeId: null, title: 'Emisión (prueba)', poster: null, preview: true }))).toContain('Video por enlazar desde el administrador');
    expect(html(h(VideoFrame, { youtubeId: 'Abc_def-123', title: 'Emisión (prueba)', poster: null, preview: true }))).toContain('Imagen del episodio por subir');
  });

  it('un documento sin su archivo: la fila sin botón; la vista previa dice que falta', () => {
    const doc = item('document', parsed('document', { title: 'Informe (prueba)', category: 'informe', date: '2026-11-01', fileId: null }), 'informe-prueba');
    const pub = html(h(DocumentRow, { item: doc }));
    expect(pub).toContain('Informe (prueba)');
    expect(pub).not.toContain('Ver el PDF');
    expect(scaffoldIn(pub)).toEqual([]);
    expect(html(h(DocumentRow, { item: doc, preview: true }))).toContain('Archivo por subir');
    // With a cover (the Semanario's front page), the cover instead of the icon.
    const withCover = html(h(DocumentRow, { item: { ...doc, data: { ...doc.data, coverId: KEY }, media: { [KEY]: PHOTO } } }));
    expect(withCover).toContain('alt="Cuadrilla en la avenida"');
  });

  it('una noticia sin foto: la tarjeta destacada sin marco vacío y la nota sin espacio de foto', () => {
    const n = news({ body: [{ type: 'paragraph', text: 'Texto (prueba).' }, { type: 'pending', text: 'Por completar: el cierre.' }] });
    const feature = html(h(NewsFeature, { item: n }));
    expect(feature).toContain('Nota (prueba)');
    expect(feature).not.toContain('md:grid-cols-2');
    expect(scaffoldIn(feature)).toEqual([]);
    expect(html(h(NewsFeature, { item: n, preview: true }))).toContain(PLACEHOLDER_TEXT);
    expect(scaffoldIn(html(h(NewsCard, { item: n, withPhoto: true })))).toEqual([]);
    const article = html(h(NewsArticle, { item: n, site, munis: new Map(), related: [] }));
    expect(article).toContain('<h1');
    expect(article).toContain('Texto (prueba).');
    expect(scaffoldIn(article)).toEqual([]);
    const previewed = html(h(NewsArticle, { item: n, site, munis: new Map(), related: [], preview: true }));
    expect(scaffoldIn(previewed)).toEqual([String(SCAFFOLDING[0]), String(SCAFFOLDING[1])]);
  });

  it('una obra sin foto ni descripción: la ficha sin marco vacío ni «se publica pronto»', () => {
    const p = item('project', parsed('project', { title: 'Obra (prueba)', category: 'vialidad', state: 'en_ejecucion', municipalityId: null, date: '2026-11-01' }), 'obra-prueba');
    const out = html(h(ProjectFicha, { item: p, munis: new Map(), related: [] }));
    expect(out).toContain('Obra (prueba)');
    expect(out).not.toContain('Descripción');
    expect(out).not.toContain('se publica pronto');
    expect(scaffoldIn(out)).toEqual([]);
    expect(html(h(ProjectFicha, { item: p, munis: new Map(), related: [], preview: true }))).toContain(PLACEHOLDER_TEXT);
  });

  it('el antetítulo de una noticia es su primer tema (las secciones del sitio oficial), si no su tipo', () => {
    expect(newsLabel(newsSnapshot.parse({ title: 'x', category: 'noticia', topics: ['Táchira', 'Deportes'] }))).toBe('Táchira');
    expect(newsLabel(newsSnapshot.parse({ title: 'x', category: 'articulo', topics: ['opinión'] }))).toBe('Opinión');
    expect(newsLabel(newsSnapshot.parse({ title: 'x', category: 'comunicado' }))).toBe('Comunicado');
    expect(html(h(NewsCard, { item: news({ topics: ['Salud'] }) }))).toMatch(/>Salud · <time/);
    // Topics as links to the news search (the news page); plain chips elsewhere.
    expect(html(h(Topics, { topics: ['Táchira'], linked: true }))).toContain('href="/actualidad?q=T%C3%A1chira"');
    expect(html(h(Topics, { topics: ['vialidad'] }))).toContain('Vialidad');
  });
});

describe('el marco de la web', () => {
  it('el aviso de la versión de prueba, fijo', () => {
    expect(html(h(DemoBanner, { text: site.demoBanner }))).toContain('Versión de prueba. El contenido es de ejemplo.');
  });

  it('las páginas llegan enteras: sin loading.tsx (un esqueleto escondería el contenido a quien no tiene JavaScript); la carga es la barra de arriba', () => {
    const web = path.join(process.cwd(), 'src', 'app', '(web)');
    expect(fs.existsSync(path.join(web, 'loading.tsx'))).toBe(false);
    const chrome = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'web', 'public-chrome.tsx'), 'utf8');
    expect(chrome).toMatch(/<Suspense fallback=\{null\}>\s*<NavProgress \/>\s*<\/Suspense>/);
  });

  it('la cabecera: el nombre en letras, las dos acciones a la vista y el menú del teléfono nativo (abre al primer toque)', () => {
    const out = html(h(SiteHeader, { site }));
    expect(out).toContain(site.name);
    expect(out.match(/href="\/atencion\/nueva\?tipo=reporte"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out.match(/href="\/atencion\/consultar"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).toMatch(/<details[^>]*>\s*<summary/);
    expect(out).toContain('Menú');
    for (const n of site.navigation) expect(out).toContain(`href="${n.path}"`);
    expect(out).not.toMatch(/<img|logo/i);
  });

  it('los canales: el del programa primero, cada uno una vez, los que no están verificados marcados «sin verificar»', () => {
    const list = orderedChannels(site);
    expect(list[0].url).toBe('https://www.youtube.com/@FreddyBernal.oficial');
    expect(new Set(list.map((c) => c.url)).size).toBe(list.length);
    const out = html(h(ChannelPills, { channels: list }));
    expect(out.match(/sin verificar/g)?.length).toBe(list.length);
    expect(out).not.toContain('por confirmar');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('un enlace a otro sitio: el icono va pegado a la última palabra (nunca solo en una línea del teléfono)', () => {
    const out = html(h(ExternalText, { text: 'Canal de YouTube @canal.prueba' }));
    expect(out).toMatch(/^<span>Canal de YouTube <span class="whitespace-nowrap">@canal\.prueba<svg[^>]*aria-hidden="true"/);
    expect(out.replace(/<[^>]+>/g, '')).toBe('Canal de YouTube @canal.prueba');
    expect(html(h(ExternalText, { text: ' Portal ' }))).toMatch(/^<span><span class="whitespace-nowrap">Portal<svg/);
  });

  it('los accesos de participación: el reporte en naranja, los cuatro tipos y el aviso de emergencias', () => {
    const out = html(h(ParticipationActions, { title: 'Atención ciudadana', emergencyNotice: site.emergencyNotice }));
    for (const href of ['/atencion/nueva?tipo=reporte', '/atencion/nueva?tipo=peticion', '/atencion/nueva?tipo=acotacion', '/atencion/nueva?tipo=denuncia', '/atencion/consultar']) {
      expect(out, href).toContain(`href="${href}"`);
    }
    expect(out).toContain('bg-action');
    expect(out).toMatch(/no es un servicio de emergencias/i);
  });
});

describe('nada de HTML crudo en la web pública', () => {
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));

  it('dangerouslySetInnerHTML solo en json-ld.tsx (datos escapados, nunca contenido)', () => {
    const offenders = [...files(path.join('src', 'components', 'web')), ...files(path.join('src', 'app', '(web)'))]
      .filter((f) => /dangerouslySetInnerHTML\s*=/.test(fs.readFileSync(f, 'utf8')))
      .filter((f) => !f.endsWith(path.join('components', 'web', 'json-ld.tsx')));
    expect(offenders).toEqual([]);
  });

  it('los componentes de cliente de la web no traen librerías pesadas (ni iconos ni clases combinadas)', () => {
    const client = files(path.join('src', 'components', 'web')).filter((f) => /^['"]use client['"]/.test(fs.readFileSync(f, 'utf8').trimStart()));
    expect(client.length).toBeGreaterThan(0);
    for (const f of client) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^import [^;]*from '(lucide-react|@\/lib\/cn|tailwind-merge|clsx|next\/image)';/m);
    }
  });
});
