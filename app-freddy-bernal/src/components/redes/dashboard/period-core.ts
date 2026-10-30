// The board's period (R4, D-71), pure: the open month or the quarter that holds it, its label and where «Anterior» and
// «Siguiente» go. The period lives in the address (?mes= and ?vista=trimestre), so a reload or a shared link shows the
// same board, and the open month stays the one every section and the feed follow (F2).

import { withMonth, type Month } from '@/lib/domain/redes';
import { periodCount, periodMonths, type PeriodMode } from '@/lib/domain/redes-dashboard';

export type PeriodLink = { href: string; monthId: string } | null;

/** The board's address for a month and a view: /redes?mes=<id> or /redes?mes=<id>&vista=trimestre. */
export function boardHref(monthId: string | null, mode: PeriodMode): string {
  const base = withMonth('/redes', monthId);
  return mode === 'quarter' ? `${base}${base.includes('?') ? '&' : '?'}vista=trimestre` : base;
}

export type BoardPeriod = { ids: string[]; index: number; label: string; detail?: string; prev: PeriodLink; next: PeriodLink };

/** The period of the board: the open month, or the quarter (three months in a row of the list) that holds it. «Anterior»
 * and «Siguiente» open the month before or after (or the first month of the quarter before or after); null at the ends. */
export function boardPeriod(months: Month[], active: Month | null, mode: PeriodMode): BoardPeriod {
  const found = active ? months.findIndex((m) => m.id === active.id) : 0;
  const at = Math.max(0, found);
  const index = mode === 'quarter' ? Math.floor(at / 3) : at;
  const p = periodMonths(months, mode, index);
  const total = periodCount(months, mode);
  const link = (i: number): PeriodLink => {
    if (i < 0 || i >= total) return null;
    const m = months[mode === 'quarter' ? i * 3 : i];
    return m ? { href: boardHref(m.id, mode), monthId: m.id } : null;
  };
  if (mode === 'quarter') return { ids: p.ids, index: p.index, label: `Trimestre ${p.index + 1}`, detail: p.label, prev: link(p.index - 1), next: link(p.index + 1) };
  return { ids: p.ids, index: p.index, label: p.label, prev: link(p.index - 1), next: link(p.index + 1) };
}
