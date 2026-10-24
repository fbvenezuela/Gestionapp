import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState, Stat } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { TweetBoard, type BoardTweet } from '@/components/tweets/tweet-board';
import { tweetStock } from '@/lib/data/tweets';
import { fmtDateTime } from '@/lib/time';

export const metadata = { title: 'Tweets' };

export default async function TweetsPage() {
  const s = await requireRole('admin', 'social', 'supervisor');
  const canEdit = s.roles.some((r) => r === 'admin' || r === 'social');
  const data = await db(s, async (sql) => ({
    stock: await tweetStock(sql),
    tweets: await sql.query<BoardTweet>(
      `select t.id, t.body, t.weighted_length, t.scheduled_at, t.status, c.name as category, t.image_asset_id, t.published_url
         from public.tweets t left join public.categories c on c.id = t.category_id
        where t.deleted_at is null and t.scheduled_at >= date_trunc('day', now()) - interval '1 day' and t.scheduled_at < now() + interval '21 days'
        order by t.scheduled_at`,
    ),
    batches: await sql.query<{ id: string; title: string; created_at: string; n: number; drafts: number }>(
      `select b.id, b.title, b.created_at, count(t.id)::int as n, count(t.id) filter (where t.status = 'draft')::int as drafts
         from public.tweet_batches b left join public.tweets t on t.batch_id = b.id and t.deleted_at is null
        where b.deleted_at is null group by b.id order by b.created_at desc limit 12`,
    ),
  }));
  return (
    <>
      <PageHeader title="Tweets" subtitle={canEdit ? 'La semana repartida por horas. Toca un tweet para cambiar el día o la hora.' : 'La semana repartida por horas.'} actions={canEdit ? <LinkButton href="/tweets/nueva"><Plus className="h-4 w-4" aria-hidden /> Tweets de la semana</LinkButton> : undefined} />
      {canEdit ? (
        <Tip id="tweets">Toca un tweet para cambiarle el día o la hora, copiarlo o marcarlo como publicado.</Tip>
      ) : (
        <Tip id="tweets-ver">Toca un tweet para leerlo completo; los que faltan por aprobar están en «Por aprobar».</Tip>
      )}
      {data.stock.lowStock ? (
        <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-warn/40 bg-warn-soft p-4" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-semibold">{data.stock.daysLeft === 0 ? 'No quedan tweets programados.' : `Quedan ${data.stock.daysLeft} días de tweets programados.`}</p>
            <p className="text-[15px] text-text-2">Prepara la tanda siguiente para que X no se quede quieto.</p>
          </div>
        </div>
      ) : null}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Días cubiertos" value={data.stock.daysLeft} tone={data.stock.lowStock ? 'danger' : 'ok'} />
        <Stat label="Por salir" value={data.stock.count} />
      </div>
      {data.tweets.length ? <TweetBoard tweets={data.tweets} canEdit={canEdit} /> : <EmptyState title="No hay tweets en las próximas semanas." action={canEdit ? <LinkButton href="/tweets/nueva">Subir la tanda de la semana</LinkButton> : undefined} />}
      <Card className="mt-6">
        <CardHeader title="Tandas" />
        <ul className="divide-y divide-border">
          {data.batches.map((b) => (
            <li key={b.id}>
              <Link href={`/tweets/${b.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{b.title}</span>
                  <span className="block text-sm text-text-2">{b.n} tweets · subida {fmtDateTime(b.created_at)}</span>
                </span>
                {b.drafts ? <span className="text-sm font-semibold text-warn">{b.drafts} por aprobar</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
