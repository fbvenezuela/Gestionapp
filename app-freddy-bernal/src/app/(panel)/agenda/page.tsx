import Link from 'next/link';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { canManageAgenda, canSeeSchedule } from '@/lib/roles';
import { BigActions, type BigAction } from '@/components/agenda/big-actions';
import { toSchedule } from '@/lib/data/events';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { LinkButton, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { MonthView, TimeGrid, type CalEvent } from '@/components/agenda/calendar';
import { TZ, fmtDateTime } from '@/lib/time';
import { WORK_STATUS, BOSS_DECISION } from '@/lib/data/labels';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Agenda' };

type Search = { vista?: string; fecha?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'social', 'camera', 'ivt');
  const sp = await searchParams;
  // The agenda is shared by the boss and despacho (§3); administración reads it. The database enforces it too.
  const canCreate = canManageAgenda(s.roles);
  // Calendar only for those who can see date and time. The database enforces it too.
  if (canSeeSchedule(s.roles)) return <Calendar s={s} sp={sp} canCreate={canCreate} />;
  if (s.roles.includes('camera')) return <CameraList s={s} />;
  if (s.roles.includes('ivt') && !s.roles.includes('social')) return <IvtList s={s} />;
  return <TeamList s={s} />;
}

async function Calendar({ s, sp, canCreate }: { s: Awaited<ReturnType<typeof requireRole>>; sp: Search; canCreate: boolean }) {
  const view = sp.vista === 'mes' || sp.vista === 'dia' ? sp.vista : 'semana';
  const anchor = (sp.fecha ? DateTime.fromISO(sp.fecha, { zone: TZ }) : DateTime.now().setZone(TZ)).setLocale('es').startOf('day');
  const from = view === 'mes' ? anchor.startOf('month').startOf('week') : view === 'semana' ? anchor.startOf('week') : anchor;
  const to = view === 'mes' ? anchor.endOf('month').endOf('week') : view === 'semana' ? anchor.endOf('week') : anchor.endOf('day');
  const { events, waiting, pending } = await db(s, async (sql) => ({
    // Cancelled events stay, struck through.
    events: await sql.query<CalEvent>(
      `select id, title, place_name, starts_at, ends_at, boss_decision, priority, cancelled_at from public.event_calendar
        where starts_at <= $2 and ends_at >= $1 order by starts_at`,
      [from.toUTC().toISO(), to.toUTC().toISO()],
    ),
    waiting: canCreate ? (await toSchedule(sql, 200)).length : 0,
    pending: canCreate
      ? (await sql.one<{ n: number }>(`select count(*)::int as n from public.events where boss_decision = 'pending' and deleted_at is null and cancelled_at is null`))!.n
      : 0,
  }));
  const boss = s.roles.includes('boss');
  const actions: BigAction[] = [
    { href: '/agenda/nuevo', label: 'Nuevo evento', hint: 'Con fecha, hora y lugar', icon: 'new' },
    { href: '/agenda/nuevo?tipo=obra', label: 'Visita de obra', hint: 'Una obra que vas a visitar', icon: 'obra' },
    { href: '/agenda/por-fecha', label: 'Por ponerle fecha', hint: 'Fichas del IVT y de política', icon: 'toSchedule', count: waiting, tone: 'warn' },
    { href: boss ? '/jefe/politica' : '/hoy', label: 'Por decidir', hint: boss ? 'Acepta o rechaza' : 'Esperan al jefe', icon: 'decide', count: pending },
  ];
  const step = view === 'mes' ? { months: 1 } : view === 'semana' ? { weeks: 1 } : { days: 1 };
  const prev = anchor.minus(step).toISODate();
  const next = anchor.plus(step).toISODate();
  const title = view === 'mes' ? anchor.toFormat('LLLL yyyy') : view === 'semana' ? `Semana del ${from.toFormat("d 'de' LLL")}` : anchor.toFormat("cccc d 'de' LLLL");
  const days: DateTime[] = [];
  if (view !== 'mes') for (let d = from; d <= to; d = d.plus({ days: 1 })) days.push(d);

  return (
    <>
      <PageHeader title="Agenda" subtitle={canCreate ? 'Hora del Táchira · la comparten el jefe y el despacho' : 'Hora del Táchira'} />
      {canCreate ? <BigActions items={actions} /> : null}
      <Tip id="agenda">Toca un evento para ver su ficha; arriba cambias entre día, semana y mes.</Tip>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={`/agenda?vista=${view}&fecha=${prev}`} className={buttonVariants({ variant: 'secondary', size: 'icon' })} aria-label="Anterior"><ChevronLeft className="h-5 w-5" aria-hidden /></Link>
          <Link href={`/agenda?vista=${view}`} className={buttonVariants({ variant: 'secondary', size: 'md' })}>Hoy</Link>
          <Link href={`/agenda?vista=${view}&fecha=${next}`} className={buttonVariants({ variant: 'secondary', size: 'icon' })} aria-label="Siguiente"><ChevronRight className="h-5 w-5" aria-hidden /></Link>
        </div>
        <h2 className="text-lg font-bold first-letter:uppercase">{title}</h2>
        <div className="ml-auto flex rounded-[var(--radius-control)] border border-border bg-surface p-0.5" role="tablist" aria-label="Vista">
          {(['dia', 'semana', 'mes'] as const).map((v) => (
            <Link key={v} role="tab" aria-selected={view === v} href={`/agenda?vista=${v}&fecha=${anchor.toISODate()}`} className={cn('min-h-10 rounded-[6px] px-3 py-2 text-sm font-semibold', view === v ? 'bg-slate text-on-slate' : 'text-text-2')}>
              {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
            </Link>
          ))}
        </div>
      </div>
      {view === 'mes' ? <MonthView anchor={anchor} events={events} /> : <TimeGrid days={days} events={events} />}
      <p className="mt-3 flex flex-wrap gap-3 text-sm text-text-2">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-accent bg-accent-soft" /> Aceptado</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-warn bg-warn-soft" /> Por decidir</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-danger bg-danger-soft" /> Rechazado</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-muted bg-surface-2" /> <span className="line-through">Cancelado</span></span>
      </p>
    </>
  );
}

async function CameraList({ s }: { s: Awaited<ReturnType<typeof requireRole>> }) {
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; title: string; place_name: string; starts_at: string | null; exact_address: string | null; n: number; cancelled: boolean }>(
      `select e.id, e.title, e.place_name, sc.starts_at, sc.exact_address, e.cancelled_at is not null as cancelled,
              (select count(*)::int from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.kind in ('boss','drone','broll','other')) as n
         from public.events e left join public.event_schedule sc on sc.event_id = e.id
        where e.deleted_at is null order by e.cancelled_at is not null, sc.starts_at nulls last`,
    ),
  );
  return (
    <>
      <PageHeader title="Mis eventos" subtitle="Los eventos que te tocan grabar." />
      <Tip id="agenda-grabacion">Toca un evento para subir lo que grabaste, por partes.</Tip>
      {rows.length === 0 ? (
        <EmptyState title="No tienes eventos asignados todavía." />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Card solid>
                <Link href={`/eventos/${e.id}`} className="block p-4">
                  <p className={cn('font-mono text-sm font-semibold text-accent-ink', e.cancelled && 'line-through')}>{fmtDateTime(e.starts_at)}</p>
                  <p className={cn('mt-0.5 text-lg font-semibold', e.cancelled && 'line-through')}>{e.title}</p>
                  <p className="flex items-center gap-1 text-[15px] text-text-2"><MapPin className="h-4 w-4" aria-hidden /> {e.exact_address || e.place_name}</p>
                  <div className="mt-2">{e.cancelled ? <Chip tone="danger">Cancelado</Chip> : e.n ? <Chip tone="ok">{e.n} archivos subidos</Chip> : <Chip tone="warn">Falta el material</Chip>}</div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// The Director del IVT: «Mis visitas de obra», the visits born from the IVT's obra fichas, with their date once the
// boss or despacho put it (the database returns the schedule to the IVT for these events only, with 2FA).
async function IvtList({ s }: { s: Awaited<ReturnType<typeof requireRole>> }) {
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; title: string; place_name: string; municipality: string; starts_at: string | null; exact_address: string | null; boss_decision: string; cancelled: boolean; obra_ficha_id: string }>(
      `select e.id, e.title, e.place_name, e.municipality, sc.starts_at, sc.exact_address, e.boss_decision, e.cancelled_at is not null as cancelled, e.obra_ficha_id
         from public.events e left join public.event_schedule sc on sc.event_id = e.id
        where e.deleted_at is null and e.obra_ficha_id is not null
        order by e.cancelled_at is not null, sc.starts_at nulls last`,
    ),
  );
  return (
    <>
      <PageHeader title="Mis visitas de obra" subtitle="Las visitas del jefe a las obras del IVT. La fecha la ponen el jefe o el despacho." />
      {!s.mfaOk ? (
        <p className="mb-4 rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn" role="status">La fecha se ve con el doble factor: entra con tu código.</p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Todavía ninguna obra tiene fecha de visita." action={<LinkButton href="/obras">Ver mis fichas de obra</LinkButton>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Card solid>
                <Link href={`/eventos/${e.id}`} className="block p-4">
                  <p className={cn('font-mono text-sm font-semibold text-accent-ink', e.cancelled && 'line-through')}>{e.starts_at ? fmtDateTime(e.starts_at) : 'Ya tiene fecha'}</p>
                  <p className={cn('mt-0.5 text-lg font-semibold', e.cancelled && 'line-through')}>{e.title}</p>
                  <p className="flex items-center gap-1 text-[15px] text-text-2"><MapPin className="h-4 w-4" aria-hidden /> {e.exact_address || [e.place_name, e.municipality].filter(Boolean).join(' · ')}</p>
                  <div className="mt-2">
                    {e.cancelled ? <Chip tone="danger">Cancelada</Chip> : <Chip tone={BOSS_DECISION[e.boss_decision]?.tone}>{BOSS_DECISION[e.boss_decision]?.label}</Chip>}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Redes: a list WITHOUT date or time, ordered by state and priority. Cancelled events go last, struck through.
async function TeamList({ s }: { s: Awaited<ReturnType<typeof requireRole>> }) {
  const rows = await db(s, (sql) =>
    sql.query<{ id: string; code: string; title: string; place_name: string; municipality: string; summary: string; work_status: string; boss_decision: string; urgency: number; has_board: boolean; n: number; cancelled: boolean }>(
      `select e.id, e.code, e.title, e.place_name, e.municipality, e.summary, e.work_status, e.boss_decision, e.urgency, e.cancelled_at is not null as cancelled,
              exists (select 1 from public.storyboards sb join public.storyboard_blocks b on b.storyboard_id = sb.id and b.deleted_at is null where sb.event_id = e.id) as has_board,
              (select count(*)::int from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.kind in ('boss','drone','broll','other')) as n
         from public.events e
        where e.deleted_at is null and e.boss_decision <> 'rejected' and e.done_on is null
        order by e.cancelled_at is not null, array_position(array['brief','storyboard','recording','material','editing','published'], e.work_status), e.urgency, e.code`,
    ),
  );
  return (
    <>
      <PageHeader title="Eventos" subtitle="Hacia dónde va y de qué se trata. Ordenados por lo que hace falta." />
      <Tip id="agenda-equipo">Toca un evento para ver de qué se trata y qué falta.</Tip>
      {rows.length === 0 ? (
        <EmptyState title="Todavía no hay eventos." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((e) => (
            <li key={e.id}>
              <Card solid className="h-full">
                <Link href={`/eventos/${e.id}`} className="flex h-full flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {e.cancelled ? <Chip tone="danger">Cancelado</Chip> : null}
                    <Chip tone={WORK_STATUS[e.work_status]?.tone}>{WORK_STATUS[e.work_status]?.label}</Chip>
                    {e.boss_decision === 'pending' ? <Chip tone={BOSS_DECISION.pending.tone}>{BOSS_DECISION.pending.label}</Chip> : null}
                    {e.urgency === 1 ? <Chip tone="danger">Urgente</Chip> : null}
                  </div>
                  <p className={cn('text-lg font-semibold leading-snug', e.cancelled && 'line-through')}>{e.title}</p>
                  <p className="flex items-center gap-1 text-[15px] text-text-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {[e.place_name, e.municipality].filter(Boolean).join(' · ')}</p>
                  {e.summary ? <p className="line-clamp-2 text-[15px] text-text-2">{e.summary}</p> : null}
                  <div className="mt-auto flex flex-wrap gap-2 pt-1 text-sm">
                    {e.has_board ? <Chip tone="ok">Storyboard listo</Chip> : <Chip tone="info">Falta storyboard</Chip>}
                    {e.n ? <Chip tone="ok">Material: {e.n}</Chip> : null}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
