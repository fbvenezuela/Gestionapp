import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { NETWORK_LABEL, PUB_STATUS } from '@/lib/data/labels';
import { fmtDateTime } from '@/lib/time';
import { Package, PublishedForm, FailForm, MetricsForm, type PackageFile } from './publication-client';

export const metadata = { title: 'Publicación' };

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  // The boss does what Redes does; uploading the evidence waits for his media permission (media_handoff).
  const canUpload = s.roles.some((r) => r === 'admin' || r === 'social');
  const { id } = await params;
  const data = await db(s, async (sql) => {
    const p = await sql.one<{
      id: string; piece_id: string | null; origin: string; network: string; format: string; copy_body: string; cover_asset_id: string | null; collaborators: string[];
      scheduled_at: string | null; published_at: string | null; url: string | null; evidence_asset_id: string | null; republish_of: string | null;
      status: string; failure_reason: string | null; validation: { level: string; text: string }[] | null; title: string; current_version: number | null; approved_version: number | null;
    }>(
      `select x.*, coalesce(p.title, x.title) as title, p.current_version, p.approved_version from public.publications x left join public.pieces p on p.id = x.piece_id where x.id = $1 and x.deleted_at is null`,
      [id],
    );
    if (!p) return null;
    const media = p.piece_id
      ? await sql.one<{ media_asset_id: string | null }>(`select media_asset_id from public.piece_versions where piece_id = $1 and version = $2`, [p.piece_id, p.approved_version ?? p.current_version])
      : null;
    // What «Descargar» needs: files kept in Drive go by pieces.
    const ids = [media?.media_asset_id, p.cover_asset_id].filter((x): x is string => !!x);
    const files = ids.length
      ? await sql.query<{ id: string; bucket: string; size_bytes: string | number; label: string }>(`select id, bucket, size_bytes, label from public.media_assets where id = any($1::uuid[])`, [ids])
      : [];
    const metrics = await sql.query<{ captured_at: string; views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; source: string }>(
      `select captured_at, views, reach, likes, comments, shares, saves, source from public.publication_metrics where publication_id = $1 order by captured_at desc`,
      [id],
    );
    const file = (fid: string | null | undefined): PackageFile | null => {
      if (!fid) return null;
      const f = files.find((x) => x.id === fid);
      return { id: fid, label: f?.label ?? '', size: Number(f?.size_bytes ?? 0), drive: f?.bucket === 'drive' };
    };
    return { p, video: file(media?.media_asset_id), cover: file(p.cover_asset_id), metrics };
  });
  if (!data) notFound();
  const { p } = data;
  const spontaneous = p.origin === 'boss_spontaneous';
  return (
    <>
      <PageHeader
        back={{ href: '/publicar', label: 'Publicar' }}
        title={`${NETWORK_LABEL[p.network]} · ${p.title}`}
        subtitle={spontaneous ? 'La publicó el jefe; el equipo la registró después' : `${p.format}${p.republish_of ? ' · republicación' : ''}`}
        actions={p.status === 'published' && p.piece_id ? <LinkButton variant="secondary" href={`/publicar/nueva?pieza=${p.piece_id}&republica=${p.id}`}>Republicar</LinkButton> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone={PUB_STATUS[p.status]?.tone}>{PUB_STATUS[p.status]?.label}</Chip>
        {p.scheduled_at ? <Chip>Programada: {fmtDateTime(p.scheduled_at)}</Chip> : null}
        {p.published_at ? <Chip tone="ok">Publicada: {fmtDateTime(p.published_at)}</Chip> : null}
        {p.piece_id ? <Link href={`/piezas/${p.piece_id}`} className="text-sm font-semibold text-accent-ink">Ver pieza</Link> : <Chip tone="info">Espontánea del jefe</Chip>}
      </div>
      {p.failure_reason ? <p className="mb-4 rounded-[var(--radius-control)] bg-danger-soft p-3 text-danger">Falló: {p.failure_reason}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {spontaneous ? null : <Package video={data.video} cover={data.cover} copy={p.copy_body} collaborators={p.collaborators} network={NETWORK_LABEL[p.network]} title={p.title} />}
          {p.validation?.length ? (
            <Card>
              <CardHeader title="Avisos de la revisión del video" />
              <ul className="flex flex-col gap-1 p-4 text-sm">{p.validation.map((v, i) => <li key={i} className={v.level === 'error' ? 'text-danger' : 'text-warn'}>{v.text}</li>)}</ul>
            </Card>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          {p.status !== 'published' ? (
            <>
              <PublishedForm id={p.id} canUpload={canUpload} />
              <FailForm id={p.id} />
            </>
          ) : (
            <Card>
              <CardHeader title="Evidencia" />
              <CardBody className="flex flex-col gap-2">
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-ink">Abrir la publicación <ExternalLink className="h-4 w-4" aria-hidden /></a> : null}
                {p.evidence_asset_id ? <a href={`/api/media/${p.evidence_asset_id}?ver=1`} target="_blank" rel="noreferrer" className="text-sm font-semibold">Ver captura</a> : <p className="text-sm text-text-2">Sin captura.</p>}
              </CardBody>
            </Card>
          )}
          {p.status === 'published' ? <MetricsForm publicationId={p.id} /> : null}
          {data.metrics.length ? (
            <Card>
              <CardHeader title="Resultados cargados" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left"><tr>{['Cuándo', 'Vistas', 'Alcance', 'Me gusta', 'Coment.', 'Compart.', 'Guard.'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody className="tabular">
                    {data.metrics.map((m, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2">{fmtDateTime(m.captured_at)}</td>
                        {[m.views, m.reach, m.likes, m.comments, m.shares, m.saves].map((v, k) => <td key={k} className="px-3 py-2">{v ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
