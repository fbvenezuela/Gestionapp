import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PRIORITY, REPORT_STATUS, REPORT_TYPE } from '@/lib/data/ficha-labels';
import type { ReportListItem } from '@/lib/data/fichas';
import { daysLate } from '@/lib/domain/report-status';

// «Lo vencido sale arriba en el inicio del director de política y del jefe» (§4.2): the community reports whose
// follow-up date passed and that are neither finished nor suspended, the most late first.
export function OverdueReports({ rows, todayIso, total, moreHref = '/municipios?vencidas=1', title = 'Vencidas en los municipios' }: { rows: ReportListItem[]; todayIso: string; total?: number; moreHref?: string; title?: string }) {
  if (!rows.length) return null;
  return (
    <Card className="mb-5 border-danger/40" role="region" aria-labelledby="overdue-title">
      <CardHeader
        title={
          <span id="overdue-title" className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden /> {title}
            {total !== undefined ? ` (${total})` : ''}
          </span>
        }
        subtitle="Pasó su fecha de seguimiento y no están finalizadas ni suspendidas."
        action={<Link href={moreHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">Ver todas</Link>}
      />
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const late = daysLate(r.follow_up_due, todayIso);
          return (
            <li key={r.id}>
              <Link href={`/reportes/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 sm:flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{r.title}</span>
                    <span className="block text-sm text-text-2 [overflow-wrap:anywhere]">
                      {r.municipality} · {REPORT_TYPE[r.type]} · {REPORT_STATUS[r.status].label} · venció hace {late} {late === 1 ? 'día' : 'días'}
                    </span>
                  </span>
                  {r.priority ? <Chip tone={PRIORITY[r.priority].tone} className="shrink-0 self-start sm:self-center">Prioridad {PRIORITY[r.priority].label.toLowerCase()}</Chip> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
