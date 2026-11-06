// The importer's mapping of an old post (scripts/web-import/mapping.ts) and of its photos (media.ts), with invented
// posts of an invented site: title, the day in the Táchira, our type and topics, the address, the excerpt only when
// someone wrote it, the old addresses and where they go, the size of a photo and its alternative text.
import { describe, it, expect } from 'vitest';
import { newsSnapshot } from '@/lib/web/schema';
import { ALT_PLACEHOLDER, REMOVED_MARKS } from '@/lib/web/import-marks';
import {
  categoryTarget, cutWords, draftOf, gmtIso, oldPathOf, ourSlug, planPost, postTarget, slugWithId, tagTarget, type WpPost, type WpTerm,
} from '../../scripts/web-import/mapping';
import { chooseSize, fetchPhoto, originalPath, uploadsPath, wantFromImage, wantFromWp, type WpMedia } from '../../scripts/web-import/media';
import { pngOf } from './fixtures/web-png';

const HOSTS = ['sitio-viejo.test', 'www.sitio-viejo.test'];
const term = (id: number, slug: string, name: string): WpTerm => ({ id, slug, name, link: `https://sitio-viejo.test/categoria/${slug}/` });
const CATS = new Map<number, WpTerm>([
  [1, term(1, 'tachira', 'Táchira')], [2, term(2, 'opinion', 'Opinión')], [3, term(3, 'biografia', 'BIOGRAFÍA')],
  [4, term(4, 'noticias', 'Noticias')], [5, term(5, 'cultura-inventada', 'Cultura &amp; artes')], [6, term(6, 'informativo', 'el informativo')],
]);
const ctx = { categories: CATS, ownHosts: HOSTS, tz: 'America/Caracas' };

function post(over: Partial<WpPost> = {}): WpPost {
  return {
    id: 101,
    date: '2026-03-01T23:30:00',
    date_gmt: '2026-03-02T03:30:00',
    modified: '2026-03-05T10:00:00',
    modified_gmt: '2026-03-05T14:00:00',
    slug: 'una-nota-inventada',
    status: 'publish',
    type: 'post',
    link: 'http://www.sitio-viejo.test/2026/03/una-nota-inventada/',
    title: { rendered: 'Una nota &#8220;inventada&#8221; para la prueba' },
    content: { rendered: '<h3>Una nota “inventada” para la prueba</h3><p>Primer párrafo de la nota de prueba, con varias palabras.</p><p>Segundo.</p>' },
    excerpt: { rendered: '<p>Primer párrafo de la nota de prueba, con varias palabras. [&hellip;]</p>' },
    featured_media: 0,
    categories: [1],
    tags: [10, 11],
    yoast_head_json: { author: 'Persona Inventada', description: 'Descripción de Yoast para la nota inventada.' },
    ...over,
  };
}

