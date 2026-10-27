import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, ImagePlus, Pencil } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { dialogBrand, getObraFicha, parishesInUse } from '@/lib/data/fichas';
import { municipalities, parishes } from '@/lib/data/common';
import { OBRA_STAGE } from '@/lib/data/ficha-labels';
import { OBRA_FIELDS, OBRA_GROUPS, daysUntil, groupProgress, toFormValues, type Marks } from '@/lib/domain/ficha-fields';
import { buildObraDialog, dialogInput } from '@/lib/domain/obra-dialog';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { FichaGroup } from '@/components/fichas/ficha-group';
import { FichaValue } from '@/components/fichas/ficha-value';
import { FichaForm } from '@/components/fichas/ficha-form';
import { FabDialogEditor } from '@/components/fichas/fab-dialog-editor';
import { HistoryTimeline } from '@/components/fichas/history-timeline';
import { NoteForm } from '@/components/fichas/note-form';
import { ObraArchiveControl } from '@/components/fichas/status-control';
import { fmtDateTime, fmtDay, today } from '@/lib/time';

export const metadata = { title: 'Ficha de obra' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ObraPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'ivt');
  const { id } = await params;
  const { editar } = await searchParams;
  if (!UUID.test(id)) notFound();
  const editing = editar === '1';
  const data = await db(s, async (sql) => {
    const f = await getObraFicha(sql, id);
    if (!f) return null;
    return {
      ...f,
      brand: await dialogBrand(sql),
      municipalities: editing ? await municipalities(sql) : [],
      parishMap: editing ? await parishes(sql) : {},
      used: editing ? await parishesInUse(sql) : {},
    };
  });
  if (!data) notFound();
  const { ficha, priv, event } = data;
  const deleted = !!ficha.deleted_at;
  const canEdit = !deleted;
  // The contacts need 2FA (obra_ficha_private): the database returns nothing without it.
  const canPrivate = s.mfaOk;
  const marks: Marks = { ...(ficha.marks as Marks), ...((priv?.marks ?? {}) as Marks) };
  const values = { ...ficha, ...(priv ?? {}) } as Record<string, unknown>;
  const defs = OBRA_FIELDS.filter((d) => canPrivate || !d.private);

  if (editing && canEdit) {
    return (
      <>
        <PageHeader back={{ href: `/obras/${id}`, label: 'Ficha de obra' }} title={`Editar ${ficha.code}`} subtitle={ficha.name} />
        <FichaForm
          kind="obra"
          id={id}
          rev={ficha.rev}
          privRev={priv?.rev ?? null}
          stage={ficha.stage}
          initial={toFormValues(OBRA_FIELDS, ficha, priv)}
          initialMarks={marks}
          municipalities={data.municipalities}
          parishMap={data.parishMap}
          parishesUsed={data.used}
          canPrivate={canPrivate}
          cancelHref={`/obras/${id}`}
        />
      </>
    );
  }

  const dialog = buildObraDialog(dialogInput(ficha as unknown as Record<string, unknown>), data.brand);
  const t0 = today().toISODate()!;
  const left = daysUntil(ficha.due_on, t0);

  return (
    <>
      <PageHeader
        back={{ href: '/obras', label: 'Fichas de obra' }}
        title={ficha.name}
        subtitle={[ficha.sector, ficha.parish, ficha.municipality].filter(Boolean).join(' · ')}
        actions={
          canEdit ? (
            <>
              <LinkButton href={`/obras/${id}?editar=1`}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </LinkButton>
              <ObraArchiveControl id={id} stage={ficha.stage} />
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">{ficha.code}</span>
        <Chip tone={OBRA_STAGE[ficha.stage].tone}>{OBRA_STAGE[ficha.stage].label}</Chip>
        {deleted ? <Chip tone="danger">Borrada</Chip> : null}
        <span className="text-sm text-text-2">
          Cargada por {ficha.created_by_name ?? '—'} · actualizada el {fmtDateTime(ficha.updated_at)}
        </span>
      </div>

      <Card className="mb-4">
        <CardBody className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
          <div className="min-w-0">
            <p className="label-caps">Fecha de la visita</p>
            {event?.starts_at ? (
              <p className="mt-1 text-[15px]">
                <span className="font-semibold first-letter:uppercase">{fmtDateTime(event.starts_at)}</span> ·{' '}
                <Link href={`/eventos/${event.id}`} className="font-semibold text-accent-ink underline">Ver el evento {event.code}</Link>
              </p>
            ) : (
              <p className="mt-1 text-[15px] text-text-2">
                {ficha.stage === 'draft'
                  ? 'Cuando la guardes con «Guardar y avisar al jefe», el jefe o el despacho le ponen fecha y hora.'
                  : ficha.stage === 'to_schedule'
                    ? 'Por ponerle fecha: la ponen el jefe o el despacho.'
                    : ficha.stage === 'scheduled' || ficha.stage === 'done'
                      ? 'Ya tiene fecha. La ponen y la ven el jefe y el despacho en la agenda.'
                      : 'Archivada: no va a la agenda.'}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {OBRA_GROUPS.map((g) => {
            const fields = defs.filter((d) => d.group === g.key);
            const prog = groupProgress(defs, g.key, values, marks);
            return (
              <FichaGroup key={g.key} title={g.title} done={prog.done} total={prog.total}>
                {g.key === 'community' && !canPrivate ? (
                  <p className="mb-3 text-[15px] text-text-2">Los contactos se ven con el doble factor.</p>
                ) : null}
                <dl className="grid gap-4 sm:grid-cols-2">
                  {fields.map((d) => (
                    <FichaValue
                      key={d.key}
                      def={d}
                      value={values[d.key]}
                      mark={marks[d.key]}
                      wide={d.type === 'long'}
                      extra={
                        d.key === 'due_on' && left !== null && !marks.due_on ? (
                          <span className="block text-sm text-text-2">{left > 0 ? `Faltan ${left} ${left === 1 ? 'día' : 'días'}` : left === 0 ? 'Es hoy' : `Pasó hace ${-left} ${left === -1 ? 'día' : 'días'}`}</span>
                        ) : undefined
                      }
                    />
                  ))}
                  {g.key === 'general' ? (
                    <div>
                      <dt className="label-caps">Fecha de actualización</dt>
                      <dd className="mt-1 text-[15px]">{fmtDay(ficha.updated_at, "d 'de' LLLL 'de' yyyy")}</dd>
                    </div>
                  ) : null}
                </dl>
              </FichaGroup>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <FabDialogEditor id={id} saved={ficha.fab_dialog} generatedBy={ficha.fab_generated_by} template={dialog.text} missing={dialog.missing} canEdit={canEdit} />
          <Card>
            <CardHeader title="Fotos del antes y del avance" />
            <CardBody className="flex items-start gap-3">
              <ImagePlus className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden />
              <p className="text-[15px] text-text-2">Aquí se van a subir varias fotos (antes y avance), con una subida que aguanta mala señal. Llega en la próxima entrega.</p>
            </CardBody>
          </Card>
          <HistoryTimeline kind="obra" rows={data.history}>
            {canEdit ? <NoteForm kind="obra" id={id} /> : null}
          </HistoryTimeline>
        </div>
      </div>
    </>
  );
}
