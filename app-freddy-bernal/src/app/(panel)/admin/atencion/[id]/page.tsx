import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, FileText, Image as ImageIcon, MapPin } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { withAnon } from '@/lib/db';
import { isDemo } from '@/lib/env';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DeskNav } from '@/components/attention/desk-nav';
import { OverdueChip, PriorityChip, Reference, ScanChip, StateChip, TypeChip } from '@/components/attention/labels';
import { Timeline } from '@/components/attention/case/timeline';
import { AssignForm, Composer, ContactReveal, PriorityDueForm, ReclassifyForm, StateForm } from '@/components/attention/case/work-forms';
import { AttendedForm, EvidenceUpload, FileActions, MergePanel, ModerationPanel } from '@/components/attention/case/more-forms';
import { caseDetail, deskCatalogs, deskStaff, replyTemplates } from '@/lib/data/attention';
import { publishedByIds } from '@/lib/web/public';
import { linkedItemPath } from '@/lib/actions/participation-types';
import { maxAttachmentBytes } from '@/lib/actions/participation-core';
import { DONE_STATES, MESSAGE_LABEL, REQUEST_PRIORITY_LABEL, deskAccess, isUuid, typesFor } from '@/lib/domain/attention';
import { fmtDate, fmtDateTime, fmtDay, TZ } from '@/lib/time';
import { DateTime } from 'luxon';

