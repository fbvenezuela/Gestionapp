import 'server-only';
import { randomUUID } from 'node:crypto';
import webpush, { type Urgency } from 'web-push';
import { withSystem } from '../db';
import { env } from '../env';
import { vapidConfig } from './config';
import { isAllowedEndpoint } from './endpoint';
import { GROUP_MINUTES, pushDecision, type NotifyPrefs } from './quiet';
import { pushText } from './text';

// Sending pushes. Always OUTSIDE any database transaction, with a short timeout, and never
// throwing back to the caller: a failed push must not break the action that caused it.

export type PushSub = { endpoint: string; p256dh: string; auth: string };
// silent: update the tray entry without sound or vibration (grouped pushes).
export type PushPayload = { title: string; body: string; url: string; tag: string; kind: string; silent?: boolean };
export type SendOutcome = { ok: number; gone: number; failed: number };
export type PushRecipient = { id: string; prefs: NotifyPrefs };

const SEND_TIMEOUT_MS = 4000;
const MAX_FAILURES = 5;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('push timeout')), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

// Only same-site paths open from a notification.
export function safeLink(link?: string | null): string {
  return link && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') ? link.slice(0, 300) : '/avisos';
}

// Push service "topic": up to 32 URL-safe characters; a newer undelivered push replaces an older one.
function topicFor(kind: string): string | undefined {
  const t = kind.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return t || undefined;
}

export async function sendToSubscriptions(
  subs: PushSub[],
  payload: PushPayload,
  opts: { urgency?: Urgency; topic?: string; ttlSeconds?: number } = {},
): Promise<SendOutcome> {
  const cfg = vapidConfig();
  if (!cfg || !subs.length) return { ok: 0, gone: 0, failed: 0 };
  const ok: string[] = [];
  const gone: string[] = [];
  const failed: string[] = [];
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      if (!isAllowedEndpoint(s.endpoint)) {
        gone.push(s.endpoint);
        return;
      }
      try {
        await withTimeout(
          webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
            TTL: opts.ttlSeconds ?? 6 * 3600,
            urgency: opts.urgency ?? 'normal',
            topic: opts.topic,
            timeout: SEND_TIMEOUT_MS,
          }),
          SEND_TIMEOUT_MS + 1000,
        );
        ok.push(s.endpoint);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
        else failed.push(s.endpoint);
      }
    }),
  );
  try {
    await withSystem(async (sql) => {
      if (ok.length) await sql.query(`update public.push_subscriptions set last_ok_at = now(), failed_count = 0 where endpoint = any($1::text[])`, [ok]);
      if (gone.length) await sql.query(`delete from public.push_subscriptions where endpoint = any($1::text[])`, [gone]);
      if (failed.length) {
        await sql.query(`update public.push_subscriptions set failed_count = failed_count + 1 where endpoint = any($1::text[])`, [failed]);
        await sql.query(`delete from public.push_subscriptions where endpoint = any($1::text[]) and failed_count >= $2`, [failed, MAX_FAILURES]);
      }
    });
  } catch (e) {
    console.warn('[push] bookkeeping failed:', (e as Error).message);
  }
  return { ok: ok.length, gone: gone.length, failed: failed.length };
}

// Phones of people who can still use the app: a person turned off or removed gets nothing,
// even if their phone row is still there.
const LIVE_SUBS = `select s.user_id, s.endpoint, s.p256dh, s.auth from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where s.user_id = any($1::uuid[]) and p.active and p.deleted_at is null`;

type SubRow = PushSub & { user_id: string };
const keys = ({ endpoint, p256dh, auth }: SubRow): PushSub => ({ endpoint, p256dh, auth });

// Text for a grouped push: replaces the earlier one in the tray (same tag) without ringing again.
export function summaryPayload(count: number, latest: { title: string; body: string; url: string }, kind: string): PushPayload {
  if (count < 2) return { ...latest, tag: kind, kind, silent: true };
  return { title: `Tienes ${count} avisos nuevos`, body: `El último: ${latest.title}`.slice(0, 160), url: '/avisos', tag: kind, kind, silent: true };
}

