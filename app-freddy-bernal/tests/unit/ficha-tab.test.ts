// The ficha inside its event (cambios del 27/10/2026, §4.1): the «Ficha de obra» tab that Redes and Grabación read,
// the brief copied into the event, the boss's «Antes de hablar» and the FAB fallback of modo lectura. Whatever
// Redes and Grabación get from an obra carries no phone, no reporter's name and no liaison's name, even when the
// private part is handed in by mistake. All data here is invented.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeSpeaking, fichaTab, HIDDEN_WITHOUT_CONTACTS, readingParts } from '@/lib/domain/ficha-tab';
import { eventFromObra } from '@/lib/domain/ficha-event';
import { EventFichaTab } from '@/components/fichas/event-ficha-tab';
import { PhotoGallery } from '@/components/fichas/photo-gallery';
import { OBRA_KINDS, REPORT_KINDS } from '@/lib/domain/media-mime';
import type { FichaMedia } from '@/lib/data/fichas';

const obra: Record<string, unknown> = {
  id: '00000000-0000-4000-8000-0000000000f1',
  code: 'O-0099',
  name: 'Muro de prueba en la quebrada (demo)',
  municipality: 'Junín',
  parish: 'Parroquia de prueba (demo)',
  sector: 'Sector de prueba (demo)',
  engineer_name: 'Residente de prueba (demo)',
  problem: 'La quebrada se come la orilla. Si hay dudas llamar al 0414-555 12 34.',
  problem_since: 'hace dos inviernos',
  why_decided: 'Lo pidió la comunidad.',
  works: 'Muro de gaviones de 40 m.',
  communities: 'El caserío de prueba (demo), contacto (0276) 555-9876',
  people_count: 400,
  families_count: 90,
  benefits: 'Las casas de la orilla quedan protegidas.',
  executor: 'Empresa de prueba (demo)',
  investment: '250.000',
  currency: 'VES',
  funding_source: 'Fondo de prueba (demo)',
  work_state: 'in_progress',
  progress_pct: 35,
  started_on: '2026-07-01',
  due_on: '2026-12-20',
  difficulties: '',
  solutions: '',
  other_aid: '',
  pending_needs: 'Alumbrado.',
  next_action: 'Revisar con el residente.',
  follow_up_owner: 'Persona del seguimiento (demo)',
  follow_up_due: '2026-11-15',
  fab_dialog: '¡Saludos! Estamos en el muro.\n\nLo que estamos haciendo: muro de gaviones de 40 m.',
  marks: { solutions: 'to_confirm', difficulties: 'not_applicable' },
};
const priv: Record<string, unknown> = {
  id: obra.id,
  engineer_phone: '0000-0000901',
  reporter_name: 'Vecina que denunció (demo)',
  reported_when: 'el mes pasado',
  reported_via: 'Asamblea',
  reporter_attends: 'yes',
  representative: 'Su hijo, al 0000-0000903',
  liaison_name: 'Enlace de prueba (demo)',
  liaison_phone: '0000-0000902',
  boss_should_know: 'Piden alumbrado.',
  marks: {},
};
const SECRETS = ['0000-0000901', '0000-0000902', '0000-0000903', 'Vecina que denunció', 'Enlace de prueba', 'Su hijo', 'Piden alumbrado', 'Asamblea', 'Persona del seguimiento'];
const PHONES = ['0414', '555 12 34', '555-9876', '(0276)'];
const DATES = ['2026-07-01', '2026-12-20', '2026-11-15', 'julio', 'diciembre', 'noviembre'];

