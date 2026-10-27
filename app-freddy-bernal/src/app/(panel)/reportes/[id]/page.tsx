import { notFound } from 'next/navigation';
import { CalendarClock, FileImage, Pencil } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { getReport, parishesInUse } from '@/lib/data/fichas';
import { municipalities, parishes, peopleWithRole } from '@/lib/data/common';
import { canManageAgenda } from '@/lib/roles';
import { eventFromReport } from '@/lib/domain/ficha-event';
import { isClosed } from '@/lib/domain/report-status';
import { ScheduleSheet } from '@/components/agenda/schedule-sheet';
import { PRIORITY, REPORT_STATUS, REPORT_TYPE } from '@/lib/data/ficha-labels';
import { REPORT_FIELDS, REPORT_GROUPS, groupProgress, toFormValues, type Marks } from '@/lib/domain/ficha-fields';
import { daysLate, isOverdue } from '@/lib/domain/report-status';
import { municipalitySlug } from '@/lib/domain/territory';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { FichaGroup } from '@/components/fichas/ficha-group';
import { FichaValue } from '@/components/fichas/ficha-value';
import { FichaForm } from '@/components/fichas/ficha-form';
import { HistoryTimeline } from '@/components/fichas/history-timeline';
import { NoteForm } from '@/components/fichas/note-form';
import { ReportStatusControl } from '@/components/fichas/status-control';
import { fmtDateTime, today } from '@/lib/time';

