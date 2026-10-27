import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { getPiece, fmtSecond } from '@/lib/data/pieces';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LENGTH_GROUP, NETWORK_LABEL, PIECE_KIND, PIECE_STATUS } from '@/lib/data/labels';
import { fmtDateTime } from '@/lib/time';
import { canApprove as canApproveNow, getDeadlines } from '@/lib/data/review';
import { LEVELS, reviewClock } from '@/lib/domain/review';
import { ReviewRoom, LevelPicker } from './review-room';
import { copyPreview, type SpecRow } from '@/lib/domain/copy-preview';

export const metadata = { title: 'Revisión' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('boss', 'admin');
  const { id } = await params;
  const { p, deadlines, specs, approver } = await db(s, async (sql) => ({
    p: await getPiece(sql, id),
    approver: await canApproveNow(sql),
    deadlines: await getDeadlines(sql),
    specs: await sql.query<SpecRow>(`select network, label, copy_max_chars, length_group from public.network_specs order by network`),
  }));
  if (!p) notFound();
  const preview = copyPreview(p.copies, specs);
  const current = p.versions[0];
  const isBoss = s.roles.includes('boss');
  const isAdmin = s.roles.includes('admin');
  const inReview = p.status === 'in_review';
  const clock = inReview ? reviewClock(p.review_level, p.sent_to_review_at, deadlines) : null;
  // The boss or admin change the level, red included (the database enforces the same).
  const canLevel = inReview && (isBoss || isAdmin);
  return (
    <>
      <PageHeader back={{ href: '/aprobar', label: 'Por aprobar' }} title={p.title} subtitle={[PIECE_KIND[p.kind], p.event_title, `versión ${p.current_version}`].filter(Boolean).join(' · ')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone={PIECE_STATUS[p.status]?.tone}>{PIECE_STATUS[p.status]?.label}</Chip>
        <Chip tone={LEVELS[p.review_level].tone}>{LEVELS[p.review_level].label}: aprueba {LEVELS[p.review_level].who}</Chip>
        {clock?.text ? <Chip tone={clock.overdue ? 'danger' : 'neutral'}>{clock.text}</Chip> : null}
        {canLevel ? <LevelPicker pieceId={p.id} level={p.review_level} canLower /> : null}
      </div>
      {clock?.overdue ? <p className="mb-4 text-sm text-danger">Venció el plazo y sigue sin aprobar. No sale hasta que {LEVELS[p.review_level].who} decida.</p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <ReviewRoom
            pieceId={p.id}
            revision={p.revision}
            canApprove={inReview && approver}
            canRequestChanges={inReview && approver}
            canAskVoice={isAdmin}
            note={inReview && !approver ? 'La aprueba el jefe. Tú puedes cambiar el nivel o comentar.' : ''}
            media={current?.media_asset_id ? { id: current.media_asset_id, mime: current.mime ?? '', drive: current.bucket === 'drive' } : null}
          />
          <Card>
            <CardHeader title="Copies: cómo saldrá" subtitle="Cada copy con las redes que lo usan y el máximo de letras de cada una." />
            <CardBody className="grid gap-5 xl:grid-cols-3">
              {preview.map((g) => {
                const overAny = g.networks.some((n) => n.over > 0) || (g.networks.length === 0 && g.length > g.limit);
                return (
                  <section key={g.group} aria-labelledby={`copy-${g.group}`} className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 id={`copy-${g.group}`} className="font-semibold">{LENGTH_GROUP[g.group].label}</h3>
                      <span className={`font-mono text-sm tabular ${overAny ? 'font-bold text-danger' : 'text-text-2'}`}>{g.length} letras</span>
                    </div>
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Redes que usan el copy ${LENGTH_GROUP[g.group].label.toLowerCase()}`}>
                      {g.networks.length ? (
                        g.networks.map((n) => (
                          <li key={n.network}>
                            <Chip tone={n.over ? 'danger' : 'neutral'}>
                              {n.label || NETWORK_LABEL[n.network]}: {n.over ? `se pasa por ${n.over}` : `hasta ${n.max}`}
                            </Chip>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-text-2">{LENGTH_GROUP[g.group].networks} · hasta {g.limit}</li>
                      )}
                    </ul>
                    <p className="whitespace-pre-wrap rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 text-[15px]">
                      {g.body || <span className="text-muted">Sin copy</span>}
                    </p>
                  </section>
                );
              })}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Comentarios" />
          {p.comments.length || p.reviews.length || p.voice.length ? (
            <ul className="divide-y divide-border text-[15px]">
              {p.voice.map((v) => (
                <li key={v.id} className="px-4 py-3">
                  <p><b>Frase pedida al jefe</b> {v.at_second !== null ? <span className="font-mono text-sm">[{fmtSecond(v.at_second)}]</span> : null}</p>
                  <p className="text-text-2">«{v.phrase}» · {v.status === 'received' ? 'audio recibido' : 'esperando audio'}</p>
                </li>
              ))}
              {p.comments.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <p><b>{c.author}</b> {c.at_second !== null ? <span className="font-mono text-sm">[{fmtSecond(c.at_second)}]</span> : null} <span className="text-sm text-text-2">v{c.version}</span></p>
                  <p className="whitespace-pre-wrap text-text-2">{c.body}</p>
                  <p className="text-sm text-muted">{fmtDateTime(c.created_at)}</p>
                </li>
              ))}
              {p.reviews.map((r, i) => (
                <li key={i} className="px-4 py-3">
                  <p><b>{r.reviewer}</b> {r.decision === 'approved' ? 'aprobó' : 'pidió cambios'} (v{r.version})</p>
                  {r.comment ? <p className="whitespace-pre-wrap text-text-2">{r.comment}</p> : null}
                  <p className="text-sm text-muted">{fmtDateTime(r.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-[15px] text-text-2">Sin comentarios todavía.</p>
          )}
        </Card>
      </div>
    </>
  );
}