describe('la pestaña «Ficha de obra» para Redes y Grabación', () => {
  it('solo la parte principal: sin teléfonos, sin el nombre de quien reportó ni del enlace, aunque le pasen los contactos', () => {
    for (const p of [null, priv]) {
      const tab = fichaTab('obra', obra, p, { contacts: false });
      expect(tab.contacts).toEqual([]);
      const all = JSON.stringify(tab);
      for (const s of [...SECRETS, ...PHONES, ...DATES]) expect(all, s).not.toContain(s);
      const keys = tab.groups.flatMap((g) => g.items.map((i) => i.def.key));
      expect(keys).toEqual(expect.arrayContaining(['name', 'engineer_name', 'works', 'people_count', 'progress_pct']));
      for (const k of HIDDEN_WITHOUT_CONTACTS.obra) expect(keys, k).not.toContain(k);
      expect(tab.groups.some((g) => g.key === 'community')).toBe(false);
    }
  });

  it('dice «Por confirmar» y deja fuera «No aplica» y lo vacío', () => {
    const items = fichaTab('obra', obra, null, { contacts: false }).groups.flatMap((g) => g.items);
    expect(items.find((i) => i.def.key === 'solutions')).toMatchObject({ mark: 'to_confirm' });
    expect(items.find((i) => i.def.key === 'difficulties')).toBeUndefined();
    expect(items.find((i) => i.def.key === 'other_aid')).toBeUndefined();
  });

  it('lo que llega a la pantalla (HTML) tampoco los tiene', () => {
    const html = renderToStaticMarkup(
      createElement(EventFichaTab, { kind: 'obra', id: String(obra.id), code: 'O-0099', tab: fichaTab('obra', obra, priv, { contacts: false }), media: [], contacts: false }),
    );
    expect(html).toContain('Muro de gaviones de 40 m.');
    expect(html).toContain('Sin contactos');
    for (const s of [...SECRETS, ...PHONES, ...DATES]) expect(html, s).not.toContain(s);
  });

  it('el jefe, el despacho y Administración ven además los contactos, en su propio recuadro', () => {
    const tab = fichaTab('obra', obra, priv, { contacts: true });
    const html = renderToStaticMarkup(createElement(EventFichaTab, { kind: 'obra', id: String(obra.id), code: 'O-0099', tab, media: [], contacts: true }));
    expect(html).toContain('Contactos y lo que debe saber el jefe');
    expect(html).toContain('Enlace de prueba (demo)');
    expect(html).toContain('href="tel:00000000902"');
    // With the right to the contacts the obra's own days are there too.
    expect(tab.groups.flatMap((g) => g.items.map((i) => i.def.key))).toEqual(expect.arrayContaining(['due_on', 'follow_up_owner']));
  });

  it('un reporte sin el derecho a los contactos: ni quien reporta, ni el encargado, ni la dirección', () => {
    const report = { title: 'Jornada de prueba (demo)', type: 'event', municipality: 'Junín', in_charge: 'Encargada de prueba (demo)', description: 'Se atendió a la comunidad.', status: 'planned', reported_at: '2026-10-20T10:00:00Z', marks: {} };
    const rpriv = { reporter_name: 'Vocera de prueba (demo)', reporter_phone: '0000-0000777', address: 'Calle de prueba (demo)', activity_at: '2026-11-01T14:00:00Z', marks: {} };
    const all = JSON.stringify(fichaTab('report', report, rpriv, { contacts: false }));
    for (const s of ['Vocera de prueba', '0000-0000777', 'Calle de prueba', 'Encargada de prueba', '2026-10-20', '2026-11-01']) expect(all, s).not.toContain(s);
    expect(all).toContain('Se atendió a la comunidad.');
  });
});

describe('la ficha técnica que se copia al evento desde la obra', () => {
  it('no lleva teléfonos, ni el nombre de quien reportó ni el del enlace, aunque la fila traiga los contactos', () => {
    const e = eventFromObra({ ...obra, ...priv, id: obra.id });
    const all = JSON.stringify(e);
    for (const s of [...SECRETS, ...PHONES, ...DATES]) expect(all, s).not.toContain(s);
    expect(e.brief.work_description).toBe('Muro de gaviones de 40 m.');
  });
});

