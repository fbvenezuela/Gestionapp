// The importer's HTML → structured text (scripts/web-import/html.ts and convert.ts), with invented articles only:
// never HTML out (no script, style, frame, form or event handler gets through, links only through safeHref), YouTube
// becomes the item's video, a post of a social network a link, a table a list, photos are collected (not pasted), the
// old site's links become paths of this site, personal data goes, and everything fits the site's schema.
import { describe, it, expect } from 'vitest';
import { richText, type TextNode } from '@/lib/web/blocks';
import { REMOVED_MARKS } from '@/lib/web/import-marks';
import { bodyText, convertArticle, plainFromHtml, youtubeIdOf } from '../../scripts/web-import/convert';
import { decodeEntities, parseHtml, textOf } from '../../scripts/web-import/html';

const OPTS = { baseUrl: 'https://sitio-viejo.test/2026/05/una-nota-inventada/', ownHosts: ['sitio-viejo.test', 'www.sitio-viejo.test'] };
const conv = (html: string) => convertArticle(html, OPTS);
const body = (html: string) => conv(html).body;
const cp = (...n: number[]) => String.fromCodePoint(...n);
const valid = (nodes: TextNode[]) => expect(richText.safeParse(nodes).success).toBe(true);

describe('el lector de HTML', () => {
  it('entidades con nombre, numéricas y las de Windows-1252; una desconocida queda como está', () => {
    expect(decodeEntities('&amp; &lt;b&gt; &#8220;cita&#8221; &#x2014; &hellip; &aacute;rbol &ntilde; &#150; &raro;')).toBe('& <b> “cita” — … árbol ñ – &raro;');
    expect(decodeEntities('&#0; &#xD800; &#1;')).toBe(`${cp(0xfffd)} ${cp(0xfffd)} `);
  });

  it('cierra párrafos y elementos de lista como un navegador y no se rompe con HTML mal hecho', () => {
    const root = parseHtml('<p>uno<p>dos<ul><li>a<li>b</ul></div><b>sin cerrar <i>tampoco</p> resto <!-- comentario --> < 3 y </x>');
    expect(root.children.filter((c) => c.type === 'element' && c.tag === 'p')).toHaveLength(2);
    // The comment and the stray closing tags go; a «<» that opens no tag is text.
    expect(textOf(root)).toBe('unodosabsin cerrar tampoco resto  < 3 y ');
    for (const bad of ['<p', '<a href="sin cierre', '<!-- sin cierre', '</', '<<<>>>', '<script>sin cierre', '']) expect(() => parseHtml(bad), bad).not.toThrow();
  });

  it('lo que va dentro de script, style, iframe o svg nunca es texto', () => {
    expect(textOf(parseHtml('a<script>alert("x")</script>b<style>p{}</style>c<iframe src="x">fallback</iframe>d<svg><text>t</text></svg>e'))).toBe('abcde');
    expect(textOf(parseHtml('a<SCRIPT type="text/javascript">x</ScRiPt >b'))).toBe('ab');
  });
});

