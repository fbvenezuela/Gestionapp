// What the official site's texts become in the demo (scripts/real-site/text.ts, news.ts, build.ts identityFrom), on
// invented texts: whole sentences out where the importer left a removal mark (never a word), the biography's
// «actualmente», the alternative texts of the photos, the site's name and tagline. Everything here is made up (demo).
import { describe, expect, it } from 'vitest';
import type { TextNode } from '@/lib/web/blocks';
import { REMOVED_MARKS } from '@/lib/web/import-marks';
import { taglineWithoutName } from '@/lib/web/real-site';
import { wantFromImage, wantFromWp, type PhotoWant } from '../../scripts/web-import/media';
import type { WpPost, WpTerm } from '../../scripts/web-import/mapping';
import { identityFrom } from '../../scripts/real-site/build';
import { altFor, biographyOf, captionFor, listsFromDashes, looksLikeFileName, newsDraft, officeLeadOf, photoWants, planNews } from '../../scripts/real-site/news';
import { dropSentences, dropSentencesInNodes, dropSentencesInRuns, hasRemovalMark, sentenceRanges } from '../../scripts/real-site/text';

const HOSTS = ['sitio-oficial.test', 'www.sitio-oficial.test'];
const CATS = new Map<number, WpTerm>([
  [11, { id: 11, slug: 'tachira', name: 'Región (demo)', link: 'https://sitio-oficial.test/categoria/tachira/' }],
  [13, { id: 13, slug: 'opinion', name: 'Opinión (demo)', link: 'https://sitio-oficial.test/categoria/opinion/' }],
]);
const ctx = { categories: CATS, ownHosts: HOSTS, tz: 'America/Caracas' };
const post = (over: Partial<WpPost> = {}): WpPost => ({
  id: 501, date: '2026-10-30T09:00:00', date_gmt: '2026-10-30T13:00:00', modified: '2026-10-30T09:00:00', modified_gmt: '2026-10-30T13:00:00',
  slug: 'nota-de-prueba-demo', status: 'publish', type: 'post', link: 'https://sitio-oficial.test/2026/10/nota-de-prueba-demo/',
  title: { rendered: 'Nota de prueba (demo)' }, content: { rendered: '<p>Texto inventado (demo).</p>' }, excerpt: { rendered: '' },
  featured_media: 0, categories: [11], tags: [], ...over,
});
const mark = REMOVED_MARKS;

describe('frases fuera, nunca palabras', () => {
  it('parte en frases sin cortar en «Dr.», «Av.», «N°», iniciales ni cifras', () => {
    const text = 'El Dr. Prueba habló en la Av. Principal. Llegaron 3.500 personas (demo). La J. Pérez Demo firmó el acta N° 12. ¿Quién sigue? Nadie.';
    const parts = sentenceRanges(text).map(([a, b]) => text.slice(a, b).trim());
    expect(parts).toEqual(['El Dr. Prueba habló en la Av. Principal.', 'Llegaron 3.500 personas (demo).', 'La J. Pérez Demo firmó el acta N° 12.', '¿Quién sigue?', 'Nadie.']);
  });

  it('la frase con una marca de datos retirados se va entera; las demás quedan como estaban', () => {
    const t = `Abrió la inscripción (demo). Para participar, escribir a ${mark.email} o llamar al ${mark.phone}. El acto es el lunes (demo).`;
    expect(dropSentences(t, hasRemovalMark)).toBe('Abrió la inscripción (demo). El acto es el lunes (demo).');
    expect(dropSentences('Sin datos de nadie (demo).', hasRemovalMark)).toBe('Sin datos de nadie (demo).');
    expect(dropSentences(`Solo esto: ${mark.id}.`, hasRemovalMark)).toBe('');
  });

  it('en un párrafo con estilos, aunque la frase cruce de un pedazo a otro', () => {
    const runs = [{ text: 'Primera frase ', bold: true }, { text: '(demo). Segunda con ' }, { text: mark.phone, bold: true }, { text: ' al final. Tercera (demo).' }];
    expect(dropSentencesInRuns(runs, hasRemovalMark)).toEqual([{ text: 'Primera frase ', bold: true }, { text: '(demo). Tercera (demo).' }]);
    expect(dropSentencesInRuns([{ text: `Todo ${mark.email}.` }], hasRemovalMark)).toEqual([]);
  });

  it('un título, un elemento de lista o el autor de una cita con una marca se van; un nodo vacío también', () => {
    const nodes: TextNode[] = [
      { type: 'heading', level: 2, text: `Contacto ${mark.phone}` },
      { type: 'paragraph', text: `Escriba a ${mark.email}.` },
      { type: 'list', items: ['Primero (demo)', `Segundo ${mark.id}`, [{ text: 'Tercero (demo)', bold: true }]] },
      { type: 'quote', text: 'Una cita inventada (demo).', cite: `Vocera ${mark.phone}` },
      { type: 'pending', text: 'Por completar (demo)' },
    ];
    expect(dropSentencesInNodes(nodes, hasRemovalMark)).toEqual([
      { type: 'list', items: ['Primero (demo)', [{ text: 'Tercero (demo)', bold: true }]] },
      { type: 'quote', text: 'Una cita inventada (demo).' },
      { type: 'pending', text: 'Por completar (demo)' },
    ]);
  });
});

