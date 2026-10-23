import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { ScheduleSettings } from './schedule-settings';

export const metadata = { title: 'Horarios de tweets' };

export default async function SlotsPage() {
  const s = await requireRole('admin');
  const data = await db(s, async (sql) => {
    const get = async <T,>(k: string, d: T) => ((await sql.one<{ value: T }>(`select value from public.app_settings where key = $1`, [k]))?.value ?? d);
    return {
      slots: await get('tweets.slots', [] as { from: string; to: string }[]),
      perDay: await get('tweets.per_day', { min: 4, max: 5 }),
      lowStock: await get('tweets.low_stock_days', 6),
      collaborators: await get('publishing.default_collaborators', [] as string[]),
    };
  });
  return (
    <>
      <PageHeader title="Horarios de tweets y publicación" subtitle="Hora del Táchira." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <ScheduleSettings {...data} />
    </>
  );
}
