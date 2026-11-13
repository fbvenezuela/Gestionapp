// The block editor says what each list block does with what you tick (APP-15): documents, questions and works fall
// back to the latest ones when none is ticked; indicators do not (the public block shows only the ticked ones and, with
// none, does not show at all). All data here is invented.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RefChecklist, refChecklistHint } from '@/components/cms/block-editor';
import { EditorContext, type EditorCtx } from '@/components/cms/editor-context';

const ctx: EditorCtx = {
  media: {},
  addMedia: () => {},
  munis: [],
  refs: [
    { id: 'i-1', kind: 'indicator', title: 'Kilómetros asfaltados (prueba)', live: true, group: null, hasSource: true },
    { id: 'd-1', kind: 'document', title: 'Informe de gestión (prueba)', live: true, group: null, hasSource: false },
  ],
  readOnly: false,
  tz: 'America/Caracas',
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const render = (kind: 'indicator' | 'document') =>
  text(renderToStaticMarkup(h(EditorContext.Provider, { value: ctx, children: h(RefChecklist, { label: 'Elegidos', kind, value: [], onChange: () => {} }) })));

describe('lo que dice cada lista del editor de bloques', () => {
  it('Indicadores: sin marcar ninguno, el bloque no sale', () => {
    expect(refChecklistHint('indicator')).toBe('Salen en el orden en que los marques. Sin marcar ninguno, el bloque no sale.');
    expect(render('indicator')).toContain('Sin marcar ninguno, el bloque no sale.');
    expect(render('indicator')).not.toContain('se usan los últimos');
  });

  it('Documentos, preguntas y obras: sin marcar ninguno, se usan los últimos', () => {
    for (const k of ['document', 'faq', 'project'] as const) expect(refChecklistHint(k)).toContain('Sin marcar ninguno, se usan los últimos.');
    expect(render('document')).toContain('Sin marcar ninguno, se usan los últimos.');
  });
});
