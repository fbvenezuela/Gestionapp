import { requireRole, db } from '@/lib/auth/session';
import { LayoutGrid } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { MonthTabs } from '@/components/redes/month-tabs';
import { FeedGrid } from '@/components/redes/feed/feed-grid';
import { FeedProfile } from '@/components/redes/feed/feed-profile';
import { getFeed, getFeedPicker, getMonthCounts, getMonthTotals, getNavCounts, getRedesSettings, monthContext } from '@/lib/data/redes';
import { FEED_SIZE, monthParam, withMonth } from '@/lib/domain/redes';

export const metadata = { title: 'Feed' };

// The feed of the month (R4, D-69): 24 places per month, #1 bottom right (the first to go out); the month tabs «N de
// 24» (the same list of months as the sections, F2), the live line, «Vaciar este mes», the read-only profile header and
// the grid. Posts, reels and carousels go in it; a piece is in one place at most (the database says so). Nothing here
// reads the agenda (D-75): no event date ever decides a place, people do.
export default async function RedesFeedPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const mark = s.roles.some((r) => r === 'social' || r === 'boss');
  const data = await db(s, async (sql) => {
    const mc = await monthContext(sql, monthParam((await searchParams).mes));
    const monthId = mc.active?.id ?? null;
    const settings = await getRedesSettings(sql);
    return {
      mc,
      feed: await getFeed(sql, monthId),
      picker: await getFeedPicker(sql, monthId),
      counts: await getMonthCounts(sql, 'feed'),
      totals: mark ? await getMonthTotals(sql) : undefined,
      nav: await getNavCounts(sql, monthId, settings.quotas),
    };
  });
  const monthId = data.mc.active?.id ?? null;
  const monthLabel = data.mc.active?.label ?? '';
  return (
    <>
      <PageHeader title="Feed" subtitle="Los 24 espacios del mes en el orden en que salen: el #1, abajo a la derecha, es el primero." />
      <RedesNav active="feed" monthId={monthId} counts={data.nav} />
      <DemoNotice userId={s.userId} />
      <MonthTabs
        months={data.mc.months}
        active={monthId}
        counts={data.counts}
        quotaLabel={String(FEED_SIZE)}
        hrefFor={(id) => withMonth('/redes/feed', id)}
        canCreate
        canDelete={mark}
        totals={data.totals}
      />
      {monthId ? (
        <FeedGrid
          key={monthId}
          monthId={monthId}
          monthLabel={monthLabel}
          months={data.mc.months}
          cells={data.feed.cells}
          filled={data.feed.filled}
          avg={data.feed.receptivity.avg}
          picker={data.picker}
          profile={<FeedProfile count={data.feed.filled} monthLabel={monthLabel} />}
        />
      ) : (
        <EmptyState icon={<LayoutGrid className="h-8 w-8" />} title="Todavía no hay meses de contenido. Toca «+ Nuevo mes» para empezar el feed." />
      )}
    </>
  );
}
