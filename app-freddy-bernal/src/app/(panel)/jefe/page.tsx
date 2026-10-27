import Link from 'next/link';
import { ChevronRight, Landmark, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { canApprove, getDeadlines, piecesInReview } from '@/lib/data/review';
import { LEVELS, LEVEL_ORDER, reviewClock } from '@/lib/domain/review';
import { cn } from '@/lib/cn';
import { today } from '@/lib/time';
import { ApproveGreen } from '../aprobar/approve-green';
import { overdueReports } from '@/lib/data/fichas';
import { OverdueReports } from '@/components/fichas/overdue-reports';
import { toSchedule } from '@/lib/data/events';

export const metadata = { title: 'Inicio' };

// The boss's entry: two big buttons, made for the iPad.
export default async function BossHome() {
  const s = await requireRole('boss', 'admin');
  const t0 = today();
  const counts = await db(s, async (sql) => ({
    todayEvents: (await sql.one<{ n: number }>(
      `select count(*)::int as n from public.event_calendar where starts_at >= $1 and starts_at < $2 and boss_decision <> 'rejected' and cancelled_at is null`,
      [t0.toUTC().toISO(), t0.plus({ days: 1 }).toUTC().toISO()],
    ))!.n,
    pending: (await sql.one<{ n: number }>(`select count(*)::int as n from public.events where boss_decision = 'pending' and deleted_at is null and cancelled_at is null`))!.n,
    toSchedule: (await toSchedule(sql, 200)).length,
    published: (await sql.one<{ n: number }>(`select count(*)::int as n from public.publications where status = 'published' and published_at > now() - interval '7 days'`))!.n,
    // The boss approves every level and the tweets (public.can_approve()): all of it waits for him here.
    review: await piecesInReview(sql),
    tweets: (await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where status = 'draft' and deleted_at is null`))!.n,
    deadlines: await getDeadlines(sql),
    canApprove: await canApprove(sql),
    // «Lo vencido sale arriba en el inicio del jefe» (§4.2): community reports past their follow-up date.
    overdue: await overdueReports(sql, t0.toISODate()!, 5),
    overdueTotal: (await sql.one<{ n: number }>(
      `select count(*)::int as n from public.community_reports where deleted_at is null and follow_up_due < $1::date and status not in ('finished', 'suspended')`,
      [t0.toISODate()],
    ))!.n,
  }));
  const boss = s.roles.includes('boss');
  const greens = counts.review.filter((p) => p.review_level === 'verde');
  const anyRed = counts.review.some((p) => p.review_level === 'rojo');
  const SHOWN = 5;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">Buen día</h1>
        <p className="mt-1 text-lg first-letter:uppercase text-text-2">{t0.toFormat("cccc d 'de' LLLL")}</p>
      </div>
      <OverdueReports rows={counts.overdue} todayIso={t0.toISODate()!} total={counts.overdueTotal} />
      {counts.review.length || counts.tweets ? (
        <Card aria-labelledby="approve-title" role="region" className={cn('p-4', anyRed && 'border-2 border-danger bg-danger-soft')}>
          <h2 id="approve-title" className={cn('flex items-center gap-2 text-xl font-bold', anyRed && 'text-danger')}>
            <ShieldAlert className="h-6 w-6" aria-hidden /> {boss ? 'Te toca aprobar' : 'Esperan al jefe'}
          </h2>
          <p className="mt-1 text-text-2">
            {boss
              ? 'Nada sale sin tu aprobación: verdes, amarillas, rojas y tweets. Si no respondes, no sale.'
              : 'Todo lo aprueba el jefe: verdes, amarillas, rojas y tweets.'}
          </p>
          {counts.canApprove && greens.length ? (
            <div className="mt-3 flex">
              <ApproveGreen pieces={greens.map((p) => ({ id: p.id, revision: p.revision }))} />
            </div>
          ) : null}
          {LEVEL_ORDER.map((lvl) => {
            const list = counts.review.filter((p) => p.review_level === lvl);
            if (!list.length) return null;
            return (
              <div key={lvl} className="mt-4">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Chip tone={LEVELS[lvl].tone}>{LEVELS[lvl].label}</Chip> {list.length} {list.length === 1 ? 'pieza' : 'piezas'}
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {list.slice(0, SHOWN).map((p) => {
                    const clock = reviewClock(p.review_level, p.sent_to_review_at, counts.deadlines);
                    return (
                      <li key={p.id}>
                        <Link href={`/aprobar/${p.id}`} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-lg font-semibold hover:bg-surface-2">
                          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{p.title}</span>
                          {clock.text ? <Chip tone={clock.overdue ? 'danger' : 'warn'}>{clock.text}</Chip> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {list.length > SHOWN ? <p className="mt-1 text-sm text-text-2">y {list.length - SHOWN} más en «Por aprobar».</p> : null}
              </div>
            );
          })}
          <div className="mt-4 flex flex-col gap-2">
            {counts.tweets ? (
              <Link href="/aprobar?tab=tweets" className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-lg font-semibold hover:bg-surface-2">
                <MessageSquare className="h-5 w-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{counts.tweets} {counts.tweets === 1 ? 'tweet por aprobar' : 'tweets por aprobar'}</span>
                <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
              </Link>
            ) : null}
            <Link href="/aprobar" className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 font-semibold hover:bg-surface-2">
              <span className="flex-1">Ver todo en «Por aprobar»</span>
              <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
            </Link>
          </div>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/jefe/politica" className="flex min-h-56 flex-col justify-between rounded-[var(--radius-card)] bg-slate p-6 text-on-slate shadow-sm hover:opacity-95">
          <Landmark className="h-12 w-12" aria-hidden />
          <span>
            <span className="block text-3xl font-bold">Política</span>
            <span className="mt-1 block text-lg opacity-90">Agenda, fichas y lo que vas a decir</span>
            <span className="mt-3 block text-base">
              {counts.todayEvents} {counts.todayEvents === 1 ? 'evento hoy' : 'eventos hoy'} · {counts.pending} por decidir · {counts.toSchedule} por ponerle fecha
            </span>
          </span>
        </Link>
        <Link href="/jefe/digital" className="flex min-h-56 flex-col justify-between rounded-[var(--radius-card)] bg-accent p-6 text-on-accent shadow-sm hover:bg-accent-hover">
          <Sparkles className="h-12 w-12" aria-hidden />
          <span>
            <span className="block text-3xl font-bold">Digital</span>
            <span className="mt-1 block text-lg">Lo publicado, lo que viene y cómo nos va</span>
            <span className="mt-3 block text-base">{counts.published} {counts.published === 1 ? 'publicación' : 'publicaciones'} esta semana</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
