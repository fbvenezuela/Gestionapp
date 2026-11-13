import type { PublicStats } from '@/lib/web/participation';
import { CITIZEN_STATE_LABEL, REQUEST_TYPE_LABEL, type RequestState, type RequestType } from '@/lib/participation/input';
import { fmtDay, fmtHours, fmtNumber } from '@/lib/web/format';
import { cn } from '@/lib/cn';
import { cardClass } from './ui';

// The public figures of citizen attention (design §5, /transparencia): each with its written definition, no data of any
// person (citizen.request_stats publishes only counts; a denuncia counts only in the totals by type and state, never by
// category or municipality). Synchronous: tests render it with fake figures.

export const STAT_DEFINITIONS = [
  { term: 'Recibidas', text: 'Solicitudes recibidas en el período. No incluye las improcedentes ni las unificadas por referirse al mismo problema.' },
  { term: 'Resueltas', text: 'Solicitudes resueltas en el período.' },
  { term: 'Pendientes', text: 'Solicitudes en trámite al cierre del período.' },
  { term: 'Vencidas', text: 'Solicitudes pendientes que pasaron su plazo de atención.' },
  { term: 'Primera respuesta', text: 'Tiempo promedio entre la recepción de la solicitud y la primera respuesta de Atención ciudadana.' },
  { term: 'Resolución', text: 'Tiempo promedio entre la llegada y la resolución, para las resueltas en el período.' },
  { term: 'Por categoría y por municipio', text: 'Solicitudes recibidas, sin las denuncias, que por confidencialidad no se muestran por lugar ni por tema.' },
] as const;

function Kpi({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={cn(cardClass, 'flex flex-col gap-1 p-5')}>
      <dt className="text-[15px] font-semibold text-text-2">{label}</dt>
      <dd className={cn('text-4xl font-bold tracking-tight tabular', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-text')}>{value}</dd>
      {hint ? <dd className="text-sm text-text-2">{hint}</dd> : null}
    </div>
  );
}

function CountTable({ caption, rows }: { caption: string; rows: { label: string; count: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <table className="w-full text-left text-base">
      <caption className="mb-3 text-left text-lg font-semibold text-text">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Qué</th>
          <th scope="col">Cuántas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-border">
            <th scope="row" className="py-2.5 pr-3 font-medium text-text">
              {r.label}
              <span className="mt-1 block h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%` }} aria-hidden />
            </th>
            <td className="py-2.5 text-right font-semibold tabular text-text">{fmtNumber(r.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsView({ stats }: { stats: PublicStats }) {
  const byType = (Object.entries(stats.byType) as [RequestType, number][])
    .filter(([, n]) => n > 0)
    .map(([t, n]) => ({ label: REQUEST_TYPE_LABEL[t] ?? t, count: n }))
    .sort((a, b) => b.count - a.count);
  const byState = (Object.entries(stats.byState) as [RequestState, number][])
    .filter(([, n]) => n > 0)
    .map(([s, n]) => ({ label: CITIZEN_STATE_LABEL[s] ?? s, count: n }))
    .sort((a, b) => b.count - a.count);
  return (
    <div className="flex flex-col gap-10">
      <p className="text-base text-text-2">
        {stats.from <= '2000-01-01' ? `Desde el inicio hasta el ${fmtDay(stats.to)}.` : `Del ${fmtDay(stats.from)} al ${fmtDay(stats.to)}.`}
      </p>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Recibidas" value={fmtNumber(stats.received)} />
        <Kpi label="Resueltas" value={fmtNumber(stats.resolved)} tone="ok" />
        <Kpi label="Pendientes" value={fmtNumber(stats.pending)} />
        <Kpi label="Vencidas" value={fmtNumber(stats.overdue)} tone={stats.overdue ? 'warn' : 'neutral'} />
        <Kpi label="Primera respuesta" value={fmtHours(stats.avgFirstResponseHours)} hint="en promedio" />
        <Kpi label="Resolución" value={fmtHours(stats.avgResolutionHours)} hint="en promedio" />
      </dl>
      <div className="grid items-start gap-10 lg:grid-cols-2">
        <CountTable caption="Por tipo" rows={byType} />
        <CountTable caption="Por estado" rows={byState} />
        <CountTable caption="Por categoría (sin denuncias)" rows={stats.byCategory.map((c) => ({ label: c.name, count: c.count }))} />
        <CountTable caption="Por municipio (sin denuncias)" rows={stats.byMunicipality.map((m) => ({ label: m.name, count: m.count }))} />
      </div>
    </div>
  );
}

export function StatDefinitions() {
  return (
    <dl className="grid gap-4 md:grid-cols-2">
      {STAT_DEFINITIONS.map((d) => (
        <div key={d.term} className="border-t border-border pt-3">
          <dt className="font-semibold text-text">{d.term}</dt>
          <dd className="mt-1 text-[15px] leading-relaxed text-text-2">{d.text}</dd>
        </div>
      ))}
    </dl>
  );
}
