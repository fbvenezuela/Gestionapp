import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ban, CalendarClock, ClipboardList, MapPin, BookOpenText, Phone, Route } from 'lucide-react';
import { requireSession, db } from '@/lib/auth/session';
import { eventHistory, getEvent, type EventFull } from '@/lib/data/events';
import { contentCategories, municipalities, peopleWithRole } from '@/lib/data/common';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { BOSS_DECISION, EVENT_KIND, EVENT_ORIGIN, WORK_STATUS, PIECE_STATUS, PIECE_KIND } from '@/lib/data/labels';
import { fmtDateTime, fmtTime, fmtDay, dt } from '@/lib/time';
import { cn } from '@/lib/cn';
import { BossPanel, BriefEditor, CameraAssign, EventEditor, MarkDone, ScheduleEditor, WorkStatusSelect } from './event-client';
import { StoryboardEditor } from './storyboard-editor';
import { MaterialPanel } from './material-panel';
import { HandoffPanel } from './handoff-panel';
import { getHandoff } from '@/lib/data/recording';
import { mediaLockSql } from '@/lib/domain/media-lock';
import { driveUi } from '@/lib/data/drive';
import { MoveSheet } from '@/components/agenda/move-sheet';
import { CancelButton, RestoreButton } from '@/components/agenda/cancel-button';
import { HistoryCard } from '@/components/agenda/history-card';
import { scheduleValues, whenOf } from '@/lib/domain/schedule-form';

export const metadata = { title: 'Evento' };

