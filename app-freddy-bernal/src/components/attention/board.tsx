import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { fmtDate } from '@/lib/time';
import { BOARD_COLUMNS, REQUEST_STATE_LABEL, inboxQuery, type InboxFilters, type RequestState } from '@/lib/domain/attention';
import type { InboxRow } from '@/lib/data/attention';
import { OverdueChip, PriorityChip, Reference, TypeChip } from './labels';
import { QuickMove } from './quick-move';

// The board by state (design §5): one column per state while the case is open, plus «Resuelto»; the finished ones
// (cerrado, no procede) are counted with a link to the list. On the phone the columns go one under the other; from the
// laptop up, side by side (the board scrolls sideways inside its own box, never the page). Up to 40 cards per column
// (the newest); the list has the rest. Who works the case moves it with the buttons; who only reads sees no buttons.
export function Board({ f, rows, counts }: { f: InboxFilters; rows: InboxRow[]; counts: Record<RequestState, number> }) {
  const finished = counts.cerrado + counts.no_procede;
  return (
    <div className="flex flex-col gap-4 lg:grid lg:auto-cols-[minmax(17rem,1fr)] lg:grid-flow-col lg:overflow-x-auto lg:pb-2">
      {BOARD_COLUMNS.map((state) => {
        const cards = rows.filter((r) => r.state === state);
        const headingId = `columna-${state}`;
        return (
          <section key={state} aria-labelledby={headingId} className="min-w-0">
            <Card solid className="flex h-full flex-col">
              <div className="border-b border-border px-4 py-3">
                <h2 id={headingId} className="flex items-center justify-between gap-2 text-base font-semibold">
                  {REQUEST_STATE_LABEL[state]} <span className="tabular text-text-2">{counts[state]}</span>
                </h2>
              </div>
              {cards.length ? (
                <ul className="flex flex-col gap-2 p-3">
                  {cards.map((r) => (
                    <li key={r.id} className="rounded-[var(--radius-control)] border border-border bg-surface-2 p-3">
                      <Link href={`/admin/atencion/${r.id}`} className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Reference value={r.reference} />
                          <OverdueChip overdue={r.overdue} />
                          <PriorityChip priority={r.priority} />
                        </span>
                        <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{r.title}</span>
                        <span className="text-sm text-text-2">
                          <TypeChip type={r.type} /> {r.municipalityName ?? 'Sin municipio'} · {fmtDate(r.createdAt, "d 'de' LLL")}
                        </span>
                        <span className="text-sm text-text-2">{r.assigneeName ?? r.areaName ?? 'Sin asignar'}</span>
                      </Link>
                      {r.canWork ? (
                        <div className="mt-2">
                          <QuickMove id={r.id} reference={r.reference} state={r.state} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {counts[state] > cards.length ? (
                    <li>
                      <Link href={`/admin/atencion${inboxQuery(f, { state, view: 'lista', page: 1 })}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
                        Ver las {counts[state]} en la lista
                      </Link>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="p-4 text-sm text-text-2">Nada aquí.</p>
              )}
            </Card>
          </section>
        );
      })}
      <section aria-labelledby="columna-terminadas" className="min-w-0">
        <Card solid>
          <CardHeader title={<span id="columna-terminadas">Cerradas y «No procede»</span>} subtitle={finished === 1 ? '1 solicitud' : `${finished} solicitudes`} />
          <div className="flex flex-col gap-1 p-4">
            <Link href={`/admin/atencion${inboxQuery(f, { state: 'cerrado', view: 'lista', page: 1 })}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
              Ver las cerradas ({counts.cerrado})
            </Link>
            <Link href={`/admin/atencion${inboxQuery(f, { state: 'no_procede', view: 'lista', page: 1 })}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
              Ver las de «No procede» ({counts.no_procede})
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
