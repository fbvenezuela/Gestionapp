import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { getPiece, fmtSecond } from '@/lib/data/pieces';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LENGTH_GROUP, PIECE_KIND, PIECE_STATUS } from '@/lib/data/labels';
import { LIMITS } from '@/lib/domain/copies';
import { fmtDateTime } from '@/lib/time';
import { ReviewRoom } from './review-room';

export const metadata = { title: 'Revisión' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('supervisor', 'admin');
  const { id } = await params;
  const p = await db(s, (sql) => getPiece(sql, id));
  if (!p) notFound();
  const current = p.versions[0];
  return (
    <>
      <PageHeader back={{ href: '/aprobar', label: 'Por aprobar' }} title={p.title} subtitle={[PIECE_KIND[p.kind], p.event_title, `versión ${p.current_version}`].filter(Boolean).join(' · ')} />
      <div className="mb-4"><Chip tone={PIECE_STATUS[p.status]?.tone}>{PIECE_STATUS[p.status]?.label}</Chip></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <ReviewRoom
            pieceId={p.id}
            canDecide={s.roles.includes('supervisor') && p.status === 'in_review'}
            media={current?.media_asset_id ? { id: current.media_asset_id, mime: current.mime ?? '' } : null}
          />
          <Card>
            <CardHeader title="Copies" />
            <CardBody className="grid gap-4 xl:grid-cols-3">
              {(['long', 'medium', 'short'] as const).map((g) => {
                const c = p.copies.find((x) => x.length_group === g);
                return (
                  <div key={g}>
                    <p className="font-semibold">{LENGTH_GROUP[g].label} <span className="text-sm font-normal text-text-2">({LENGTH_GROUP[g].networks})</span></p>
                    <p className="font-mono text-xs text-text-2">{c?.char_count ?? 0}/{LIMITS[g]}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[15px]">{c?.body || <span className="text-muted">Sin copy</span>}</p>
                  </div>
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
