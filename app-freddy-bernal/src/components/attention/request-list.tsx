import Link from 'next/link';
import { ChevronLeft, ChevronRight, Paperclip, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime } from '@/lib/time';
import { REQUEST_STATES, REQUEST_STATE_LABEL, inboxQuery, type InboxFilters, type RequestState } from '@/lib/domain/attention';
import type { InboxRow } from '@/lib/data/attention';
import { OverdueChip, PriorityChip, Reference, StateChip, TypeChip } from './labels';

// The inbox as a list (design §5): on the phone, one card per request; from the tablet up, a table. Each row opens the
// case. What the row shows is what this person's RLS gave (a denuncia only to who may read it).

/** How many there are in each state with the filters; each one filters the list by that state. */
export function StateCounts({ f, counts }: { f: InboxFilters; counts: Record<RequestState, number> }) {
  const total = REQUEST_STATES.reduce((n, s) => n + counts[s], 0);
  const link = (state: RequestState | null) => `/admin/atencion${inboxQuery(f, { state, page: 1 })}`;
  const chip = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-chip)] border px-3 text-sm font-semibold',
      active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface text-text hover:bg-surface-2',
    );
  return (
    <nav aria-label="Solicitudes por estado" className="mb-4">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link href={link(null)} className={chip(!f.state)} aria-current={!f.state ? 'true' : undefined}>
            Todas <span className="tabular">{total}</span>
          </Link>
        </li>
        {REQUEST_STATES.map((s) => (
          <li key={s}>
            <Link href={link(s)} className={chip(f.state === s)} aria-current={f.state === s ? 'true' : undefined}>
              {REQUEST_STATE_LABEL[s]} <span className="tabular">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const place = (r: InboxRow) => [r.municipalityName, r.sector].filter(Boolean).join(' · ') || 'Sin lugar';

export function RequestList({ rows }: { rows: InboxRow[] }) {
  return (
    <>
      {/* Phone: cards. */}
      <ul className="flex flex-col gap-3 md:hidden" aria-label="Solicitudes">
        {rows.map((r) => (
          <li key={r.id}>
            <Card solid className="p-0">
              <Link href={`/admin/atencion/${r.id}`} className="flex flex-col gap-2 p-4">
                <span className="flex flex-wrap items-center gap-2">
                  <Reference value={r.reference} />
                  <StateChip state={r.state} />
                  <OverdueChip overdue={r.overdue} />
                  <PriorityChip priority={r.priority} />
                </span>
                <span className="font-semibold [overflow-wrap:anywhere]">{r.title}</span>
                <span className="text-sm text-text-2 [overflow-wrap:anywhere]">
                  <TypeChip type={r.type} /> {r.categoryName} · {place(r)}
                </span>
                <span className="text-sm text-text-2">
                  Llegó el {fmtDate(r.createdAt, "d 'de' LLL")}
                  {r.dueAt ? ` · Comprometida: ${fmtDate(r.dueAt, "d 'de' LLL")}` : ''}
                  {r.assigneeName ? ` · ${r.assigneeName}` : r.areaName ? ` · ${r.areaName}` : ' · Sin asignar'}
                </span>
                <RowExtras r={r} />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
      {/* Tablet and up: a table. */}
      <Card solid className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Solicitudes de la bandeja</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-text-2">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Código</th>
              <th scope="col" className="px-4 py-3 font-semibold">Solicitud</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-3 font-semibold">Área y responsable</th>
              <th scope="col" className="px-4 py-3 font-semibold">Llegó</th>
              <th scope="col" className="px-4 py-3 font-semibold">Comprometida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-surface-2">
                <td className="px-4 py-3">
                  {/* The code in one line: split at its dashes («AC-» / «2026-» / «RQ8FZM») it was hard to read and copy. */}
                  <Link href={`/admin/atencion/${r.id}`} className="whitespace-nowrap font-mono font-semibold text-accent-ink underline-offset-2 hover:underline">
                    {r.reference}
                  </Link>
                </td>
                <td className="max-w-md px-4 py-3">
                  <p className="font-semibold [overflow-wrap:anywhere]">{r.title}</p>
                  <p className="mt-0.5 text-text-2 [overflow-wrap:anywhere]">
                    <TypeChip type={r.type} /> {r.categoryName} · {place(r)}
                  </p>
                  <RowExtras r={r} />
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-col items-start gap-1">
                    <StateChip state={r.state} />
                    <OverdueChip overdue={r.overdue} />
                    <PriorityChip priority={r.priority} />
                  </span>
                </td>
                <td className="px-4 py-3 text-text-2">
                  <p>{r.areaName ?? 'Sin área'}</p>
                  <p>{r.assigneeName ?? 'Sin responsable'}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-2">{fmtDateTime(r.createdAt)}</td>
                <td className={cn('whitespace-nowrap px-4 py-3', r.overdue ? 'font-semibold text-danger' : 'text-text-2')}>{r.dueAt ? fmtDate(r.dueAt, "d 'de' LLL") : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function RowExtras({ r }: { r: InboxRow }) {
  if (!r.supportCount && !r.files && !r.duplicateOf && !r.isSpam) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-2">
      {r.supportCount ? (
        <span className="inline-flex items-center gap-1">
          <Users className="h-4 w-4" aria-hidden /> {r.supportCount === 1 ? '1 apoyo' : `${r.supportCount} apoyos`}
        </span>
      ) : null}
      {r.files ? (
        <span className="inline-flex items-center gap-1">
          <Paperclip className="h-4 w-4" aria-hidden /> {r.files === 1 ? '1 archivo' : `${r.files} archivos`}
        </span>
      ) : null}
      {r.duplicateOf ? <Chip>Unida a otro caso</Chip> : null}
      {r.isSpam ? <Chip tone="warn">Spam</Chip> : null}
    </span>
  );
}

export function Pagination({ f, page, pages, total }: { f: InboxFilters; page: number; pages: number; total: number }) {
  if (pages <= 1) return <p className="mt-3 text-sm text-text-2">{total === 1 ? '1 solicitud' : `${total} solicitudes`}</p>;
  const href = (p: number) => `/admin/atencion${inboxQuery(f, { page: p })}`;
  const btn = 'inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[15px] font-semibold hover:bg-surface-2';
  return (
    <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-text-2">
        Página {page} de {pages} · {total} solicitudes
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn} rel="prev">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={btn} rel="next">
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
