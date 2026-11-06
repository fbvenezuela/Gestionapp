// «La oficina» (06/11/2026): which room an activity is in, the script's first draft and the drawing's cells. Pure.
import { describe, expect, it } from 'vitest';
import { officeRoom, ROOM, ROOMS, scriptDraft, type OfficeFacts } from '@/lib/domain/office';
import { myRooms } from '@/lib/domain/office-roles';
import { ROOM_CELL } from '@/components/office/office-map';

const base: OfficeFacts = {
  tracked: true, scriptStatus: 'none', cleanDone: false, brutalDone: false, shots: 0, rawMedia: 0,
  pieces: 0, piecesInReview: 0, piecesApproved: 0, piecesApprovedWithCopies: 0, published: 0,
};
const room = (f: Partial<OfficeFacts>) => officeRoom({ ...base, ...f });

describe('la sala de cada actividad', () => {
  it('sigue la línea, paso por paso', () => {
    expect(room({})).toBe('reception');
    expect(room({ scriptStatus: 'draft' })).toBe('script');
    expect(room({ scriptStatus: 'approved' })).toBe('storyboard');
    expect(room({ scriptStatus: 'approved', shots: 3 })).toBe('recording');
    expect(room({ scriptStatus: 'approved', shots: 3, rawMedia: 2 })).toBe('clean_cut');
    expect(room({ scriptStatus: 'approved', shots: 3, rawMedia: 2, cleanDone: true })).toBe('brutal_edit');
    expect(room({ scriptStatus: 'approved', shots: 3, rawMedia: 2, cleanDone: true, brutalDone: true })).toBe('approval');
    expect(room({ scriptStatus: 'approved', shots: 3, rawMedia: 2, cleanDone: true, brutalDone: true, pieces: 1, piecesInReview: 1 })).toBe('approval');
    expect(room({ scriptStatus: 'approved', shots: 3, rawMedia: 2, cleanDone: true, brutalDone: true, pieces: 1, piecesApproved: 1 })).toBe('copywriting');
    expect(room({ pieces: 1, piecesApproved: 1, piecesApprovedWithCopies: 1 })).toBe('publishing');
    expect(room({ pieces: 1, piecesApproved: 1, published: 2 })).toBe('analytics');
  });

  it('una actividad de antes de la oficina no vuelve a Recepción por lo que ya se hizo afuera', () => {
    const old = { tracked: false };
    expect(room({ ...old })).toBe('reception');
    expect(room({ ...old, shots: 1 })).toBe('recording');
    expect(room({ ...old, shots: 2, rawMedia: 2 })).toBe('clean_cut');
    expect(room({ ...old, shots: 2, rawMedia: 2, pieces: 1, piecesInReview: 1 })).toBe('approval');
  });

  it('un video en revisión espera al jefe aunque falte marcar un paso', () => {
    expect(room({ scriptStatus: 'approved', shots: 1, rawMedia: 1, pieces: 1, piecesInReview: 1 })).toBe('approval');
  });
});

describe('el borrador del guion', () => {
  it('usa solo lo que dice la ficha y dice lo que falta', () => {
    const s = scriptDraft({ title: 'Entrega de un módulo (demo)', work: 'Pintura y techo', ledBy: '', achievements: 'Techo nuevo', keyFacts: '' });
    expect(s).toContain('Pintura y techo');
    expect(s).toContain('Techo nuevo');
    expect(s.match(/\(falta en la ficha\)/g)).toHaveLength(2);
    expect(s).not.toMatch(/\d{2,}/);
    expect(s.split('\n').filter((l) => l.startsWith('Toma'))).toHaveLength(5);
  });
});

describe('las salas', () => {
  it('diez salas, cada una con su lugar en el dibujo y su ejemplo', () => {
    expect(ROOMS).toHaveLength(10);
    const cells = new Set(ROOMS.map((r) => ROOM_CELL[r].join(',')));
    expect(cells.size).toBe(10);
    for (const r of ROOMS) expect(ROOM[r].example.length).toBeGreaterThan(10);
  });

  it('el editor en línea y la oficina del jefe son de personas; la IA solo propone', () => {
    expect(ROOM.clean_cut.crew).toBe('person');
    expect(ROOM.approval.crew).toBe('person');
    expect(ROOM.script.crew).toBe('ai_and_person');
  });

  it('las salas de cada rol', () => {
    expect(myRooms(['boss'])).toEqual(['approval']);
    expect(myRooms(['dispatch'])).toEqual(['reception']);
    expect(myRooms(['camera'])).toContain('recording');
    expect(myRooms(['politics'])).toEqual([]);
  });
});
