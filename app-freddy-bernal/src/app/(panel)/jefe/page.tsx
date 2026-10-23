import Link from 'next/link';
import { Landmark, Sparkles } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { today } from '@/lib/time';

export const metadata = { title: 'Inicio' };

// The boss's entry: two big buttons, made for the iPad.
export default async function BossHome() {
  const s = await requireRole('boss', 'admin');
  const t0 = today();
  const counts = await db(s, async (sql) => ({
    todayEvents: (await sql.one<{ n: number }>(
      `select count(*)::int as n from public.event_calendar where starts_at >= $1 and starts_at < $2 and boss_decision <> 'rejected'`,
      [t0.toUTC().toISO(), t0.plus({ days: 1 }).toUTC().toISO()],
    ))!.n,
    pending: (await sql.one<{ n: number }>(`select count(*)::int as n from public.events where boss_decision = 'pending' and deleted_at is null`))!.n,
    published: (await sql.one<{ n: number }>(`select count(*)::int as n from public.publications where status = 'published' and published_at > now() - interval '7 days'`))!.n,
  }));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">Buen día</h1>
        <p className="mt-1 text-lg first-letter:uppercase text-text-2">{t0.toFormat("cccc d 'de' LLLL")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/jefe/politica" className="flex min-h-56 flex-col justify-between rounded-[var(--radius-card)] bg-slate p-6 text-on-slate shadow-sm hover:opacity-95">
          <Landmark className="h-12 w-12" aria-hidden />
          <span>
            <span className="block text-3xl font-bold">Política</span>
            <span className="mt-1 block text-lg opacity-90">Agenda, fichas y lo que vas a decir</span>
            <span className="mt-3 block text-base">
              {counts.todayEvents} {counts.todayEvents === 1 ? 'evento hoy' : 'eventos hoy'} · {counts.pending} por decidir
            </span>
          </span>
        </Link>
        <Link href="/jefe/digital" className="flex min-h-56 flex-col justify-between rounded-[var(--radius-card)] bg-accent p-6 text-on-accent shadow-sm hover:bg-accent-hover">
          <Sparkles className="h-12 w-12" aria-hidden />
          <span>
            <span className="block text-3xl font-bold">Digital</span>
            <span className="mt-1 block text-lg">Lo publicado, lo que viene y cómo nos va</span>
            <span className="mt-3 block text-base">{counts.published} publicaciones esta semana</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
