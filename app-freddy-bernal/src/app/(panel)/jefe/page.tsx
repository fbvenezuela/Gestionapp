import Link from 'next/link';
import { ChevronRight, Clapperboard, HardHat, Landmark, Megaphone, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { HubTile } from '@/components/home/hub-tile';
import { canApprove, getDeadlines, piecesInReview } from '@/lib/data/review';
import { LEVELS, LEVEL_ORDER, reviewClock } from '@/lib/domain/review';
import { cn } from '@/lib/cn';
import { today } from '@/lib/time';
import { ApproveGreen } from '../aprobar/approve-green';
import { overdueReports } from '@/lib/data/fichas';
import { OverdueReports } from '@/components/fichas/overdue-reports';
import { bossCounts, redesCounts } from '@/lib/data/home-counts';
import { freshNoteEvents } from '@/lib/data/recording';

export const metadata = { title: 'Inicio' };

const nf = new Intl.NumberFormat('es-VE');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
// Grabación's new notes shown by title in the Redes tile; the rest are one tap away in «Hoy» (up to 10 there).
const SHOWN_NOTES = 3;

// The boss's Inicio (§3), made for the iPad and the phone: what is overdue in the municipalities, what waits for his
// approval (every level and the tweets, «Aprobar todas las verdes» in one tap) and four big tiles, Política, Obras,
// Redes and Digital, each with live counters that open the screen where those things are. Only the boss and
// administración open it, and both may see the agenda's dates.
export default async function BossHome() {
  const s = await requireRole('boss', 'admin');
  const boss = s.roles.includes('boss');
  const t0 = today();
  const counts = await db(s, async (sql) => ({
    tiles: await bossCounts(sql, t0.toUTC().toISO()!, t0.plus({ days: 1 }).toUTC().toISO()!),
    redes: await redesCounts(sql),
    // What Grabación left for the editor in the last days (§5), the same events as «Notas de Grabación nuevas» in Hoy:
    // the boss edits too, and he lands here, not in Hoy. Titles only (never when it was written). Administración does
    // not get it in Hoy either.
    notes: boss ? await freshNoteEvents(sql, SHOWN_NOTES) : null,
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
  const { politics, obras, digital } = counts.tiles;
  const redes = counts.redes;
  const stage = (st: string) => obras.stages[st] ?? 0;
  const notes = counts.notes;
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
        <HubTile
          id="tile-politica"
          href="/jefe/politica"
          title="Política"
          subtitle="Agenda, fichas y lo que vas a decir"
          icon={Landmark}
          tone="slate"
          counters={[
            { href: '/agenda?vista=dia', value: politics.today, label: plural(politics.today, 'evento hoy', 'eventos hoy') },
            { href: '/jefe/politica', value: politics.pending, label: 'por decidir', tone: 'warn' },
            { href: '/agenda/por-fecha', value: politics.toSchedule, label: 'por ponerle fecha', tone: 'warn' },
          ]}
        >
          <Link href="/agenda" className="mt-1 flex min-h-14 items-center gap-2 rounded-[var(--radius-control)] px-3 text-base font-semibold text-accent-ink hover:bg-surface-2">
            <span className="flex-1">Ver la agenda completa</span>
            <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        </HubTile>
        <HubTile
          id="tile-obras"
          href="/obras"
          title="Obras"
          subtitle="Las fichas del IVT por estado y por municipio"
          icon={HardHat}
          tone="warn"
          grid={[
            { href: '/obras?estado=to_schedule', value: stage('to_schedule'), label: 'por ponerle fecha', tone: 'warn' },
            { href: '/obras?estado=scheduled', value: stage('scheduled'), label: 'con fecha' },
            { href: '/obras?estado=draft', value: stage('draft'), label: plural(stage('draft'), 'borrador', 'borradores') },
            { href: '/obras?estado=done', value: stage('done'), label: plural(stage('done'), 'visita realizada', 'visitas realizadas') },
          ]}
          counters={obras.municipalities.slice(0, 3).map((m) => ({
            href: `/obras?municipio=${encodeURIComponent(m.municipality)}`,
            value: m.total,
            label: `${plural(m.total, 'ficha', 'fichas')} en ${m.municipality}${m.to_schedule ? ` · ${m.to_schedule} por ponerle fecha` : ''}`,
          }))}
        >
          <Link href="/municipios" className="mt-1 flex min-h-14 items-center gap-2 rounded-[var(--radius-control)] px-3 text-base font-semibold text-accent-ink hover:bg-surface-2">
            <span className="flex-1">Ver los municipios</span>
            <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        </HubTile>
        <HubTile
          id="tile-redes"
          href="/redes"
          title="Redes"
          subtitle="Piezas, tweets, publicaciones y resultados"
          icon={Megaphone}
          tone="accent"
          counters={[
            { href: '/piezas', value: redes.pieces.active, label: plural(redes.pieces.active, 'pieza en curso', 'piezas en curso') },
            { href: '/publicar', value: redes.publish.ready, label: plural(redes.publish.ready, 'lista para publicar', 'listas para publicar'), tone: 'ok' },
            { href: '/tweets', value: redes.tweets.daysLeft, label: plural(redes.tweets.daysLeft, 'día cubierto de tweets', 'días cubiertos de tweets'), tone: redes.tweets.lowStock ? 'danger' : undefined },
          ]}
          list={
            notes && notes.total
              ? {
                  key: 'notes',
                  label: 'Notas de Grabación nuevas',
                  icon: Clapperboard,
                  total: notes.total,
                  items: notes.events.map((e) => ({ href: `/eventos/${e.id}?tab=material`, label: e.title })),
                  itemHint: 'ver las notas de Grabación',
                  more: notes.total > notes.events.length ? { href: '/hoy', label: 'Ver más en «Hoy»' } : undefined,
                }
              : null
          }
        />
        <HubTile
          id="tile-digital"
          href="/jefe/digital"
          title="Digital"
          subtitle="Lo publicado, lo que viene y cómo nos va"
          icon={Sparkles}
          tone="solid"
          counters={[
            { href: '/jefe/digital', value: digital.published7, label: plural(digital.published7, 'publicada esta semana', 'publicadas esta semana') },
            { href: '/jefe/digital', value: digital.upcoming, label: plural(digital.upcoming, 'programada: lo que viene', 'programadas: lo que viene') },
            { href: '/resultados?dias=7', value: nf.format(digital.views7), label: 'vistas esta semana' },
          ]}
        />
      </div>
    </div>
  );
}