describe('«Antes de hablar» del jefe en el modo lectura', () => {
  it('sin la parte privada (lo que la base devuelve a Redes o Grabación) no hay nada que mostrar', () => {
    expect(beforeSpeaking('obra', null)).toEqual([]);
    expect(beforeSpeaking('report', null)).toEqual([]);
  });

  it('con ella: quién reportó, si estará, el enlace y lo que debe saber; nunca un teléfono (la pantalla puede salir en cámara)', () => {
    const items = beforeSpeaking('obra', priv);
    expect(items.map((i) => i.label)).toEqual(['Quién hizo el reporte', '¿Estará en la visita?', 'Si no asiste, quién la representa', 'Enlace comunitario', 'Qué debe saber o decidir']);
    expect(items.find((i) => i.label === '¿Estará en la visita?')?.value).toBe('Sí');
    const all = JSON.stringify(items);
    for (const p of ['0000-0000901', '0000-0000902', '0000-0000903']) expect(all, p).not.toContain(p);
    expect(beforeSpeaking('obra', { reporter_name: '', liaison_name: '', marks: { liaison_name: 'to_confirm' } })).toEqual([{ label: 'Enlace comunitario', value: 'Por confirmar' }]);
    expect(beforeSpeaking('report', { reporter_name: 'Vocera de prueba (demo)', reporter_role: 'Vocera', reporter_phone: '0000-0000777', marks: {} })).toEqual([
      { label: 'Quién reportó', value: 'Vocera de prueba (demo), Vocera' },
    ]);
  });
});

describe('el modo lectura toma el diálogo FAB cuando el storyboard no tiene discurso', () => {
  it('sin discurso: el diálogo de la ficha, un párrafo por parte, y después las líneas de los bloques', () => {
    expect(readingParts('', ['Línea del bloque'], String(obra.fab_dialog))).toEqual({
      parts: ['¡Saludos! Estamos en el muro.', 'Lo que estamos haciendo: muro de gaviones de 40 m.', 'Línea del bloque'],
      fromFicha: true,
    });
  });

  it('con discurso escrito, manda el discurso; sin ninguno de los dos, nada', () => {
    expect(readingParts('Lo que escribió Redes.', [], String(obra.fab_dialog))).toEqual({ parts: ['Lo que escribió Redes.'], fromFicha: false });
    expect(readingParts(null, [' '], '')).toEqual({ parts: [], fromFicha: false });
  });
});

describe('las fotos de la ficha', () => {
  const m = (over: Partial<FichaMedia>): FichaMedia => ({
    id: '00000000-0000-4000-8000-0000000000b1', kind: 'before', label: 'Antes 1', mime: 'image/jpeg', size_bytes: 120_000, bucket: 'material', width: 180, height: 320, duration_s: null, ...over,
  });
  const html = (media: FichaMedia[], kinds: readonly string[] = OBRA_KINDS) =>
    renderToStaticMarkup(createElement(PhotoGallery, { target: { obraFichaId: String(obra.id) }, kinds: kinds as typeof OBRA_KINDS, media, canUpload: false, title: 'Fotos' }));

  it('cada foto con su miniatura por la plataforma, agrupada en Antes, Avance y Documentos', () => {
    const out = html([m({}), m({ id: '00000000-0000-4000-8000-0000000000b2', kind: 'progress', label: 'Avance 1' }), m({ id: '00000000-0000-4000-8000-0000000000b3', kind: 'document', label: 'Documento 1', mime: 'application/pdf' })]);
    expect(out).toContain('src="/api/media/00000000-0000-4000-8000-0000000000b1/thumb"');
    expect(out).toContain('src="/api/media/00000000-0000-4000-8000-0000000000b2/thumb"');
    // A PDF outside Drive has no picture: its icon.
    expect(out).not.toContain('0000000000b3/thumb');
    for (const t of ['Antes', 'Avance', 'Documentos']) expect(out).toContain(`aria-label="${t}"`);
  });

  it('un archivo de Drive nunca se abre con un enlace simple; un reporte muestra «Después» y no «Avance»', () => {
    const out = html([m({ bucket: 'drive' })]);
    expect(out).not.toContain('href="/api/media/');
    expect(out).toContain('/thumb"');
    const report = html([m({ kind: 'after', label: 'Después 1' }), m({ id: '00000000-0000-4000-8000-0000000000b4', kind: 'progress' })], REPORT_KINDS);
    expect(report).toContain('aria-label="Después"');
    expect(report).not.toContain('aria-label="Avance"');
  });
});
