// The shared agenda's merge (src/lib/domain/agenda-merge.ts): only what each person changed is written, the last
// save wins on the same field, the other person is told with field names only, and the phone keeps a draft that
// shows «Usar lo de él / Dejar lo mío» when someone saved in between. Also the brief an event takes from a ficha
// (src/lib/domain/ficha-event.ts): never a contact. All data is invented.
import { describe, it, expect } from 'vitest';
import {
  draftConflicts,
  editField,
  emptyDraft,
  fieldLabels,
  labelList,
  mergePatch,
  norm,
  overwrittenUser,
  restoreEditDraft,
  savePayload,
  shownValues,
  takeTheirs,
} from '@/lib/domain/agenda-merge';
import { eventFromObra, eventFromReport, obraVisitTitle, withoutPhones } from '@/lib/domain/ficha-event';
import { clearDrafts, draftStorageKey } from '@/lib/hooks/use-draft';
import { looksLikeDateTime } from '@/lib/push/text';

describe('mergePatch: lo que cada uno cambió', () => {
  const base = { title: 'Visita (demo)', summary: 'Resumen', urgency: 2 };

  it('escribe solo lo que esta persona cambió; lo que cambió la otra se queda', () => {
    const current = { title: 'Visita (demo)', summary: 'Resumen del jefe', urgency: 2 }; // the boss changed the summary
    const mine = { title: 'Visita nueva (demo)', summary: 'Resumen', urgency: 2 }; // despacho changed the title
    expect(mergePatch(current, base, mine)).toEqual({ write: { title: 'Visita nueva (demo)' }, overlap: [] });
  });

  it('si los dos cambiaron lo mismo, gana el último y se nombra el campo', () => {
    const current = { ...base, title: 'Título del jefe (demo)' };
    const mine = { ...base, title: 'Título del despacho (demo)' };
    expect(mergePatch(current, base, mine)).toEqual({ write: { title: 'Título del despacho (demo)' }, overlap: ['title'] });
  });

  it('los dos escribieron lo mismo: no es un choque', () => {
    const current = { ...base, title: 'Igual (demo)' };
    expect(mergePatch(current, base, { ...base, title: 'Igual (demo)' }).overlap).toEqual([]);
  });

  it('sin base (un formulario viejo) se escribe lo que difiere de lo actual, y no hay choque que nombrar', () => {
    expect(mergePatch({ ...base }, null, { ...base, urgency: 1 })).toEqual({ write: { urgency: 1 }, overlap: [] });
  });

  it('las fechas se comparan como instantes (Date del driver, texto ISO del formulario)', () => {
    const at = '2027-03-10T14:00:00.000Z';
    expect(norm(new Date(at))).toBe(norm('2027-03-10T14:00:00Z'));
    const r = mergePatch({ starts_at: new Date(at) }, { starts_at: at }, { starts_at: '2027-03-10T15:00:00.000Z' });
    expect(r).toEqual({ write: { starts_at: '2027-03-10T15:00:00.000Z' }, overlap: [] });
  });

  it('a quién se avisa: al último que guardó, si la fila se movió, chocaron y no es uno mismo', () => {
    expect(overwrittenUser({ rowRev: 3, sentRev: 2, overlap: ['title'], lastBy: 'b', me: 'a' })).toBe('b');
    expect(overwrittenUser({ rowRev: 2, sentRev: 2, overlap: ['title'], lastBy: 'b', me: 'a' })).toBeNull();
    expect(overwrittenUser({ rowRev: 3, sentRev: 2, overlap: [], lastBy: 'b', me: 'a' })).toBeNull();
    expect(overwrittenUser({ rowRev: 3, sentRev: 2, overlap: ['title'], lastBy: 'a', me: 'a' })).toBeNull();
    expect(overwrittenUser({ rowRev: 3, sentRev: undefined, overlap: ['title'], lastBy: 'b', me: 'a' })).toBeNull();
  });

  it('los nombres de los campos, nunca sus valores ni una fecha', () => {
    expect(labelList(['starts_at', 'exact_address'])).toBe('Fecha y hora y Dirección exacta');
    expect(fieldLabels(['title', 'title'])).toEqual(['Título']);
    for (const l of fieldLabels(['starts_at', 'ends_at', 'exact_address', 'site_contacts', 'speech', 'blocks'])) expect(looksLikeDateTime(l), l).toBe(false);
  });
});

