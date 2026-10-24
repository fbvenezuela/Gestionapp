import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PIECE_KIND } from '@/lib/data/labels';
import { getDeadlines, piecesInReview } from '@/lib/data/review';
import { LEVELS, LEVEL_ORDER, reviewClock } from '@/lib/domain/review';
import { cn } from '@/lib/cn';
import { TweetApprovals } from './tweet-approvals';
import { ApproveGreen } from './approve-green';

export const metadata = { title: 'Por aprobar' };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireRole('supervisor', 'admin', 'boss');
  const { tab } = await searchParams;
  const isTweets = tab === 'tweets';
  const canApprove = s.roles.includes('supervisor');
  const isBoss = s.roles.includes('boss');
  const data = await db(s, async (sql) => ({
    pieces: await piecesInReview(sql),
    deadlines: await getDeadlines(sql),
    tweets: await sql.query<{ id: string; body: string; weighted_length: number; scheduled_at: string | null; category: string | null; batch: string }>(
      `select t.id, t.body, t.weighted_length, t.scheduled_at, c.name as category, b.title as batch from public.tweets t
         join public.tweet_batches b on b.id = t.batch_id left join public.categories c on c.id = t.category_id
        where t.status = 'draft' and t.deleted_at is null order by t.scheduled_at nulls last, t.position`,
    ),
  }));

  return (
    <>
      <PageHeader
        title="Por aprobar"
        subtitle={
          canApprove ? 'Nada se publica sin aprobación. Las rojas las aprueba el jefe.'
            : isBoss ? 'Las rojas te esperan a ti. Las demás las aprueba supervisión.'
              : 'Supervisión aprueba verdes y amarillas; el jefe, las rojas.'
        }
      />
      <div className="mb-4 flex gap-1" role="tablist">
        <Link role="tab" aria-selected={!isTweets} href="/aprobar" className={cn('min-h-10 rounded-full px-4 py-2 text-sm font-semibold', !isTweets ? 'bg-slate text-on-slate' : 'border border-border bg-surface text-text-2')}>
          Piezas ({data.pieces.length})
        </Link>
        <Link role="tab" aria-selected={isTweets} href="/aprobar?tab=tweets" className={cn('min-h-10 rounded-full px-4 py-2 text-sm font-semibold', isTweets ? 'bg-slate text-on-slate' : 'border border-border bg-surface text-text-2')}>
          Tweets ({data.tweets.length})
        </Link>
      </div>
      {!isTweets ? (
        data.pieces.length ? (
          <div className="flex flex-col gap-4">
            {LEVEL_ORDER.map((lvl) => {
              const list = data.pieces.filter((p) => p.review_level === lvl);
              if (!list.length) return null;
              const mine = lvl === 'rojo' ? isBoss : canApprove;
              return (
                <Card key={lvl}>
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    <Chip tone={LEVELS[lvl].tone}>{LEVELS[lvl].label}</Chip>
                    <h2 className="flex-1 text-base font-semibold">
                      {list.length} {list.length === 1 ? 'pieza' : 'piezas'} · aprueba {LEVELS[lvl].who}
                    </h2>
                    {lvl === 'verde' && canApprove ? <ApproveGreen ids={list.map((p) => p.id)} /> : null}
                  </div>
                  <ul className="divide-y divide-border">
                    {list.map((p) => {
                      const clock = reviewClock(p.review_level, p.sent_to_review_at, data.deadlines);
                      return (
                        <li key={p.id}>
                          <Link href={`/aprobar/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{p.title}</span>
                              <span className="block truncate text-sm text-text-2">{PIECE_KIND[p.kind]} · v{p.current_version}{p.event_title ? ` · ${p.event_title}` : ''}</span>
                            </span>
                            {clock.text ? <Chip tone={clock.overdue ? 'danger' : mine ? 'warn' : 'neutral'}>{clock.text}</Chip> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
            <p className="text-sm text-text-2">Si vence el plazo, la pieza sigue sin aprobar: avisamos de nuevo, pero no sale sola.</p>
          </div>
        ) : (
          <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="No hay piezas esperando. ¡Al día!" />
        )
      ) : data.tweets.length ? (
        <TweetApprovals tweets={data.tweets} canApprove={canApprove} />
      ) : (
        <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="No hay tweets esperando." />
      )}
    </>
  );
}
