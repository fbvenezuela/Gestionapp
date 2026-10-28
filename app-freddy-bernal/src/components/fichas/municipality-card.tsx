import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { Counters } from '@/lib/domain/report-status';

// One municipality with its counters (§4.2): abiertas, en ejecución, finalizadas and vencidas (by their follow-up
// date). The obra count only for those who see obras. Solid (no blur): it comes in a grid of all the municipalities.
export function MunicipalityCard({ name, href, counters, obras }: { name: string; href: string; counters: Counters; obras?: number }) {
  const cells: { label: string; value: number; tone?: string }[] = [
    { label: 'Abiertas', value: counters.open },
    { label: 'En ejecución', value: counters.inProgress },
    { label: 'Finalizadas', value: counters.finished },
    { label: 'Vencidas', value: counters.overdue, tone: counters.overdue ? 'text-danger' : undefined },
  ];
  return (
    <Card solid className={cn('flex flex-col', counters.overdue > 0 && 'border-danger/40')}>
      <Link href={href} className="flex min-h-14 items-center justify-between gap-2 rounded-t-[var(--radius-card)] px-4 pt-3 pb-2 hover:bg-surface-2">
        <h3 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{name}</h3>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
      <dl className="grid grid-cols-4 gap-1 px-3 pb-3">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 text-center">
            <dt className="truncate text-[11px] font-semibold text-text-2" title={c.label}>{c.label}</dt>
            <dd className={cn('text-xl font-bold tabular', c.tone)}>{c.value}</dd>
          </div>
        ))}
      </dl>
      {obras !== undefined ? <p className="border-t border-border px-4 py-2 text-sm text-text-2">{obras} {obras === 1 ? 'ficha de obra' : 'fichas de obra'}</p> : null}
    </Card>
  );
}
