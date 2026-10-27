// The counters per municipality and what is overdue (§4.2): «abiertas, en ejecución, finalizadas, vencidas por su
// fecha de seguimiento», and «lo vencido sale arriba».
import { describe, it, expect } from 'vitest';
import { bucketOf, countersFor, daysLate, isOverdue, mergeCounters, sortReports, totals } from '@/lib/domain/report-status';
import { REPORT_STATUSES } from '@/lib/data/ficha-labels';

const TODAY = '2026-10-27';

describe('vencida', () => {
  it('pasó su fecha de seguimiento y no está finalizada ni suspendida', () => {
    expect(isOverdue('2026-10-26', 'pending', TODAY)).toBe(true);
    expect(isOverdue('2026-10-26', 'in_progress', TODAY)).toBe(true);
    expect(isOverdue('2026-10-26', 'planned', TODAY)).toBe(true);
    expect(isOverdue('2026-10-27', 'pending', TODAY)).toBe(false);
    expect(isOverdue('2026-10-26', 'finished', TODAY)).toBe(false);
    expect(isOverdue('2026-10-26', 'suspended', TODAY)).toBe(false);
    expect(isOverdue(null, 'pending', TODAY)).toBe(false);
  });

  it('las fechas llegan como Date a medianoche UTC (la base) o como texto', () => {
    expect(isOverdue(new Date('2026-10-20T00:00:00Z'), 'pending', TODAY)).toBe(true);
    expect(daysLate(new Date('2026-10-20T00:00:00Z'), TODAY)).toBe(7);
    expect(daysLate('2026-10-27', TODAY)).toBe(0);
    expect(daysLate('2026-11-01', TODAY)).toBe(0);
  });
});

describe('contadores', () => {
  it('abiertas = programado + pendiente; vencidas se cuentan aparte', () => {
    expect(bucketOf('planned')).toBe('open');
    expect(bucketOf('pending')).toBe('open');
    expect(bucketOf('in_progress')).toBe('inProgress');
    expect(bucketOf('finished')).toBe('finished');
    expect(bucketOf('suspended')).toBeNull();
    for (const s of REPORT_STATUSES) expect(['open', 'inProgress', 'finished', null]).toContain(bucketOf(s));
    const c = countersFor(
      [
        { status: 'planned', follow_up_due: '2026-11-01' },
        { status: 'pending', follow_up_due: '2026-10-01' },
        { status: 'in_progress', follow_up_due: '2026-10-20' },
        { status: 'finished', follow_up_due: '2026-10-01' },
        { status: 'suspended', follow_up_due: '2026-10-01' },
      ],
      TODAY,
    );
    expect(c).toEqual({ open: 2, inProgress: 1, finished: 1, overdue: 2 });
  });

  it('una tarjeta por municipio de la lista, en su orden, con ceros; uno que ya no está, al final', () => {
    const rows = [
      { municipality: 'Torbes', open: 2, inProgress: 0, finished: 1, overdue: 1 },
      { municipality: 'Municipio viejo (demo)', open: 1, inProgress: 0, finished: 0, overdue: 0 },
    ];
    const merged = mergeCounters(['Junín', 'Torbes'], rows);
    expect(merged.map((m) => m.municipality)).toEqual(['Junín', 'Torbes', 'Municipio viejo (demo)']);
    expect(merged[0]).toEqual({ municipality: 'Junín', open: 0, inProgress: 0, finished: 0, overdue: 0 });
    expect(merged[1]).toMatchObject({ open: 2, finished: 1, overdue: 1 });
    expect(totals(merged)).toEqual({ open: 3, inProgress: 0, finished: 1, overdue: 1 });
  });
});

describe('lo vencido arriba', () => {
  it('primero las vencidas (la más atrasada arriba), después por fecha, la más nueva primero', () => {
    const rows = [
      { id: 'a', status: 'planned', follow_up_due: '2026-11-10', when: '2026-10-26T10:00:00Z' },
      { id: 'b', status: 'pending', follow_up_due: '2026-10-25', when: '2026-10-01T10:00:00Z' },
      { id: 'c', status: 'in_progress', follow_up_due: '2026-10-10', when: '2026-10-02T10:00:00Z' },
      { id: 'd', status: 'finished', follow_up_due: '2026-10-01', when: '2026-10-27T10:00:00Z' },
      { id: 'e', status: 'planned', follow_up_due: null, when: '2026-10-20T10:00:00Z' },
    ];
    expect(sortReports(rows, TODAY).map((r) => r.id)).toEqual(['c', 'b', 'd', 'a', 'e']);
  });
});
