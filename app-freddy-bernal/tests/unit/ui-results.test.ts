import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PubTitle } from '@/app/(panel)/resultados/pub-title';

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
