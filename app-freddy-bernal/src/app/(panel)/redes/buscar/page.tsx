import { Search } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { monthParam } from '@/lib/domain/redes';

export const metadata = { title: 'Buscar en Redes' };

// «Buscar en Redes» (R4, D-71): titles, fields, copies, notices and tweets, grouped by format, as the person (RLS).
// Never dates, times or addresses: those columns are not searched (D-75).
// Paso 0 (integrator): the base page (its access and the section bar). WP-D builds the search.
export default async function RedesSearchPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const monthId = monthParam((await searchParams).mes);
  return (
    <>
      <PageHeader title="Buscar en Redes" />
      <RedesNav active="search" monthId={monthId} />
      <DemoNotice userId={s.userId} />
      <EmptyState icon={<Search className="h-8 w-8" />} title="Aquí vas a buscar en todo Redes: títulos, copies, avisos y tweets." />
    </>
  );
}
