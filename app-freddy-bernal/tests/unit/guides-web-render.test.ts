// /ayuda/web and /ayuda/atencion rendered without a server (WF-C): the index has each part of its page as a card, a part
// shows every section with its anchor and its PDF number, a flow is a list of steps with links between them, the
// references are links with the PDF's number and the client's words come filled. All the content is the guide's own.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebGuidePage } from '@/components/guides/web-guide';
import { UNFILLED_HUECO, clientWords, webEntry, webFlows, webPart } from '@/lib/guides/web';

const words = clientWords();
const html = (page: 'web' | 'atencion', q: { parte?: string; flujo?: string } = {}) => renderToStaticMarkup(createElement(WebGuidePage, { page, words, ...q }));
// A hueco, a reference marker or a «**» left unprinted.
const unfilled = new RegExp(`${UNFILLED_HUECO.source}|\\[§|\\*\\*`);

describe('«La web» y «Atención ciudadana» en «Ayuda y guías»', () => {
  it('el índice de «La web»: su apertura y las partes 1, 2, 3, 4, 6 y 7, cada una con sus secciones', () => {
    const out = html('web');
    expect(out).toMatch(/<h1[^>]*>La web<\/h1>/);
    for (const n of [1, 2, 3, 4, 6, 7]) expect(out, `parte ${n}`).toContain(`id="parte-${n}"`);
    expect(out).not.toContain('id="parte-5"');
    expect(out).toContain('href="/ayuda/web?parte=4#aprobar"');
    expect(out).toContain('href="/ayuda/web?flujo=flujo-web-contenido"');
    expect(out).not.toContain('flujo=flujo-web-envio');
    // The guide's opening, with its reference as a link to the PDF's 7.1.
    expect(out).toContain('href="/ayuda/web?parte=7#prueba-que-es"');
    expect(out).toMatch(/>7\.1<\/a>/);
    expect(out).not.toMatch(unfilled);
  });

  it('el índice de «Atención ciudadana»: las partes 5 y 6 (sus flujos) y el recorrido del ciudadano, que está en «La web»', () => {
    const out = html('atencion');
    expect(out).toMatch(/<h1[^>]*>Atención ciudadana<\/h1>/);
    expect(out).toContain('id="parte-5"');
    expect(out).toContain('href="/ayuda/atencion?flujo=flujo-web-envio"');
    expect(out).not.toContain('flujo=flujo-web-contenido');
    expect(out).toContain('href="/ayuda/web?parte=2"');
    expect(out).not.toMatch(unfilled);
  });

  it('una parte: cada sección con su ancla y su número; las tablas como listas que caben en el teléfono', () => {
    const out = html('web', { parte: '4' });
    expect(out).toMatch(/<h1[^>]*>Parte 4 · Administrar la web<\/h1>/);
    for (const s of webPart(4, 'web')!.sections.filter((x) => !x.pdf.endsWith('.0'))) {
      expect(out, s.id).toContain(`id="${s.id}"`);
      expect(out, s.id).toContain(`href="#${s.id}"`);
    }
    expect(out).toContain(`>4.8 ${webEntry('4.8')!.title}<`);
    expect(out).not.toContain('<table');
    expect(out).toContain('<dt class="label-caps">');
    // The client's words, filled: the program's name in the table of what each type asks.
    expect(out).toContain(words.program);
    expect(out).not.toMatch(unfilled);
  });

  it('un flujo: un paso por cada recuadro del dibujo, con enlaces a los pasos que siguen y lo que hay que saber', () => {
    const f = webFlows()[0];
    const out = html('atencion', { flujo: f.id });
    expect(out).toContain(`aria-label="${f.title}, ${f.nodes.length} pasos"`);
    for (const n of f.nodes) expect(out, n.id).toContain(`id="${f.id}-${n.id}"`);
    for (const e of f.edges) expect(out, `${e.from} → ${e.to}`).toContain(`href="#${f.id}-${e.to}"`);
    expect(out).toContain('Qué hay que saber');
    expect(out).toContain('>Pregunta<');
    // A flow of the other page is not shown here: its page's index instead.
    expect(html('web', { flujo: f.id })).not.toContain(`aria-label="${f.title}`);
  });

  it('el recorrido del ciudadano dice el comprobante con el nombre de la institución de la configuración', () => {
    const out = html('web', { parte: '2' });
    expect(out).toContain(`«Comprobante · Atención ciudadana · ${words.organization}»`);
    expect(out).not.toMatch(unfilled);
  });

  it('una parte o un flujo que no existe: el índice', () => {
    expect(html('atencion', { parte: '4' })).toMatch(/<h1[^>]*>Atención ciudadana<\/h1>/);
    expect(html('web', { parte: 'x', flujo: 'no-existe' })).toMatch(/<h1[^>]*>La web<\/h1>/);
  });
});