// Push for a notice that was just stored in the app. Respects the per-kind preferences and
// quiet hours (critical kinds ignore both). Critical kinds are never grouped: each one rings and
// stays in the tray (own tag, no push-service topic). Other kinds ring at most once per person
// per kind every GROUP_MINUTES; inside that window the tray entry is quietly updated to
// «Tienes N avisos nuevos», so nothing is lost and the phone does not buzz on every one.
export async function pushNotice(
  recipients: PushRecipient[],
  n: { kind: string; title: string; body?: string; link?: string },
  critical: boolean,
  now = new Date(),
): Promise<void> {
  try {
    if (!recipients.length || !vapidConfig()) return;
    const allowed = recipients.filter((r) => pushDecision(n.kind, r.prefs, critical, now, env.appTz) === 'send').map((r) => r.id);
    if (!allowed.length) return;
    const text = pushText(n.title, n.body);
    const url = safeLink(n.link);

    if (critical) {
      const subs = await withSystem((sql) => sql.query<SubRow>(LIVE_SUBS, [allowed]));
      if (subs.length) await sendToSubscriptions(subs.map(keys), { ...text, url, tag: `${n.kind}-${randomUUID().slice(0, 8)}`, kind: n.kind }, { urgency: 'high' });
      return;
    }

    const plan = await withSystem(async (sql) => {
      const subs = await sql.query<SubRow>(LIVE_SUBS, [allowed]);
      if (!subs.length) return { fresh: [] as SubRow[], grouped: [] as (SubRow & { n: number })[] };
      const claimed = await sql.query<{ user_id: string }>(
        `insert into public.notify_throttle (user_id, kind, sent_at)
         select u, $2::text, now() from unnest($1::uuid[]) as u
         on conflict (user_id, kind) do update set sent_at = excluded.sent_at
           where public.notify_throttle.sent_at < now() - make_interval(mins => $3::int)
         returning user_id`,
        [[...new Set(subs.map((s) => s.user_id))], `push:${n.kind}`, GROUP_MINUTES],
      );
      const fresh = new Set(claimed.map((c) => c.user_id));
      const waiting = [...new Set(subs.filter((s) => !fresh.has(s.user_id)).map((s) => s.user_id))];
      // Unread notices of this kind since the last push that rang (one minute of slack for the
      // notice that caused it, which is stored just before the push goes out).
      const counts = waiting.length
        ? await sql.query<{ user_id: string; n: number }>(
            `select t.user_id, count(x.id)::int as n from public.notify_throttle t
               left join public.notifications x on x.user_id = t.user_id and x.kind = $3 and x.read_at is null
                 and x.created_at >= t.sent_at - interval '1 minute'
              where t.user_id = any($1::uuid[]) and t.kind = $2 group by t.user_id`,
            [waiting, `push:${n.kind}`, n.kind],
          )
        : [];
      const count = new Map(counts.map((c) => [c.user_id, c.n]));
      return {
        fresh: subs.filter((s) => fresh.has(s.user_id)),
        grouped: subs.filter((s) => !fresh.has(s.user_id)).map((s) => ({ ...s, n: count.get(s.user_id) ?? 1 })),
      };
    });

    if (plan.fresh.length) {
      await sendToSubscriptions(plan.fresh.map(keys), { ...text, url, tag: n.kind, kind: n.kind }, { urgency: 'normal', topic: topicFor(n.kind) });
    }
    // One send per distinct count (people with the same count share the text). No topic here, so
    // a quiet summary never replaces an undelivered push that should ring.
    const byCount = new Map<number, PushSub[]>();
    for (const s of plan.grouped) byCount.set(s.n, [...(byCount.get(s.n) ?? []), keys(s)]);
    for (const [c, subs] of byCount) await sendToSubscriptions(subs, summaryPayload(c, { ...text, url }, n.kind), { urgency: 'normal' });
  } catch (e) {
    console.warn('[push] not sent:', (e as Error).message);
  }
}
