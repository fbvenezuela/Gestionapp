import 'server-only';
import { createElement } from 'react';
import { NoticeEmail } from '@emails/templates';
import { withSystem } from './db';
import { env } from './env';
import { brand } from './client-config';
import { sendEmail } from './email/send';
import { pushNotice } from './push/deliver';

// Kinds that cannot be turned off (they block someone's work).
const CRITICAL = new Set(['changes_requested', 'publish_failed', 'tweets_low_stock', 'event_assigned', 'review_red', 'review_overdue', 'assistant_escalation', 'assistant_health']);

export type Notice = {
  userIds: string[];
  kind: string;
  title: string;
  body?: string;
  link?: string;
  key: string; // idempotency: same key = same notice, never sent twice
  email?: boolean;
};

// Rule 4: callers must never put an event's date or time in title/body (the push sender also
// strips anything that looks like one).
// Safe to call again with the same key (the cron retries a step that failed): the in-app notice is
// stored once, the phone rings only for notices stored by this call, and the emails go to everyone
// on the notice who has none yet, so a call that failed halfway through its emails is completed
// without repeating any (the outbox key is the guard).
export async function notify(n: Notice) {
  const { fresh, mail } = await withSystem(async (sql) => {
    const fresh: { id: string; prefs: Record<string, unknown> }[] = [];
    for (const uid of n.userIds) {
      const row = await sql.one<{ id: string; notify_prefs: Record<string, unknown>; live: boolean }>(
        `insert into public.notifications (user_id, kind, title, body, link, idempotency_key)
         values ($1, $2, $3, $4, $5, $6) on conflict (idempotency_key) do nothing
         returning user_id as id, (select notify_prefs from public.profiles where id = $1) as notify_prefs,
                   coalesce((select active and deleted_at is null from public.profiles where id = $1), false) as live`,
        [uid, n.kind, n.title, n.body ?? '', n.link ?? null, `${n.key}:${uid}`],
      );
      // Someone turned off or removed keeps the in-app notice but gets no push and no email.
      if (row?.live) fresh.push({ id: row.id, prefs: row.notify_prefs ?? {} });
    }
    const mail = n.email && n.userIds.length
      ? await sql.query<{ id: string; email: string; notify_prefs: Record<string, unknown> | null }>(
          `select p.id, p.email, p.notify_prefs from public.profiles p
            where p.id = any($1::uuid[]) and p.active and p.deleted_at is null
              and not exists (select 1 from public.outbox o where o.idempotency_key = $2::text || ':' || p.id::text)
            order by array_position($1::uuid[], p.id)`,
          [n.userIds, n.key],
        )
      : [];
    return { fresh, mail };
  });
  // Phone push, outside the transaction above. pushNotice never throws; the extra catch is a
  // second guard so a push problem can never break the action that sent the notice.
  await pushNotice(fresh, n, CRITICAL.has(n.kind)).catch((e) => console.warn('[push]', (e as Error).message));
  for (const r of mail) {
    if (!CRITICAL.has(n.kind) && r.notify_prefs?.[n.kind] === false) continue;
    await sendEmail({
      to: r.email,
      subject: n.title,
      template: `notice:${n.kind}`,
      element: createElement(NoticeEmail, { appName: brand.appName, title: n.title, body: n.body ?? '', url: n.link ? `${env.appUrl}${n.link}` : undefined }),
      idempotencyKey: `${n.key}:${r.id}`,
    });
  }
}

export async function usersWithRole(role: string): Promise<string[]> {
  return withSystem(async (sql) =>
    (await sql.query<{ user_id: string }>(
      `select ur.user_id from public.user_roles ur join public.profiles p on p.id = ur.user_id
        where ur.role = $1::public.app_role and p.active and p.deleted_at is null`,
      [role],
    )).map((r) => r.user_id),
  );
}