const TABS = [
  { key: 'ficha', label: 'Ficha' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'material', label: 'Material' },
  { key: 'piezas', label: 'Piezas' },
] as const;

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const has = (...r: string[]) => s.roles.some((x) => r.includes(x));
  const data = await db(s, async (sql) => {
    const ev = await getEvent(sql, id);
    if (!ev) return null;
    const media = await sql.query<{ id: string; kind: string; label: string; size_bytes: number; duration_s: number | null; width: number | null; height: number | null; status: string; mime: string; bucket: string; lock: string | null; ext: string | null }>(
      `select m.id, m.kind, m.label, m.size_bytes, m.duration_s, m.width, m.height, m.status, m.mime, m.bucket,
              ${mediaLockSql('m.id')} as lock, lower(substring(m.storage_path from '\\.([A-Za-z0-9]{1,5})$')) as ext
         from public.media_assets m where m.event_id = $1 and m.deleted_at is null order by m.kind, m.created_at`,
      [id],
    );
    const pieces = has('admin', 'social', 'boss')
      ? await sql.query<{ id: string; title: string; kind: string; status: string; current_version: number }>(
          `select id, title, kind, status, current_version from public.pieces where event_id = $1 and deleted_at is null order by created_at`,
          [id],
        )
      : [];
    // The shared agenda: the boss and despacho edit it (the database decides: can_manage_agenda()).
    const editors = has('boss', 'dispatch');
    return {
      ev,
      media,
      pieces,
      categories: editors ? await contentCategories(sql) : [],
      municipalities: editors ? await municipalities(sql) : [],
      cameras: has('admin', 'boss', 'dispatch', 'social') ? await peopleWithRole(sql, 'camera') : [],
      history: editors ? await eventHistory(sql, id) : [],
      // Whoever edits the storyboard reads its history (what someone else typed stays readable after a save).
      boardHistory: rawTab === 'storyboard' && has('admin', 'social', 'boss') ? await eventHistory(sql, id, true) : [],
      // Grabación's storyboard and note for the editor (§5): RLS gives the notes to admin, the boss, Redes and the
      // camera person assigned; despacho gets the storyboard files only.
      handoff: await getHandoff(sql, id),
    };
  });
  if (!data) notFound();
  const { ev } = data;
  // The IVT (a visit born from its obra) and política (an activity born from its report) read only the event row:
  // never its brief, storyboard or material. Política never its date either.
  if (!has('admin', 'boss', 'dispatch', 'social', 'camera')) return <SourceView ev={ev} has={has} />;
  const cancelled = !!ev.cancelled_at;
  const canEdit = has('boss', 'dispatch');
  const canBoard = has('admin', 'social', 'boss');
  // The boss «hace lo de Redes» (he uploads finals, covers and material like Redes; media_insert lets him).
  const canUpload = has('admin', 'social', 'boss') || (has('camera') && ev.cameras.some((c) => c.user_id === s.userId));
  // The camera person assigned to this event, recording it (not the boss or admin with a camera role as well): they
  // leave the storyboard and the note for the editor (§5).
  const recorder = has('camera') && !has('admin', 'boss', 'social') && ev.cameras.some((c) => c.user_id === s.userId);
  const tab = TABS.find((t) => t.key === rawTab)?.key ?? (has('camera') && !has('admin', 'boss') ? 'material' : 'ficha');
  const visibleTabs = TABS.filter((t) => t.key !== 'piezas' || has('admin', 'social', 'boss'));
  const past = ev.schedule ? new Date(ev.schedule.starts_at) < new Date() : false;
  // «Marcar realizado»: the boss, despacho and whoever records it (mark_event_done(); administración reads the agenda).
  const canMarkDone = has('boss', 'dispatch') || (has('camera') && ev.cameras.some((c) => c.user_id === s.userId));
  const markDone = canMarkDone && past && !ev.done_on && !cancelled;
  // Its own short query, after (never inside) the one above.
  const drive = tab === 'material' ? await driveUi(s) : null;

  return (
    <>
      <PageHeader
        back={{ href: '/agenda', label: has('social') && !has('admin', 'boss', 'dispatch') ? 'Eventos' : 'Agenda' }}
        title={ev.title}
        subtitle={[ev.place_name, ev.municipality].filter(Boolean).join(' · ')}
        actions={
          ev.blocks.length || ev.storyboard?.speech ? (
            <LinkButton variant="slate" href={`/eventos/${ev.id}/lectura`}>
              <BookOpenText className="h-4 w-4" aria-hidden /> Modo lectura
            </LinkButton>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">{ev.code}</span>
        {cancelled ? <Chip tone="danger">Cancelado</Chip> : null}
        {ev.kind !== 'event' ? <Chip tone="info">{EVENT_KIND[ev.kind]}</Chip> : null}
        <Chip tone={WORK_STATUS[ev.work_status]?.tone}>{WORK_STATUS[ev.work_status]?.label}</Chip>
        <Chip tone={BOSS_DECISION[ev.boss_decision]?.tone}>{BOSS_DECISION[ev.boss_decision]?.label}</Chip>
        {ev.priority ? <Chip tone="accent">Importancia {ev.priority}/10</Chip> : null}
        {ev.category_name ? <Chip>{ev.category_name}</Chip> : null}
        {ev.done_on ? <Chip tone="ok">Realizado el {fmtDay(ev.done_on, "d 'de' LLLL")}</Chip> : null}
        <span className="text-sm text-text-2">
          {EVENT_ORIGIN[ev.origin]}
          {ev.updated_by_name ? ` · último cambio: ${ev.updated_by_name}` : ''}
        </span>
      </div>

      {cancelled ? (
        <Card className="mb-4 border-danger/40 bg-danger-soft" role="status">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Ban className="h-6 w-6 shrink-0 text-danger" aria-hidden />
            <p className="min-w-0 flex-1 text-[15px]">
              <b className="text-danger">Cancelado</b>
              {ev.cancelled_by_name ? ` por ${ev.cancelled_by_name}` : ''}.{ev.cancel_reason ? ` Motivo: ${ev.cancel_reason}` : ''}
            </p>
            {canEdit ? <RestoreButton id={ev.id} /> : null}
          </CardBody>
        </Card>
      ) : null}

      {canEdit && !cancelled && !ev.done_on ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {ev.schedule ? <MoveSheet id={ev.id} rev={ev.schedule.rev} current={whenOf(scheduleValues(ev.schedule))} /> : null}
          <CancelButton id={ev.id} fromFicha={!!(ev.obra_ficha_id || ev.community_report_id)} />
        </div>
      ) : null}

      {(ev.obra_ficha_id && has('admin', 'boss', 'dispatch')) || (ev.community_report_id && has('admin', 'boss', 'dispatch')) ? (
        <p className="mb-4">
          <Link className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink underline" href={ev.obra_ficha_id ? `/obras/${ev.obra_ficha_id}` : `/reportes/${ev.community_report_id}`}>
            <ClipboardList className="h-4 w-4" aria-hidden /> {ev.obra_ficha_id ? 'Ver la ficha de obra' : 'Ver el reporte comunitario'}
          </Link>
        </p>
      ) : null}

      {ev.schedule ? (
        <Card className="mb-4 border-slate/20">
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <p className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
              <span>
                <span className="block font-semibold first-letter:uppercase">{fmtDateTime(ev.schedule.starts_at)}</span>
                <span className="block text-sm text-text-2">hasta las {fmtTime(ev.schedule.ends_at)} ({Math.round((dt(ev.schedule.ends_at)!.diff(dt(ev.schedule.starts_at)!, 'minutes').minutes))} min)</span>
              </span>
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
              <span className="text-[15px]">{ev.schedule.exact_address || 'Sin dirección exacta'}</span>
            </p>
            <div className="flex flex-col gap-1 text-[15px]">
              {ev.schedule.directions ? <p className="flex items-start gap-2"><Route className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden />{ev.schedule.directions}</p> : null}
              {ev.schedule.site_contacts ? <p className="flex items-start gap-2"><Phone className="mt-0.5 h-5 w-5 shrink-0 text-text-2" aria-hidden />{ev.schedule.site_contacts}</p> : null}
            </div>
          </CardBody>
          {(canEdit && !cancelled) || markDone ? (
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
              {canEdit && !cancelled ? <ScheduleEditor id={ev.id} schedule={ev.schedule} /> : null}
              {markDone ? <MarkDone id={ev.id} /> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {has('boss') && !cancelled ? <BossPanel id={ev.id} priority={ev.priority} decision={ev.boss_decision} /> : null}

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Secciones del evento">
        {visibleTabs.map((t) => (
          <Link
            key={t.key}
            href={`/eventos/${ev.id}?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn('min-h-11 whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] font-semibold', tab === t.key ? 'border-accent text-text' : 'border-transparent text-text-2 hover:text-text')}
          >
            {t.label}
            {t.key === 'material' && data.media.length ? <span className="ml-1 text-text-2">({data.media.filter((m) => ['boss', 'drone', 'broll', 'other'].includes(m.kind)).length})</span> : null}
          </Link>
        ))}
      </nav>

      {tab === 'ficha' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader title="Ficha técnica" action={canEdit ? <BriefEditor id={ev.id} brief={ev.brief} /> : undefined} />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="De qué es la obra o el acto" value={ev.brief?.work_description} wide />
                <Item label="Quién la dirige" value={ev.brief?.led_by} />
                <Item label="Encargado" value={ev.brief?.in_charge} />
                <Item label="Qué se está logrando" value={ev.brief?.achievements} wide />
                <Item label="Datos y cifras" value={ev.brief?.key_facts} wide />
                <Item label="Protocolo" value={ev.brief?.protocol} wide />
                {ev.brief?.notes ? <Item label="Notas" value={ev.brief.notes} wide /> : null}
                {ev.summary ? <Item label="De qué se trata" value={ev.summary} wide /> : null}
              </dl>
            </CardBody>
          </Card>
          <div className="flex flex-col gap-4">
            {canEdit ? <EventEditor ev={ev} categories={data.categories} municipalities={data.municipalities} /> : null}
            {has('social', 'boss') ? <WorkStatusSelect id={ev.id} status={ev.work_status} /> : null}
            <Card>
              <CardHeader title="Quién graba" />
              <CardBody>
                {data.cameras.length ? (
                  <CameraAssign id={ev.id} assigned={ev.cameras.map((c) => c.user_id)} people={data.cameras} />
                ) : ev.cameras.length ? (
                  <p>{ev.cameras.map((c) => c.full_name).join(', ')}</p>
                ) : (
                  <p className="text-text-2">Sin asignar.</p>
                )}
              </CardBody>
            </Card>
            {canEdit ? <HistoryCard rows={data.history} /> : null}
          </div>
        </div>
      ) : null}

      {tab === 'storyboard' ? (
        <div className="flex flex-col gap-4">
          <StoryboardEditor eventId={ev.id} canEdit={canBoard} speech={ev.storyboard?.speech ?? ''} blocks={ev.blocks} facts={ev.brief?.key_facts ?? ''} rev={ev.storyboard?.rev ?? null} />
          {canBoard ? <HistoryCard rows={data.boardHistory} title="Historial del storyboard" /> : null}
        </div>
      ) : null}

      {tab === 'material' ? (
        <MaterialPanel
          eventId={ev.id}
          eventCode={ev.code}
          eventTitle={ev.title}
          media={data.media.map((m) => ({ ...m, ext: m.ext ?? 'bin' }))}
          canUpload={canUpload}
          canRemove={has('admin')}
          canPick={!!drive?.picker}
          handoffFirst={!recorder}
          notes={recorder || has('admin', 'boss', 'social') ? data.handoff.notes.filter((n) => n.body.trim()).map((n) => ({ kind: n.kind, body: n.body, author: n.author })) : null}
          handoff={<HandoffPanel eventId={ev.id} handoff={data.handoff} camera={recorder && !cancelled} notes={recorder || has('admin', 'boss', 'social')} canRemove={has('admin')} />}
        />
      ) : null}

      {tab === 'piezas' ? (
        <Card>
          <CardHeader title="Piezas de este evento" action={has('admin', 'social', 'boss') ? <LinkButton size="sm" href={`/piezas/nueva?evento=${ev.id}`}>Nueva pieza</LinkButton> : undefined} />
          {data.pieces.length ? (
            <ul className="divide-y divide-border">
              {data.pieces.map((p) => (
                <li key={p.id}>
                  <Link href={`/piezas/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.title}</span>
                      <span className="block text-sm text-text-2">{PIECE_KIND[p.kind]} · versión {p.current_version || '—'}</span>
                    </span>
                    <Chip tone={PIECE_STATUS[p.status]?.tone}>{PIECE_STATUS[p.status]?.label}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-[15px] text-text-2">Todavía no hay piezas.</p>
          )}
        </Card>
      ) : null}
    </>
  );
}

// The IVT and política: the event row only. The IVT sees the date of the visits born from its obras (2FA: the
// database returns the schedule); política gets «Ya tiene fecha», never the date (the database returns none).
function SourceView({ ev, has }: { ev: EventFull; has: (...r: string[]) => boolean }) {
  const cancelled = !!ev.cancelled_at;
  // Rejected by the boss: it has no date any more (the one it had is not shown), and the ficha waits for another.
  const rejected = !cancelled && ev.boss_decision === 'rejected';
  const back = has('ivt') ? { href: '/agenda', label: 'Mis visitas de obra' } : { href: ev.community_report_id ? `/reportes/${ev.community_report_id}` : '/municipios', label: 'Volver' };
  return (
    <>
      <PageHeader back={back} title={ev.title} subtitle={[ev.place_name, ev.municipality].filter(Boolean).join(' · ')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">{ev.code}</span>
        <Chip tone="info">{EVENT_KIND[ev.kind]}</Chip>
        {cancelled ? <Chip tone="danger">Cancelado</Chip> : <Chip tone={BOSS_DECISION[ev.boss_decision]?.tone}>{BOSS_DECISION[ev.boss_decision]?.label}</Chip>}
      </div>
      <Card className="mb-4">
        <CardBody className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
          <div className="min-w-0 text-[15px]">
            {cancelled ? (
              <p><b className="text-danger">Se canceló.</b> La ficha vuelve a «Por ponerle fecha».</p>
            ) : rejected ? (
              <p><b className="text-danger">El jefe la rechazó.</b> Ya no tiene fecha: la ficha vuelve a «Por ponerle fecha».</p>
            ) : ev.schedule ? (
              <>
                <p className="font-semibold first-letter:uppercase">{fmtDateTime(ev.schedule.starts_at)}</p>
                <p className="text-sm text-text-2">hasta las {fmtTime(ev.schedule.ends_at)}</p>
                {ev.schedule.exact_address ? <p className="mt-1 flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{ev.schedule.exact_address}</p> : null}
              </>
            ) : (
              <p>Ya tiene fecha. La ven el jefe y el despacho en la agenda.</p>
            )}
          </div>
        </CardBody>
      </Card>
      {ev.summary ? (
        <Card className="mb-4">
          <CardBody><p className="label-caps">De qué se trata</p><p className="mt-1 whitespace-pre-wrap text-[15px]">{ev.summary}</p></CardBody>
        </Card>
      ) : null}
      {ev.obra_ficha_id && has('ivt') ? (
        <LinkButton href={`/obras/${ev.obra_ficha_id}`} size="lg"><ClipboardList className="h-5 w-5" aria-hidden /> Ver la ficha de obra</LinkButton>
      ) : ev.community_report_id && has('politics') ? (
        <LinkButton href={`/reportes/${ev.community_report_id}`} size="lg"><ClipboardList className="h-5 w-5" aria-hidden /> Ver el reporte</LinkButton>
      ) : null}
    </>
  );
}

function Item({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="label-caps">{label}</dt>
      <dd className={cn('mt-1 whitespace-pre-wrap text-[15px]', !value && 'text-muted')}>{value || 'Falta este dato'}</dd>
    </div>
  );
}
