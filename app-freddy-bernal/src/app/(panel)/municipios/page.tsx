import { Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { listReports, municipalityCounters, obraCounts, overdueReports, parishesInUse } from '@/lib/data/fichas';
import { municipalities, parishes } from '@/lib/data/common';
import { PRIORITIES, REPORT_STATUSES, REPORT_TYPES } from '@/lib/data/ficha-labels';
import { mergeCounters, totals } from '@/lib/domain/report-status';
import { municipalitySlug, parishOptions } from '@/lib/domain/territory';
import { PageHeader, Stat, EmptyState } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { FilterBar, type FilterValues } from '@/components/fichas/filter-bar';
import { MunicipalityCard } from '@/components/fichas/municipality-card';
import { OverdueReports } from '@/components/fichas/overdue-reports';
import { ReportList } from '@/components/fichas/report-list';
import { today } from '@/lib/time';

export const metadata = { title: 'Municipios' };

// «Todo filtrado por municipio y que quede un registro» (§4.2): the 29 municipalities with their counters, what is
// overdue on top, and the filters. Home of the Director de política. Redes never comes here (no reports for Redes).
export default async function MunicipiosPage({ searchParams }: { searchParams: Promise<FilterValues> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'politics');
  const sp = await searchParams;
  const f = {
    municipio: sp.municipio || undefined,
    parroquia: sp.parroquia || undefined,
    tipo: (REPORT_TYPES as readonly string[]).includes(sp.tipo ?? '') ? sp.tipo : undefined,
    estado: (REPORT_STATUSES as readonly string[]).includes(sp.estado ?? '') ? sp.estado : undefined,
    prioridad: (PRIORITIES as readonly string[]).includes(sp.prioridad ?? '') ? sp.prioridad : undefined,
    vencidas: sp.vencidas === '1' ? '1' : undefined,
  };
  const filtered = Object.values(f).some(Boolean);
  const seesObras = s.roles.some((r) => r === 'admin' || r === 'boss' || r === 'dispatch' || r === 'ivt');
  const t0 = today().toISODate()!;
  const data = await db(s, async (sql) => {
    const list = await municipalities(sql);
    return {
      list,
      parishMap: await parishes(sql),
      used: await parishesInUse(sql, f.municipio),
      counters: mergeCounters(list, await municipalityCounters(sql, t0)),
      obras: seesObras ? await obraCounts(sql) : [],
      overdue: filtered ? [] : await overdueReports(sql, t0, 5),
      results: filtered
        ? await listReports(sql, t0, { municipality: f.municipio, parish: f.parroquia, type: f.tipo, status: f.estado, priority: f.prioridad, overdue: !!f.vencidas })
        : [],
    };
  });
  const all = totals(data.counters);
  const usedAll = [...new Set(Object.values(data.used).flat())];
  const parishChoice = f.municipio ? parishOptions(data.parishMap, f.municipio, data.used[f.municipio] ?? []) : parishOptions({}, '', usedAll);

  return (
    <>
      <PageHeader
        title="Municipios"
        subtitle="Los eventos, avances e incidencias de cada municipio, con su estado. Toca uno para ver todo en orden de fecha."
        actions={
          <LinkButton href="/reportes/nuevo" size="lg">
            <Plus className="h-5 w-5" aria-hidden /> Nueva ficha comunitaria
          </LinkButton>
        }
      />

      {!filtered ? <OverdueReports rows={data.overdue} todayIso={t0} total={all.overdue} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Abiertas" value={all.open} />
        <Stat label="En ejecución" value={all.inProgress} tone={all.inProgress ? 'accent' : undefined} />
        <Stat label="Finalizadas" value={all.finished} tone={all.finished ? 'ok' : undefined} />
        <Stat label="Vencidas" value={all.overdue} tone={all.overdue ? 'danger' : undefined} />
      </div>

      <FilterBar action="/municipios" values={f} municipalities={data.list} parishes={parishChoice} />

      {filtered ? (
        <Card solid>
          <CardHeader title={`Fichas comunitarias (${data.results.length})`} subtitle="Las vencidas primero; después, de la más nueva a la más vieja." />
          {data.results.length ? <ReportList rows={data.results} /> : <div className="p-4"><EmptyState title="No hay fichas con ese filtro." /></div>}
        </Card>
      ) : (
        <section aria-labelledby="mun-title">
          <h2 id="mun-title" className="mb-3 text-lg font-semibold">Los {data.counters.length} municipios</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.counters.map((c) => (
              <MunicipalityCard
                key={c.municipality}
                name={c.municipality}
                href={`/municipios/${municipalitySlug(c.municipality)}`}
                counters={c}
                obras={seesObras ? (data.obras.find((o) => o.municipality === c.municipality)?.total ?? 0) : undefined}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
