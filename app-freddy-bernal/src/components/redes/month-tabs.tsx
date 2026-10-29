import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { Month } from '@/lib/domain/redes';

// The month tabs of a section and of the feed (R4, D-67, F14): one list of months for both. «Mes 1 · 3 de 8» (the
// section's pieces in that month, of its quota) or «Mes 1 · 21 de 24» (filled feed slots), the current one marked;
// «+ Nuevo mes» always visible after the tabs; the «⋯» menu («Cambiar nombre», «Borrar este mes») for who may.
// A server component: `hrefFor` runs here, so every tab is a plain link with ?mes= (the month in the address rules).
//
// Paso 0 fixes the props and the tutorials' anchors (month-tabs, month-new) with a minimal body: links without counts
// and «+ Nuevo mes» not wired yet. WP-C1 builds the rest (chooseMonth on each tab without waiting, createMonth, the
// «⋯» menu with ConfirmDialog) keeping these props.
export type MonthTabsProps = {
  months: Month[]; // live months, in order (getMonths)
  active: string | null; // the open month's id (pickMonth)
  counts?: Record<string, number>; // per month id: the section's pieces, or the feed's filled slots
  quotaLabel?: string | null; // the «de N» of each tab: '8' in Posts, '24' in the feed; null = no quota (Fin de mes)
  hrefFor: (monthId: string) => string; // each tab's address, with ?mes= (sectionHref, withMonth)
  canCreate: boolean; // «+ Nuevo mes»: Redes, the boss and administración
  canDelete: boolean; // «Borrar este mes» in «⋯»: Redes and the boss
};

/** «Mes 1», «Mes 1 · 3 de 8» or «Mes 1 · 3» (no quota). */
export function monthTabLabel(label: string, count?: number, quotaLabel?: string | null): string {
  if (count === undefined) return label;
  return quotaLabel ? `${label} · ${count} de ${quotaLabel}` : `${label} · ${count}`;
}

export function MonthTabs({ months, active, counts, quotaLabel, hrefFor, canCreate }: MonthTabsProps) {
  return (
    <nav aria-label="Meses de contenido" data-tour="month-tabs" className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
      <ul className="-mx-4 flex min-w-0 max-w-full gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {months.map((m) => {
          const current = m.id === active;
          return (
            <li key={m.id} className="shrink-0">
              <Link
                href={hrefFor(m.id)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--radius-control)] border px-4 text-sm font-semibold',
                  current ? 'border-slate bg-slate text-on-slate' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
                )}
              >
                {monthTabLabel(m.label, counts ? (counts[m.id] ?? 0) : undefined, quotaLabel)}
              </Link>
            </li>
          );
        })}
      </ul>
      {canCreate ? (
        <button
          type="button"
          data-tour="month-new"
          disabled
          className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-control)] border border-dashed border-border bg-surface px-4 text-sm font-semibold text-text-2 disabled:opacity-60"
        >
          + Nuevo mes
        </button>
      ) : null}
    </nav>
  );
}