describe('una nota de la web oficial', () => {
  it('como la planifica el importador, sin datos personales, sin autor y con su fuente', () => {
    const r = planNews(
      post({
        content: { rendered: '<p>Se inauguró una plaza inventada (demo). Informes al 0414-555-0199, de lunes a viernes. La plaza abre de día (demo).</p>' },
        yoast_head_json: { author: 'Usuario Demo', description: 'Una plaza inventada (demo). Correo: info.demo@correo.test para dudas.' },
      }),
      ctx,
    );
    expect('plan' in r).toBe(true);
    if (!('plan' in r)) return;
    const draft = newsDraft(r.plan, { coverId: null, galleryIds: [] }, 'sitio-oficial.test');
    expect(draft).toMatchObject({ title: 'Nota de prueba (demo)', category: 'noticia', topics: ['Táchira'], sources: [{ label: 'sitio-oficial.test', url: 'https://sitio-oficial.test/2026/10/nota-de-prueba-demo/' }] });
    expect(draft).not.toHaveProperty('author');
    expect(JSON.stringify(draft.body)).toBe(JSON.stringify([{ type: 'paragraph', text: 'Se inauguró una plaza inventada (demo). La plaza abre de día (demo).' }]));
    expect(draft.seo?.description).toBe('Una plaza inventada (demo).');
    expect(JSON.stringify(draft)).not.toMatch(/0414|correo\.test|retirad/);
  });

  it('una columna de opinión es un artículo con el tema «Opinión»; con datos en el título, la nota queda fuera', () => {
    const op = planNews(post({ categories: [13] }), ctx);
    expect('plan' in op && newsDraft(op.plan, { coverId: null, galleryIds: [] }, 'x.test')).toMatchObject({ category: 'articulo', topics: ['Opinión'] });
    expect(planNews(post({ title: { rendered: 'Llame al 0414-555-0101 (demo)' } }), ctx)).toEqual({ skip: 'el título tenía datos personales' });
    expect(planNews(post({ status: 'draft' }), ctx)).toMatchObject({ skip: expect.any(String) });
  });

  it('un texto larguísimo pierde sus últimos párrafos hasta caber (como el importador)', () => {
    const r = planNews(post({ content: { rendered: Array.from({ length: 200 }, (_, i) => `<p>${'Párrafo inventado de prueba (demo). '.repeat(70)} ${i}</p>`).join('') } }), ctx);
    if (!('plan' in r)) throw new Error('debía planificarse');
    const draft = newsDraft(r.plan, { coverId: null, galleryIds: [] }, 'x.test');
    expect(JSON.stringify(draft).length).toBeLessThanOrEqual(450_000);
    expect(draft.body!.length).toBeGreaterThan(10);
  });
});

