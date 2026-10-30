import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { getPiece, fmtSecond } from '@/lib/data/pieces';
import { cardHref, getMonths, getRedesSettings } from '@/lib/data/redes';
import { PageHeader } from '@/components/ui/page';
import { brand } from '@/lib/client-config';
import { isDemo } from '@/lib/env';
import { LEVELS } from '@/lib/domain/review';
import { FORMAT } from '@/lib/domain/redes';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { NETWORK_LABEL, PUB_STATUS } from '@/lib/data/labels';
import { fmtDateTime, ms } from '@/lib/time';
import { MediaPreview } from '@/components/media/media-preview';
import { DownloadLink } from '@/components/media/drive-download';
import { CopiesEditor } from './copies-editor';
import { VersionUpload, VoiceLineUpload } from './piece-client';
import { PieceBig } from './piece-big';
import { driveUi } from '@/lib/data/drive';

export const metadata = { title: 'Pieza' };

// The piece in big (R4, D-60, §5.1): the same card as in its section, then «Copies» (#copies: formula, voice, closing,
// the three lengths), the final file and its versions, the phrases asked to the boss, the publications and the review
// history. Every piece keeps this address (notifications, Mensajes, 360, Buscar, Publicar and Hoy link here). Nothing
// here reads the agenda: of an event, only its title (D-75). In the demo, a piece kept on another server says so
// (not-found.tsx).
export default async function PiecePage({ params }: { params: Promise<{ id: string }> }) {
  // The boss does what Redes does, uploading the final file and the cover included (20261027001900_media_handoff.sql).
  const s = await requireRole('admin', 'social', 'boss');
  const { id } = await params;
  const data = await db(s, async (sql) => {
    const piece = await getPiece(sql, id);
    if (!piece?.card) return null;
    return {
      piece,
      months: await getMonths(sql),
      settings: await getRedesSettings(sql),
      formulas: await sql.query<{ id: string; code: string; name: string; description: string }>(`select id, code, name, description from public.copy_formulas where active and deleted_at is null order by sort`),
      closings: (await sql.one<{ value: { closings?: string[] } }>(`select value from public.app_settings where key = 'brand'`))?.value?.closings,
    };
  });
  if (!data) notFound();
  const p = data.piece;
  const card = p.card!;
  const f = FORMAT[card.format];
  const drive = await driveUi(s);
  const current = p.versions[0];
  const lastChanges = p.reviews.find((r) => r.decision === 'changes_requested' && r.version === p.current_version);
  const firstMonth = data.months[0]?.id ?? null;
  const month = data.months.find((m) => m.id === (card.monthId ?? firstMonth)) ?? null;
  const back = cardHref(card, firstMonth);

  return (
    <>
      <PageHeader
        back={{ href: back, label: f.plural }}
        title={p.title}
        subtitle={[f.label, month?.label, p.event_title, p.category_name].filter(Boolean).join(' · ')}
        actions={p.status === 'approved' ? <LinkButton href={`/publicar/nueva?pieza=${p.id}`}>Publicar</LinkButton> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone={card.chip.tone}>{card.chip.label}</Chip>
        <Chip>Versión {p.current_version || '—'}</Chip>
        <Chip tone={LEVELS[p.review_level].tone}>{LEVELS[p.review_level].label}: aprueba {LEVELS[p.review_level].who}</Chip>
        {p.approved_by_name ? <Chip tone="ok">Aprobó {p.approved_by_name} · {fmtDateTime(p.approved_at)}</Chip> : null}
      </div>

      {lastChanges ? (
        <Card className="mb-4 border-danger/40 bg-danger-soft">
          <CardBody>
            <p className="font-semibold text-danger">Pidieron cambios</p>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{lastChanges.comment}</p>
            <p className="mt-1 text-sm text-text-2">{lastChanges.reviewer} · {fmtDateTime(lastChanges.created_at)}</p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PieceBig
            card={card}
            sectionHref={back}
            level={p.review_level}
            sentBefore={!!p.sent_to_review_at}
            ctx={{
              format: card.format,
              monthId: month?.id ?? null,
              monthLabel: month?.label ?? '',
              months: data.months,
              pillars: data.settings.pillars,
              perms: { boss: s.roles.includes('boss'), admin: s.roles.includes('admin'), mark: s.roles.some((r) => r === 'social' || r === 'boss') },
              demo: isDemo(),
              userId: s.userId,
              manualOrder: false,
            }}
          />
          {card.format === 'story' ? null : (
            <div id="copies" className="scroll-mt-20">
              <CopiesEditor
                pieceId={p.id}
                copies={p.copies}
                formulas={data.formulas}
                closings={data.closings?.length ? data.closings : brand.closings}
                voice={p.copy_voice}
                closing={p.copy_closing}
                approved={p.status === 'approved'}
              />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card data-tour="final-file">
            <CardHeader title="Archivo final" subtitle={current ? `Versión ${current.version}` : 'Todavía no hay archivo'} />
            <CardBody className="flex flex-col gap-3">
              {current?.media_asset_id ? <MediaPreview id={current.media_asset_id} mime={current.mime ?? ''} drive={current.bucket === 'drive'} /> : null}
              {current?.cover_asset_id ? (
                <DownloadLink
                  file={{ id: current.cover_asset_id, label: current.cover_label || 'Portada', size: Number(current.cover_size ?? 0) }}
                  drive={current.cover_bucket === 'drive'}
                  className="text-left text-sm font-semibold text-accent-ink"
                >
                  Descargar portada
                </DownloadLink>
              ) : null}
              <VersionUpload pieceId={p.id} eventId={p.event_id} format={card.format} canPick={drive.picker} />
              {p.versions.length > 1 ? (
                <details className="rounded-[var(--radius-control)] border border-border">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">Versiones anteriores ({p.versions.length - 1})</summary>
                  <ul className="divide-y divide-border border-t border-border text-sm">
                    {p.versions.slice(1).map((v) => (
                      <li key={v.version} className="px-3 py-2">
                        <span className="font-semibold">Versión {v.version}</span>
                        {v.notes ? <span className="text-text-2"> · {v.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardBody>
          </Card>

          {p.voice.length ? (
            <Card>
              <CardHeader title="Frases pedidas al jefe" />
              <ul className="divide-y divide-border">
                {p.voice.map((v) => (
                  <li key={v.id} className="flex flex-col gap-2 px-4 py-3">
                    <p className="text-[15px]">«{v.phrase}» {v.at_second !== null ? <span className="font-mono text-sm text-text-2">en {fmtSecond(v.at_second)}</span> : null}</p>
                    {v.audio_asset_id ? (
                      <DownloadLink
                        file={{ id: v.audio_asset_id, label: v.audio_label || 'Audio', size: Number(v.audio_size ?? 0) }}
                        drive={v.audio_bucket === 'drive'}
                        className="text-left text-sm font-semibold text-ok"
                      >
                        Audio recibido · descargar
                      </DownloadLink>
                    ) : (
                      <VoiceLineUpload requestId={v.id} eventId={p.event_id} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {p.publications.length ? (
            <Card>
              <CardHeader title="Publicaciones" />
              <ul className="divide-y divide-border">
                {p.publications.map((x) => (
                  <li key={x.id}>
                    <Link href={`/publicar/${x.id}`} className="flex min-h-11 flex-wrap items-center gap-2 px-4 py-3 hover:bg-surface-2">
                      <span className="flex-1 font-semibold">{NETWORK_LABEL[x.network]}</span>
                      <span className="text-sm text-text-2">{fmtDateTime(x.published_at ?? x.scheduled_at)}</span>
                      <Chip tone={PUB_STATUS[x.status]?.tone}>{PUB_STATUS[x.status]?.label}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Historial de revisión" />
            {p.reviews.length || p.comments.length ? (
              <ul className="divide-y divide-border text-[15px]">
                {[...p.reviews.map((r) => ({ at: r.created_at, who: r.reviewer, text: r.comment, tag: r.decision === 'approved' ? 'Aprobó' : 'Pidió cambios', v: r.version })),
                  ...p.comments.map((c) => ({ at: c.created_at, who: c.author, text: c.at_second !== null ? `[${fmtSecond(c.at_second)}] ${c.body}` : c.body, tag: 'Comentó', v: c.version }))]
                  .sort((a, b) => ms(b.at) - ms(a.at))
                  .map((h, i) => (
                    <li key={i} className="px-4 py-3">
                      <p><b>{h.who}</b> {h.tag.toLowerCase()} (v{h.v})</p>
                      {h.text ? <p className="whitespace-pre-wrap text-text-2">{h.text}</p> : null}
                      <p className="text-sm text-muted">{fmtDateTime(h.at)}</p>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="p-4 text-[15px] text-text-2">Todavía no hay revisiones.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
