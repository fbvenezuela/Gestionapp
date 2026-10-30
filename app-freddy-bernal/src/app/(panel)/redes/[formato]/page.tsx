import { notFound } from 'next/navigation';
import { requireRole, db } from '@/lib/auth/session';
import { isDemo } from '@/lib/env';
import { PageHeader } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { MonthTabs } from '@/components/redes/month-tabs';
import { QuotaLine } from '@/components/redes/quota-line';
import { MonthSummary } from '@/components/redes/month-summary';
import type { SectionCtx } from '@/components/redes/card/card-core';
import {
  getMonthCounts, getMonthSummary, getMonthTotals, getNavCounts, getRedesSettings, getSection, monthContext, type SectionSort,
} from '@/lib/data/redes';
import { FEED_FORMATS, FORMAT, formatFromSlug, monthParam, sectionHref, type Format } from '@/lib/domain/redes';
import { SectionClient } from './section-client';

export const metadata = { title: 'Redes' };

// A section of Redes by format (R4, D-60, D-61): /redes/reels, /posts, /carruseles, /historias, /youtube, /fin-de-mes.
// The month tabs with the quota and «+ Nuevo mes», the month's quota, the order, the cards and «+ Nuevo …»; in Fin de
// mes, the month's summary on top; #pieza-<id> opens that card. Nothing here reads the agenda (D-75): of an event, only
// its title. Every link carries the open month (?mes=), so it follows in the other sections and in the feed (F2).
const SUBTITLE: Record<Format, string> = {
  reel: 'Videos verticales 9:16: el video, la portada, las tomas y el copy.',
  post: 'Una imagen con su texto del arte, el caption y sus notas.',
  carousel: 'Láminas en orden, cada una con su texto y su imagen, y el caption.',
  story: 'Las historias del día a día: idea, foto o clip, sticker y texto en pantalla.',
  youtube: 'Videos horizontales 16:9: el guion por tomas y la descripción con capítulos.',
  month_end: 'Las piezas del cierre del mes y el resumen para el jefe.',
};

const SORTS: readonly SectionSort[] = ['manual', 'feed', 'newest', 'oldest'];

export default async function RedesSectionPage({ params, searchParams }: { params: Promise<{ formato: string }>; searchParams: Promise<{ mes?: string; orden?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const { formato } = await params;
  const format = formatFromSlug(formato);
  if (!format) notFound();
  const sp = await searchParams;
  const inFeed = (FEED_FORMATS as readonly Format[]).includes(format);
  const sort: SectionSort = SORTS.includes(sp.orden as SectionSort) && (sp.orden !== 'feed' || inFeed) ? (sp.orden as SectionSort) : 'manual';
  const boss = s.roles.includes('boss');
  const admin = s.roles.includes('admin');
  const mark = s.roles.some((r) => r === 'social' || r === 'boss');
  const data = await db(s, async (sql) => {
    const mc = await monthContext(sql, monthParam(sp.mes));
    const settings = await getRedesSettings(sql);
    const monthId = mc.active?.id ?? null;
    return {
      mc,
      settings,
      section: await getSection(sql, format, monthId, mc.firstId, sort, settings.quotas),
      counts: await getMonthCounts(sql, format),
      nav: await getNavCounts(sql, monthId, settings.quotas),
      totals: mark ? await getMonthTotals(sql) : undefined,
      summary: format === 'month_end' ? await getMonthSummary(sql, monthId, settings.quotas) : null,
    };
  });
  const f = FORMAT[format];
  const monthId = data.mc.active?.id ?? null;
  const monthLabel = data.mc.active?.label ?? '';
  const ctx: SectionCtx = {
    format,
    monthId,
    monthLabel,
    months: data.mc.months,
    pillars: data.settings.pillars,
    perms: { boss, admin, mark },
    demo: isDemo(),
    userId: s.userId,
    manualOrder: sort === 'manual',
  };
  return (
    <>
      <PageHeader title={f.plural} subtitle={SUBTITLE[format]} />
      <RedesNav active={format} monthId={monthId} counts={data.nav} />
      <DemoNotice userId={s.userId} />
      <Tip id="redes-seccion">Cada tarjeta es una pieza: ahí subes el archivo, escribes el copy y la mandas a aprobar.</Tip>
      <MonthTabs
        months={data.mc.months}
        active={monthId}
        counts={data.counts}
        quotaLabel={data.section.quota === null ? null : String(data.section.quota)}
        hrefFor={(id) => sectionHref(f.slug, id)}
        canCreate
        canDelete={mark}
        totals={data.totals}
      />
      <QuotaLine format={format} monthLabel={monthLabel || 'este mes'} count={data.section.count} quota={data.section.quota} canChange={admin} />
      {data.summary ? <MonthSummary summary={data.summary} monthLabel={monthLabel} /> : null}
      <SectionClient key={`${format}:${monthId ?? ''}`} format={format} cards={data.section.cards} ctx={ctx} sort={sort} />
    </>
  );
}
