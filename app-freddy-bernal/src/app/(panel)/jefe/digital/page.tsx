import { ExternalLink } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState, Stat } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { fmtDateTime } from '@/lib/time';
import { PUB_THUMB_COLUMNS, PUB_THUMB_JOINS, pubThumbOf, type PubThumbCols } from '@/lib/data/pub-thumbs';
import { PubThumb } from '@/app/(panel)/resultados/pub-thumb';

export const metadata = { title: 'Digital' };

const nf = new Intl.NumberFormat('es-VE');

export default async function BossDigital() {
  const s = await requireRole('boss', 'admin');
  const data = await db(s, async (sql) => ({
    // With its picture (the same candidates and order as Resultados).
    published: await sql.query<PubThumbCols & { id: string; title: string; published_at: string; url: string | null; views: number | null }>(
      `select x.id, coalesce(p.title, x.title) as title, x.published_at, x.url, ${PUB_THUMB_COLUMNS},
              (select m.views from public.publication_metrics m where m.publication_id = x.id order by m.captured_at desc limit 1) as views
         from public.publications x left join public.pieces p on p.id = x.piece_id ${PUB_THUMB_JOINS}
        where x.status = 'published' and x.deleted_at is null and x.published_at > now() - interval '7 days' order by x.published_at desc limit 20`,
    ),
    coming: await sql.query<{ id: string; title: string; network: string; scheduled_at: string }>(
      `select x.id, p.title, x.network, x.scheduled_at from public.publications x join public.pieces p on p.id = x.piece_id
        where x.status = 'scheduled' and x.deleted_at is null and x.scheduled_at > now() order by x.scheduled_at limit 10`,
    ),
    inReview: (await sql.one<{ n: number }>(`select count(*)::int as n from public.pieces where status = 'in_review' and deleted_at is null`))!.n,
  }));
  const views = data.published.reduce((a, p) => a + (p.views ?? 0), 0);
  return (
    <>
      <PageHeader title="Digital" back={{ href: '/jefe', label: 'Inicio' }} actions={<LinkButton href="/resultados" size="lg" variant="secondary">Ver resultados</LinkButton>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Publicado esta semana" value={data.published.length} />
        <Stat label="Vistas esta semana" value={nf.format(views)} />
        <Stat label="En revisión" value={data.inReview} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lo publicado" />
          {data.published.length ? (
            <ul className="divide-y divide-border">
              {data.published.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-4 text-lg">
                  <PubThumb t={pubThumbOf(p)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block text-base text-text-2">{NETWORK_LABEL[p.network]} · {fmtDateTime(p.published_at)}{p.views != null ? ` · ${nf.format(p.views)} vistas` : ''}</span>
                  </span>
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer" aria-label="Abrir" className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2"><ExternalLink className="h-5 w-5" /></a> : null}
                </li>
              ))}
            </ul>
          ) : <div className="p-4"><EmptyState title="Nada publicado esta semana." /></div>}
        </Card>
        <Card>
          <CardHeader title="Lo que viene" />
          {data.coming.length ? (
            <ul className="divide-y divide-border">
              {data.coming.map((p) => (
                <li key={p.id} className="px-4 py-4 text-lg">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-base text-text-2">{NETWORK_LABEL[p.network]} · {fmtDateTime(p.scheduled_at)}</span>
                </li>
              ))}
            </ul>
          ) : <div className="p-4"><EmptyState title="No hay nada programado." /></div>}
        </Card>
      </div>
    </>
  );
}
