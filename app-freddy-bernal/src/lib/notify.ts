import 'server-only';
import { createElement } from 'react';
import { NoticeEmail } from '@emails/templates';
import { withSystem } from './db';
import { env } from './env';
import { brand } from './client-config';
import { sendEmail } from './email/send';
import { CHAT_PUSH_KIND, pushNotice } from './push/deliver';
import { kindOn } from './push/quiet';
import type { Role } from './roles';
import { chatRoles, firstName } from '@/components/chat/chat-core';

// Kinds that cannot be turned off (they block someone's work).
// A moved or cancelled event (the shared agenda, 27/10/2026) too: Grabación and the IVT have to be there, or not.
export const CRITICAL = new Set(['changes_requested', 'publish_failed', 'tweets_low_stock', 'event_assigned', 'review_red', 'review_overdue', 'assistant_escalation', 'assistant_health', 'drive_down', 'drive_quota', 'event_moved', 'event_cancelled']);

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
// on the notice who has no outbox row yet, so a call that failed halfway through its emails (before
// storing them) is completed without repeating any (the outbox key is the guard). An email that is
// stored but that Resend refused stays 'failed' in the outbox: nothing resends it yet
// (docs/PENDIENTES.md).
export async function notify(n: Notice) {
  const { fresh, mail } = await withSystem(async (sql) => {
    const fresh: { id: string; prefs: Record<string, unknown> }[] = [];
    for (const uid of n.userIds) {
      const row = await sql.one<{ id: string; notify_prefs: Record<string, unknown>; live: boolean }>(
        `insert into public.notifications (user_id, kind, title, body, link, idempotency_key)
         values ($1, $2, $3, $4, $5, $6) on conflict (idempotency_key) do nothing
         returning user_id as id, (select notify_prefs from public.profiles where id = $1) as notify_prefs,
                   coalesce((select active and deleted_at is null from public.profiles where id = $1), false)
                     and exists (select 1 from public.user_roles where user_id = $1) as live`,
        [uid, n.kind, n.title, n.body ?? '', n.link ?? null, `${n.key}:${uid}`],
      );
      // Someone turned off, removed or left without a role (the retired roles, 27/10/2026) keeps the in-app notice
      // but gets no push and no email.
      if (row?.live) fresh.push({ id: row.id, prefs: row.notify_prefs ?? {} });
    }
    const mail = n.email && n.userIds.length
      ? await sql.query<{ id: string; email: string; notify_prefs: Record<string, unknown> | null }>(
          `select p.id, p.email, p.notify_prefs from public.profiles p
            where p.id = any($1::uuid[]) and p.active and p.deleted_at is null
              and exists (select 1 from public.user_roles ur where ur.user_id = p.id)
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
    if (!CRITICAL.has(n.kind) && !kindOn(n.kind, r.notify_prefs)) continue;
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

// Mensajes (R3, D-55): a new message rings the phones of the others in the conversation (everyone of the team in «Todo
// el equipo») who did not silence it, with the title «Mensaje nuevo» and who wrote it: «De Daniela (Redes)». NEVER the
// text nor a group's name (a phone's lock screen shows the notice, and phones may be shared): this never even reads
// them. No row in «Avisos» (the envelope already counts it) and never an email. Grouped every 10 minutes like any
// other kind («Tienes 3 mensajes nuevos», push/deliver.ts), quiet hours apply, and «Qué avisos quiero» → «Mensajes
// nuevos del equipo» turns it off. Called after the message's transaction, never inside db().
export async function notifyChat(m: { messageId: string }) {
  const plan = await withSystem(async (sql) => {
    const msg = await sql.one<{ conversation_id: string; author_id: string; kind: string; name: string; roles: string[] }>(
      `select x.conversation_id, x.author_id, c.kind,
              coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
              public.chat_team_roles(x.author_id)::text[] as roles
         from public.chat_messages x
         join public.chat_conversations c on c.id = x.conversation_id
         join public.profiles p on p.id = x.author_id
        where x.id = $1`,
      [m.messageId],
    );
    if (!msg) return null;
    // Active people of the team (never an admin account), in this channel NOW (whoever was taken out hears nothing),
    // not the author, not muted. Never for an archived channel (nobody writes there; just in case).
    const recipients = await sql.query<{ id: string; notify_prefs: Record<string, unknown> | null }>(
      `select p.id, p.notify_prefs from public.profiles p
        where p.id <> $2 and p.active and p.deleted_at is null and public.chat_team_roles(p.id) <> '{}'
          and not exists (select 1 from public.chat_conversations k where k.id = $1 and k.archived_at is not null)
          and ($3::text = 'team' or exists (select 1 from public.chat_members cm
                                             where cm.conversation_id = $1 and cm.user_id = p.id and cm.removed_at is null))
          and not exists (select 1 from public.chat_reads r where r.conversation_id = $1 and r.user_id = p.id and r.muted)
        order by p.id`,
      [msg.conversation_id, msg.author_id, msg.kind],
    );
    return { msg, recipients };
  });
  if (!plan || !plan.recipients.length) return;
  const { msg, recipients } = plan;
  const body = msg.roles.includes('boss') ? 'Del jefe' : `De ${firstName(msg.name)} (${chatRoles(msg.roles as Role[])})`;
  await pushNotice(
    recipients.map((r) => ({ id: r.id, prefs: r.notify_prefs ?? {} })),
    { kind: CHAT_PUSH_KIND, title: 'Mensaje nuevo', body, link: `/mensajes/${msg.conversation_id}` },
    false,
  ).catch((e) => console.warn('[push]', (e as Error).message));
}

// The given people who still hold a role (one of the six or admin: the database allows nothing else) and are active.
// For notices to someone named by a row (who created an event), who may have lost their role since.
export async function withAnyRole(userIds: (string | null | undefined)[]): Promise<string[]> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return [];
  return withSystem(async (sql) =>
    (await sql.query<{ id: string }>(
      `select p.id from public.profiles p
        where p.id = any($1::uuid[]) and p.active and p.deleted_at is null
          and exists (select 1 from public.user_roles ur where ur.user_id = p.id)
        order by array_position($1::uuid[], p.id)`,
      [ids],
    )).map((r) => r.id),
  );
}