describe('el borrador en el teléfono', () => {
  const current = { title: 'Visita (demo)', summary: 'Resumen' };

  it('guarda solo lo cambiado, con su valor de partida y su versión; volver atrás lo quita', () => {
    let d = editField(emptyDraft(), current, 4, 'title', 'Visita nueva (demo)');
    expect(d).toEqual({ baseRev: 4, base: { title: 'Visita (demo)' }, values: { title: 'Visita nueva (demo)' } });
    expect(shownValues(d, current)).toEqual({ title: 'Visita nueva (demo)', summary: 'Resumen' });
    d = editField(d, current, 4, 'title', 'Visita (demo)');
    expect(d.values).toEqual({});
  });

  it('al volver, si otra persona cambió el mismo campo, sale en el aviso; «Usar lo de él» lo suelta', () => {
    const saved = editField(emptyDraft(), current, 4, 'title', 'Lo mío (demo)');
    const now = { title: 'Lo de él (demo)', summary: 'Resumen' };
    const d = restoreEditDraft(saved, now)!;
    expect(draftConflicts(d, now)).toEqual(['title']);
    // The save sends where this person started, so the server tells the other one.
    expect(savePayload(d, now, 5)).toEqual({ rev: 4, base: { title: 'Visita (demo)', summary: 'Resumen' } });
    const theirs = takeTheirs(d, 'title');
    expect(shownValues(theirs, now).title).toBe('Lo de él (demo)');
    expect(draftConflicts(theirs, now)).toEqual([]);
  });

  it('un borrador que ya está guardado (o roto) no se recupera', () => {
    const saved = editField(emptyDraft(), current, 4, 'title', 'Ya guardado (demo)');
    expect(restoreEditDraft(saved, { ...current, title: 'Ya guardado (demo)' })).toBeNull();
    expect(restoreEditDraft('basura', current)).toBeNull();
    expect(restoreEditDraft({ values: { title: { x: 1 } } }, current)).toBeNull();
  });

  it('cada persona tiene sus borradores, y «Salir» los borra todos', () => {
    expect(draftStorageKey('u1', 'evento:1')).toBe('draft:u1:evento:1');
    expect(draftStorageKey('', 'evento:1')).toBe('draft:evento:1');
    const store = new Map<string, string>([['draft:u1:evento:1', '{}'], ['draft:u2:horario:2', '{}'], ['sun-mode', 'on']]);
    const fake = { get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null, removeItem: (k: string) => void store.delete(k) };
    clearDrafts(fake);
    expect([...store.keys()]).toEqual(['sun-mode']);
  });
});

describe('el evento que nace de una ficha: nunca un contacto', () => {
  const obra = {
    name: 'Rehabilitación del puente de prueba', municipality: 'Junín', parish: 'Parroquia (demo)', sector: 'Sector (demo)',
    engineer_name: 'Residente de obra (demo)', problem: 'Se cayó la base. Llamar al 0414-1234567.', problem_since: 'hace dos años',
    why_decided: 'Paso de productores.', works: 'Pilotes nuevos, 80 m.', communities: 'Caseríos (demo)', people_count: 1200, families_count: 300,
    benefits: 'Pasa la carga.', executor: 'Vialidad (demo)', investment: '1.500.000', currency: 'VES', funding_source: 'Fondo (demo)',
    work_state: 'in_progress', progress_pct: 60, started_on: '2026-07-01', due_on: '2026-12-20', follow_up_owner: 'Persona del seguimiento (demo)',
    // A private field cast in by mistake never gets through.
    reporter_name: 'Vecina que denunció (demo)', liaison_name: 'Enlace (demo)', liaison_phone: '0000-0000902', engineer_phone: '0000-0000901',
  };

  it('la obra: título «Visita de obra», la ficha técnica con sus cifras y su fuente, sin teléfonos, nombres de contacto ni fechas', () => {
    const e = eventFromObra(obra);
    expect(e.title).toBe('Visita de obra: Rehabilitación del puente de prueba');
    expect(e.placeName).toBe('Sector (demo), Parroquia (demo)');
    expect(e.brief.in_charge).toBe('Residente de obra (demo)');
    expect(e.brief.key_facts).toContain('1.200 personas beneficiadas (Ficha del IVT)');
    expect(e.brief.key_facts).toContain('60 % de avance (Ficha del IVT)');
    const all = JSON.stringify(e);
    for (const secret of ['0414', '1234567', '0000-0000902', '0000-0000901', 'Vecina que denunció', 'Enlace (demo)', 'Persona del seguimiento', '2026-12-20', '2026-07-01']) {
      expect(all, secret).not.toContain(secret);
    }
    expect(obraVisitTitle('x'.repeat(200)).length).toBeLessThanOrEqual(140);
  });

  it('el reporte: sin su encargado (Redes nunca lee un reporte), con la cifra estimada dicha como tal', () => {
    const e = eventFromReport({ title: 'Asamblea de prueba (demo)', community: 'Sector (demo)', description: 'Se reúnen los voceros.', in_charge: 'Encargada (demo)',
      institution: 'Consejo comunal (demo)', people_count: 80, figures_kind: 'estimated', results: '', why_matters: 'Piden alumbrado.' });
    expect(e.brief.in_charge).toBe('');
    expect(JSON.stringify(e)).not.toContain('Encargada');
    expect(e.brief.key_facts).toBe('80 personas (Reporte comunitario, cifra estimada)');
  });

  it('quita lo que parece un teléfono, no las cantidades', () => {
    expect(withoutPhones('Llamar al 0414-123 45 67 o al (0276) 555-1234.')).not.toMatch(/\d{3}/);
    expect(withoutPhones('Inversión de 1.500.000 para 1200 familias')).toBe('Inversión de 1.500.000 para 1200 familias');
  });
});
