import { BarChart3, FolderOpen, MessageSquareText, Send } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { HubTile } from '@/components/home/hub-tile';
import { RedesNav } from '@/components/redes/redes-nav';
import { DemoNotice } from '@/components/redes/demo-notice';
import { CreateSheet } from '@/components/redes/create-sheet';
import { Matrix } from '@/components/redes/dashboard/matrix';
import { periodKey } from '@/components/redes/dashboard/matrix-core';
import { PeriodNav } from '@/components/redes/dashboard/period-nav';
import { boardHref, boardPeriod } from '@/components/redes/dashboard/period-core';
import { Stats } from '@/components/redes/dashboard/stats';
import { Observations } from '@/components/redes/dashboard/observations';
import { Activity } from '@/components/redes/dashboard/activity';
import { QuickActions } from '@/components/redes/dashboard/quick-actions';
import { SearchBox } from '@/components/redes/dashboard/search-box';
import { redesCounts } from '@/lib/data/home-counts';
import { getActivity, getDashboard, getRedesSettings, monthContext } from '@/lib/data/redes';
import { matrix, navCounts, receptivityAverage, type PeriodMode } from '@/lib/domain/redes-dashboard';
import { monthParam, withMonth } from '@/lib/domain/redes';

export const metadata = { title: 'Redes' };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// Redes (§3, R4 D-60, D-71): the board of Redes for Redes, the boss and administración. On top the section bar (with
// the open month's numbers), the period's figures, «Estado del contenido» (formats × seven categories, by month or by
// quarter; every number goes to the next piece of its cell), «Observaciones», «Actividad reciente», «Acciones rápidas»
// and «Buscar en Redes»; below, «Lo demás de Redes» (Tweets, Publicar, Resultados and Biblioteca, the same tiles as
// before, each opening the very screen Redes works on). ?crear=1 opens «¿Qué quieres crear?» (nothing is created on
// load). Nothing here reads the agenda: no event dates, ever (Redes must not see them, D-75).
export default async function RedesBoard({ searchParams }: { searchParams: Promise<{ mes?: string; crear?: string; vista?: string }> }) {
  const s = await requireRole('admin', 'social', 'boss');
  const sp = await searchParams;
  const mode: PeriodMode = sp.vista === 'trimestre' ? 'quarter' : 'month';
  // What waits for the boss opens where he approves; Redes (who does not approve) goes to its own screen.
  const approver = s.roles.some((r) => r === 'boss' || r === 'admin');
  const data = await db(s, async (sql) => {
    const mc = await monthContext(sql, monthParam(sp.mes));
    const period = boardPeriod(mc.months, mc.active, mode);
    const settings = await getRedesSettings(sql);
    return {
      mc,
      period,
      settings,
      board: await getDashboard(sql, period.ids),
      activity: await getActivity(sql, 12),
      counts: await redesCounts(sql, mc.active?.id ?? null),
    };
  });
  const { mc, period, board, counts: c } = data;
  const monthId = mc.active?.id ?? null;
  const monthLabel = mc.active?.label ?? '';
  // The section bar counts the open month; in «Por trimestre» the board's rows hold the other two months as well.
  const nav = navCounts(board.rows.filter((r) => r.monthId === monthId), data.settings.quotas);
  const monthOf = Object.fromEntries(board.rows.map((r) => [r.id, r.monthId]));
  const periodLabel = mode === 'quarter' ? `el ${period.label.toLowerCase()}` : monthLabel || 'este mes';
  return (
    <>
      <PageHeader title="Redes" subtitle="El tablero de Redes: lo que falta en cada formato, por mes o por trimestre, y lo último que pasó." />
      <RedesNav active="dashboard" monthId={monthId} counts={nav} />
      <DemoNotice userId={s.userId} />
      {sp.crear === '1' ? <CreateSheet defaultOpen monthId={monthId} monthLabel={monthLabel} closeHref={withMonth('/redes', monthId)} /> : null}
      <Stats receptivity={receptivityAverage(board.rows)} ready={c.publish.ready} scheduled={c.publish.scheduled} periodLabel={periodLabel} />
      <Card className="mb-5">
        <CardHeader
          title="Estado del contenido"
          subtitle="Cada número lleva a una pieza de esa casilla; la vez siguiente, a la que sigue."
        />
        <CardBody className="flex flex-col gap-4">
          {mc.months.length ? (
            <>
              <PeriodNav
                mode={mode}
                label={period.label}
                detail={period.detail}
                monthHref={boardHref(monthId, 'month')}
                quarterHref={boardHref(monthId, 'quarter')}
                prev={period.prev}
                next={period.next}
              />
              <Matrix cells={matrix(board.rows)} monthOf={monthOf} fallbackMonthId={monthId} period={periodKey(mode, monthId, period.index)} />
            </>
          ) : (
            <p className="text-[15px] text-text-2">Todavía no hay meses de contenido. Crea el primero desde una sección con «+ Nuevo mes».</p>
          )}
        </CardBody>
      </Card>
      <Observations items={board.observations} fallbackMonthId={monthId} />
      <div className="mb-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Activity items={data.activity} fallbackMonthId={monthId} />
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Buscar en Redes" subtitle="Títulos, campos de las tarjetas, copies, avisos y tweets." />
            <CardBody>
              <SearchBox monthId={monthId} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Acciones rápidas" subtitle={`Se crea en ${monthLabel || 'el primer mes'} y se abre en su sección.`} />
            <CardBody>
              <QuickActions monthId={monthId} monthLabel={monthLabel} />
            </CardBody>
          </Card>
        </div>
      </div>
      <h2 className="mb-3 text-xl font-bold">Lo demás de Redes</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <HubTile
          id="hub-tweets"
          href="/tweets"
          title="Tweets"
          subtitle="La semana repartida por horas"
          icon={MessageSquareText}
          counters={[
            { href: '/tweets', value: c.tweets.daysLeft, label: plural(c.tweets.daysLeft, 'día cubierto', 'días cubiertos'), tone: c.tweets.lowStock ? 'danger' : undefined },
            { href: '/tweets', value: c.tweets.upcoming, label: 'por salir' },
            { href: approver ? '/aprobar?tab=tweets' : '/tweets', value: c.tweets.drafts, label: 'por aprobar', tone: 'warn' },
          ]}
        />
        <HubTile
          id="hub-publicar"
          href="/publicar"
          title="Publicar"
          subtitle="Lo aprobado, listo para publicar a mano"
          icon={Send}
          counters={[
            { href: '/publicar', value: c.publish.ready, label: plural(c.publish.ready, 'aprobada y sin publicar', 'aprobadas y sin publicar'), tone: 'ok' },
            { href: '/publicar', value: c.publish.scheduled, label: plural(c.publish.scheduled, 'programada', 'programadas') },
            { href: '/publicar', value: c.publish.failed, label: plural(c.publish.failed, 'falló', 'fallaron'), tone: 'danger' },
          ]}
        />
        <HubTile
          id="hub-resultados"
          href="/resultados"
          title="Resultados"
          subtitle="Cómo le fue a cada publicación y a qué hora nos va mejor"
          icon={BarChart3}
          counters={[
            { href: '/resultados', value: c.results.published30, label: plural(c.results.published30, 'publicación en 30 días', 'publicaciones en 30 días') },
            { href: '/resultados', value: c.results.withoutNumbers, label: 'sin números: carga sus resultados', tone: 'warn' },
          ]}
        />
        <HubTile
          id="hub-biblioteca"
          href="/biblioteca"
          title="Biblioteca"
          subtitle="El material por día y por evento, como el Drive"
          icon={FolderOpen}
          counters={[{ href: '/biblioteca', value: c.library.events, label: plural(c.library.events, 'evento con material', 'eventos con material') }]}
        />
      </div>
    </>
  );
}
