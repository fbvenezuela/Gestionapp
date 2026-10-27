import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PubTitle } from '@/app/(panel)/resultados/pub-title';
import { PubThumb } from '@/app/(panel)/resultados/pub-thumb';
import { thumbSources, type PubThumb as PubThumbData } from '@/lib/domain/thumb-source';

const row = { id: 'pub-1', title: 'Pieza de prueba', url: 'https://example.com/p/1' };
const html = (canLoad: boolean, card: boolean, url: string | null = row.url) =>
  renderToStaticMarkup(createElement(PubTitle, { r: { ...row, url }, canLoad, card }));

describe('resultados: título de cada publicación', () => {
  it('en la tarjeta del teléfono es un blanco de 44 px y subrayado', () => {
    for (const canLoad of [true, false]) {
      const out = html(canLoad, true);
      expect(out).toMatch(/^<a /);
      expect(out).toContain('min-h-11');
      expect(out).toContain('flex');
      expect(out).toMatch(/class="[^"]*\bunderline\b/);
    }
  });

  it('admin y redes van a cargar los números; el resto va a la red', () => {
    expect(html(true, true)).toContain('href="/publicar/pub-1"');
    const other = html(false, true);
    expect(other).toContain('href="https://example.com/p/1"');
    expect(other).toContain('target="_blank"');
    expect(other).toContain('se abre en la red');
  });

  it('sin enlace, solo el título (nunca un «#»)', () => {
    const out = html(false, true, null);
    expect(out).toMatch(/^<span /);
    expect(out).not.toContain('href');
  });

  it('en la tabla de escritorio sigue en línea', () => {
    const out = html(true, false);
    expect(out).not.toContain('min-h-11');
    expect(out).toContain('hover:underline');
  });

  it('la página usa la versión de tarjeta en el teléfono y la de tabla en escritorio', () => {
    const code = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/resultados/page.tsx'), 'utf8');
    expect(code).toContain('<PubTitle r={r} canLoad={canLoad} card />');
    expect(code).toContain('<PubTitle r={r} canLoad={canLoad} />');
  });

  it('«1 publicación», no «1 publicaciones»', () => {
    const code = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/resultados/page.tsx'), 'utf8');
    expect(code).not.toMatch(/\$\{b\.total\} publicaciones/);
    expect(code).toContain("b.total === 1 ? 'publicación' : 'publicaciones'");
  });
});

// §6 «Resultados con miniaturas»: each publication shows its picture (through /api/media/<id>/thumb, permissions
// checked there) or, when it has none, the icon of its format. Demo ids only.
describe('resultados: miniatura de cada publicación', () => {
  const ID = '00000000-0000-4000-8000-0000000000c1';
  const thumb = (t: PubThumbData, className?: string) => renderToStaticMarkup(createElement(PubThumb, { t, className }));

  it('con un archivo: la imagen sale de /api/media/<id>/thumb, decorativa y perezosa', () => {
    const out = thumb(thumbSources({ origin: 'piece', network: 'instagram', format: 'reel', versionCover: { id: ID, mime: 'image/jpeg' } }));
    expect(out).toContain(`src="/api/media/${ID}/thumb"`);
    expect(out).toContain('alt=""');
    expect(out).toContain('loading="lazy"');
    expect(out).not.toContain('data-thumb-icon');
  });

  it('sin archivo: el ícono del formato, nunca una imagen rota', () => {
    for (const [format, network, icon] of [['reel', 'instagram', 'video'], ['carousel', 'instagram', 'carousel'], ['photo', 'instagram', 'image'], ['post', 'x', 'text']] as const) {
      const out = thumb(thumbSources({ origin: 'piece', network, format }));
      expect(out, format).not.toContain('<img');
      expect(out, format).toContain(`data-thumb-icon="${icon}"`);
      expect(out, format).toContain('aria-hidden="true"');
    }
  });

  it('lo del jefe por su cuenta muestra su captura', () => {
    const out = thumb(thumbSources({ origin: 'boss_spontaneous', network: 'tiktok', format: 'post', evidence: { id: ID, mime: 'image/png' } }));
    expect(out).toContain(`src="/api/media/${ID}/thumb"`);
  });

  it('4:5 como un post del feed; la tabla la pide más chica', () => {
    const t = thumbSources({ origin: 'piece', network: 'instagram', format: 'reel' });
    expect(thumb(t)).toMatch(/class="[^"]*\bh-20\b[^"]*\bw-16\b/);
    const small = thumb(t, 'h-15 w-12');
    expect(small).toMatch(/\bh-15\b/);
    expect(small).not.toMatch(/\bh-20\b/);
  });

  it('la tarjeta del teléfono, la tabla y el «Digital» del jefe la muestran; los archivos se leen en la misma consulta', () => {
    const page = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/resultados/page.tsx'), 'utf8');
    expect(page).toContain('<PubThumb t={pubThumbOf(r)} />');
    expect(page).toContain('<PubThumb t={pubThumbOf(r)} className="h-15 w-12" />');
    expect(page).toMatch(/\$\{PUB_THUMB_COLUMNS\}[\s\S]*\$\{PUB_THUMB_JOINS\}/);
    const digital = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/jefe/digital/page.tsx'), 'utf8');
    expect(digital).toContain('<PubThumb t={pubThumbOf(p)} />');
    expect(digital).toMatch(/\$\{PUB_THUMB_COLUMNS\}[\s\S]*\$\{PUB_THUMB_JOINS\}/);
  });
});
