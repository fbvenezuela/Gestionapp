import { NextResponse, type NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { withSystem } from '@/lib/db';
import { env } from '@/lib/env';
import { notify, usersWithRole } from '@/lib/notify';
import { tweetStock } from '@/lib/data/tweets';
import { publisherFor } from '@/lib/publish';
import { getDeadlines, piecesInReview } from '@/lib/data/review';
import { LEVELS, reviewClock } from '@/lib/domain/review';
import { DIGEST_HOUR, runDailyDigest } from '@/lib/push/digest-run';
import { assistantHealthCheck } from '@/lib/assistant';

// Scheduled work. Called by Vercel Cron (see vercel.json, daily) and/or by Supabase pg_cron +
// pg_net every 5 minutes (migration 20261025000800_push.sql) with the CRON_SECRET bearer.
// Safe to call often: a lease keeps two ticks from overlapping, every notice has an
// idempotency key, daily work is claimed once per local day and escalations are marked.
export async function GET(req: NextRequest) {
  if (!env.cronSecret || req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return new NextResponse('No autorizado', { status: 401 });
  }
  const lease = await withSystem((sql) =>
    sql.one<{ name: string }>(
      `insert into public.cron_leases (name, until) values ('tick', now() + interval '4 minutes')
       on conflict (name) do update set until = excluded.until where public.cron_leases.until < now()
       returning name`,
    ),
  );
  if (!lease) return NextResponse.json({ busy: true });
  try {
    return NextResponse.json(await tick());
  } finally {
    await withSystem((sql) => sql.query(`update public.cron_leases set until = now() where name = 'tick'`));
  }
}

async function tick() {
  const local = DateTime.now().setZone(env.appTz);
  const day = local.toISODate();
  const morning = local.hour >= DIGEST_HOUR;
  const out: Record<string, unknown> = {};

  // 1) Tweets running out (5-6 days left): once a (local) day, from the morning on, in the app
  // and by email.
  const stock = await withSystem((sql) => tweetStock(sql));
  out.tweetDaysLeft = stock.daysLeft;
  if (stock.lowStock && morning) {
    const social = await usersWithRole('social');
    await notify({ userIds: social, kind: 'tweets_low_stock', title: stock.daysLeft ? `Quedan ${stock.daysLeft} días de tweets programados` : 'No quedan tweets programados', body: 'Prepara la tanda de la semana.', link: '/tweets/nueva', key: `tweets-low:${day}`, email: true });
  }

  // 2) Publications whose time has come.
  const due = await withSystem((sql) =>
    sql.query<{ id: string; network: string; format: string; copy_body: string; collaborators: string[]; mode: string; title: string }>(
      `select x.id, x.network, x.format, x.copy_body, x.collaborators, x.mode, p.title from public.publications x join public.pieces p on p.id = x.piece_id
        where x.status = 'scheduled' and x.scheduled_at <= now() and x.deleted_at is null
          and p.status = 'approved' and p.deleted_at is null limit 50`,
    ),
  );
  const social = await usersWithRole('social');
  for (const p of due) {
    if (p.mode === 'api') {
      const r = await publisherFor(p.network).publish({ publicationId: p.id, network: p.network, format: p.format, copy: p.copy_body, mediaUrl: null, coverUrl: null, collaborators: p.collaborators });
      await withSystem((sql) =>
        r.ok
          ? sql.query(`update public.publications set status = 'published', published_at = now(), url = $2, external_id = $3 where id = $1`, [p.id, r.url, r.externalId])
          : sql.query(`update public.publications set status = 'failed', failure_reason = $2 where id = $1`, [p.id, r.reason]),
      );
      if (!r.ok) await notify({ userIds: social, kind: 'publish_failed', title: `Falló la publicación de «${p.title}»`, body: r.reason, link: `/publicar/${p.id}`, key: `pubfail:${p.id}`, email: true });
    } else {
      await notify({ userIds: social, kind: 'publish_due', title: `Toca publicar «${p.title}»`, body: 'Descarga el paquete y marca «Ya lo publiqué».', link: `/publicar/${p.id}`, key: `pubdue:${p.id}` });
    }
  }
  out.duePublications = due.length;

  // 3) Reviews past their deadline: a second notice, once. No answer is NOT approval.
  const late = await withSystem(async (sql) => {
    const deadlines = await getDeadlines(sql);
    const rows = await sql.query<{ id: string; escalated: boolean }>(`select id, review_escalated_at is not null as escalated from public.pieces where status = 'in_review' and deleted_at is null`);
    const fresh = new Set(rows.filter((r) => !r.escalated).map((r) => r.id));
    const list = (await piecesInReview(sql)).filter((p) => fresh.has(p.id) && reviewClock(p.review_level, p.sent_to_review_at, deadlines).overdue);
    for (const p of list) await sql.query(`update public.pieces set review_escalated_at = now() where id = $1`, [p.id]);
    return list;
  });
  if (late.length) {
    const [sup, boss, admin] = [await usersWithRole('supervisor'), await usersWithRole('boss'), await usersWithRole('admin')];
    for (const p of late) {
      const red = p.review_level === 'rojo';
      await notify({
        userIds: [...new Set([...sup, ...(red ? boss : admin)])],
        kind: 'review_overdue',
        title: `Venció el plazo: «${p.title}» sigue sin aprobar`,
        body: `Nivel ${LEVELS[p.review_level].label.toLowerCase()}: la aprueba ${LEVELS[p.review_level].who}. No sale hasta que alguien decida.`,
        link: `/aprobar/${p.id}`,
        key: `review-late:${p.id}:${p.sent_to_review_at}`,
        email: true,
      });
    }
  }
  out.lateReviews = late.length;

  // 4) Daily digest by email for whoever turned it on in Perfil.
  out.digest = await runDailyDigest();

  // 5) Assistant health: too many degraded answers in the last hour → one notice to admin.
  out.assistant = await assistantHealthCheck().catch((e) => ({ error: String((e as Error).message ?? e) }));
  return out;
}
