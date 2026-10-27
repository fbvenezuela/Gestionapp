import 'server-only';
import { createElement } from 'react';
import { DateTime } from 'luxon';
import { DigestEmail } from '@emails/templates';
import { withSystem } from '../db';
import type { Sql } from '../db/core';
import { env } from '../env';
import { brand } from '../client-config';
import { sendEmail } from '../email/send';
import { tweetStock } from '../data/tweets';
import { piecesInReview } from '../data/review';
import { buildDigest, digestPath, type DigestData } from './digest';

// Local hour from which the day's digest may go (Vercel's daily cron runs at 07:00 Caracas).
export const DIGEST_HOUR = 7;

// What waits, read once per tick for everybody. Never touches event_schedule.
async function digestData(sql: Sql): Promise<DigestData> {
  const inReview = (await piecesInReview(sql, 50)).map((p) => ({ title: p.title, red: p.review_level === 'rojo' }));
  const tw = await sql.one<{ n: number }>(`select count(*)::int as n from public.tweets where status = 'draft' and deleted_at is null`);
  const changes = await sql.query<{ title: string }>(
    `select title from public.pieces where status = 'changes_requested' and deleted_at is null order by updated_at desc limit 50`,
  );
  const stock = await tweetStock(sql);
  const briefs = await sql.query<{ title: string }>(
    `select e.title from public.events e left join public.event_brief b on b.event_id = e.id
      where e.deleted_at is null and e.cancelled_at is null and e.done_on is null and e.boss_decision <> 'rejected'
        and (b.event_id is null or b.work_description = '' or b.led_by = '' or b.achievements = '')
      order by e.created_at limit 50`,
  );
  return {
    inReview,
    tweetsToApprove: tw?.n ?? 0,
    changesRequested: changes.map((c) => c.title),
    tweetStock: { daysLeft: stock.daysLeft, low: stock.lowStock },
    eventsWithoutBrief: briefs.map((b) => b.title),
  };
}

// Once per local day per opted-in person («Resumen diario por correo» in Perfil). Safe to call
// every few minutes: the day is claimed atomically and the email has a per-person-per-day key.
export async function runDailyDigest(now = new Date()): Promise<{ claimed: number; sent: number }> {
  const local = DateTime.fromJSDate(now).setZone(env.appTz);
  if (local.hour < DIGEST_HOUR) return { claimed: 0, sent: 0 };
  const day = local.toISODate();
  const dayStart = local.startOf('day').toUTC().toISO();

  const { people, data } = await withSystem(async (sql) => {
    const rows = await sql.query<{ id: string; email: string; full_name: string; roles: string[] }>(
      `with opted as (
         select id from public.profiles
          where active and deleted_at is null and coalesce(notify_prefs ->> 'daily_digest', 'false') = 'true'
       ), claimed as (
         insert into public.notify_throttle (user_id, kind, sent_at)
         select id, 'digest', $2::timestamptz from opted
         on conflict (user_id, kind) do update set sent_at = excluded.sent_at
           where public.notify_throttle.sent_at < $1::timestamptz
         returning user_id
       )
       select p.id, p.email, p.full_name,
              coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}')::text[] as roles
         from claimed c join public.profiles p on p.id = c.user_id
         left join public.user_roles ur on ur.user_id = p.id
        group by p.id, p.email, p.full_name`,
      [dayStart, now.toISOString()],
    );
    return { people: rows, data: rows.length ? await digestData(sql) : null };
  });

  let sent = 0;
  if (!data) return { claimed: 0, sent };
  for (const person of people) {
    const dg = buildDigest(person.roles ?? [], data);
    if (!dg) continue;
    try {
      const r = await sendEmail({
        to: person.email,
        subject: dg.subject,
        template: 'digest',
        element: createElement(DigestEmail, { appName: brand.appName, name: person.full_name.split(' ')[0], sections: dg.sections, url: `${env.appUrl}${digestPath(person.roles ?? [], data)}` }),
        idempotencyKey: `digest:${person.id}:${day}`,
      });
      if (r.stored) sent++;
    } catch (e) {
      console.warn('[digest] not sent:', (e as Error).message);
    }
  }
  return { claimed: people.length, sent };
}
