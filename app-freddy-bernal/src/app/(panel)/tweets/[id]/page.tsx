import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { TweetBoard, type BoardTweet } from '@/components/tweets/tweet-board';
import { contentCategories } from '@/lib/data/common';
import { BatchActions, BatchEditor } from './batch-client';

export const metadata = { title: 'Tanda de tweets' };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole('admin', 'social', 'supervisor');
  const { id } = await params;
  const canEdit = s.roles.some((r) => r === 'admin' || r === 'social');
  const data = await db(s, async (sql) => {
    const batch = await sql.one<{ id: string; title: string; source_name: string }>(`select id, title, source_name from public.tweet_batches where id = $1 and deleted_at is null`, [id]);
    if (!batch) return null;
    const tweets = await sql.query<BoardTweet & { category_id: string | null; position: number }>(
      `select t.id, t.body, t.weighted_length, t.scheduled_at, t.status, c.name as category, t.category_id, t.image_asset_id, t.published_url, t.position
         from public.tweets t left join public.categories c on c.id = t.category_id where t.batch_id = $1 and t.deleted_at is null order by t.position`,
      [id],
    );
    return { batch, tweets, categories: canEdit ? await contentCategories(sql) : [] };
  });
  if (!data) notFound();
  const counts = {
    draft: data.tweets.filter((t) => t.status === 'draft').length,
    approved: data.tweets.filter((t) => t.status === 'approved').length,
    scheduled: data.tweets.filter((t) => t.status === 'scheduled').length,
  };
  return (
    <>
      <PageHeader title={data.batch.title} subtitle={data.batch.source_name ? `Desde ${data.batch.source_name}` : undefined} back={{ href: '/tweets', label: 'Tweets' }} />
      <BatchActions batchId={id} counts={counts} draftIds={data.tweets.filter((t) => t.status === 'draft').map((t) => t.id)} canApprove={s.roles.includes('supervisor')} canEdit={canEdit} />
      <div className="mb-6"><TweetBoard tweets={data.tweets} canEdit={canEdit} /></div>
      {canEdit ? <BatchEditor tweets={data.tweets} categories={data.categories} /> : null}
    </>
  );
}
