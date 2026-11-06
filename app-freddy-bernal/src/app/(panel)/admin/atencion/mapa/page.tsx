import Link from 'next/link';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { DeskNav } from '@/components/attention/desk-nav';
import { MapLoader } from '@/components/attention/map/map-loader';
import { StateChip } from '@/components/attention/labels';
import { deskCatalogs, mapData } from '@/lib/data/attention';
import { deskAccess, parseInboxFilters } from '@/lib/domain/attention';

export const metadata = { title: 'Mapa de atención' };

// The map of the attention desk (design §5): the cases with a point the person consented to, as markers grouped by
// closeness (never a denuncia: the database never keeps their point), and everything else counted by municipality.
// What this person reads (RLS), open cases unless «Todas» is chosen; by category and area too.
export default async function AttentionMapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireRole('attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor', 'boss');
  const access = deskAccess(s.roles);
  const sp = await searchParams;
  const f = parseInboxFilters(sp);
  const openOnly = sp.todas !== '1';
  const data = await db(s, async (sql) => ({ catalogs: await deskCatalogs(sql), map: await mapData(sql, f, s.userId, { openOnly }) }));
  const { points, byMunicipality } = data.map;
  return (
    <div className="flex flex-col">
      <PageHeader title="Mapa de atención" subtitle="Solo los puntos que la persona marcó con su permiso. Las denuncias nunca van al mapa." />
      <DeskNav access={access} current="mapa" />
      <Card className="mb-5 p-4">
        <form method="get" action="/admin/atencion/mapa" className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" aria-label="Filtrar el mapa">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Cuáles
            <Select name="todas" defaultValue={openOnly ? '' : '1'}>
              <option value="">Las abiertas</option>
              <option value="1">Todas</option>
            </Select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Categoría
            <Select name="categoria" defaultValue={f.categoryId ?? ''}>
              <option value="">Todas</option>
              {data.catalogs.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Área
            <Select name="area" defaultValue={f.area ?? ''}>
              <option value="">Todas</option>
              {data.catalogs.areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="secondary">Ver</Button>
        </form>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card solid>
          <CardHeader title="Con ubicación" subtitle={points.length === 1 ? '1 caso' : `${points.length} casos`} />
          <MapLoader points={points} />
          {points.length ? (
            <details className="border-t border-border px-4 py-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-semibold text-accent-ink">La lista de estos casos</summary>
              <ul className="flex flex-col gap-2 pb-2">
                {points.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <Link href={`/admin/atencion/${p.id}`} className="font-mono font-semibold text-accent-ink underline-offset-2 hover:underline">{p.reference}</Link>
                    <span className="text-text-2">{p.categoryName}</span>
                    <StateChip state={p.state} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
        <Card solid>
          <CardHeader title="Sin ubicación, por municipio" subtitle="No van al mapa: se cuentan aquí." />
          {byMunicipality.length ? (
            <ul className="divide-y divide-border">
              {byMunicipality.map((m) => (
                <li key={m.id ?? 'ninguno'} className="flex items-center justify-between gap-3 px-4 py-2 text-[15px]">
                  {m.id ? (
                    <Link href={`/admin/atencion?municipio=${m.id}`} className="min-w-0 truncate font-semibold text-accent-ink underline-offset-2 hover:underline">{m.name}</Link>
                  ) : (
                    <span className="min-w-0 truncate">{m.name}</span>
                  )}
                  <span className="tabular font-semibold">{m.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-[15px] text-text-2">Nada sin ubicación con estos filtros.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
