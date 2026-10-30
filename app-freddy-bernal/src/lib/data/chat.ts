import 'server-only';
import type { Sql } from '../db';
import type { Session } from '../auth/session';
import { isTeamRole, type Role } from '../roles';
import { CHAT_HIDDEN, knowsAgenda, linkRefs, previewOf } from '../domain/chat';
import { LINK_KIND, chatRoles, firstName, type ChatItem, type ChatLink, type ChatMember, type ReadOnly } from '@/components/chat/chat-core';

// Mensajes as the person reads it: channels and «Todo el equipo» (R5, D-79 to D-88). Every function runs inside
// db(session, sql => …): RLS decides what comes back (the members of each channel with 2FA; the boss because he is a
// member of every channel; never Administración, never 360). Nothing here reads event_schedule, and nothing here is
// ever logged.

type Kind = 'channel' | 'team';
const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
const teamRoles = (roles: readonly string[]): Role[] => roles.filter((r): r is Role => isTeamRole(r));
const NEVER = `'-infinity'::timestamptz`;
export const TEAM_TITLE = 'Todo el equipo';

// ---------------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------------
export type ChatPerson = { id: string; name: string; roles: Role[]; boss: boolean };

/** The people the boss can put in a channel (the active team, never an admin account), bosses included (the screen
 * shows them fixed). Empty for anybody else (chat_people() is the boss's, with 2FA). */
export async function chatPeopleForBoss(sql: Sql): Promise<ChatPerson[]> {
  const rows = await sql.query<{ id: string; full_name: string; roles: string[] }>(
    `select id, full_name, roles::text[] as roles from public.chat_people()`,
  );
  return rows.map((r) => ({ id: r.id, name: r.full_name, roles: teamRoles(r.roles), boss: r.roles.includes('boss') }));
}

type MemberRow = { user_id: string; full_name: string; roles: string[]; active: boolean; current: boolean };
const toMember = (r: MemberRow): ChatMember => {
  const roles = teamRoles(r.roles);
  return { id: r.user_id, name: r.full_name, roles, active: r.active, current: r.current, boss: roles.includes('boss') };
};

// Who is in a channel I can read now (current), and whoever wrote there and is not (to name an old message's author).
// The bosses first, then by name: the screen lists them in this order.
async function membersOf(sql: Sql, id: string): Promise<ChatMember[]> {
  const rows = await sql.query<MemberRow>(
    `select user_id, full_name, roles::text[] as roles, active, current from public.chat_member_list($1)`,
    [id],
  );
  const list = rows.map(toMember);
  return [...list.filter((m) => m.current && m.boss), ...list.filter((m) => !(m.current && m.boss))];
}

// ---------------------------------------------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------------------------------------------
export type ChannelSummary = {
  id: string;
  kind: Kind;
  title: string;
  description: string | null;
  memberCount: number;
  last: { by: string; text: string; at: string; hidden: boolean } | null;
  unread: number;
  muted: boolean;
  archived: boolean;
};

/**
 * My channels (where I am now) and «Todo el equipo» if it exists: «Todo el equipo» first, then by the newest movement;
 * the archived ones apart, for «Archivados». One query: the count of members comes from chat_member_list() inside it.
 */
