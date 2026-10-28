import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PIECE_KIND } from '@/lib/data/labels';
import { canApprove as canApproveNow, getDeadlines, piecesInReview } from '@/lib/data/review';
import { LEVELS, LEVEL_ORDER, reviewClock } from '@/lib/domain/review';
import { cn } from '@/lib/cn';
import { TweetApprovals } from './tweet-approvals';
import { ApproveGreen } from './approve-green';

export const metadata = { title: 'Por aprobar' };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireRole('boss', 'admin');
  const { tab } = await searchParams;
  const isTweets = tab === 'tweets';
  const data = await db(s, async (sql) => ({
    // Every level and every tweet: the boss (public.can_approve()). Admin sees the list, never decides.
    canApprove: await canApproveNow(sql),
    pieces: await piecesInReview(sql),
    deadlines: await getDeadlines(sql),
    tweets: await sql.query<{ id: string; body: string; weighted_length: number; scheduled_at: string | null; category: string | null; batch: string }>(
      `select t.id, t.body, t.weighted_length, t.scheduled_at, c.name as category, b.title as batch from public.tweets t
         join public.tweet_batches b on b.id = t.batch_id left join public.categories c on c.id = t.category_id
        where t.status = 'draft' and t.deleted_at is null order by t.scheduled_at nulls last, t.position`,
    ),
  }));
  const { canApprove } = data;
  const greens = data.pieces.filter((p) => p.review_level === 'verde');

  return (
    <>
      <PageHeader
        title="Por aprobar"
        subtitle={
          canApprove ? 'Nada se publica sin tu aprobación. Las verdes, todas de una vez.'
            : 'Todo lo aprueba el jefe: verdes, amarillas, rojas y tweets. Tú puedes cambiar el nivel o comentar.'
        }
      />
      <Tip id="aprobar">Las verdes se aprueban todas juntas con un toque; las amarillas y las rojas, una por una con su lista.</Tip>
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
            {canApprove && greens.length ? <ApproveGreen pieces={greens.map((p) => ({ id: p.id, revision: p.revision }))} /> : null}
            {LEVEL_ORDER.map((lvl) => {
              const list = data.pieces.filter((p) => p.review_level === lvl);
              if (!list.length) return null;
              return (
                <Card key={lvl} solid>
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    <Chip tone={LEVELS[lvl].tone}>{LEVELS[lvl].label}</Chip>
                    <h2 className="flex-1 text-base font-semibold">
                      {list.length} {list.length === 1 ? 'pieza' : 'piezas'} · aprueba {LEVELS[lvl].who}
                    </h2>
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
                            {clock.text ? <Chip tone={clock.overdue ? 'danger' : canApprove ? 'warn' : 'neutral'}>{clock.text}</Chip> : null}
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