describe('un artículo viejo → su borrador', () => {
  it('título, día en el Táchira, tipo y temas, firma, dirección y descripción; el título repetido arriba se va', () => {
    const p = planPost(post(), ctx);
    expect(p).toMatchObject({
      sourceId: 101,
      sourceUrl: 'https://www.sitio-viejo.test/2026/03/una-nota-inventada/',
      oldPath: '/2026/03/una-nota-inventada',
      monthPath: '/2026/03',
      slug: 'una-nota-inventada',
      target: '/actualidad/una-nota-inventada',
      title: 'Una nota “inventada” para la prueba',
      date: '2026-03-01',
      publishedAt: '2026-03-02T03:30:00.000Z',
      modifiedAt: '2026-03-05T14:00:00.000Z',
      category: 'noticia',
      topics: ['Táchira'],
      author: 'Persona Inventada',
      seoDescription: 'Descripción de Yoast para la nota inventada.',
      refused: null,
    });
    // WordPress's automatic excerpt (the first words) is not kept: it would repeat the first paragraph.
    expect(p.excerpt).toBeUndefined();
    expect(p.body).toEqual([{ type: 'paragraph', text: 'Primer párrafo de la nota de prueba, con varias palabras.' }, { type: 'paragraph', text: 'Segundo.' }]);
    const draft = draftOf(p, { coverId: null, galleryIds: [] });
    expect(newsSnapshot.safeParse(draft).success).toBe(true);
    expect(draft).toMatchObject({ title: p.title, date: '2026-03-01', category: 'noticia', body: p.body, municipalityId: null, youtubeId: null, seo: { description: p.seoDescription } });
  });

  it('el tipo más fuerte de sus categorías (opinión → artículo, el informativo → comunicado); una desconocida es un tema', () => {
    expect(planPost(post({ categories: [1, 2] }), ctx)).toMatchObject({ category: 'articulo', topics: ['Táchira', 'Opinión'] });
    expect(planPost(post({ categories: [6] }), ctx)).toMatchObject({ category: 'comunicado', topics: [] });
    expect(planPost(post({ categories: [4, 5] }), ctx)).toMatchObject({ category: 'noticia', topics: ['Cultura & artes'] });
    // The 2014 biography goes to /gobernador.
    expect(planPost(post({ categories: [3] }), ctx).target).toBe('/gobernador');
  });

  it('un extracto escrito a mano se queda; sin Yoast, la descripción sale del texto', () => {
    const p = planPost(post({ excerpt: { rendered: '<p>Un resumen escrito por alguien.</p>' }, yoast_head_json: null }), ctx);
    expect(p.excerpt).toBe('Un resumen escrito por alguien.');
    expect(p.seoDescription).toBe('Primer párrafo de la nota de prueba, con varias palabras. Segundo.');
    expect(p.author).toBeUndefined();
  });

  it('direcciones: un número sale del título, los acentos y el %xx se limpian, «semanario» no choca con la página', () => {
    expect(ourSlug('3911', 'Título de la nota')).toEqual({ slug: 'titulo-de-la-nota', changed: false, numeric: true });
    expect(ourSlug('se%c3%b1al-de-prueba', 'x')).toEqual({ slug: 'senal-de-prueba', changed: true, numeric: false });
    expect(ourSlug('doble--guion-', 'x').slug).toBe('doble-guion');
    expect(ourSlug('semanario', 'x').slug).toBe('semanario-nota');
    // At most 120, cut at a dash when one is far enough.
    expect(ourSlug('a'.repeat(70) + '-' + 'b'.repeat(60), 'x').slug).toBe('a'.repeat(70));
    expect(ourSlug('a'.repeat(50) + '-' + 'b'.repeat(90), 'x').slug).toHaveLength(120);
    expect(slugWithId('una-nota', 101)).toBe('una-nota-101');
    expect(slugWithId('x'.repeat(120), 7)).toHaveLength(120);
    const p = planPost(post({ slug: '3911', link: 'https://sitio-viejo.test/2019/09/3911/' }), ctx);
    expect(p.slug).toBe('una-nota-inventada-para-la-prueba');
    expect(p.flags.has('numeric_slug')).toBe(true);
  });

  it('sin título, uno provisional; uno largo, cortado; datos personales del título y del extracto, fuera', () => {
    expect(planPost(post({ title: { rendered: '' } }), ctx)).toMatchObject({ title: 'Nota del 01/03/2026' });
    expect(planPost(post({ title: { rendered: '' } }), ctx).flags.has('title_missing')).toBe(true);
    const long = planPost(post({ title: { rendered: 'palabra '.repeat(40) } }), ctx);
    expect(long.title.length).toBeLessThanOrEqual(160);
    expect(long.flags.has('title_truncated')).toBe(true);
    const pii = planPost(post({ title: { rendered: 'Concurso: escribe a premio@correo.test' }, excerpt: { rendered: 'Llama al 0414-555.01.99' } }), ctx);
    expect(pii.title).toBe(`Concurso: escribe a ${REMOVED_MARKS.email}`);
    expect(pii.excerpt).toBe(`Llama al ${REMOVED_MARKS.phone}`);
    expect([...pii.flags]).toEqual(expect.arrayContaining(['email_removed', 'phone_removed']));
  });

  it('lo que no se importa: con contraseña o sin publicar', () => {
    expect(planPost(post({ content: { rendered: '', protected: true } }), ctx).refused).toMatch(/contraseña/);
    expect(planPost(post({ status: 'draft' }), ctx).refused).toMatch(/no está publicado/);
  });

  it('las direcciones viejas y adónde van', () => {
    expect(oldPathOf('https://www.sitio-viejo.test/categoria/salud/', HOSTS)).toBe('/categoria/salud');
    expect(oldPathOf('https://otro.test/x/', HOSTS)).toBeNull();
    expect(categoryTarget(term(9, 'salud', 'Salud'))).toBe('/actualidad?q=salud');
    expect(categoryTarget(term(9, 'opinion', 'Opinión'))).toBe('/actualidad?categoria=articulo');
    expect(categoryTarget(term(9, 'biografia', 'Biografía'))).toBe('/gobernador');
    expect(categoryTarget(term(9, 'nueva', 'Nueva Categoría'))).toBe('/actualidad?q=Nueva%20Categor%C3%ADa');
    expect(tagTarget({ id: 1, slug: 'agua-potable', name: 'Agua potable!', link: '' })).toBe('/actualidad?q=Agua%20potable');
    expect(postTarget(planPost(post(), ctx), 'una-nota-inventada-101')).toBe('/actualidad/una-nota-inventada-101');
    expect(gmtIso('0000-00-00T00:00:00')).toBeNull();
    expect(cutWords('uno dos tres cuatro', 12)).toBe('uno dos…');
  });
});

