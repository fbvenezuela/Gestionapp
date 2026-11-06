import { Card, CardHeader } from '@/components/ui/card';
import { REQUEST_STATE_LABEL, REQUEST_TYPE_LABEL, fmtHours, type RequestState, type RequestType } from '@/lib/domain/attention';

// The figures of the attention desk (design §5): each number with its written definition right under it, the times
// as median and average, and the distributions as plain bars (a table underneath for screen readers: the bars are
// decoration). Empty states say so instead of drawing nothing.

export function Figure({ label, value, definition, tone }: { label: string; value: string | number; definition: string; tone?: 'danger' | 'ok' }) {
  return (
    <Card className="flex flex-col gap-1 p-4 sm:p-5">
      <p className="label-caps">{label}</p>
      <p className={`text-3xl font-bold tabular ${tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : 'text-text'}`}>{value}</p>
      <p className="text-sm text-text-2">{definition}</p>
    </Card>
  );
}

export function TimeFigure({ label, median, average, count, definition }: { label: string; median: number | null; average: number | null; count: number; definition: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4 sm:p-5">
      <p className="label-caps">{label}</p>
      {count ? (
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-sm text-text-2">Mediana</dt>
            <dd className="text-2xl font-bold tabular">{fmtHours(median)}</dd>
          </div>
          <div>
            <dt className="text-sm text-text-2">Promedio</dt>
            <dd className="text-2xl font-bold tabular">{fmtHours(average)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-[15px] text-text-2">Sin casos para medir en estas fechas.</p>
      )}
      <p className="text-sm text-text-2">{definition}</p>
    </Card>
  );
}

type Row = { name: string; count: number };

export function Distribution({ title, rows, empty, caption }: { title: string; rows: Row[]; empty: string; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card solid>
      <CardHeader title={title} />
      {rows.length ? (
        <div className="p-4">
          <ul className="flex flex-col gap-2" aria-hidden>
            {rows.map((r) => (
              <li key={r.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
                <span className="truncate" title={r.name}>{r.name}</span>
                <span className="h-3 rounded-full bg-surface-2">
                  <span className="block h-3 rounded-full bg-accent" style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%` }} />
                </span>
                <span className="tabular font-semibold">{r.count}</span>
              </li>
            ))}
          </ul>
          <table className="sr-only">
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Solicitudes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">{r.name}</th>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-[15px] text-text-2">{empty}</p>
      )}
    </Card>
  );
}

export const byTypeRows = (o: Record<string, number>): Row[] =>
  Object.entries(o).map(([k, v]) => ({ name: REQUEST_TYPE_LABEL[k as RequestType] ?? k, count: Number(v) })).sort((a, b) => b.count - a.count);
export const byStateRows = (o: Record<string, number>): Row[] =>
  Object.entries(o).map(([k, v]) => ({ name: REQUEST_STATE_LABEL[k as RequestState] ?? k, count: Number(v) })).sort((a, b) => b.count - a.count);
