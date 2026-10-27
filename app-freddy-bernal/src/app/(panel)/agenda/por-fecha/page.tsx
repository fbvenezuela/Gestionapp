import Link from 'next/link';
import { CalendarClock, HardHat, Users } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { canManageAgenda } from '@/lib/roles';
import { toSchedule } from '@/lib/data/events';
import { peopleWithRole } from '@/lib/data/common';
import { obraVisitTitle } from '@/lib/domain/ficha-event';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Tip } from '@/components/ui/tip';
import { ScheduleSheet } from '@/components/agenda/schedule-sheet';
import { DismissButton } from '@/components/agenda/dismiss-button';
import { dt, today } from '@/lib/time';

export const metadata = { title: 'Por ponerle fecha' };

// «Por ponerle fecha» (§4.1, §4.2): the obra fichas the IVT sent and the community reports that go to the boss's
// agenda, still without a date (view agenda_to_schedule: it has no date column). The boss and despacho put it;
// administración reads. Oldest first.
export default async function ToSchedulePage() {
  const s = await requireRole('admin', 'boss', 'dispatch');
  const manager = canManageAgenda(s.roles);
  const data = await db(s, async (sql) => ({
    rows: await toSchedule(sql, 200),
    cameras: manager ? await peopleWithRole(sql, 'camera') : [],
  }));
  const t0 = today();
  // How long it has waited (since the ficha was last saved): days only.
  const age = (v: string | Date) => {
    const d = dt(v);
    const days = d ? Math.max(0, Math.round(t0.diff(d.startOf('day'), 'days').days)) : 0;
    return days === 0 ? 'desde hoy' : days === 1 ? 'desde ayer' : `hace ${days} días`;
  };
  return (
    <>
      <PageHeader title="Por ponerle fecha" subtitle="Fichas que esperan fecha y hora. Al ponérsela, pasan a la agenda." back={{ href: '/agenda', label: 'Agenda' }} />
      <Tip id="por-fecha">Toca «Ponerle fecha» y queda en la agenda; «No va» la saca de aquí con su motivo.</Tip>
      {data.rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="Nada por ponerle fecha. ¡Al día!" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.rows.map((r) => (
            <li key={`${r.kind}:${r.id}`}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {r.kind === 'obra' ? (
                    <Chip tone="accent"><HardHat className="h-3.5 w-3.5" aria-hidden /> Obra del IVT</Chip>
                  ) : (
                    <Chip tone="info"><Users className="h-3.5 w-3.5" aria-hidden /> Reporte comunitario</Chip>
                  )}
                  <span className="font-mono text-xs font-semibold text-text-2">{r.code}</span>
                  {r.had_cancelled ? <Chip tone="warn">Se canceló una visita antes</Chip> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{r.title}</p>
                  <p className="text-[15px] text-text-2">
                    {[r.parish, r.municipality].filter(Boolean).join(' · ')} · esperando {age(r.waiting_since)}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {manager ? (
                    <ScheduleSheet
                      kind={r.kind}
                      fichaId={r.id}
                      defaultTitle={r.kind === 'obra' ? obraVisitTitle(r.title) : r.title}
                      defaultPlace={r.parish}
                      cameras={data.cameras}
                    />
                  ) : null}
                  <Link href={r.kind === 'obra' ? `/obras/${r.id}` : `/reportes/${r.id}`} className="inline-flex min-h-11 items-center px-2 font-semibold text-accent-ink underline">
                    Ver ficha
                  </Link>
                  {manager ? <DismissButton kind={r.kind} id={r.id} /> : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
