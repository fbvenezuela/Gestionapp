import type { Month } from '@/lib/domain/redes';
import { MonthMenu, MonthTabLink, NewMonthButton } from './month-tabs-client';
import { MONTH_SLOT } from './card/card-core';

// The month tabs of a section and of the feed (R4, D-67, F2, F14): one list of months for both. «Mes 1 · 3 de 8» (the
// section's pieces in that month, of its quota) or «Mes 1 · 21 de 24» (filled feed slots), the open one marked; every
// tab is a plain link with ?mes= (the month in the address rules, so it follows in every section and in the feed) that
// also remembers the month for this person without waiting (chooseMonth). «+ Nuevo mes» always visible after the tabs;
// the «⋯» of the open month: «Cambiar nombre» and «Borrar este mes» (it says first how many pieces it has and where they
// go; none is deleted). A server component: `hrefFor` runs here; the tapping parts are in month-tabs-client.tsx.
export type MonthTabsProps = {
  months: Month[]; // live months, in order (getMonths)
  active: string | null; // the open month's id (pickMonth)
  counts?: Record<string, number>; // per month id: the section's pieces, or the feed's filled slots
  quotaLabel?: string | null; // the «de N» of each tab: '8' in Posts, '24' in the feed; null = no quota (Fin de mes)
  hrefFor: (monthId: string) => string; // each tab's address, with ?mes= (sectionHref, withMonth)
  canCreate: boolean; // «+ Nuevo mes» and «Cambiar nombre»: Redes, the boss and administración
  canDelete: boolean; // «Borrar este mes» in «⋯»: Redes and the boss
  totals?: Record<string, { pieces: number; placed: number }>; // per month: every live piece and its feed places (getMonthTotals); without it, no «Borrar este mes»
};

/** «Mes 1», «Mes 1 · 3 de 8» or «Mes 1 · 3» (no quota). */
export function monthTabLabel(label: string, count?: number, quotaLabel?: string | null): string {
  if (count === undefined) return label;
  return quotaLabel ? `${label} · ${count} de ${quotaLabel}` : `${label} · ${count}`;
}

export function MonthTabs({ months, active, counts, quotaLabel, hrefFor, canCreate, canDelete, totals }: MonthTabsProps) {
  const open = months.find((m) => m.id === active) ?? null;
  const target = months.find((m) => m.id !== open?.id)?.label ?? '';
  const template = hrefFor(MONTH_SLOT);
  return (
    <nav aria-label="Meses de contenido" data-tour="month-tabs" className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
      <ul className="-mx-4 flex min-w-0 max-w-full gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {months.map((m) => (
          <li key={m.id} className="shrink-0">
            <MonthTabLink href={hrefFor(m.id)} monthId={m.id} current={m.id === active}>
              {monthTabLabel(m.label, counts ? (counts[m.id] ?? 0) : undefined, quotaLabel)}
            </MonthTabLink>
          </li>
        ))}
      </ul>
      {canCreate ? <NewMonthButton data-tour="month-new" hrefTemplate={template} /> : null}
      {open ? (
        <MonthMenu
          month={{ id: open.id, label: open.label }}
          canRename={canCreate}
          canDelete={canDelete && months.length > 1}
          total={totals ? (totals[open.id] ?? { pieces: 0, placed: 0 }) : null}
          target={target}
          hrefTemplate={template}
        />
      ) : null}
    </nav>
  );
}
