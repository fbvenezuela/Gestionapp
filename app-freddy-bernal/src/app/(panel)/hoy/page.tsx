import Link from 'next/link';
import { AlertTriangle, ChevronRight, Clock, Inbox } from 'lucide-react';
import { requireSession, db, menuRoles } from '@/lib/auth/session';
import { canSeeSchedule, type Role } from '@/lib/roles';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PageHeader, Stat, EmptyState } from '@/components/ui/page';
import { Tip } from '@/components/ui/tip';
import { fmtTime, today } from '@/lib/time';
import { tweetStock } from '@/lib/data/tweets';
import { getDeadlines, piecesInReview } from '@/lib/data/review';
import { LEVELS, reviewClock } from '@/lib/domain/review';

export const metadata = { title: 'Hoy' };

type Item = { href: string; title: string; detail?: string; tone?: 'warn' | 'danger' | 'info' | 'accent' | 'ok' | 'neutral'; tag?: string };

export default async function TodayPage() {
  const s = await requireSession();
  const roles = menuRoles(s);
  const has = (...r: Role[]) => r.some((x) => roles.includes(x));
  const sched = canSeeSchedule(roles) || roles.includes('camera');
  const t0 = today();

  const data = await db(s, async (sql) => {
    const todayEvents = sched
      ? await sql.query<{ id: string; title: string; place_name: string; starts_at: string; ends_at: string; work_status: string }>(
          `select e.id, e.title, e.place_name, s.starts_at, s.ends_at, e.work_status
             from public.events e join public.event_schedule s on s.event_id = e.id
            where e.deleted_at is null and s.starts_at >= $1 and s.starts_at < $2 and e.boss_decision <> 'rejected'
            order by s.starts_at`,
          [t0.toUTC().toISO(), t0.plus({ days: 1 }).toUTC().toISO()],
        )
      : [];

    const waiting: Item[] = [];
    const blocked: Item[] = [];
    const stats: { label: string; value: number; tone?: 'accent' | 'danger' | 'ok'; hint?: string }[] = [];

    if (has('social', 'admin')) {
      const changes = await sql.query<{ id: string; title: string }>(`select id, title from public.pieces where status = 'changes_requested' and deleted_at is null order by updated_at desc limit 10`);
      for (const p of changes) waiting.push({ href: `/piezas/${p.id}`, title: p.title, detail: 'Supervisión pidió cambios', tone: 'danger', tag: 'Cambios' });
      const needBoard = await sql.query<{ id: string; title: string }>(
        `select e.id, e.title from public.events e left join public.storyboards sb on sb.event_id = e.id
          where e.deleted_at is null and e.boss_decision = 'accepted' and e.done_on is null
            and (sb.id is null or not exists (select 1 from public.storyboard_blocks b where b.storyboard_id = sb.id and b.deleted_at is null))
          order by e.urgency, e.created_at limit 10`,
      );
      for (const e of needBoard) waiting.push({ href: `/eventos/${e.id}?tab=storyboard`, title: e.title, detail: 'Falta el storyboard', tone: 'info', tag: 'Storyboard' });
      const matReady = await sql.query<{ id: string; title: string }>(
        `select e.id, e.title from public.events e
          where e.deleted_at is null and exists (select 1 from public.media_assets m where m.event_id = e.id and m.kind in ('boss','drone','broll','other') and m.deleted_at is null)
            and not exists (select 1 from public.pieces p where p.event_id = e.id and p.deleted_at is null) limit 10`,
      );
      for (const e of matReady) waiting.push({ href: `/eventos/${e.id}?tab=material`, title: e.title, detail: 'Llegó el material: arma la pieza', tone: 'accent', tag: 'Material' });
      const approved = await sql.query<{ id: string; title: string }>(
        `select p.id, p.title from public.pieces p where p.status = 'approved' and p.deleted_at is null
           and not exists (select 1 from public.publications x where x.piece_id = p.id and x.status in ('scheduled','published') and x.deleted_at is null) limit 10`,
      );
      for (const p of approved) waiting.push({ href: `/publicar/nueva?pieza=${p.id}`, title: p.title, detail: 'Aprobada: lista para publicar', tone: 'ok', tag: 'Publicar' });
      const failed = await sql.query<{ id: string; network: string; failure_reason: string | null }>(`select id, network, failure_reason from public.publications where status = 'failed' and deleted_at is null limit 5`);
      for (const f of failed) blocked.push({ href: `/publicar/${f.id}`, title: `Falló la publicación en ${f.network}`, detail: f.failure_reason ?? '', tone: 'danger' });
      const voice = await sql.query<{ piece_id: string; phrase: string }>(`select piece_id, phrase from public.voice_line_requests where status = 'requested' limit 5`);
      for (const v of voice) blocked.push({ href: `/piezas/${v.piece_id}`, title: 'Esperando frase del jefe', detail: `«${v.phrase.slice(0, 80)}»`, tone: 'warn' });
      const stock = await tweetStock(sql);
      if (stock.lowStock) blocked.push({ href: '/tweets/nueva', title: stock.daysLeft === 0 ? 'No quedan tweets programados' : `Quedan ${stock.daysLeft} días de tweets`, detail: 'Prepara la tanda de la semana', tone: 'warn' });
      stats.push({ label: 'Cambios pedidos', value: changes.length, tone: changes.length ? 'danger' : undefined });
      stats.push({ label: 'Listas para publicar', value: approved.length, tone: approved.length ? 'ok' : undefined });
      stats.push({ label: 'Días de tweets', value: stock.daysLeft, tone: stock.lowStock ? 'danger' : undefined, hint: 'programados' });
    }

    // Review clock: past the deadline the piece is still NOT approved; it shows as stuck.
    const inReview = has('social', 'admin', 'supervisor') ? await piecesInReview(sql, 50) : [];
    const deadlines = await getDeadlines(sql);
    const overdue = inReview.filter((p) => reviewClock(p.review_level, p.sent_to_review_at, deadlines).overdue);
    for (const p of overdue) {
      const c = reviewClock(p.review_level, p.sent_to_review_at, deadlines);
      blocked.push({ href: has('supervisor') ? `/aprobar/${p.id}` : `/piezas/${p.id}`, title: p.title, detail: `Sin aprobar: ${c.text.toLowerCase()} (${LEVELS[p.review_level].label.toLowerCase()}, aprueba ${LEVELS[p.review_level].who})`, tone: 'danger' });
    }

    if (has('supervisor')) {
      const pend = inReview.filter((p) => !overdue.includes(p));
      for (const p of pend) {
        const c = reviewClock(p.review_level, p.sent_to_review_at, deadlines);
        waiting.push({ href: `/aprobar/${p.id}`, title: p.title, detail: p.review_level === 'rojo' ? `En rojo: la aprueba el jefe · ${c.text.toLowerCase()}` : `Por aprobar · ${c.text.toLowerCase()}`, tone: p.review_level === 'rojo' ? 'danger' : 'warn', tag: LEVELS[p.review_level].label });
      }
      const tw = await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where status = 'draft' and deleted_at is null`);
      if (tw!.n) waiting.push({ href: '/aprobar?tab=tweets', title: `${tw!.n} tweets por aprobar`, tone: 'warn', tag: 'Tweets' });
      stats.push({ label: 'Piezas por aprobar', value: inReview.length, tone: overdue.length ? 'danger' : inReview.length ? 'accent' : undefined });
      stats.push({ label: 'Tweets por aprobar', value: tw!.n, tone: tw!.n ? 'accent' : undefined });
    }

    if (has('dispatch')) {
      const incomplete = await sql.query<{ id: string; title: string }>(
        `select e.id, e.title from public.events e left join public.event_brief b on b.event_id = e.id
          where e.deleted_at is null and e.done_on is null and e.boss_decision <> 'rejected'
            and (b.event_id is null or b.work_description = '' or b.led_by = '' or b.achievements = '') limit 10`,
      );
      for (const e of incomplete) waiting.push({ href: `/eventos/${e.id}?tab=ficha`, title: e.title, detail: 'Ficha técnica incompleta', tone: 'warn', tag: 'Ficha' });
      const pendingBoss = await sql.one<{ n: number }>(`select count(*)::int as n from public.events where boss_decision = 'pending' and deleted_at is null`);
      stats.push({ label: 'Fichas incompletas', value: incomplete.length, tone: incomplete.length ? 'accent' : undefined });
      stats.push({ label: 'Esperan al jefe', value: pendingBoss!.n });
    }

    if (has('camera')) {
      const mine = await sql.query<{ id: string; title: string; n: number; past: boolean }>(
        `select e.id, e.title,
                (select count(*)::int from public.media_assets m where m.event_id = e.id and m.deleted_at is null and m.kind in ('boss','drone','broll','other')) as n,
                s.starts_at < now() as past
           from public.events e join public.event_assignments a on a.event_id = e.id and a.user_id = auth.uid()
           left join public.event_schedule s on s.event_id = e.id
          where e.deleted_at is null order by s.starts_at`,
      );
      for (const e of mine.filter((m) => m.past && m.n === 0)) waiting.push({ href: `/eventos/${e.id}?tab=material`, title: e.title, detail: 'Sube el material', tone: 'danger', tag: 'Material' });
      stats.push({ label: 'Mis eventos', value: mine.length });
      stats.push({ label: 'Material por subir', value: mine.filter((m) => m.past && m.n === 0).length, tone: 'danger' });
    }

    if (has('secretary')) {
      const mine = await sql.query<{ id: string; title: string; boss_decision: string }>(`select id, title, boss_decision from public.events where deleted_at is null order by created_at desc limit 10`);
      for (const e of mine) waiting.push({ href: `/eventos/${e.id}`, title: e.title, detail: e.boss_decision === 'pending' ? 'Esperando decisión' : e.boss_decision === 'accepted' ? 'Aceptado' : 'Rechazado', tone: e.boss_decision === 'accepted' ? 'ok' : e.boss_decision === 'rejected' ? 'danger' : 'warn' });
    }

    return { todayEvents, waiting, blocked, stats: stats.slice(0, 3) };
  });

  const first = s.name.split(' ')[0];
  return (
    <>
      <PageHeader title={`Hola, ${first}`} subtitle={t0.toFormat("cccc d 'de' LLLL")} />
      <Tip id="hoy">Aquí está lo que espera por ti; lo de «Trancado» está parado y necesita una mano.</Tip>

      {data.stats.length ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.stats.map((st) => (
            <Stat key={st.label} label={st.label} value={st.value} tone={st.tone} hint={st.hint} />
          ))}
        </div>
      ) : null}

      {/* min-w-0 on each column: a grid item grows to fit its longest title otherwise, and the
          page scrolls sideways on a phone instead of wrapping it. */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Lo que espera por mí" subtitle={data.waiting.length ? `${data.waiting.length} ${data.waiting.length === 1 ? 'pendiente' : 'pendientes'}` : undefined} />
            {data.waiting.length ? <ItemList items={data.waiting} /> : <div className="p-4"><EmptyState icon={<Inbox className="h-8 w-8" />} title="Nada pendiente. ¡Bien!" /></div>}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {sched ? (
            <Card>
              <CardHeader title="Hoy en la agenda" action={<Link href="/agenda" className="text-sm font-semibold text-accent-ink">Ver agenda</Link>} />
              {data.todayEvents.length ? (
                <ul className="divide-y divide-border">
                  {data.todayEvents.map((e) => (
                    <li key={e.id}>
                      <Link href={`/eventos/${e.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                        <span className="w-16 shrink-0 font-mono text-sm font-semibold tabular">{fmtTime(e.starts_at)}</span>
                        <span className="min-w-0 border-l-2 border-accent pl-3">
                          <span className="block font-semibold [overflow-wrap:anywhere]">{e.title}</span>
                          <span className="block text-sm text-text-2">{e.place_name}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-[15px] text-text-2">No hay eventos hoy.</p>
              )}
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Trancado" />
            {data.blocked.length ? <ItemList items={data.blocked} icon /> : <p className="p-4 text-[15px] text-text-2">Nada trancado.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

// On a phone the title takes up to two lines, the detail (where the deadline is, «vence en …»)
// wraps instead of being cut, and the chip goes on its own line below; from sm up, it sits on the right.
function ItemList({ items, icon }: { items: Item[]; icon?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((it, i) => (
        <li key={i}>
          <Link href={it.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
            {icon ? <AlertTriangle className="h-5 w-5 shrink-0 text-warn" aria-hidden /> : <Clock className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="min-w-0 sm:flex-1">
                <span className="line-clamp-2 font-semibold [overflow-wrap:anywhere]">{it.title}</span>
                {it.detail ? <span className="line-clamp-3 text-sm text-text-2 [overflow-wrap:anywhere]">{it.detail}</span> : null}
              </span>
              {it.tag ? <Chip tone={it.tone} className="shrink-0 self-start sm:self-center">{it.tag}</Chip> : null}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

