import { LayoutGrid } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { monthParam } from '@/lib/domain/redes';

export const metadata = { title: 'Feed' };

// The feed of the month (R4, D-69): 24 slots, #1 bottom right; the profile header, the month tabs «N de 24», the
// grid, «Vaciar este mes» and the live line. Nothing here reads the agenda (D-75).
// Paso 0 (integrator): the base page (its access, the section bar and the tutorials' anchors that live in WP-D's
// components, hidden). WP-D builds the feed (with the month tabs) and removes each hidden anchor it replaces.
export default async function RedesFeedPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const monthId = monthParam((await searchParams).mes);
  return (
    <>
      <PageHeader title="Feed" />
      <RedesNav active="feed" monthId={monthId} />
      <DemoNotice userId={s.userId} />
      <div data-tour="feed-live" hidden />
      <div data-tour="feed-grid" hidden />
      <div data-tour="feed-clear-month" hidden />
      <EmptyState icon={<LayoutGrid className="h-8 w-8" />} title="Todavía no hay publicaciones en el feed de este mes." />
    </>
  );
}