export const metadata = { title: 'Solicitud' };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`);

// One citizen request (design §5): what arrived, its files, who has it, its state and due date, the replies and the
// internal notes, the evidence, the resolution and what the person said, duplicates, «Casos atendidos», moderation and the
// whole history. Read AS THE PERSON: a case they may not read (another area's, a denuncia for a responsible, anything
// for the web's editor) is simply not found (404). The forms show only what this person may do on THIS case
// (can_work_request / can_steer_request, computed by the database); the database decides again on every action.
export default async function AttentionCasePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor', 'boss');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const access = deskAccess(s.roles);
  const data = await db(s, async (sql) => {
    const detail = await caseDetail(sql, id);
    if (!detail) return null;
    const works = detail.request.canWork;
    return {
      detail,
      catalogs: works ? await deskCatalogs(sql) : null,
      staff: works ? await deskStaff(sql) : [],
      templates: works ? await replyTemplates(sql) : [],
    };
  });
  if (!data) notFound();
  const { detail } = data;
  const r = detail.request;
  // The published item it is about (public content: read as anon, after the person's transaction).
  const linked = r.linkedItemId ? (await withAnon((sql) => publishedByIds(sql, [r.linkedItemId!])))[0] ?? null : null;
  const merged = !!r.duplicateOf;
  const done = DONE_STATES.includes(r.state);
  const canWork = r.canWork;
  const canSteer = r.canSteer;
  const coordinator = access.coordinator;
  const place = [r.municipalityName, r.parishName, r.sector].filter(Boolean).join(' · ');
  const dueDay = r.dueAt ? DateTime.fromJSDate(new Date(r.dueAt)).setZone(TZ).toISODate() : null;
  const files = detail.files;
  const unscanned = files.some((f) => f.scanStatus === 'sin_analizar' && !f.withheld);
  const resolvedCase = !!r.resolvedAt && (r.state === 'resuelto' || r.state === 'cerrado') && !r.isSpam && !merged;

  return (
    <div className="flex flex-col">
      <PageHeader
        back={{ href: '/admin/atencion', label: 'Bandeja' }}
        title={<span className="[overflow-wrap:anywhere]">{r.title}</span>}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Reference value={r.reference} />
            <TypeChip type={r.type} />
            <StateChip state={r.state} />
            <OverdueChip overdue={r.overdue} />
            <PriorityChip priority={r.priority} />
            {r.isSpam ? <Chip tone="warn">Spam</Chip> : null}
          </span>
        }
      />
      <DeskNav access={access} current="bandeja" />
      {merged ? (
        <Card className="mb-5 border-info/40 bg-info-soft">
          <CardBody className="text-[15px]">
            Este caso está unido a {r.mainReference ? <Link href={`/admin/atencion/${r.duplicateOf}`} className="font-mono font-semibold underline">{r.mainReference}</Link> : 'otro caso'}: se atiende allí. Su
            historia se guarda aquí.
          </CardBody>
        </Card>
      ) : null}
      {!canWork ? (
        <p className="mb-5 rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 py-3 text-[15px] text-text-2" role="note">
          Lo puedes consultar, pero no te toca atenderlo: sin contacto y sin cambios.
        </p>
      ) : null}

      {/* On a computer the right column (state, area, files…) is much taller than the left one: the left column's first
          two rows keep their own height and the last one (the history, at its top) takes what is left, so «Lo que llegó»
          is never stretched into a tall empty card. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-[auto_auto_1fr]">
        {/* What arrived */}
        <Card className="lg:col-start-1">
          <CardHeader title="Lo que llegó" subtitle={`El ${fmtDateTime(r.createdAt)}`} />
          <CardBody className="flex flex-col gap-3 text-[15px]">
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{r.description}</p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold">Categoría</dt>
              <dd>{r.categoryName}</dd>
              <dt className="font-semibold">Dónde</dt>
              <dd className="[overflow-wrap:anywhere]">{place || 'Sin lugar'}{r.locationReference ? ` · ${r.locationReference}` : ''}</dd>
              {r.eventDate ? (
                <>
                  <dt className="font-semibold">Cuándo pasó</dt>
                  <dd>{fmtDay(r.eventDate, "d 'de' LLLL 'de' yyyy")}</dd>
                </>
              ) : null}
              <dt className="font-semibold">Ubicación</dt>
              <dd>
                {r.lat !== null && r.lng !== null && r.locationConsent ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink"
                  >
                    <MapPin className="h-4 w-4" aria-hidden /> Marcada con su permiso: ver en el mapa <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="sr-only">(se abre en otra pestaña)</span>
                  </a>
                ) : r.type === 'denuncia' ? (
                  'Una denuncia nunca lleva el punto exacto.'
                ) : (
                  'Sin punto en el mapa.'
                )}
              </dd>
              <dt className="font-semibold">Quién</dt>
              <dd>{r.anonymous ? 'Anónima' : r.publishNameConsent ? 'Dejó contacto y permite su nombre en «Casos atendidos»' : 'Dejó contacto (sin permiso para su nombre)'}</dd>
              {linked ? (
                <>
                  <dt className="font-semibold">Sobre</dt>
                  <dd>
                    <Link href={linkedItemPath(linked.kind === 'news' ? 'news' : 'project', linked.slug)} className="font-semibold text-accent-ink underline-offset-2 hover:underline">
                      {linked.kind === 'news' ? 'Noticia' : 'Obra o acción'}: {linked.data.title}
                    </Link>
                  </dd>
                </>
              ) : null}
            </dl>
            {r.supportCount || detail.supports.length ? (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-ink">
                  {r.supportCount === 1 ? '1 persona se sumó' : `${r.supportCount} personas o casos se sumaron`}
                </summary>
                <ul className="mt-1 flex flex-col gap-2">
                  {detail.supports.map((x) => (
                    <li key={x.id} className="text-sm">
                      <span className="font-mono font-semibold">{x.reference}</span> · {fmtDate(x.createdAt, "d 'de' LLL")}
                      {x.automatic ? ' · se sumó solo (el mismo problema en el mismo lugar)' : ''}
                      {x.note ? <span className="block text-text-2 [overflow-wrap:anywhere]">«{x.note}» (solo el equipo)</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardBody>
        </Card>

        {/* The panels */}
        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <Card>
            <CardHeader title={<span id="estado">Estado</span>} subtitle={r.firstResponseAt ? `Primera respuesta: ${fmtDateTime(r.firstResponseAt)}` : 'Todavía sin respuesta del equipo'} />
            <CardBody className="flex flex-col gap-3">
              {canWork && !merged ? <StateForm id={r.id} state={r.state} /> : <StateChip state={r.state} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Área y responsable" />
            <CardBody className="flex flex-col gap-3 text-[15px]">
              <p>
                {r.type === 'denuncia' ? 'Denuncias' : (r.areaName ?? 'Sin área')} · {r.assigneeName ?? 'sin responsable'}
              </p>
              {canWork && !merged && !done && data.catalogs ? (
                <AssignForm
                  id={r.id}
                  type={r.type}
                  areaId={r.areaId}
                  assigneeId={r.assigneeId}
                  areas={data.catalogs.areas}
                  staff={data.staff}
                  canSteer={canSteer}
                  me={s.userId}
                />
              ) : done && canWork ? (
                <p className="text-sm text-text-2">Para cambiar quién la tiene, reábrela primero.</p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Prioridad y fecha comprometida" />
            <CardBody className="flex flex-col gap-3 text-[15px]">
              <p>
                {REQUEST_PRIORITY_LABEL[r.priority]} · {r.dueAt ? `comprometida para el ${fmtDate(r.dueAt, "d 'de' LLL")}` : 'sin fecha comprometida'}
                {r.overdue ? <span className="font-semibold text-danger"> · vencida</span> : null}
              </p>
              {canSteer && !merged ? <PriorityDueForm id={r.id} priority={r.priority} due={dueDay} /> : canWork ? <p className="text-sm text-text-2">La prioridad y la fecha las pone la coordinación.</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contacto de la persona" />
            <CardBody>
              {canWork ? (
                <ContactReveal id={r.id} anonymous={r.anonymous} canErase={coordinator} />
              ) : (
                <p className="text-sm text-text-2">El contacto lo ven solo quienes atienden el caso. Queda registrado quién lo mira.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Archivos" subtitle="Los de la persona y las evidencias del equipo. Nunca son públicos." />
            <CardBody className="flex flex-col gap-3">
              {unscanned ? (
                <p className="rounded-[var(--radius-control)] border border-warn/40 bg-warn-soft px-3 py-2 text-sm" role="note">
                  {isDemo()
                    ? 'Archivos sin analizar (versión de prueba): ábrelos solo si confías en ellos.'
                    : 'Hay archivos sin analizar: no se abren hasta que el revisor los apruebe.'}
                </p>
              ) : null}
              {files.length ? (
                <ul className="flex flex-col gap-3">
                  {files.map((f) => {
                    const photo = f.mime.startsWith('image/');
                    return (
                      <li key={f.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                        <p className="flex items-center gap-2 text-[15px] font-semibold">
                          {photo ? <ImageIcon className="h-4 w-4" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
                          {f.kind === 'evidence' ? 'Evidencia del equipo' : 'De la persona'} · {photo ? 'Foto' : 'PDF'} · {kb(f.bytes)}
                        </p>
                        <p className="flex flex-wrap gap-2">
                          <ScanChip status={f.scanStatus} />
                          {f.kind === 'evidence' ? <Chip tone={f.shared ? 'info' : 'neutral'}>{f.shared ? 'La ve la persona' : 'Solo el equipo'}</Chip> : null}
                          {f.withheld ? <Chip tone="danger">Retirado</Chip> : null}
                        </p>
                        <p className="text-xs text-text-2">
                          {fmtDateTime(f.at)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ''}{f.withheld && f.withheldReason ? ` · Motivo: ${f.withheldReason}` : ''}
                        </p>
                        {!f.withheld ? (
                          <p className="flex flex-wrap gap-x-4">
                            {photo ? (
                              <a href={`/api/archivos/atencion/${f.id}?ver=1`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink">
                                Ver la foto <span className="sr-only">(se abre en otra pestaña)</span>
                              </a>
                            ) : null}
                            <a href={`/api/archivos/atencion/${f.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink" download>
                              Descargar
                            </a>
                          </p>
                        ) : null}
                        {!f.withheld && (canWork || canSteer) && !merged ? <FileActions fileId={f.id} kind={f.kind} shared={f.shared} canWork={canWork} canSteer={canSteer} /> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-text-2">No hay archivos.</p>
              )}
              {canWork && !merged ? (
                <div className="border-t border-border pt-3">
                  <EvidenceUpload id={r.id} maxBytes={maxAttachmentBytes()} />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Resolución" />
            <CardBody className="flex flex-col gap-2 text-[15px]">
              {r.resolvedAt ? (
                <>
                  <p>Resuelta el {fmtDateTime(r.resolvedAt)}.</p>
                  {r.resolutionNote ? <p className="text-text-2 [overflow-wrap:anywhere]">Justificación (interna): {r.resolutionNote}</p> : null}
                </>
              ) : (
                <p className="text-text-2">Todavía no está resuelta.</p>
              )}
              {r.citizenConfirmation === 'resolved' ? (
                <p className="font-semibold text-ok">La persona confirmó que se resolvió{r.citizenConfirmedAt ? ` (${fmtDate(r.citizenConfirmedAt, "d 'de' LLL")})` : ''}.</p>
              ) : r.citizenConfirmation === 'not_resolved' ? (
                <p className="font-semibold text-danger">La persona dice que no se resolvió{r.citizenConfirmedAt ? ` (${fmtDate(r.citizenConfirmedAt, "d 'de' LLL")})` : ''}: el caso volvió a atención.</p>
              ) : r.state === 'resuelto' ? (
                <p className="text-text-2">Esperando que la persona confirme desde su consulta.</p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Casos iguales" subtitle={detail.merged.length ? `${detail.merged.length} unido(s) a este` : undefined} />
            <CardBody className="flex flex-col gap-3 text-[15px]">
              {detail.merged.length ? (
                <ul className="flex flex-col gap-1">
                  {detail.merged.map((d) => (
                    <li key={d.id}>
                      <Link href={`/admin/atencion/${d.id}`} className="font-mono font-semibold text-accent-ink underline-offset-2 hover:underline">{d.reference}</Link>
                      <span className="text-text-2"> · llegó el {fmtDate(d.createdAt, "d 'de' LLL")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {coordinator && !merged && !done ? <MergePanel id={r.id} reference={r.reference} /> : !detail.merged.length ? <p className="text-sm text-text-2">Ninguno.</p> : null}
            </CardBody>
          </Card>

          {coordinator && resolvedCase ? (
            <Card>
              <CardHeader title="Casos atendidos" subtitle="Lo que se publica en la web, sin datos de la persona." />
              <CardBody>
                <AttendedForm
                  id={r.id}
                  type={r.type}
                  anonymous={r.anonymous}
                  nameConsent={r.publishNameConsent}
                  municipality={r.municipalityName}
                  published={detail.attended ? { status: detail.attended.status, summary: detail.attended.summary, displayName: detail.attended.displayName } : null}
                />
              </CardBody>
            </Card>
          ) : detail.attended?.status === 'published' ? (
            <Card>
              <CardHeader title="Casos atendidos" />
              <CardBody className="text-[15px]">Publicada en «Casos atendidos»: {detail.attended.summary}</CardBody>
            </Card>
          ) : null}

          {coordinator && !merged && data.catalogs ? (
            <Card>
              <CardHeader title="Corregir tipo o categoría" />
              <CardBody>
                <ReclassifyForm id={r.id} type={r.type} categoryId={r.categoryId} categories={data.catalogs.categories} types={typesFor(s.roles)} />
              </CardBody>
            </Card>
          ) : null}

          {canSteer && !merged ? (
            <Card>
              <CardHeader title="Moderación" />
              <CardBody>
                <ModerationPanel
                  id={r.id}
                  isSpam={r.isSpam}
                  messages={detail.messages
                    .filter((m) => !m.redacted)
                    .map((m) => ({ id: m.id, label: `${MESSAGE_LABEL[m.kind]} · ${fmtDate(m.at, "d 'de' LLL")} · ${m.body.slice(0, 40)}${m.body.length > 40 ? '…' : ''}` }))}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* Writing */}
        {canWork ? (
          <Card className="lg:col-start-1">
            <CardHeader title="Escribir" subtitle="Una nota interna, una respuesta a la persona o un pedido de información." />
            <CardBody>
              <Composer id={r.id} state={r.state} merged={merged} templates={data.templates.map((t) => ({ id: t.id, kind: t.kind, title: t.title, body: t.body }))} />
            </CardBody>
          </Card>
        ) : null}

        {/* The history */}
        <div className="lg:col-start-1 lg:self-start">
          <Timeline detail={detail} />
        </div>
      </div>
    </div>
  );
}
