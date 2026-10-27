import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { PRIORITY, REPORT_STATUS, REPORT_TYPE } from '@/lib/data/ficha-labels';
import type { ReportListItem } from '@/lib/data/fichas';
import { fmtDate } from '@/lib/time';

// A list of community reports: overdue marked, state and priority as chips.
export function ReportList({ rows }: { rows: ReportListItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/reportes/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="min-w-0 sm:flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">{r.title}</span>
                <span className="block text-sm text-text-2 [overflow-wrap:anywhere]">
                  {r.code} · {[r.municipality, r.parish].filter(Boolean).join(', ')} · {REPORT_TYPE[r.type]} · {fmtDate(r.when, "d 'de' LLL")}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap gap-1.5">
                {r.overdue ? <Chip tone="danger">Vencida</Chip> : null}
                <Chip tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Chip>
                {r.priority ? <Chip tone={PRIORITY[r.priority].tone}>{PRIORITY[r.priority].label}</Chip> : null}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
