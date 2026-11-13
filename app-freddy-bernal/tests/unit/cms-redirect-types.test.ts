// «Redirecciones» says each type in words (APP-13), and each one fits its closed list: on a 360 px phone and in the
// row's 18rem list there are about 240 px for the text, about 29 characters of the app's font. The longest types said
// «…, también para formularios» and were cut; the «Tipo» hint says what «(formularios)» means.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/lib/actions/web-site', () => ({ saveRedirect: vi.fn(), deleteRedirect: vi.fn() }));

const { NewRedirectForm, RedirectRowForm, REDIRECT_TYPES } = await import('@/components/cms/redirect-forms');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('los tipos de una redirección', () => {
  it('son los cuatro de siempre, dichos en palabras', () => {
    expect(REDIRECT_TYPES.map(([v]) => v).sort()).toEqual(['301', '302', '307', '308']);
    for (const [, label] of REDIRECT_TYPES) expect(label).not.toMatch(/\d/);
    expect(Object.fromEntries(REDIRECT_TYPES)['301']).toBe('Para siempre (lo normal)');
  });

  it('cada uno cabe en la lista cerrada del teléfono y de la fila', () => {
    for (const [, label] of REDIRECT_TYPES) expect(label.length, label).toBeLessThanOrEqual(27);
  });

  it('el formulario nuevo explica «Por un tiempo» y «(formularios)»; la fila muestra el tipo guardado', () => {
    const form = text(renderToStaticMarkup(h(NewRedirectForm)));
    expect(form).toContain('«(formularios)», si a la dirección vieja se enviaban formularios.');
    for (const [, label] of REDIRECT_TYPES) expect(form).toContain(label);
    expect(form).not.toMatch(/30[1278] ·/);
    const row = renderToStaticMarkup(h(RedirectRowForm, { r: { id: 'r-demo', from: '/vieja-demo', to: '/actualidad', status: 308 } }));
    expect(row).toMatch(/<option value="308" selected="">Para siempre \(formularios\)<\/option>/);
  });
});