describe('las fotos y su texto alternativo', () => {
  const wp = (id: number, file: string, alt = '', caption = '') => ({
    id, source_url: `https://sitio-oficial.test/wp-content/uploads/2026/10/${file}`, alt_text: alt, caption: { rendered: caption },
    media_details: { width: 800, height: 600 },
  });

  it('el de WordPress; si es solo un nombre de archivo o falta, la leyenda; si no, el título (y «(foto N)» en la galería)', () => {
    const own = wantFromWp(wp(1, 'a.jpg', 'Vecinos en la plaza (demo)'), HOSTS, 1600);
    expect(altFor(own, 'Título de prueba (demo)', null)).toBe('Vecinos en la plaza (demo)');
    const fileName = wantFromWp(wp(2, 'b.jpg', 'photo_0000000000000000000_y', '<p>Acto inventado (demo)</p>'), HOSTS, 1600);
    expect(altFor(fileName, 'Título de prueba (demo)', 0)).toBe('Acto inventado (demo)');
    const none = wantFromWp(wp(3, 'c.jpg'), HOSTS, 1600);
    expect(none.alt).toMatch(/^\[Por escribir\]/);
    expect(altFor(none, 'Título de prueba (demo)', null)).toBe('Título de prueba (demo)');
    expect(altFor(none, 'Título de prueba (demo)', 0)).toBe('Título de prueba (demo) (foto 2)');
    expect(altFor(none, 'Título de prueba (demo)', 1)).toBe('Título de prueba (demo) (foto 3)');
    const long = altFor(none, 'Un título muy largo de prueba (demo) '.repeat(20), 0);
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.endsWith(' (foto 2)')).toBe(true);
    for (const f of ['IMG_1234.jpg', 'DSC0001', 'photo_1_y', 'foto.png']) expect(looksLikeFileName(f), f).toBe(true);
    for (const f of ['Vecinos en la plaza', 'Acto 2026']) expect(looksLikeFileName(f), f).toBe(false);
  });

  it('un texto alternativo o una leyenda con datos retirados pierden esa frase (y vuelve el título si no queda nada)', () => {
    const want: PhotoWant = { ...wantFromWp(wp(4, 'd.jpg'), HOSTS, 1600), alt: `Llamar al ${mark.phone}.`, altMissing: false, caption: `Acto (demo). Informes: ${mark.email}.` };
    expect(altFor(want, 'Título de prueba (demo)', null)).toBe('Acto (demo).');
    expect(captionFor(want)).toBe('Acto (demo).');
  });

  it('la foto de la nota primero, sin repetir un archivo, nunca una de otra página', () => {
    const r = planNews(
      post({
        featured_media: 10,
        content: {
          rendered: `<p><img class="wp-image-10" src="https://sitio-oficial.test/wp-content/uploads/2026/10/portada-300x200.jpg"></p>
            <p><img src="https://sitio-oficial.test/wp-content/uploads/2026/10/portada-1024x683.jpg"></p>
            <p><img src="https://otro-sitio.test/ajena.jpg"></p><p><img src="https://sitio-oficial.test/wp-content/uploads/2026/10/segunda.jpg"></p>`,
        },
      }),
      ctx,
    );
    if (!('plan' in r)) throw new Error('debía planificarse');
    const wants = photoWants(r.plan, new Map([[10, wp(10, 'portada.jpg')]]), HOSTS, 1600);
    expect(wants.map((w) => [w.role, w.want.url])).toEqual([
      ['cover', 'https://sitio-oficial.test/wp-content/uploads/2026/10/portada.jpg'],
      ['inline', 'https://sitio-oficial.test/wp-content/uploads/2026/10/segunda.jpg'],
    ]);
    expect(wantFromImage({ src: 'https://otro-sitio.test/x.jpg', alt: '', caption: '', attachmentId: null, linkHref: null }, HOSTS).external).toBe(true);
  });
});