describe('las fotos', () => {
  const media = (over: Partial<WpMedia> = {}): WpMedia => ({
    id: 77,
    source_url: 'http://sitio-viejo.test/wp-content/uploads/2026/03/foto-scaled.jpg',
    alt_text: '',
    caption: { rendered: '' },
    media_details: {
      width: 2560, height: 1920, filesize: 600_000,
      sizes: {
        thumbnail: { source_url: 'https://sitio-viejo.test/wp-content/uploads/2026/03/foto-150x150.jpg', width: 150, height: 150 },
        large: { source_url: 'https://sitio-viejo.test/wp-content/uploads/2026/03/foto-1024x768.jpg', width: 1024, height: 768, filesize: 130_000 },
        '2048x2048': { source_url: 'https://sitio-viejo.test/wp-content/uploads/2026/03/foto-2048x1536.jpg', width: 2048, height: 1536, filesize: 380_000 },
        crop: { source_url: 'https://sitio-viejo.test/wp-content/uploads/2026/03/foto-1296x700.jpg', width: 1296, height: 700 },
      },
    },
    ...over,
  });

  it('el tamaño más grande con las mismas proporciones que cabe; nunca un recorte; el original si ya es pequeño', () => {
    expect(chooseSize(media(), 2048).url).toMatch(/foto-2048x1536\.jpg$/);
    expect(chooseSize(media(), 1600).url).toMatch(/foto-1024x768\.jpg$/);
    expect(chooseSize(media({ media_details: { width: 1200, height: 800 } }), 2048).url).toMatch(/foto-scaled\.jpg$/);
  });

  it('la dirección vieja del original (la que redirige) y lo que es de otra página', () => {
    expect(originalPath('/wp-content/uploads/2026/03/foto-1024x768.jpg')).toBe('/wp-content/uploads/2026/03/foto.jpg');
    expect(originalPath('/wp-content/uploads/2026/03/foto-scaled.jpg')).toBe('/wp-content/uploads/2026/03/foto.jpg');
    expect(originalPath('/wp-content/uploads/2026/03/foto-e1612345678901.png')).toBe('/wp-content/uploads/2026/03/foto.png');
    expect(uploadsPath('https://cdn.otro.test/wp-content/uploads/x.jpg', HOSTS)).toBeNull();
    const w = wantFromWp(media(), HOSTS, 2048);
    expect(w).toMatchObject({ key: 'id:77', oldPath: '/wp-content/uploads/2026/03/foto.jpg', external: false, bytes: 380_000, fallbackUrl: 'https://sitio-viejo.test/wp-content/uploads/2026/03/foto-scaled.jpg' });
  });

  it('texto alternativo: el de WordPress, o el pie, o el del artículo; si no hay, «[Por escribir]» (y sin datos personales)', () => {
    expect(wantFromWp(media({ alt_text: 'Una plaza con árboles (prueba)' }), HOSTS, 2048)).toMatchObject({ alt: 'Una plaza con árboles (prueba)', altMissing: false });
    expect(wantFromWp(media({ caption: { rendered: '<p>Pie con <b>negrita</b></p>' } }), HOSTS, 2048)).toMatchObject({ alt: 'Pie con negrita', caption: 'Pie con negrita' });
    expect(wantFromWp(media(), HOSTS, 2048, { alt: 'Del artículo (prueba)' }).alt).toBe('Del artículo (prueba)');
    expect(wantFromWp(media(), HOSTS, 2048)).toMatchObject({ alt: ALT_PLACEHOLDER, altMissing: true });
    const pii = wantFromWp(media({ caption: { rendered: 'Foto: persona@correo.test' } }), HOSTS, 2048);
    expect(pii.caption).toBe(`Foto: ${REMOVED_MARKS.email}`);
    expect(pii.alt).toBe(`Foto: ${REMOVED_MARKS.email}`);
    expect(pii.pii.emails).toBe(1);
  });

  it('una foto sin id: su original primero (o el enlace a él), con la clave del sitio principal; de otra página no se baja', () => {
    const own = wantFromImage({ src: 'https://www.sitio-viejo.test/wp-content/uploads/2020/01/otra-1024x683.jpg', alt: '', caption: '', attachmentId: null, linkHref: '/wp-content/uploads/2020/01/otra.jpg' }, HOSTS);
    expect(own).toMatchObject({
      key: 'url:https://sitio-viejo.test/wp-content/uploads/2020/01/otra.jpg',
      url: 'https://sitio-viejo.test/wp-content/uploads/2020/01/otra.jpg',
      fallbackUrl: 'https://www.sitio-viejo.test/wp-content/uploads/2020/01/otra-1024x683.jpg',
      oldPath: '/wp-content/uploads/2020/01/otra.jpg',
      external: false,
    });
    expect(wantFromImage({ src: 'https://cdn.otro.test/foto.jpg', alt: '', caption: '', attachmentId: null, linkHref: null }, HOSTS).external).toBe(true);
  });

  it('bajar y revisar como una subida del equipo: una foto buena, un GIF, una muy pequeña, una que no está (se prueba la otra dirección)', async () => {
    const files = new Map<string, Uint8Array>([
      ['https://sitio-viejo.test/buena.png', pngOf(320, 200)],
      ['https://sitio-viejo.test/anim.gif', new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0])],
      ['https://sitio-viejo.test/mini.png', pngOf(40, 40)],
    ]);
    const http = { bytes: async (url: string) => files.get(url) ?? null };
    const want = (url: string, fallbackUrl: string | null = null) => ({ ...wantFromImage({ src: url, alt: '', caption: '', attachmentId: null, linkHref: null }, HOSTS), url, fallbackUrl });
    const ok = await fetchPhoto(http, want('https://sitio-viejo.test/buena.png'));
    expect(ok).toMatchObject({ ok: true, mime: 'image/png', ext: 'png', width: 320, height: 200 });
    expect(ok.ok && ok.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await fetchPhoto(http, want('https://sitio-viejo.test/anim.gif'))).toEqual({ ok: false, reason: 'unsupported' });
    expect(await fetchPhoto(http, want('https://sitio-viejo.test/mini.png'))).toEqual({ ok: false, reason: 'too_small' });
    expect(await fetchPhoto(http, want('https://sitio-viejo.test/no-esta.png'))).toEqual({ ok: false, reason: 'missing' });
    expect(await fetchPhoto(http, want('https://sitio-viejo.test/no-esta.png', 'https://sitio-viejo.test/buena.png'))).toMatchObject({ ok: true, width: 320 });
  });
});