describe('el texto que sale', () => {
  it('párrafos con negrita, cursiva y enlaces', () => {
    expect(body('<p>Texto con <strong>negrita</strong>, <em>cursiva</em> y <a href="https://ejemplo.test/x">un enlace</a>.</p>')).toEqual([
      {
        type: 'paragraph',
        runs: [
          { text: 'Texto con ' }, { text: 'negrita', bold: true }, { text: ', ' }, { text: 'cursiva', italic: true }, { text: ' y ' },
          { text: 'un enlace', href: 'https://ejemplo.test/x' }, { text: '.' },
        ],
      },
    ]);
    expect(body('<p>Solo   texto\n  plano</p>')).toEqual([{ type: 'paragraph', text: 'Solo texto plano' }]);
  });

  it('títulos (h1 y h2 son de nivel 2; h3 a h6, de nivel 3), listas anidadas y citas con su autor', () => {
    expect(body('<h1>Uno</h1><h2>Dos</h2><h4>Cuatro</h4><h5></h5>')).toEqual([
      { type: 'heading', level: 2, text: 'Uno' }, { type: 'heading', level: 2, text: 'Dos' }, { type: 'heading', level: 3, text: 'Cuatro' },
    ]);
    expect(body('<ol><li>Primero</li><li><b>Segundo</b> punto<ul><li>dentro</li></ul></li></ol>')).toEqual([
      { type: 'list', ordered: true, items: ['Primero', [{ text: 'Segundo', bold: true }, { text: ' punto' }], '– dentro'] },
    ]);
    expect(body('<blockquote><p>Lo que se dijo.</p><cite>Alguien inventado</cite></blockquote>')).toEqual([
      { type: 'quote', text: 'Lo que se dijo.', cite: 'Alguien inventado' },
    ]);
  });

  it('un salto de línea queda dentro del párrafo; espacios raros e invisibles se limpian', () => {
    expect(body('<p>Línea uno<br>línea dos<br><br>línea tres</p>')).toEqual([{ type: 'paragraph', text: 'Línea uno\nlínea dos\nlínea tres' }]);
    expect(body(`<p>${cp(0xa0)}con${cp(0xa0, 0xa0)}espacios${cp(0x200b)} y${cp(0xad)} guion${cp(0x2028)}fin </p><p>&nbsp;</p>`)).toEqual([
      { type: 'paragraph', text: 'con espacios y guion fin' },
    ]);
  });

  it('nunca pasa HTML ni código: script, style, formularios, objetos, eventos y enlaces peligrosos se quedan fuera', () => {
    const html = `
      <p onclick="alert(1)">Hola<script>alert('script')</script><style>body{display:none}</style></p>
      <form action="https://otro.test"><input name="clave"><button>Enviar</button></form>
      <object data="x.swf"></object><embed src="x.swf"><video src="v.mp4"></video>
      <p><img src="x" onerror="alert('img')"><svg onload="alert('svg')"><script>alert(2)</script></svg></p>
      <p><a href="javascript:alert('a')">uno</a> <a href=" JaVaScRiPt:alert(1)">dos</a> <a href="jav&#x09;ascript:alert(1)">tres</a>
         <a href="data:text/html;base64,PHNjcmlwdD4=">cuatro</a> <a href="vbscript:msgbox">cinco</a> <a href="#ancla">seis</a></p>
      <p>&lt;script&gt;esto es texto&lt;/script&gt;</p>`;
    const c = conv(html);
    const json = JSON.stringify(c.body);
    for (const bad of ['alert', 'javascript', 'onerror', 'onclick', 'data:', 'vbscript', 'clave', 'display:none', 'swf']) expect(json.toLowerCase(), bad).not.toContain(bad);
    expect(c.body.find((n) => n.type === 'paragraph' && n.runs)?.type).toBeUndefined();
    expect(bodyText(c.body)).toContain('uno dos tres cuatro cinco seis');
    // Written as text in the old article, it stays text (the site's renderer escapes it).
    expect(bodyText(c.body)).toContain('<script>esto es texto</script>');
    expect(c.flags.has('embed_removed')).toBe(true);
    valid(c.body);
  });

  it('los enlaces de la web vieja quedan como direcciones de esta web; los de afuera, tal cual', () => {
    const c = conv(`<p><a href="https://www.sitio-viejo.test/2019/03/otra-nota/">a</a> <a href="http://sitio-viejo.test/?p=123">b</a>
      <a href="/categoria/salud/">c</a> <a href="otra-relativa/">d</a> <a href="http://ejemplo.test/fuente">e</a>
      <a href="https://sitio-viejo.test/wp-content/uploads/2020/01/boletin.pdf">f</a></p>`);
    const hrefs = (c.body[0] as { runs: { href?: string }[] }).runs.map((r) => r.href).filter(Boolean);
    expect(hrefs).toEqual(['/2019/03/otra-nota', '/?p=123', '/categoria/salud', '/2026/05/una-nota-inventada/otra-relativa', 'http://ejemplo.test/fuente', '/wp-content/uploads/2020/01/boletin.pdf']);
    expect(c.flags.has('pdf_link')).toBe(true);
  });
});

