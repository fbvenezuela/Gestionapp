import Link from 'next/link';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { DeskNav } from '@/components/attention/desk-nav';
import { Distribution, Figure, TimeFigure, byStateRows, byTypeRows } from '@/components/attention/stats';
import { deskStats } from '@/lib/data/attention';
import { STAT_DEFINITIONS, deskAccess } from '@/lib/domain/attention';
import { fmtDay, today } from '@/lib/time';

export const metadata = { title: 'Cifras de atención' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string | string[] | undefined) => (typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

// The attention desk's figures (design §5): received, resolved, pending, overdue, the time to the first response and to
// the resolution (median and average) and what arrived by category, municipality and area, each one with its written
// definition. For the coordinator, the auditor and the boss (public.request_stats() refuses anyone else; for the auditor
// and the boss a denuncia counts only in the totals by kind and state). Last 30 days unless other dates are chosen.
export default async function AttentionStatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireRole('attention_coordinator', 'auditor', 'boss');
  const access = deskAccess(s.roles);
  const sp = await searchParams;
  const all = sp.periodo === 'todo';
  const t = today();
  let from = all ? null : (day(sp.desde) ?? t.minus({ days: 29 }).toISODate()!);
  let to = all ? null : (day(sp.hasta) ?? t.toISODate()!);
  if (from && to && from > to) [from, to] = [to, from];
  const st = await db(s, (sql) => deskStats(sql, from, to));
  const range = all ? 'Desde el inicio hasta hoy' : `Del ${fmtDay(st.from, "d 'de' LLL 'de' yyyy")} al ${fmtDay(st.to, "d 'de' LLL 'de' yyyy")}`;
  const quick = [
    { label: 'Últimos 30 días', href: '/admin/atencion/estadisticas' },
    { label: 'Este mes', href: `/admin/atencion/estadisticas?desde=${t.startOf('month').toISODate()}&hasta=${t.toISODate()}` },
    { label: 'Todo', href: '/admin/atencion/estadisticas?periodo=todo' },
  ];
  const nothing = st.received === 0 && st.resolved === 0 && st.pending === 0;
  return (
    <div className="flex flex-col">
      <PageHeader title="Cifras de atención" subtitle={range} />
      <DeskNav access={access} current="cifras" />
      <Card className="mb-5 p-4">
        <form method="get" action="/admin/atencion/estadisticas" className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" aria-label="Fechas de las cifras">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Desde
            <Input type="date" name="desde" defaultValue={from ?? ''} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Hasta
            <Input type="date" name="hasta" defaultValue={to ?? ''} />
          </label>
          <Button type="submit" variant="secondary">Ver</Button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-x-4">
          {quick.map((q) => (
            <li key={q.label}>
              <Link href={q.href} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent-ink">{q.label}</Link>
            </li>
          ))}
        </ul>
      </Card>
      {nothing ? (
        <p className="mb-5 rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 py-3 text-[15px] text-text-2" role="status">
          No hay solicitudes en estas fechas. Prueba con otras o con «Todo».
        </p>
      ) : null}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Recibidas" value={st.received} definition={STAT_DEFINITIONS.received} />
        <Figure label="Resueltas" value={st.resolved} definition={STAT_DEFINITIONS.resolved} tone="ok" />
        <Figure label="Pendientes" value={st.pending} definition={STAT_DEFINITIONS.pending} />
        <Figure label="Vencidas" value={st.overdue} definition={STAT_DEFINITIONS.overdue} tone={st.overdue ? 'danger' : undefined} />
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TimeFigure
          label="Tiempo a la primera respuesta"
          median={st.medianFirstResponseHours}
          average={st.avgFirstResponseHours}
          count={st.answered}
          definition={`${STAT_DEFINITIONS.firstResponse} Con respuesta: ${st.answered}.`}
        />
        <TimeFigure label="Tiempo de resolución" median={st.medianResolutionHours} average={st.avgResolutionHours} count={st.resolved} definition={STAT_DEFINITIONS.resolution} />
      </div>
      <p className="mb-5 text-sm text-text-2">{STAT_DEFINITIONS.median}</p>
      <p className="mb-3 text-sm text-text-2">{STAT_DEFINITIONS.distribution}</p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Distribution title="Por tipo" rows={byTypeRows(st.byType)} empty="Nada llegó en estas fechas." caption="Solicitudes recibidas por tipo" />
        <Distribution title="Por estado de hoy" rows={byStateRows(st.byState)} empty="Nada llegó en estas fechas." caption="Solicitudes recibidas por estado actual" />
        <Distribution title="Por categoría" rows={st.byCategory} empty="Nada llegó en estas fechas." caption="Solicitudes recibidas por categoría" />
        <Distribution title="Por municipio" rows={st.byMunicipality} empty="Nada con municipio en estas fechas." caption="Solicitudes recibidas por municipio" />
        <Distribution title="Por área" rows={st.byArea} empty="Nada con área en estas fechas." caption="Solicitudes recibidas por área" />
      </div>
    </div>
  );
}
