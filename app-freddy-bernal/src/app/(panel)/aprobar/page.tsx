import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PIECE_KIND } from '@/lib/data/labels';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import { TweetApprovals } from './tweet-approvals';

export const metadata = { title: 'Por aprobar' };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireRole('supervisor', 'admin');
  const { tab } = await searchParams;
  const isTweets = tab === 'tweets';
  const canApprove = s.roles.includes('supervisor');
  const data = await db(s, async (sql) => ({
    pieces: await sql.query<{ id: string; title: string; kind: string; current_version: number; updated_at: string; event_title: string | null }>(
      `select p.id, p.title, p.kind, p.current_version, p.updated_at, e.title as event_title from public.pieces p left join public.events e on e.id = p.event_id
        where p.status = 'in_review' and p.deleted_at is null order by p.updated_at`,
    ),
    tweets: await sql.query<{ id: string; body: string; weighted_length: number; scheduled_at: string | null; category: string | null; batch: string }>(
      `select t.id, t.body, t.weighted_length, t.scheduled_at, c.name as category, b.title as batch from public.tweets t
         join public.tweet_batches b on b.id = t.batch_id left join public.categories c on c.id = t.category_id
        where t.status = 'draft' and t.deleted_at is null order by t.scheduled_at nulls last, t.position`,
    ),
  }));

  return (
    <>
      <PageHeader title="Por aprobar" subtitle={canApprove ? 'Nada se publica sin tu aprobación.' : 'Solo supervisión aprueba. Aquí ves lo que espera.'} />
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
          <Card>
            <ul className="divide-y divide-border">
              {data.pieces.map((p) => (
                <li key={p.id}>
                  <Link href={`/aprobar/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.title}</span>
                      <span className="block truncate text-sm text-text-2">{PIECE_KIND[p.kind]} · v{p.current_version}{p.event_title ? ` · ${p.event_title}` : ''} · enviada {fmtDateTime(p.updated_at)}</span>
                    </span>
                    <Chip tone="warn">Revisar</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
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
