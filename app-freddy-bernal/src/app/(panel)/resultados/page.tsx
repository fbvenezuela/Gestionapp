import Link from 'next/link';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState, Stat } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { bestTimes, MIN_POINTS } from '@/lib/domain/best-times';
import { dt, fmtDateTime } from '@/lib/time';
import { CsvImport } from './csv-import';

export const metadata = { title: 'Resultados' };

type Row = { id: string; title: string; network: string; format: string; published_at: string; url: string | null; views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; republish_of: string | null };

const nf = new Intl.NumberFormat('es-VE');

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const s = await requireRole('admin', 'social', 'supervisor', 'boss');
  const { dias } = await searchParams;
  const days = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const canLoad = s.roles.some((r) => r === 'admin' || r === 'social');
  const rows = await db(s, (sql) =>
    sql.query<Row>(
      `select x.id, p.title, x.network, x.format, x.published_at, x.url, x.republish_of, m.views, m.reach, m.likes, m.comments, m.shares, m.saves
         from public.publications x join public.pieces p on p.id = x.piece_id
         left join lateral (select * from public.publication_metrics pm where pm.publication_id = x.id order by pm.captured_at desc limit 1) m on true
        where x.status = 'published' and x.deleted_at is null and x.published_at > now() - make_interval(days => $1)
        order by x.published_at desc`,
      [days],
    ),
  );
  const inter = (r: Row) => (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0);
  const withData = rows.filter((r) => r.views != null);
  const best = bestTimes(
    rows.map((r) => ({ network: r.network, publishedAt: new Date(r.published_at), views: r.views, interactions: r.views != null ? inter(r) : null })),
    (d) => dt(d)!.hour,
  );
  const totalViews = withData.reduce((a, r) => a + (r.views ?? 0), 0);

  return (
    <>
      <PageHeader title="Resultados" subtitle="Cómo le fue a cada publicación y a qué hora nos va mejor." />
      <div className="mb-4 flex gap-1">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/resultados?dias=${d}`} className={`min-h-10 rounded-full px-4 py-2 text-sm font-semibold ${d === days ? 'bg-slate text-on-slate' : 'border border-border bg-surface text-text-2'}`}>
            {d} días
          </Link>
        ))}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Publicaciones" value={rows.length} />
        <Stat label="Vistas" value={nf.format(totalViews)} hint={`${withData.length} con números`} />
        <Stat label="Sin números" value={rows.length - withData.length} tone={rows.length - withData.length ? 'accent' : undefined} hint="carga sus resultados" />
      </div>

      <h2 className="mb-2 text-lg font-bold">¿A qué hora nos va mejor?</h2>
      {best.length === 0 ? (
        <EmptyState title="Todavía no hay publicaciones con resultados." />
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {best.map((b) => (
            <Card key={b.network}>
              <CardHeader title={NETWORK_LABEL[b.network]} subtitle={`${b.total} publicaciones`} action={b.enoughData ? null : <Chip tone="warn">Todavía pocos datos</Chip>} />
              <CardBody className="flex flex-col gap-2">
                {b.best ? (
                  <p className="text-[15px]">
                    Por ahora, lo que mejor funciona es la <b>{b.best.label.split(' (')[0].toLowerCase()}</b> ({nf.format(b.best.avgViews ?? 0)} vistas en promedio).
                    {!b.enoughData ? ` Hace falta probar al menos ${MIN_POINTS} veces en cada horario para estar seguros.` : ''}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1.5">
                  {b.slots.map((sl) => {
                    const max = Math.max(...b.slots.map((x) => x.avgViews ?? 0), 1);
                    return (
                      <li key={sl.band} className="text-sm">
                        <div className="flex justify-between"><span>{sl.label}</span><span className="tabular text-text-2">{sl.avgViews != null ? nf.format(sl.avgViews) : '—'} · {sl.count} pub.</span></div>
                        <div className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-accent" style={{ width: `${((sl.avgViews ?? 0) / max) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold">Por publicación</h2>
      {rows.length ? (
        <Card className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-left">
                <tr>{['Publicación', 'Red', 'Hora', 'Vistas', 'Alcance', 'Interacción'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={canLoad ? `/publicar/${r.id}` : '#'} className="font-semibold hover:underline">{r.title}</Link>
                      {r.republish_of ? <span className="ml-1 text-xs text-text-2">(republicación)</span> : null}
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-accent-ink">link</a> : null}
                    </td>
                    <td className="px-3 py-2">{NETWORK_LABEL[r.network]} · {r.format}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.published_at)}</td>
                    <td className="px-3 py-2 tabular">{r.views != null ? nf.format(r.views) : <span className="text-muted">sin cargar</span>}</td>
                    <td className="px-3 py-2 tabular">{r.reach != null ? nf.format(r.reach) : '—'}</td>
                    <td className="px-3 py-2 tabular">{r.views != null ? `${nf.format(inter(r))} (${r.likes ?? 0} ♥ · ${r.comments ?? 0} 💬 · ${r.shares ?? 0} ↗ · ${r.saves ?? 0} 🔖)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState title="No hay publicaciones en este periodo." />
      )}
      {canLoad ? <CsvImport /> : null}
      <p className="mt-4 text-sm text-text-2">Los me gusta y comentarios miden el alcance del contenido, no el apoyo político.</p>
    </>
  );
}
