import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { windowHint, type PublishingWindows } from '@/lib/domain/publishing-windows';
import { ScheduleSettings } from './schedule-settings';

export const metadata = { title: 'Horarios de tweets' };

export default async function SlotsPage() {
  const s = await requireRole('admin');
  const data = await db(s, async (sql) => {
    const get = async <T,>(k: string, d: T) => ((await sql.one<{ value: T }>(`select value from public.app_settings where key = $1`, [k]))?.value ?? d);
    return {
      slots: await get('tweets.slots', [] as { from: string; to: string }[]),
      perDay: await get('tweets.per_day', { min: 2, max: 3 }),
      lowStock: await get('tweets.low_stock_days', 6),
      collaborators: await get('publishing.default_collaborators', [] as string[]),
      windows: await get('publishing.windows', {} as PublishingWindows),
    };
  });
  const { windows, ...settings } = data;
  const nets = Object.entries(windows).filter(([, w]) => w);
  return (
    <>
      <PageHeader title="Horarios de tweets y publicación" subtitle="Hora del Táchira." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <ScheduleSettings {...settings} />
      {nets.length ? (
        <Card className="mt-4">
          <CardHeader title="Mejores horas por red" subtitle="Lo medido en el diagnóstico. Se muestra como aviso al programar; nunca bloquea." />
          <ul className="divide-y divide-border">
            {nets.map(([n, w]) => (
              <li key={n} className="px-4 py-3 text-sm">
                <span className="font-semibold">{NETWORK_LABEL[n] ?? n}</span>
                <p className="text-text-2">{windowHint(w)}</p>
                {w!.note ? <p className="text-muted">{w!.note}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
