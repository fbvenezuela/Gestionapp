import { notFound } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { MonthTabs } from '@/components/redes/month-tabs';
import { FORMAT, formatFromSlug, monthParam, sectionHref } from '@/lib/domain/redes';

export const metadata = { title: 'Redes' };

// A section of Redes by format (R4, D-60, D-61): /redes/reels, /posts, /carruseles, /historias, /youtube, /fin-de-mes.
// The month tabs with the quota and «+ Nuevo mes», the order, the cards and «+ Nuevo …»; in Fin de mes, the month's
// summary on top; #pieza-<id> opens that card. Nothing here reads the agenda (D-75).
// Paso 0 (integrator): the base page (its access, the section bar, the month tabs and the tutorials' anchors that
// live in WP-C1's components, hidden). WP-C1 builds the section and removes each hidden anchor it replaces.
export default async function RedesSectionPage({ params, searchParams }: { params: Promise<{ formato: string }>; searchParams: Promise<{ mes?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const { formato } = await params;
  const format = formatFromSlug(formato);
  if (!format) notFound();
  const monthId = monthParam((await searchParams).mes);
  const f = FORMAT[format];
  return (
    <>
      <PageHeader title={f.plural} />
      <RedesNav active={format} monthId={monthId} />
      <DemoNotice userId={s.userId} />
      <Tip id="redes-seccion">Cada tarjeta es una pieza: ahí subes el archivo, escribes el copy y la mandas a aprobar.</Tip>
      <MonthTabs
        months={[]}
        active={monthId}
        hrefFor={(id) => sectionHref(f.slug, id)}
        canCreate
        canDelete={s.roles.some((r) => r === 'social' || r === 'boss')}
      />
      <div data-tour="month-quota" hidden />
      <div data-tour="section-sort" hidden />
      <div data-tour="new-piece" hidden />
      <div data-tour="month-summary" hidden />
      <div data-tour="piece-card" hidden />
      <div data-tour="card-checks" hidden />
      <div data-tour="design-checks" hidden />
      <div data-tour="rating" hidden />
      <div data-tour="notice-band" hidden />
      <EmptyState icon={<LayoutGrid className="h-8 w-8" />} title="Todavía no hay piezas en esta sección." />
    </>
  );
}
