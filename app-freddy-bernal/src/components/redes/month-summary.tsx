import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { MediaThumb } from '@/components/media/media-thumb';
import { NETWORK_LABEL } from '@/lib/data/labels';
import type { MonthSummary as Summary } from '@/lib/data/redes';
import { FORMAT } from '@/lib/domain/redes';

// «Resumen del mes» (D-72) on top of Fin de mes: the month's accountability, for the boss (everyone sees it). Per
// format, made of its quota, approved and published; the average receptivity (only what was rated); designs
// disapproved and open notices; and what went out, with its thumbnail. Read-only.
const num = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 1 });

export function MonthSummary({ summary, monthLabel }: { summary: Summary; monthLabel: string }) {
  const r = summary.receptivity;
  return (
    <Card data-tour="month-summary" className="mb-5">
      <CardHeader title={`Resumen del mes · ${monthLabel}`} subtitle="Lo que se hizo, lo aprobado y lo publicado: la rendición de cuentas del mes." />
      <CardBody className="flex flex-col gap-4">
        <div>
          <table className="w-full min-w-0 text-left text-sm min-[600px]:text-[15px]">
            <caption className="sr-only">Piezas del mes por formato</caption>
            <thead>
              <tr className="border-b border-border text-sm text-text-2">
                <th scope="col" className="py-2 pr-2 min-[600px]:pr-3 font-semibold">Formato</th>
                <th scope="col" className="py-2 pr-2 min-[600px]:pr-3 font-semibold">Hechas</th>
                <th scope="col" className="py-2 pr-2 min-[600px]:pr-3 font-semibold">Aprobadas</th>
                <th scope="col" className="py-2 font-semibold">Publicadas</th>
              </tr>
            </thead>
            <tbody>
              {summary.formats.map((f) => (
                <tr key={f.format} className="border-b border-border last:border-0">
                  <th scope="row" className="py-2 pr-2 min-[600px]:pr-3 font-semibold">{FORMAT[f.format].plural}</th>
                  <td className="py-2 pr-2 min-[600px]:pr-3 tabular">{f.quota === null ? f.made : `${f.made} de ${f.quota}`}</td>
                  <td className="py-2 pr-2 min-[600px]:pr-3 tabular">{f.approved}</td>
                  <td className="py-2 tabular">{f.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-wrap gap-2">
          <li>
            <Chip tone="info" className="whitespace-normal">{r.avg === null ? 'Receptividad: sin evaluar' : `Receptividad media ${num(r.avg)} de 10 · ${r.count} ${r.count === 1 ? 'pieza puntuada' : 'piezas puntuadas'}`}</Chip>
          </li>
          <li>
            <Chip tone={summary.designBad ? 'danger' : 'neutral'}>{summary.designBad === 1 ? '1 diseño desaprobado' : `${summary.designBad} diseños desaprobados`}</Chip>
          </li>
          <li>
            <Chip tone={summary.openNotices ? 'warn' : 'neutral'}>{summary.openNotices === 1 ? '1 aviso abierto' : `${summary.openNotices} avisos abiertos`}</Chip>
          </li>
        </ul>
        <section aria-label="Lo publicado" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Lo publicado</h3>
          {summary.published.length ? (
            <ul className="grid gap-2 min-[600px]:grid-cols-2">
              {summary.published.map((p) => (
                <li key={p.pieceId} className="flex min-w-0 items-center gap-3">
                  <MediaThumb ids={p.thumbIds} className="h-11 w-11" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.title}</span>
                    <span className="block text-sm text-text-2">
                      {FORMAT[p.format].label} · {p.networks.map((n) => NETWORK_LABEL[n] ?? n).join(', ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-2">Todavía no se publicó nada este mes.</p>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
