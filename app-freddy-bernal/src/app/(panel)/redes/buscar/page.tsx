import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { SearchBox } from '@/components/redes/dashboard/search-box';
import { getNavCounts, getRedesSettings, monthContext, searchRedes } from '@/lib/data/redes';
import { monthParam } from '@/lib/domain/redes';

export const metadata = { title: 'Buscar en Redes' };

// «Buscar en Redes» (R4, D-71): titles, card fields, copies, notices and tweets, grouped by format, as the person (RLS).
// Each result opens its card in its own section and month (#pieza-<id>), or its tweets' week. Never dates, times or
// addresses: those columns are not searched (D-75). At least two letters.
const results = (n: number, q: string) => (n === 1 ? `1 resultado para «${q}»` : `${n} resultados para «${q}»`);

export default async function RedesSearchPage({ searchParams }: { searchParams: Promise<{ mes?: string; q?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const sp = await searchParams;
  const raw = typeof sp.q === 'string' ? sp.q : '';
  const data = await db(s, async (sql) => {
    const mc = await monthContext(sql, monthParam(sp.mes));
    const settings = await getRedesSettings(sql);
    return { mc, nav: await getNavCounts(sql, mc.active?.id ?? null, settings.quotas), found: await searchRedes(sql, raw) };
  });
  const monthId = data.mc.active?.id ?? null;
  const { q, total, groups } = data.found;
  return (
    <>
      <PageHeader title="Buscar en Redes" subtitle="En todo Redes: títulos, campos de las tarjetas, copies, avisos y tweets." />
      <RedesNav active="search" monthId={monthId} counts={data.nav} />
      <DemoNotice userId={s.userId} />
      <div className="mb-5">
        <SearchBox monthId={monthId} q={raw} />
      </div>
      {!raw.trim() ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title="Escribe una palabra del título, del copy, de un aviso o de un tweet." />
      ) : q.length < 2 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title="Escribe al menos 2 letras para buscar." />
      ) : !total ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title={`No encontramos nada con «${q}» en Redes.`} />
      ) : (
        <>
          <p role="status" className="mb-3 text-[15px] font-semibold">
            {results(total, q)}
          </p>
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <Card solid key={g.key} role="region" aria-labelledby={`buscar-${g.key}`}>
                <CardHeader title={<span id={`buscar-${g.key}`}>{g.label}</span>} subtitle={g.items.length === 1 ? '1 resultado' : `${g.items.length} resultados`} />
                <CardBody>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((it) => (
                      <li key={it.id}>
                        <Link
                          href={it.href}
                          className="flex min-h-14 min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 hover:border-accent"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="font-semibold [overflow-wrap:anywhere]">{it.title}</span>
                              <Chip>{it.where}</Chip>
                            </span>
                            <span className="mt-0.5 block text-sm text-text-2 [overflow-wrap:anywhere]">{it.snippet}</span>
                          </span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