describe('la página del gobernador', () => {
  it('biografía: sin las frases de «actualmente» (son de 2014), las condecoraciones como listas con sus títulos', () => {
    const bio = biographyOf(
      post({
        id: 1, categories: [], title: { rendered: 'Biografía' },
        content: {
          rendered: `<p>Persona Demo nace en una ciudad de prueba (demo). Actualmente dirige una comisión inventada.</p>
            <p>Fue alcaldesa de prueba (demo). Hoy actualmente no se sabe (demo). Presidió una asociación (demo).</p>
            <p>Condecoraciones</p><p>&#8211; Orden de Prueba (demo).</p><p>-Orden Inventada.</p><p>Distinciones locales</p><p>&#8211; Ciudad Demo</p>`,
        },
      }),
      ctx,
    );
    expect(bio.biography).toEqual([
      { type: 'paragraph', text: 'Persona Demo nace en una ciudad de prueba (demo).' },
      { type: 'paragraph', text: 'Fue alcaldesa de prueba (demo). Presidió una asociación (demo).' },
    ]);
    expect(bio.honors).toEqual([
      { type: 'list', items: ['Orden de Prueba (demo).', 'Orden Inventada.'] },
      { type: 'heading', level: 3, text: 'Distinciones locales' },
      { type: 'list', items: ['Ciudad Demo'] },
    ]);
    expect(bio.sourceUrl).toBe('https://sitio-oficial.test/2026/10/nota-de-prueba-demo/');
    expect(listsFromDashes([{ type: 'paragraph', text: 'Sin listas (demo).' }])).toEqual([{ type: 'paragraph', text: 'Sin listas (demo).' }]);
  });

  it('la toma de posesión: su día y su primer párrafo tal cual, después del título repetido (antes va un sumario)', () => {
    const lead = officeLeadOf(
      post({
        date_gmt: '2025-06-06T00:33:52', title: { rendered: 'Persona Demo asume (demo)' },
        content: { rendered: '<p>Sumario corto (demo)</p><h3><strong>Persona Demo asume (demo)</strong></h3><p><strong>Persona Demo</strong> comenzó un período de prueba (demo).</p><p>Otro (demo).</p>' },
      }),
      ctx,
    );
    expect(lead).toEqual([
      { type: 'heading', level: 3, text: '5 de junio de 2025' },
      { type: 'paragraph', text: 'Persona Demo comenzó un período de prueba (demo).' },
    ]);
    // Without the repeated heading: the first paragraph that reads as one (a kicker is short).
    const plain = officeLeadOf(post({ content: { rendered: '<p>Sumario (demo)</p><p>Un párrafo largo de prueba con más de doce palabras para que cuente como el primero de verdad (demo).</p>' } }), ctx);
    expect(plain[1]).toEqual({ type: 'paragraph', text: 'Un párrafo largo de prueba con más de doce palabras para que cuente como el primero de verdad (demo).' });
  });
});

describe('el nombre y el lema del sitio', () => {
  it('como los guarda WordPress («Nombre  Nombre - Lema» en el nombre); si falta, los de la marca', () => {
    expect(identityFrom({ name: 'Persona Demo  Persona Demo - Gobernadora de prueba (demo)', description: '' }, { name: 'X', tagline: 'Y' })).toEqual({
      name: 'Persona Demo', tagline: 'Persona Demo - Gobernadora de prueba (demo)',
    });
    expect(identityFrom({ name: 'Sitio Demo', description: 'Un lema &amp; algo (demo)' }, { name: 'X', tagline: 'Y' })).toEqual({ name: 'Sitio Demo', tagline: 'Un lema & algo (demo)' });
    expect(identityFrom(null, { name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' })).toEqual({ name: 'Respaldo (demo)', tagline: 'Respaldo - Cargo (demo)' });
    expect(identityFrom({ name: 'Ana Demo - Cargo de prueba' }, { name: 'X', tagline: 'Y' })).toEqual({ name: 'Ana Demo', tagline: 'Ana Demo - Cargo de prueba' });
  });

  it('el lema sin el nombre delante, para la portada', () => {
    expect(taglineWithoutName({ name: 'Persona Demo', tagline: 'Persona Demo - gobernadora de prueba (demo)' })).toBe('Gobernadora de prueba (demo)');
    expect(taglineWithoutName({ name: 'Persona Démo', tagline: 'persona demo: Cargo (demo)' })).toBe('Cargo (demo)');
    expect(taglineWithoutName({ name: 'Persona Demo', tagline: 'Otro lema (demo)' })).toBe('Otro lema (demo)');
    expect(taglineWithoutName({ name: 'Persona Demo', tagline: 'Persona Demo' })).toBe('Persona Demo');
  });
});
