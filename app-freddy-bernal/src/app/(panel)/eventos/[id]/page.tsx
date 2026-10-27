import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, MapPin, BookOpenText, Phone, Route } from 'lucide-react';
import { requireSession, db } from '@/lib/auth/session';
import { getEvent } from '@/lib/data/events';
import { contentCategories, municipalities, peopleWithRole } from '@/lib/data/common';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { BOSS_DECISION, WORK_STATUS, PIECE_STATUS, PIECE_KIND } from '@/lib/data/labels';
import { fmtDateTime, fmtTime, fmtDay, dt } from '@/lib/time';
import { cn } from '@/lib/cn';
import { BossPanel, BriefEditor, CameraAssign, EventEditor, MarkDone, ScheduleEditor, WorkStatusSelect } from './event-client';
import { StoryboardEditor } from './storyboard-editor';
import { MaterialPanel } from './material-panel';
import { mediaLockSql } from '@/lib/domain/media-lock';
import { driveUi } from '@/lib/data/drive';

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
    const media = await sql.query<{ id: string; kind: string; label: string; size_bytes: number; duration_s: number | null; width: number | null; height: number | null; status: string; mime: string; bucket: string; lock: string | null }>(
      `select m.id, m.kind, m.label, m.size_bytes, m.duration_s, m.width, m.height, m.status, m.mime, m.bucket,
              ${mediaLockSql('m.id')} as lock
         from public.media_assets m where m.event_id = $1 and m.deleted_at is null order by m.kind, m.created_at`,
      [id],
    );
    const pieces = has('admin', 'social', 'boss')
      ? await sql.query<{ id: string; title: string; kind: string; status: string; current_version: number }>(
          `select id, title, kind, status, current_version from public.pieces where event_id = $1 and deleted_at is null order by created_at`,
          [id],
        )
      : [];
    const editors = has('admin', 'dispatch');
    return {
      ev,
      media,
      pieces,
      categories: editors ? await contentCategories(sql) : [],
      municipalities: editors ? await municipalities(sql) : [],
      cameras: has('admin', 'dispatch', 'social') ? await peopleWithRole(sql, 'camera') : [],
    };
  });
  if (!data) notFound();
  const { ev } = data;
  const canEdit = has('admin', 'dispatch');
  const canBoard = has('admin', 'social');
  // The boss «hace lo de Redes» (he uploads finals, covers and material like Redes; media_insert lets him).
  const canUpload = has('admin', 'social', 'boss') || (has('camera') && ev.cameras.some((c) => c.user_id === s.userId));
  const tab = TABS.find((t) => t.key === rawTab)?.key ?? (has('camera') && !has('admin', 'boss') ? 'material' : 'ficha');
  const visibleTabs = TABS.filter((t) => t.key !== 'piezas' || has('admin', 'social', 'boss'));
  const past = ev.schedule ? new Date(ev.schedule.starts_at) < new Date() : false;
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
        <Chip tone={WORK_STATUS[ev.work_status]?.tone}>{WORK_STATUS[ev.work_status]?.label}</Chip>
        <Chip tone={BOSS_DECISION[ev.boss_decision]?.tone}>{BOSS_DECISION[ev.boss_decision]?.label}</Chip>
        {ev.priority ? <Chip tone="accent">Importancia {ev.priority}/10</Chip> : null}
        {ev.category_name ? <Chip>{ev.category_name}</Chip> : null}
        {ev.done_on ? <Chip tone="ok">Realizado el {fmtDay(ev.done_on, "d 'de' LLLL")}</Chip> : null}
      </div>

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
          {canEdit || (past && !ev.done_on) ? (
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
              {canEdit ? <ScheduleEditor id={ev.id} schedule={ev.schedule} /> : null}
              {past && !ev.done_on ? <MarkDone id={ev.id} /> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {has('boss') ? <BossPanel id={ev.id} priority={ev.priority} decision={ev.boss_decision} /> : null}

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
            {has('admin', 'social') ? <WorkStatusSelect id={ev.id} status={ev.work_status} /> : null}
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
          </div>
        </div>
      ) : null}

      {tab === 'storyboard' ? (
        <StoryboardEditor eventId={ev.id} canEdit={canBoard} speech={ev.storyboard?.speech ?? ''} blocks={ev.blocks} facts={ev.brief?.key_facts ?? ''} />
      ) : null}

      {tab === 'material' ? <MaterialPanel eventId={ev.id} eventCode={ev.code} media={data.media} canUpload={canUpload} canRemove={has('admin')} canPick={!!drive?.picker} /> : null}

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

function Item({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="label-caps">{label}</dt>
      <dd className={cn('mt-1 whitespace-pre-wrap text-[15px]', !value && 'text-muted')}>{value || 'Falta este dato'}</dd>
    </div>
  );
}
