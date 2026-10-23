import Link from 'next/link';
import { BookOpenText, CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { LinkButton } from '@/components/ui/button';
import { BOSS_DECISION } from '@/lib/data/labels';
import { fmtDateTime, fmtTime, today } from '@/lib/time';

export const metadata = { title: 'Política' };

export default async function BossPolitics() {
  const s = await requireRole('boss', 'admin');
  const t0 = today();
  const data = await db(s, async (sql) => ({
    upcoming: await sql.query<{ id: string; title: string; place_name: string; starts_at: string; boss_decision: string; priority: number | null; has_board: boolean }>(
      `select c.id, c.title, c.place_name, c.starts_at, c.boss_decision, c.priority,
              exists (select 1 from public.storyboards sb where sb.event_id = c.id and (sb.speech <> '' or exists (select 1 from public.storyboard_blocks b where b.storyboard_id = sb.id and b.deleted_at is null))) as has_board
         from public.event_calendar c where c.starts_at >= $1 and c.starts_at < $2 and c.boss_decision <> 'rejected' order by c.starts_at`,
      [t0.toUTC().toISO(), t0.plus({ days: 7 }).toUTC().toISO()],
    ),
    pending: await sql.query<{ id: string; title: string; starts_at: string | null; place_name: string }>(
      `select e.id, e.title, s.starts_at, e.place_name from public.events e left join public.event_schedule s on s.event_id = e.id
        where e.boss_decision = 'pending' and e.deleted_at is null order by s.starts_at nulls last`,
    ),
  }));
  return (
    <>
      <PageHeader title="Política" back={{ href: '/jefe', label: 'Inicio' }} actions={<LinkButton href="/agenda" size="lg"><CalendarDays className="h-5 w-5" aria-hidden /> Ver calendario</LinkButton>} />
      {data.pending.length ? (
        <Card className="mb-5">
          <CardHeader title={`Esperan tu decisión (${data.pending.length})`} subtitle="Califica de 1 a 10 y acepta o rechaza." />
          <ul className="divide-y divide-border">
            {data.pending.map((e) => (
              <li key={e.id}>
                <Link href={`/eventos/${e.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 text-lg hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{e.title}</span>
                    <span className="block text-base text-text-2">{fmtDateTime(e.starts_at)} · {e.place_name}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <h2 className="mb-2 text-xl font-bold">Los próximos 7 días</h2>
      {data.upcoming.length === 0 ? (
        <EmptyState title="No hay eventos en los próximos días." />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.upcoming.map((e) => (
            <li key={e.id}>
              <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <Link href={`/eventos/${e.id}`} className="min-w-0 flex-1">
                  <p className="font-mono text-base font-semibold first-letter:uppercase text-accent-ink">{fmtDateTime(e.starts_at).split(',')[0]} · {fmtTime(e.starts_at)}</p>
                  <p className="text-xl font-semibold">{e.title}</p>
                  <p className="flex items-center gap-1 text-base text-text-2"><MapPin className="h-4 w-4" aria-hidden /> {e.place_name}</p>
                  <div className="mt-2 flex gap-2">
                    <Chip tone={BOSS_DECISION[e.boss_decision].tone}>{BOSS_DECISION[e.boss_decision].label}</Chip>
                    {e.priority ? <Chip tone="accent">{e.priority}/10</Chip> : null}
                  </div>
                </Link>
                {e.has_board ? (
                  <LinkButton variant="slate" size="lg" href={`/eventos/${e.id}/lectura`}><BookOpenText className="h-5 w-5" aria-hidden /> Lo que voy a decir</LinkButton>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-text-2">La sección de ropa llega en una fase siguiente.</p>
    </>
  );
}