describe('videos, redes, tablas y fotos', () => {
  it('YouTube (iframe, nocookie o la dirección sola en su línea) es el video de la nota; el segundo queda como enlace', () => {
    expect(youtubeIdOf('https://www.youtube.com/watch?v=Abc_def-123&t=10')).toBe('Abc_def-123');
    expect(youtubeIdOf('https://youtu.be/Abc_def-123')).toBe('Abc_def-123');
    expect(youtubeIdOf('https://www.youtube-nocookie.com/embed/Abc_def-123?rel=0')).toBe('Abc_def-123');
    expect(youtubeIdOf('https://www.youtube.com/shorts/Abc_def-123')).toBe('Abc_def-123');
    expect(youtubeIdOf('https://otro.test/watch?v=Abc_def-123')).toBeNull();
    const c = conv(`<p>Antes</p><figure class="wp-block-embed is-provider-youtube"><div class="wp-block-embed__wrapper">
      <iframe src="https://www.youtube.com/embed/Abc_def-123?feature=oembed" allowfullscreen></iframe></div></figure>
      <p>https://youtu.be/Zyx_wvu-987</p><p>Después</p>`);
    expect(c.videos).toEqual(['Abc_def-123', 'Zyx_wvu-987']);
    expect(c.body).toEqual([
      { type: 'paragraph', text: 'Antes' },
      { type: 'paragraph', runs: [{ text: 'Ver el video en YouTube', href: 'https://www.youtube.com/watch?v=Zyx_wvu-987' }] },
      { type: 'paragraph', text: 'Después' },
    ]);
    expect(c.flags.has('video_extra')).toBe(true);
  });

  it('una publicación de X, Instagram o Facebook queda como enlace; otros marcos se quitan', () => {
    const c = conv(`<blockquote class="twitter-tweet"><p lang="es">Mensaje inventado <a href="https://t.co/xyz">pic.twitter.com/xyz</a></p>&mdash; Cuenta Inventada (@inventada)
      <a href="https://twitter.com/inventada/status/1234567890123456789?ref_src=twsrc">1 de noviembre</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>
      <blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/INVENTADO/?utm_source=x"><div>Ver esta publicación</div></blockquote>
      <iframe src="https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Finventada%2Fvideos%2F123%2F"></iframe>
      <iframe src="https://maps.otro.test/embed?x=1"></iframe>`);
    expect(c.body).toEqual([
      { type: 'quote', text: 'Mensaje inventado', cite: 'Cuenta Inventada (@inventada)' },
      { type: 'paragraph', runs: [{ text: 'Ver la publicación en X', href: 'https://twitter.com/inventada/status/1234567890123456789' }] },
      { type: 'paragraph', runs: [{ text: 'Ver la publicación en Instagram', href: 'https://www.instagram.com/p/INVENTADO/' }] },
      { type: 'paragraph', runs: [{ text: 'Ver la publicación en Facebook', href: 'https://www.facebook.com/inventada/videos/123/' }] },
    ]);
    expect([...c.flags].sort()).toEqual(['embed_removed', 'embed_replaced']);
  });

  it('una tabla queda como lista, fila por fila; los shortcodes de WordPress se van (un «[sic]» no)', () => {
    const c = conv('<table><tr><th>Municipio</th><th>Obras</th></tr><tr><td>Uno (prueba)</td><td>3</td></tr></table><p>[vc_row]Texto [sic] final[/vc_row] [caption id="x"]</p>');
    expect(c.body).toEqual([
      { type: 'list', items: ['Municipio · Obras', 'Uno (prueba) · 3'] },
      { type: 'paragraph', text: 'Texto [sic] final' },
    ]);
    expect(c.flags.has('table_flattened')).toBe(true);
  });

  it('las fotos se recogen con su id, su pie y el enlace a su original; el pie no queda en el texto', () => {
    const c = conv(`<figure id="attachment_77" class="wp-caption aligncenter"><img class="size-medium wp-image-77" src="https://sitio-viejo.test/wp-content/uploads/2020/01/foto-300x200.jpg" alt="">
      <figcaption class="wp-caption-text">Pie de foto inventado</figcaption></figure>
      <p><a href="https://www.sitio-viejo.test/wp-content/uploads/2020/01/otra.jpg"><img src="https://www.sitio-viejo.test/wp-content/uploads/2020/01/otra-1024x683.jpg" alt="Una plaza (prueba)"></a></p>
      <p>Texto <img src="/wp-content/uploads/2020/01/relativa.png"> sigue</p>`);
    expect(c.images).toEqual([
      { src: 'https://sitio-viejo.test/wp-content/uploads/2020/01/foto-300x200.jpg', alt: '', caption: 'Pie de foto inventado', attachmentId: 77, linkHref: null },
      { src: 'https://www.sitio-viejo.test/wp-content/uploads/2020/01/otra-1024x683.jpg', alt: 'Una plaza (prueba)', caption: '', attachmentId: null, linkHref: '/wp-content/uploads/2020/01/otra.jpg' },
      { src: 'https://sitio-viejo.test/wp-content/uploads/2020/01/relativa.png', alt: '', caption: '', attachmentId: null, linkHref: null },
    ]);
    expect(c.body).toEqual([{ type: 'paragraph', text: 'Texto sigue' }]);
  });
});

