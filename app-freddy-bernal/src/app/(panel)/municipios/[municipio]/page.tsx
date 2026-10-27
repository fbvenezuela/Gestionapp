import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, ChevronRight, ClipboardList, HardHat, Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { municipalityCounters, municipalityTimeline, parishesInUse, type TimelineItem } from '@/lib/data/fichas';
import { municipalities, parishes } from '@/lib/data/common';
import { OBRA_STAGE, PRIORITIES, PRIORITY, REPORT_STATUS, REPORT_STATUSES, REPORT_TYPE, REPORT_TYPES } from '@/lib/data/ficha-labels';
import { BOSS_DECISION } from '@/lib/data/labels';
import { emptyCounters, mergeCounters } from '@/lib/domain/report-status';
import { municipalityFromSlug, municipalitySlug, parishKey, parishOptions } from '@/lib/domain/territory';
import { PageHeader, Stat, EmptyState } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { FilterBar, type FilterValues } from '@/components/fichas/filter-bar';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, today } from '@/lib/time';

export const metadata = { title: 'Municipio' };

// One municipality (§4.2): its parishes, and its community reports, obra fichas (for those who see obras) and
// events in one line of time, each with its state. An event's date shows only to whoever may see it (the boss,
// despacho, administración); for everyone else, when it was created.
export default async function MunicipioPage({ params, searchParams }: { params: Promise<{ municipio: string }>; searchParams: Promise<FilterValues> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'politics');
  const { municipio } = await params;
  const sp = await searchParams;
  const f = {
    parroquia: sp.parroquia || undefined,
    tipo: (REPORT_TYPES as readonly string[]).includes(sp.tipo ?? '') ? sp.tipo : undefined,
    estado: (REPORT_STATUSES as readonly string[]).includes(sp.estado ?? '') ? sp.estado : undefined,
    prioridad: (PRIORITIES as readonly string[]).includes(sp.prioridad ?? '') ? sp.prioridad : undefined,
    vencidas: sp.vencidas === '1' ? '1' : undefined,
  };
  const t0 = today().toISODate()!;
  const data = await db(s, async (sql) => {
    const list = await municipalities(sql);
    const name = municipalityFromSlug(municipio, list);
    if (!name) return null;
    const counters = mergeCounters([name], (await municipalityCounters(sql, t0)).filter((c) => c.municipality === name))[0];
    return {
      name,
      counters: counters ?? { municipality: name, ...emptyCounters() },
      parishMap: await parishes(sql),
      used: (await parishesInUse(sql, name))[name] ?? [],
      items: await municipalityTimeline(sql, name, t0, { parish: f.parroquia, type: f.tipo, status: f.estado, priority: f.prioridad, overdue: !!f.vencidas }),
    };
  });
  if (!data) notFound();
  const here = `/municipios/${municipalitySlug(data.name)}`;
  const choice = parishOptions(data.parishMap, data.name, data.used);
  const c = data.counters;

  return (
    <>
      <PageHeader
        back={{ href: '/municipios', label: 'Municipios' }}
        title={data.name}
        subtitle="Fichas comunitarias, obras y eventos del municipio, en orden de fecha."
        actions={
          <LinkButton href={`/reportes/nuevo?municipio=${encodeURIComponent(data.name)}`}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva ficha comunitaria
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Abiertas" value={c.open} />
        <Stat label="En ejecución" value={c.inProgress} tone={c.inProgress ? 'accent' : undefined} />
        <Stat label="Finalizadas" value={c.finished} tone={c.finished ? 'ok' : undefined} />
        <Stat label="Vencidas" value={c.overdue} tone={c.overdue ? 'danger' : undefined} />
      </div>

      <nav aria-label="Parroquias" className="mb-4">
        <p className="label-caps mb-2">Parroquias</p>
        {choice.options.length ? (
          <ul className="flex flex-wrap gap-2">
            <li>
              <ParishLink href={here} active={!f.parroquia}>Todas</ParishLink>
            </li>
            {choice.options.map((p) => (
              <li key={p}>
                <ParishLink href={`${here}?parroquia=${encodeURIComponent(p)}`} active={!!f.parroquia && parishKey(f.parroquia) === parishKey(p)}>{p}</ParishLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-text-2">Todavía no hay parroquias escritas en este municipio. La lista oficial está pendiente; mientras tanto se escriben a mano.</p>
        )}
      </nav>

      <FilterBar action={here} values={f} parishes={choice} />

      <Card>
        <CardHeader title={`En orden de fecha (${data.items.length})`} subtitle="Lo vencido arriba; después, de lo más nuevo a lo más viejo." />
        {data.items.length ? (
          <ul className="divide-y divide-border">
            {data.items.map((it) => (
              <li key={`${it.kind}:${it.id}`}>
                <TimelineRow it={it} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <EmptyState title={Object.values(f).some(Boolean) ? 'No hay nada con ese filtro.' : 'Todavía no hay nada cargado en este municipio.'} />
          </div>
        )}
      </Card>
    </>
  );
}

function ParishLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn('inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold', active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface text-text hover:bg-surface-2')}
    >
      {children}
    </Link>
  );
}

function TimelineRow({ it }: { it: TimelineItem }) {
  const Icon = it.kind === 'report' ? ClipboardList : it.kind === 'obra' ? HardHat : CalendarDays;
  const href = it.kind === 'report' ? `/reportes/${it.id}` : it.kind === 'obra' ? `/obras/${it.id}` : `/eventos/${it.id}`;
  const what = it.kind === 'report' ? `Ficha comunitaria · ${REPORT_TYPE[it.type]}` : it.kind === 'obra' ? 'Ficha de obra' : 'Evento';
  const when =
    it.kind === 'event'
      ? it.starts_at
        ? fmtDateTime(it.starts_at)
        : `creado el ${fmtDate(it.at, "d 'de' LLL")}`
      : it.kind === 'obra'
        ? `actualizada el ${fmtDate(it.at, "d 'de' LLL")}`
        : fmtDate(it.at, "d 'de' LLL");
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <Icon className="h-5 w-5 shrink-0 text-text-2" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 sm:flex-1">
          <span className="block font-semibold [overflow-wrap:anywhere]">{it.title}</span>
          <span className="block text-sm text-text-2 [overflow-wrap:anywhere]">
            {it.code} · {what}
            {it.kind !== 'event' && it.parish ? ` · ${it.parish}` : ''} · {when}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap gap-1.5">
          {it.kind === 'report' ? (
            <>
              {it.overdue ? <Chip tone="danger">Vencida</Chip> : null}
              <Chip tone={REPORT_STATUS[it.status].tone}>{REPORT_STATUS[it.status].label}</Chip>
              {it.priority ? <Chip tone={PRIORITY[it.priority].tone}>{PRIORITY[it.priority].label}</Chip> : null}
            </>
          ) : it.kind === 'obra' ? (
            <Chip tone={OBRA_STAGE[it.stage].tone}>{OBRA_STAGE[it.stage].label}</Chip>
          ) : it.done_on ? (
            <Chip tone="ok">Realizado</Chip>
          ) : (
            <Chip tone={BOSS_DECISION[it.boss_decision]?.tone}>{BOSS_DECISION[it.boss_decision]?.label ?? it.boss_decision}</Chip>
          )}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
