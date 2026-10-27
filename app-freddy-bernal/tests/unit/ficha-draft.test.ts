// What the phone keeps of a ficha being written (src/lib/domain/ficha-draft.ts and useDraft): opening a form and
// leaving keeps nothing, a draft never brings back someone else's old values, a field someone else changed in
// between makes the save say «Ojo», and a preset in the link wins over an old new-form draft. All data invented.
import { describe, it, expect } from 'vitest';
import { EMPTY_DRAFT, draftConflicts, draftValues, editMark, editValue, editWantsAgenda, normalizeDraft, restoreDraft, revToSend, type DraftBase } from '@/lib/domain/ficha-draft';
import { sameJson } from '@/lib/hooks/use-draft';

const server = (over: Partial<DraftBase['values']> = {}, rev = 3): DraftBase => ({
  values: { name: 'Asfaltado de prueba (demo)', engineer_name: 'Ingeniera de vialidad (demo)', problem: 'Huecos en la vía.', sector: '', ...over },
  marks: { investment: 'to_confirm' },
  wantsAgenda: null,
  rev,
});
// What the phone would hold: JSON, as localStorage gives it back.
const stored = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

describe('abrir el formulario y salir no deja nada', () => {
  it('sin cambios no hay borrador: el hook no escribe hasta un cambio de verdad, y uno igual al inicio se bota', () => {
    const base = server();
    expect(restoreDraft(stored(EMPTY_DRAFT), base, false)).toBeNull();
    expect(sameJson(EMPTY_DRAFT, { wantsAgenda: null, marks: {}, values: {}, base: null })).toBe(true);
    // Typing and going back to what it was removes the change.
    let d = editValue(EMPTY_DRAFT, base, 'sector', 'Sector Las Palmas (demo)');
    d = editValue(d, base, 'sector', '');
    expect(d.values).toEqual({});
    expect(restoreDraft(stored(d), base, false)).toBeNull();
  });

  it('un borrador del formato viejo (los valores completos) no se recupera', () => {
    const old = { values: { name: 'Asfaltado de prueba (demo)', engineer_name: 'Ingeniera de vialidad (demo)' }, marks: { investment: 'to_confirm' }, wantsAgenda: null };
    expect(normalizeDraft(old)).toEqual(EMPTY_DRAFT);
    expect(restoreDraft(old, server({ engineer_name: 'Ing. Cambiado por despacho (demo)' }), false)).toBeNull();
  });
});

describe('volver a un formulario de edición', () => {
  it('lo que cambió otra persona en otro campo se queda; lo mío va encima, y se guarda sin «Ojo» (rev actual)', () => {
    const before = server({}, 3);
    const d = editValue(EMPTY_DRAFT, before, 'problem', 'Huecos grandes; en lluvia no suben los carros.');
    expect(d.base).toBe(3);
    // Despacho saved «Ingeniero responsable» meanwhile: rev 4.
    const now = server({ engineer_name: 'Ing. Cambiado por despacho (demo)' }, 4);
    const back = restoreDraft(stored(d), now, false)!;
    expect(back).not.toBeNull();
    const shown = draftValues(back, now);
    expect(shown.values.engineer_name).toBe('Ing. Cambiado por despacho (demo)');
    expect(shown.values.problem).toBe('Huecos grandes; en lluvia no suben los carros.');
    expect(draftConflicts(back, now)).toEqual([]);
    expect(revToSend(back, now)).toBe(4);
  });

  it('si la otra persona cambió el mismo campo, queda lo mío y se manda el rev viejo para que el servidor diga «Ojo»', () => {
    const before = server({}, 3);
    const d = editValue(EMPTY_DRAFT, before, 'engineer_name', 'Ing. de la IVT (demo)');
    const now = server({ engineer_name: 'Ing. Cambiado por despacho (demo)' }, 4);
    const back = restoreDraft(stored(d), now, false)!;
    expect(draftValues(back, now).values.engineer_name).toBe('Ing. de la IVT (demo)');
    expect(draftConflicts(back, now)).toEqual(['engineer_name']);
    expect(revToSend(back, now)).toBe(3);
    // Typing again in that field keeps the conflict (it started from the old value).
    const again = editValue(back, now, 'engineer_name', 'Ing. de la IVT, segunda vez (demo)');
    expect(draftConflicts(again, now)).toEqual(['engineer_name']);
  });

  it('un cambio que ya está en el servidor no se recupera (nada que traer de vuelta)', () => {
    const d = editValue(EMPTY_DRAFT, server({}, 3), 'sector', 'Sector Las Palmas (demo)');
    expect(restoreDraft(stored(d), server({ sector: 'Sector Las Palmas (demo)' }, 4), false)).toBeNull();
  });

  it('las marcas «No aplica» / «Por confirmar» y el interruptor de la agenda siguen las mismas reglas', () => {
    const before: DraftBase = { ...server({}, 2), wantsAgenda: false };
    let d = editMark(EMPTY_DRAFT, before, 'investment', undefined);
    d = editMark(d, before, 'sector', 'not_applicable');
    d = editWantsAgenda(d, before, true);
    const shown = draftValues(d, before);
    expect(shown.marks).toEqual({ sector: 'not_applicable' });
    expect(shown.wantsAgenda).toBe(true);
    // Someone else turned the agenda on meanwhile: nothing to bring back for it.
    const now: DraftBase = { ...before, wantsAgenda: true, rev: 3 };
    const back = restoreDraft(stored(d), now, false)!;
    expect(back.wantsAgenda).toBeNull();
    expect(draftConflicts(back, now)).toEqual([]);
    expect(editWantsAgenda(EMPTY_DRAFT, before, false).wantsAgenda).toBeNull();
  });
});

describe('volver a un formulario nuevo', () => {
  it('el municipio del enlace (?municipio=) gana sobre un borrador viejo', () => {
    // Opened with ?municipio=Torbes, typed the title, left.
    const torbes: DraftBase = { values: { title: '', municipality: 'Torbes' }, marks: {}, wantsAgenda: null, rev: null };
    let d = editValue(EMPTY_DRAFT, torbes, 'title', 'Jornada de prueba (demo)');
    d = editValue(d, torbes, 'municipality', 'Torbes');
    expect(d.values.municipality).toBeUndefined();
    // Now opened from Junín: the title comes back, the municipality is Junín.
    const junin: DraftBase = { values: { title: '', municipality: 'Junín' }, marks: {}, wantsAgenda: null, rev: null };
    const back = restoreDraft(stored(d), junin, true)!;
    expect(draftValues(back, junin).values).toEqual({ title: 'Jornada de prueba (demo)', municipality: 'Junín' });
    // A municipality typed by hand under another preset is dropped too.
    const moved = editValue(EMPTY_DRAFT, torbes, 'municipality', 'Cárdenas');
    expect(restoreDraft(stored(moved), junin, true)).toBeNull();
    expect(revToSend(back, junin)).toBeUndefined();
  });
});
