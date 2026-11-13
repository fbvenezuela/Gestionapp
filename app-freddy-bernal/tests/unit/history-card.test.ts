import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HistoryCard } from '@/components/agenda/history-card';
import type { HistoryRow } from '@/lib/data/events';

// «Historial» of an event (APP-03): plain words only. A link between rows, a code or a column without a name of its own
// never reaches the screen, and a change with nothing left to say does not show.
const AT = '2026-11-11T14:00:00.000Z';
const UUID_A = '0c9c9cb3-0dab-4ab3-8e5d-9b360aee6d36';
const UUID_B = '97369c5f-1111-4222-8333-944455556666';
const CAT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const row = (over: Partial<HistoryRow>): HistoryRow => ({ at: AT, actor_name: 'Despacho (demo)', table_name: 'events', action: 'update', changes: {}, block: null, ...over });
const html = (rows: HistoryRow[], categories: { id: string; name: string }[] = []) =>
  renderToStaticMarkup(createElement(HistoryCard, { rows, categories }))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');

describe('Historial del evento', () => {
  it('sin nombres de columnas, ids ni claves desconocidas', () => {
    const text = html([
      row({ changes: { community_report_id: { before: null, after: UUID_A }, title: { before: 'Viejo título', after: 'Nuevo título' } } }),
      row({ changes: { obra_ficha_id: { before: null, after: UUID_B }, cancelled_by: { before: null, after: UUID_A }, summary: { before: '', after: 'Algo' } } }),
      row({ changes: { some_new_column: { before: 'x', after: 'y' }, municipality: { before: 'Junín', after: 'Cárdenas' } } }),
    ]);
    for (const raw of ['community_report_id', 'obra_ficha_id', 'cancelled_by', 'some_new_column', UUID_A, UUID_B]) expect(text).not.toContain(raw);
    expect(text).toContain('Título: Viejo título → Nuevo título');
    expect(text).toContain('Municipio: Junín → Cárdenas');
  });

  it('la decisión del jefe, en qué va, la prioridad y la categoría se dicen con sus palabras', () => {
    const text = html(
      [
        row({
          changes: {
            boss_decision: { before: 'pending', after: 'accepted' },
            work_status: { before: 'brief', after: 'storyboard' },
            urgency: { before: 2, after: 1 },
            category_id: { before: null, after: CAT },
          },
        }),
      ],
      [{ id: CAT, name: 'Obras (demo)' }],
    );
    expect(text).toContain('Decisión del jefe: Por decidir → Aceptado');
    expect(text).toContain('En qué va: Ficha → Storyboard');
    expect(text).toContain('Prioridad para el equipo: Normal → Urgente');
    expect(text).toContain('Categoría: (vacío) → Obras (demo)');
    expect(text).not.toMatch(/pending|accepted|brief\b/);
    expect(text).not.toContain(CAT);
    // A category the card does not know (switched off since): never its id.
    expect(html([row({ changes: { category_id: { before: CAT, after: UUID_A } } })])).toContain('Categoría: otra categoría → otra categoría');
  });

  it('el día en que se hizo se lee como fecha', () => {
    const text = html([row({ changes: { done_on: { before: null, after: '2026-11-11' } } })]);
    expect(text).toContain('Día en que se hizo: (vacío) → 11 de noviembre');
    expect(text).not.toContain('done_on');
  });

  it('lo que hizo la app sola dice «La app», nunca «El sistema»', () => {
    const text = html([row({ actor_name: null, table_name: 'event_brief', action: 'insert' })]);
    expect(text).toContain('La app creó · Ficha técnica');
    expect(text).not.toContain('El sistema');
    // An action or a part the card does not know: plain words too.
    const odd = html([row({ actor_name: null, table_name: 'some_table', action: 'truncate', changes: { title: { before: 'a', after: 'b' } } })]);
    expect(odd).toContain('La app cambió · otro dato');
    expect(odd).not.toMatch(/some_table|truncate/);
  });

  it('un cambio que solo tocó campos escondidos no sale', () => {
    const rows = [row({ changes: { community_report_id: { before: null, after: UUID_A } } }), row({ changes: { position: { before: 1, after: 2 }, rev: { before: 1, after: 2 } } })];
    const text = html(rows);
    expect(text).not.toContain('cambió ·');
    expect(text).toContain('Todavía no hay cambios.');
    // With one change that does say something, only that one shows.
    const mixed = html([...rows, row({ actor_name: 'Jefe (demo)', changes: { priority: { before: null, after: 8 } } })]);
    expect(mixed.match(/cambió ·/g)).toHaveLength(1);
    expect(mixed).toContain('Importancia: (vacío) → 8');
  });

  it('el bloque del storyboard que se agregó muestra lo que decía', () => {
    const text = html([row({ table_name: 'storyboard_blocks', action: 'insert', block: { shot: 'Plano general', boss_line: 'Buenos días' } })]);
    expect(text).toContain('creó · Bloque del storyboard');
    expect(text).toContain('Plano: Plano general');
    expect(text).toContain('Lo que dice el jefe: Buenos días');
  });
});