export async function myChannels(sql: Sql, s: Session): Promise<{ rows: ChannelSummary[]; archived: ChannelSummary[] }> {
  const rows = await sql.query<{
    id: string; kind: Kind; title: string; description: string | null; created_at: Date; archived: boolean; muted: boolean;
    last_author: string | null; last_name: string | null; last_body: string | null; last_at: Date | null;
    hidden_author: string | null; hidden_name: string | null; hidden_at: Date | null; unread: number; members: number;
  }>(
    `select c.id, c.kind, c.title, c.description, c.created_at, c.archived_at is not null as archived,
            coalesce(r.muted, false) as muted,
            lm.author_id as last_author, lm.name as last_name, lm.body as last_body, lm.created_at as last_at,
            hm.author_id as hidden_author, hm.name as hidden_name, hm.created_at as hidden_at,
            (select count(*)::int from public.chat_messages x
              where x.conversation_id = c.id and x.author_id <> auth.uid() and x.created_at > coalesce(r.last_read_at, ${NEVER}))
            + (select count(*)::int from public.chat_hidden_marks(c.id) h
                where h.author_id <> auth.uid() and h.created_at > coalesce(r.last_read_at, ${NEVER})) as unread,
            (select count(*)::int from public.chat_member_list(c.id) l where l.current) as members
       from public.chat_conversations c
       left join public.chat_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
       left join lateral (select x.author_id, x.body, x.created_at,
                                 (select l.full_name from public.chat_member_list(c.id) l where l.user_id = x.author_id) as name
                            from public.chat_messages x
                           where x.conversation_id = c.id order by x.created_at desc, x.id desc limit 1) lm on true
       left join lateral (select h.author_id, h.created_at,
                                 (select l.full_name from public.chat_member_list(c.id) l where l.user_id = h.author_id) as name
                            from public.chat_hidden_marks(c.id) h
                           order by h.created_at desc limit 1) hm on true
      where c.kind = 'team'
         or exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = auth.uid() and m.removed_at is null)`,
  );
  const nameOf = (id: string | null, name: string | null) => (id === s.userId ? 'Tú' : firstName(name ?? 'Alguien'));
  const summaries = rows.map((r): ChannelSummary & { sortAt: number } => {
    const lastVisible = r.last_at ? new Date(r.last_at).getTime() : -Infinity;
    const lastHidden = r.hidden_at ? new Date(r.hidden_at).getTime() : -Infinity;
    const last = lastHidden > lastVisible
      ? { by: nameOf(r.hidden_author, r.hidden_name), text: CHAT_HIDDEN, at: iso(r.hidden_at)!, hidden: true }
      : r.last_at
        ? { by: nameOf(r.last_author, r.last_name), text: previewOf(r.last_body ?? ''), at: iso(r.last_at)!, hidden: false }
        : null;
    return {
      id: r.id,
      kind: r.kind,
      title: r.kind === 'team' ? TEAM_TITLE : r.title,
      description: r.kind === 'team' ? null : r.description,
      memberCount: r.members,
      last,
      unread: r.unread,
      muted: r.muted,
      archived: r.archived,
      sortAt: Math.max(lastVisible, lastHidden, new Date(r.created_at).getTime()),
    };
  });
  summaries.sort((a, b) => (a.kind === 'team' ? -1 : b.kind === 'team' ? 1 : b.sortAt - a.sortAt));
  const out = summaries.map((x) => {
    const { sortAt, ...rest } = x;
    void sortAt;
    return rest;
  });
  return { rows: out.filter((c) => !c.archived), archived: out.filter((c) => c.archived) };
}

/** The id of «Todo el equipo» if it exists already (the database makes it the first time someone opens it). */
export async function teamChannelId(sql: Sql): Promise<string | null> {
  return (await sql.one<{ id: string }>(`select id from public.chat_conversations where kind = 'team'`))?.id ?? null;
}

/** How many of MY channels (where I am now, not archived) have something new from someone else: the envelope at the
 * top. Muted ones do not count. */