export const metadata = { title: 'Ficha comunitaria' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A community report (§4.2): only política, despacho, the boss and administración open it (the database decides:
// Redes gets nothing, not even by the link). Contacts with 2FA. Its history only grows.
export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'politics');
  const { id } = await params;
  const { editar } = await searchParams;
  if (!UUID.test(id)) notFound();
  const editing = editar === '1';
  const manager = canManageAgenda(s.roles);
  const data = await db(s, async (sql) => {
    const r = await getReport(sql, id);
    if (!r) return null;
    // «Ponerle fecha» (boss and despacho): it goes to the agenda, is still open and has no live activity.
    const toSchedule = manager && r.report.wants_agenda && !isClosed(r.report.status) && !r.report.deleted_at && !r.scheduled && !r.event?.live;
    return {
      ...r,
      toSchedule,
      cameras: toSchedule ? await peopleWithRole(sql, 'camera') : [],
      municipalities: editing ? await municipalities(sql) : [],
      parishMap: editing ? await parishes(sql) : {},
      used: editing ? await parishesInUse(sql) : {},
    };
  });
  if (!data) notFound();
  const { report, priv, event } = data;
  const deleted = !!report.deleted_at;
  const canEdit = !deleted;
  const canPrivate = s.mfaOk;
  const marks: Marks = { ...(report.marks as Marks), ...((priv?.marks ?? {}) as Marks) };
  const values = { ...report, ...(priv ?? {}) } as Record<string, unknown>;
  const defs = REPORT_FIELDS.filter((d) => canPrivate || !d.private);
  const munHref = `/municipios/${municipalitySlug(report.municipality)}`;

  if (editing && canEdit) {
    return (
      <>
        <PageHeader back={{ href: `/reportes/${id}`, label: 'Ficha comunitaria' }} title={`Editar ${report.code}`} subtitle={report.title} />
        <FichaForm
          kind="report"
          id={id}
          rev={report.rev}
          privRev={priv?.rev ?? null}
          wantsAgenda={report.wants_agenda}
          initial={toFormValues(REPORT_FIELDS, report, priv)}
          initialMarks={marks}
          municipalities={data.municipalities}
          parishMap={data.parishMap}
          parishesUsed={data.used}
          canPrivate={canPrivate}
          cancelHref={`/reportes/${id}`}
        />
      </>
    );
  }

  const t0 = today().toISODate()!;
  const overdue = isOverdue(report.follow_up_due, report.status, t0);

  return (
    <>
      <PageHeader
        back={{ href: munHref, label: report.municipality }}
        title={report.title}
        subtitle={[report.community, report.parish, report.municipality].filter(Boolean).join(' · ')}
        actions={
          canEdit ? (
            <LinkButton href={`/reportes/${id}?editar=1`}>
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </LinkButton>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">{report.code}</span>
        <Chip>{REPORT_TYPE[report.type]}</Chip>
        <Chip tone={REPORT_STATUS[report.status].tone}>{REPORT_STATUS[report.status].label}</Chip>
        {report.priority ? <Chip tone={PRIORITY[report.priority].tone}>Prioridad {PRIORITY[report.priority].label.toLowerCase()}</Chip> : null}
        {overdue ? <Chip tone="danger">Vencida hace {daysLate(report.follow_up_due, t0)} {daysLate(report.follow_up_due, t0) === 1 ? 'día' : 'días'}</Chip> : null}
        {deleted ? <Chip tone="danger">Borrada</Chip> : null}
        <span className="text-sm text-text-2">Cargada por {report.created_by_name ?? '—'} · actualizada el {fmtDateTime(report.updated_at)}</span>
      </div>

      <Card className="mb-4">
        <CardBody className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
          <div className="min-w-0">
            <p className="label-caps">Agenda del jefe</p>
            <p className="mt-1 text-[15px] text-text-2">
              {event?.live && event.starts_at
                ? `Ya tiene fecha: ${fmtDateTime(event.starts_at)} (${event.code}).`
                : data.scheduled
                  ? // Política never reads the date: the database only says that there is one (report_has_live_event).
                    'Ya tiene fecha. La ven el jefe y el despacho en la agenda.'
                  : report.wants_agenda && event && !event.live
                    ? 'Se canceló la actividad en la agenda: otra vez por ponerle fecha.'
                    : report.wants_agenda
                      ? 'Va a la agenda: por ponerle fecha. La pone el jefe (o el despacho).'
                      : 'No va a la agenda: queda en el registro del municipio.'}
            </p>
            {data.toSchedule ? (
              <div className="mt-3">
                <ScheduleSheet
                  kind="report"
                  fichaId={id}
                  defaultTitle={eventFromReport(report as unknown as Record<string, unknown>).title}
                  defaultPlace={eventFromReport(report as unknown as Record<string, unknown>).placeName}
                  cameras={data.cameras}
                />
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {REPORT_GROUPS.map((g) => {
            const fields = defs.filter((d) => d.group === g.key);
            if (!fields.length) {
              return g.key === 'reporter' ? (
                <Card key={g.key} className="p-4">
                  <p className="text-[15px] text-text-2">«Persona que reporta»: se ve con el doble factor.</p>
                </Card>
              ) : null;
            }
            const prog = groupProgress(defs, g.key, values, marks);
            return (
              <FichaGroup key={g.key} title={g.title} done={prog.done} total={prog.total}>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {fields.map((d) => (
                    <FichaValue key={d.key} def={d} value={values[d.key]} mark={marks[d.key]} wide={d.type === 'long' || d.type === 'url'} />
                  ))}
                </dl>
              </FichaGroup>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {canEdit ? <ReportStatusControl id={id} status={report.status} /> : null}
          <Card>
            <CardHeader title="Evidencias" subtitle="Fotos, videos o documentos (antes y después)." />
            <CardBody className="flex items-start gap-3">
              <FileImage className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden />
              <p className="text-[15px] text-text-2">
                La subida de archivos a la ficha llega en la próxima entrega. Mientras tanto, pega el enlace al material en «Evidencias y observaciones».
              </p>
            </CardBody>
          </Card>
          <HistoryTimeline kind="report" rows={data.history}>
            {canEdit ? <NoteForm kind="report" id={id} /> : null}
          </HistoryTimeline>
        </div>
      </div>
    </>
  );
}