describe('datos personales y límites', () => {
  it('correos, teléfonos y cédulas salen del texto y de los enlaces, también si un teléfono cruza dos estilos', () => {
    const c = conv(`<p>Escribe a <a href="mailto:persona@correo.test">persona@correo.test</a> o llama al <strong>0414</strong>-555.01.99.</p>
      <ul><li>Contacto: otra@correo.test</li></ul><h3>Ganador: V-12.345.678</h3><p><a href="https://wa.me/584145550199">WhatsApp</a></p>`);
    const text = JSON.stringify(c.body);
    for (const leak of ['persona@', 'otra@', '0414', '555', '12.345.678', 'wa.me']) expect(text, leak).not.toContain(leak);
    expect(bodyText(c.body)).toContain(`Escribe a ${REMOVED_MARKS.email} o llama al ${REMOVED_MARKS.phone}.`);
    expect(c.pii).toEqual({ emails: 3, phones: 2, ids: 1 });
    expect([...c.flags].sort()).toEqual(['email_removed', 'id_removed', 'phone_removed']);
    valid(c.body);
  });

  it('un párrafo, una lista o un artículo enormes se parten dentro de los límites del sitio', () => {
    const long = `${'palabra '.repeat(1200)}fin`;
    const styled = Array.from({ length: 70 }, (_, i) => (i % 2 ? `<b>n${i}</b>` : `t${i} `)).join('');
    const items = Array.from({ length: 60 }, (_, i) => `<li>punto ${i}</li>`).join('');
    const c = conv(`<p>${long}</p><p>${styled}</p><ul>${items}</ul>`);
    expect(c.body.filter((n) => n.type === 'paragraph').length).toBeGreaterThanOrEqual(4);
    expect(c.body.filter((n) => n.type === 'list').map((n) => (n as { items: unknown[] }).items.length)).toEqual([50, 10]);
    valid(c.body);
    const many = conv(Array.from({ length: 260 }, (_, i) => `<p>Párrafo ${i}</p>`).join(''));
    expect(many.body).toHaveLength(200);
    expect(many.flags.has('text_truncated')).toBe(true);
  });

  it('un artículo vacío se señala; el texto plano de un título o un extracto sale sin etiquetas', () => {
    expect(conv('<p>&nbsp;</p><!-- nada -->').flags.has('no_body')).toBe(true);
    expect(plainFromHtml('<strong>Título</strong> &#8211; con &amp; entidades<br>y salto')).toBe('Título – con & entidades y salto');
    expect(plainFromHtml('Resumen<script>x()</script> [caption]final')).toBe('Resumen final');
  });
});