export async function unreadChannels(sql: Sql): Promise<number> {
  return (await sql.one<{ n: number }>(
    `select count(*)::int as n from public.chat_conversations c
       left join public.chat_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
      where (c.kind = 'team'
             or exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = auth.uid() and m.removed_at is null))
        and c.archived_at is null
        and not coalesce(r.muted, false)
        and (exists (select 1 from public.chat_messages x
                      where x.conversation_id = c.id and x.author_id <> auth.uid() and x.created_at > coalesce(r.last_read_at, ${NEVER}))
             or exists (select 1 from public.chat_hidden_marks(c.id) h
                         where h.author_id <> auth.uid() and h.created_at > coalesce(r.last_read_at, ${NEVER})))`,
  ))?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------
// One channel
// ---------------------------------------------------------------------------------------------------------------
export const CHAT_PAGE = 50;
export const CHAT_MAX_PAGE = 1000;

export type Channel = {
  id: string;
  kind: Kind;
  title: string;
  description: string | null;
  // Who is in it now, the bosses first.
  members: ChatMember[];
  onlyBoss: boolean;
  archived: boolean;
  muted: boolean;
  readOnly: ReadOnly | null;
  // Redes or política read it (chat_hides_agenda_for_me): the composer checks before sending.
  hidesAgenda: boolean;
  // The note «Aquí está Redes o política…»: only to who knows the agenda, only here (U13).
  agendaNote: boolean;
  items: ChatItem[];
  more: boolean;
  firstUnreadId: string | null;
  lastReadAt: string | null;
};

type MsgRow = { id: string; author_id: string; body: string; created_at: Date };
type MarkRow = { id: string; author_id: string; created_at: Date };

// The messages and the hidden marks in time order, each with its author as the reader names them and its links.
async function toItems(sql: Sql, msgs: MsgRow[], marks: MarkRow[], everyone: ChatMember[], me: string): Promise<ChatItem[]> {
  const byId = new Map(everyone.map((m) => [m.id, m]));
  const author = (id: string) => {
    const m = byId.get(id);
    return { author: id === me ? 'Tú' : m?.name ?? 'Alguien del equipo', role: m ? chatRoles(m.roles) : '' };
  };
  const links = await linkTitles(sql, msgs.flatMap((m) => linkRefs(m.body)));
  const items: ChatItem[] = [
    ...msgs.map((m) => ({
      id: m.id, authorId: m.author_id, ...author(m.author_id), body: m.body, createdAt: iso(m.created_at)!,
      links: linkRefs(m.body).map((r) => links.get(r.href)!),
    })),
    ...marks.map((h) => ({ id: h.id, authorId: h.author_id, ...author(h.author_id), body: null, createdAt: iso(h.created_at)!, links: [] })),
  ];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
}

/** Why there is no box, from what the database answered (chat_may_post) and the channel. */
export function readOnlyOf(c: { canPost: boolean; archived: boolean; onlyBoss: boolean }, roles: readonly Role[]): ReadOnly | null {
  if (c.canPost) return null;
  if (c.archived) return { reason: 'archived' };
  if (c.onlyBoss && !roles.includes('boss')) return { reason: 'only-boss' };
  return { reason: 'closed' };
}

/**
 * A channel I can read (null: it does not exist, or RLS says no: I am not in it), with its last `limit` messages and
 * the hidden marks among them, who is in it and whether I can write. `limit` grows with «Ver anteriores».
 */
export async function channel(sql: Sql, s: Session, id: string, limit = CHAT_PAGE): Promise<Channel | null> {
  const c = await sql.one<{
    id: string; kind: Kind; title: string; description: string | null; only_boss_posts: boolean; archived: boolean;
    can_post: boolean; hides: boolean; last_read_at: Date | null; muted: boolean;
  }>(
    `select c.id, c.kind, c.title, c.description, c.only_boss_posts, c.archived_at is not null as archived,
            public.chat_may_post(c.id) as can_post, public.chat_hides_agenda_for_me(c.id) as hides,
            r.last_read_at, coalesce(r.muted, false) as muted
       from public.chat_conversations c
       left join public.chat_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
      where c.id = $1`,
    [id],
  );
  if (!c) return null;
  const n = Math.min(Math.max(limit, CHAT_PAGE), CHAT_MAX_PAGE);
  const everyone = await membersOf(sql, id);
  const rows = await sql.query<MsgRow>(
    `select id, author_id, body, created_at from public.chat_messages where conversation_id = $1 order by created_at desc, id desc limit $2`,
    [id, n + 1],
  );
  const more = rows.length > n;
  const msgs = rows.slice(0, n).reverse();
  const oldest = more ? msgs[0]?.created_at : null;
  const marks = (await sql.query<MarkRow>(`select id, author_id, created_at from public.chat_hidden_marks($1)`, [id])).filter(
    (h) => !oldest || new Date(h.created_at) >= new Date(oldest),
  );
  const items = await toItems(sql, msgs, marks, everyone, s.userId);
  const lastRead = c.last_read_at ? new Date(c.last_read_at).toISOString() : null;
  const firstUnread = items.find((it) => it.authorId !== s.userId && (!lastRead || it.createdAt > lastRead));
  return {
    id: c.id,
    kind: c.kind,
    title: c.kind === 'team' ? TEAM_TITLE : c.title,
    description: c.kind === 'team' ? null : c.description,
    members: everyone.filter((m) => m.current),
    onlyBoss: c.only_boss_posts,
    archived: c.archived,
    muted: c.muted,
    readOnly: readOnlyOf({ canPost: c.can_post, archived: c.archived, onlyBoss: c.only_boss_posts }, s.roles),
    hidesAgenda: c.hides,
    agendaNote: c.hides && knowsAgenda(s.roles),
    items,
    more,
    firstUnreadId: firstUnread?.id ?? null,
    lastReadAt: lastRead,
  };
}

// A message created a moment before another can be saved a moment after it: the loop asks again for this overlap and
// the phone drops what it already has (by id).
export const SINCE_OVERLAP_S = 30;

/**
 * What is new in a channel I can read since `after` (with SINCE_OVERLAP_S of overlap), in time order: messages and
 * hidden marks. Without `after`, the last CHAT_PAGE. null: I cannot read it (not in it, or taken out meanwhile).
 */
export async function messagesSince(sql: Sql, s: Session, id: string, after: { at: string; id: string } | null): Promise<ChatItem[] | null> {
  const c = await sql.one<{ kind: Kind }>(`select kind from public.chat_conversations where id = $1`, [id]);
  if (!c) return null;
  const msgs = after
    ? await sql.query<MsgRow>(
        `select id, author_id, body, created_at from public.chat_messages
          where conversation_id = $1 and created_at > $2::timestamptz - make_interval(secs => $3::int)
          order by created_at, id limit 200`,
        [id, after.at, SINCE_OVERLAP_S],
      )
    : (await sql.query<MsgRow>(
        `select id, author_id, body, created_at from public.chat_messages where conversation_id = $1 order by created_at desc, id desc limit $2`,
        [id, CHAT_PAGE],
      )).reverse();
  const from = after ? new Date(after.at).getTime() - SINCE_OVERLAP_S * 1000 : -Infinity;
  const marks = (await sql.query<MarkRow>(`select id, author_id, created_at from public.chat_hidden_marks($1)`, [id])).filter(
    (h) => new Date(h.created_at).getTime() > from,
  );
  if (!msgs.length && !marks.length) return [];
  return toItems(sql, msgs, marks, await membersOf(sql, id), s.userId);
}

// ---------------------------------------------------------------------------------------------------------------
// The boss's editor
// ---------------------------------------------------------------------------------------------------------------
export type ChannelEditor = {
  id: string;
  title: string;
  description: string | null;
  archived: boolean;
  people: ChatPerson[];
  // Who is in it now (ids), bosses included.
  members: string[];
};

/** A channel for «Editar canal» (the boss with 2FA): null if it does not exist, is «Todo el equipo» or RLS says no. */
export async function channelEditor(sql: Sql, id: string): Promise<ChannelEditor | null> {
  const c = await sql.one<{ id: string; kind: Kind; title: string; description: string | null; archived: boolean }>(
    `select id, kind, title, description, archived_at is not null as archived from public.chat_conversations where id = $1`,
    [id],
  );
  if (!c || c.kind !== 'channel') return null;
  const members = (await membersOf(sql, id)).filter((m) => m.current).map((m) => m.id);
  return { id: c.id, title: c.title, description: c.description, archived: c.archived, people: await chatPeopleForBoss(sql), members };
}

// ---------------------------------------------------------------------------------------------------------------
// Links to the platform (D-54): the title the READER sees, or null («Algo que no puedes abrir»)
// ---------------------------------------------------------------------------------------------------------------
/** Each reference's title as RLS gives it to the person who reads (never event_schedule: titles carry no date). */
export async function linkTitles(sql: Sql, refs: { kind: string; id: string; href: string }[]): Promise<Map<string, ChatLink>> {
  const out = new Map<string, ChatLink>();
  if (!refs.length) return out;
  const ids = (kind: string) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
  const titles = new Map<string, string>();
  const read = async (kind: string, q: string) => {
    const list = ids(kind);
    if (!list.length) return;
    for (const r of await sql.query<{ id: string; title: string | null }>(q, [list])) if (r.title) titles.set(`${kind}:${r.id}`, r.title);
  };
  // A cancelled event keeps its link, said as such.
  await read('event', `select id, case when cancelled_at is null then title else title || ' (cancelado)' end as title
                         from public.events where id = any($1::uuid[]) and deleted_at is null`);
  await read('piece', `select id, title from public.pieces where id = any($1::uuid[]) and deleted_at is null`);
  // The obra roles read the row; Redes and Grabación only while a live visit links to it (visit_obra_ficha).
  await read('obra', `select x.id, coalesce(f.name, v.name) as title from unnest($1::uuid[]) as x(id)
                        left join public.obra_fichas f on f.id = x.id and f.deleted_at is null
                        left join lateral public.visit_obra_ficha(x.id) v on f.id is null`);
  await read('report', `select id, title from public.community_reports where id = any($1::uuid[]) and deleted_at is null`);
  await read('publication', `select p.id, pc.title from public.publications p join public.pieces pc on pc.id = p.piece_id
                              where p.id = any($1::uuid[]) and p.deleted_at is null`);
  await read('tweets', `select id, coalesce(nullif(btrim(title), ''), 'Tanda de tweets') as title from public.tweet_batches
                         where id = any($1::uuid[]) and deleted_at is null`);
  // Only the channels the reader is in (RLS).
  await read('chat', `select id, case kind when 'team' then '${TEAM_TITLE}' else title end as title
                        from public.chat_conversations where id = any($1::uuid[])`);
  for (const r of refs) out.set(r.href, { href: r.href, kind: LINK_KIND[r.kind] ?? '', title: titles.get(`${r.kind}:${r.id}`) ?? null });
  return out;
}
