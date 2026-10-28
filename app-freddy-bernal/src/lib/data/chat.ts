import 'server-only';
import type { Sql } from '../db';
import type { Session } from '../auth/session';
import { isTeamRole, type Role } from '../roles';
import { CHAT_HIDDEN, CHAT_ROLE_PAIRS, CHAT_ROLE_NAME, knowsAgenda, linkRefs, pairAllowed, previewOf, type ChatPairRole, type ChatRule } from '../domain/chat';
import { LINK_KIND, chatRoles, firstName, type ChatItem, type ChatLink, type ChatMember, type ReadOnly } from '@/components/chat/chat-core';

// Mensajes as the person reads it (R3, design §4.2). Every function runs inside db(session, sql => …): RLS decides
// what comes back (members with 2FA, the boss with 2FA; never Administración, never 360). Nothing here reads
// event_schedule, and nothing here is ever logged.

type Kind = 'direct' | 'group' | 'team';
const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
const teamRoles = (roles: readonly string[]): Role[] => roles.filter((r): r is Role => isTeamRole(r));
const NEVER = `'-infinity'::timestamptz`;

// ---------------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------------
export type ChatPerson = { id: string; name: string; roles: Role[]; canWrite: boolean };

/** «Escribirle a alguien»: the active people of the team (never an admin account), and whether I may write to them now. */
export async function chatPeople(sql: Sql): Promise<ChatPerson[]> {
  const rows = await sql.query<{ id: string; full_name: string; roles: string[]; can_write: boolean }>(
    `select id, full_name, roles::text[] as roles, can_write from public.chat_people()`,
  );
  return rows.map((r) => ({ id: r.id, name: r.full_name, roles: teamRoles(r.roles), canWrite: r.can_write }));
}

/** Whether I accepted «Lo lee el jefe» (D-59). */
export async function noticeAccepted(sql: Sql): Promise<boolean> {
  return !!(await sql.one<{ ok: boolean }>(`select exists (select 1 from public.chat_notice_ack where user_id = auth.uid()) as ok`))?.ok;
}

// The members of conversations I can read, by conversation (direct and group; «Todo el equipo» has no rows).
async function membersOf(sql: Sql, ids: string[]): Promise<Map<string, ChatMember[]>> {
  const out = new Map<string, ChatMember[]>();
  if (!ids.length) return out;
  const rows = await sql.query<{ conversation_id: string; user_id: string; full_name: string; roles: string[]; active: boolean }>(
    `select c.id as conversation_id, l.user_id, l.full_name, l.roles::text[] as roles, l.active
       from unnest($1::uuid[]) as c(id) cross join lateral public.chat_member_list(c.id) l`,
    [ids],
  );
  for (const r of rows) {
    const list = out.get(r.conversation_id) ?? [];
    list.push({ id: r.user_id, name: r.full_name, roles: teamRoles(r.roles), active: r.active });
    out.set(r.conversation_id, list);
  }
  return out;
}

// Everybody of «Todo el equipo»: the active team and me.
async function teamMembers(sql: Sql, s: Session): Promise<ChatMember[]> {
  const people = await chatPeople(sql);
  return [{ id: s.userId, name: s.name, roles: teamRoles(s.roles), active: true }, ...people.map((p) => ({ id: p.id, name: p.name, roles: p.roles, active: true }))];
}

// ---------------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------------
export type ConversationSummary = {
  id: string;
  kind: Kind;
  title: string;
  // The other person's roles (direct) or nothing.
  roles: string;
  memberCount: number;
  last: { by: string; text: string; at: string; hidden: boolean } | null;
  unread: number;
  muted: boolean;
};

const titleOf = (kind: Kind, title: string | null, members: ChatMember[], me: string): string => {
  if (kind === 'team') return 'Todo el equipo';
  if (kind === 'group') return title ?? 'Grupo';
  const others = members.filter((m) => m.id !== me);
  if (others.length === 1) return others[0].name;
  return members.map((m) => firstName(m.name)).join(' y ');
};

/**
 * My conversations (member, and «Todo el equipo» if it exists), newest first, «Todo el equipo» on top. The seeded
 * directs that have no message yet stay out (D-57). The boss's list has his own only: the others are in «Todas».
 */
export async function myConversations(sql: Sql, s: Session): Promise<ConversationSummary[]> {
  const rows = await sql.query<{
    id: string; kind: Kind; title: string | null; created_at: Date; muted: boolean;
    last_author: string | null; last_body: string | null; last_at: Date | null;
    hidden_author: string | null; hidden_at: Date | null; unread: number;
  }>(
    `select c.id, c.kind, c.title, c.created_at, coalesce(r.muted, false) as muted,
            lm.author_id as last_author, lm.body as last_body, lm.created_at as last_at,
            hm.author_id as hidden_author, hm.created_at as hidden_at,
            (select count(*)::int from public.chat_messages x
              where x.conversation_id = c.id and x.author_id <> auth.uid() and x.created_at > coalesce(r.last_read_at, ${NEVER}))
            + (select count(*)::int from public.chat_hidden_marks(c.id) h
                where h.author_id <> auth.uid() and h.created_at > coalesce(r.last_read_at, ${NEVER})) as unread
       from public.chat_conversations c
       left join public.chat_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
       left join lateral (select x.author_id, x.body, x.created_at from public.chat_messages x
                           where x.conversation_id = c.id order by x.created_at desc, x.id desc limit 1) lm on true
       left join lateral (select h.author_id, h.created_at from public.chat_hidden_marks(c.id) h
                           order by h.created_at desc limit 1) hm on true
      where c.kind = 'team' or exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = auth.uid())`,
  );
  const shown = rows.filter((r) => r.kind !== 'direct' || r.last_at || r.hidden_at);
  const members = await membersOf(sql, shown.filter((r) => r.kind !== 'team').map((r) => r.id));
  const team = shown.some((r) => r.kind === 'team') ? await teamMembers(sql, s) : [];
  const nameOf = (list: ChatMember[], id: string | null) => (id === s.userId ? 'Tú' : firstName(list.find((m) => m.id === id)?.name ?? 'Alguien'));
  const summaries = shown.map((r): ConversationSummary & { sortAt: number } => {
    const list = r.kind === 'team' ? team : members.get(r.id) ?? [];
    const lastVisible = r.last_at ? new Date(r.last_at).getTime() : -Infinity;
    const lastHidden = r.hidden_at ? new Date(r.hidden_at).getTime() : -Infinity;
    const last = lastHidden > lastVisible
      ? { by: nameOf(list, r.hidden_author), text: CHAT_HIDDEN, at: iso(r.hidden_at)!, hidden: true }
      : r.last_at
        ? { by: nameOf(list, r.last_author), text: previewOf(r.last_body ?? ''), at: iso(r.last_at)!, hidden: false }
        : null;
    const other = r.kind === 'direct' ? list.find((m) => m.id !== s.userId) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      title: titleOf(r.kind, r.title, list, s.userId),
      roles: other ? chatRoles(other.roles) : '',
      memberCount: list.length,
      last,
      unread: r.unread,
      muted: r.muted,
      sortAt: Math.max(lastVisible, lastHidden, new Date(r.created_at).getTime()),
    };
  });
  summaries.sort((a, b) => (a.kind === 'team' ? -1 : b.kind === 'team' ? 1 : b.sortAt - a.sortAt));
  return summaries.map((x) => {
    const { sortAt, ...rest } = x;
    void sortAt;
    return rest;
  });
}

/** The id of «Todo el equipo» if it exists already (the database makes it the first time someone opens it). */
export async function teamChannelId(sql: Sql): Promise<string | null> {
  return (await sql.one<{ id: string }>(`select id from public.chat_conversations where kind = 'team'`))?.id ?? null;
}

export const ALL_PAGE = 30;
export type BossRow = { id: string; kind: Kind; title: string; members: { name: string; roles: string }[]; lastAt: string | null; count: number; mine: boolean };

/** «Todas» for the boss with 2FA (RLS gives him every conversation): the newest movement first, ALL_PAGE a page. The
 * directs that never had a message stay out. Reading here marks nothing as read. */
export async function allConversations(sql: Sql, s: Session, page = 0): Promise<{ rows: BossRow[]; more: boolean }> {
  const rows = await sql.query<{ id: string; kind: Kind; title: string | null; last_at: Date | null; n: number; member: boolean }>(
    `select c.id, c.kind, c.title, a.last_at, a.n, public.chat_is_member(c.id) as member
       from public.chat_conversations c
       cross join lateral (select max(x.created_at) as last_at, count(*)::int as n
                             from public.chat_messages x where x.conversation_id = c.id) a
      where c.kind <> 'direct' or a.n > 0
      order by coalesce(a.last_at, c.created_at) desc, c.id desc
      limit $1 offset $2`,
    [ALL_PAGE + 1, page * ALL_PAGE],
  );
  const more = rows.length > ALL_PAGE;
  const list = rows.slice(0, ALL_PAGE);
  const members = await membersOf(sql, list.filter((r) => r.kind !== 'team').map((r) => r.id));
  return {
    more,
    rows: list.map((r) => {
      const m = r.kind === 'team' ? [] : members.get(r.id) ?? [];
      return {
        id: r.id,
        kind: r.kind,
        title: r.kind === 'direct' ? m.map((x) => firstName(x.name)).join(' y ') : titleOf(r.kind, r.title, m, s.userId),
        members: m.map((x) => ({ name: x.name, roles: chatRoles(x.roles) })),
        lastAt: iso(r.last_at),
        count: r.n,
        mine: r.member,
      };
    }),
  };
}

/** How many of MY conversations have something new from someone else (the envelope at the top). Muted ones do not
 * count; the boss does not count the conversations he only reads. */
export async function unreadConversations(sql: Sql): Promise<number> {
  return (await sql.one<{ n: number }>(
    `select count(*)::int as n from public.chat_conversations c
       left join public.chat_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
      where (c.kind = 'team' or exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
        and not coalesce(r.muted, false)
        and (exists (select 1 from public.chat_messages x
                      where x.conversation_id = c.id and x.author_id <> auth.uid() and x.created_at > coalesce(r.last_read_at, ${NEVER}))
             or exists (select 1 from public.chat_hidden_marks(c.id) h
                         where h.author_id <> auth.uid() and h.created_at > coalesce(r.last_read_at, ${NEVER})))`,
  ))?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------
// One conversation
// ---------------------------------------------------------------------------------------------------------------
export const CHAT_PAGE = 50;
export const CHAT_MAX_PAGE = 1000;

export type Conversation = {
  id: string;
  kind: Kind;
  title: string;
  members: ChatMember[];
  onlyBoss: boolean;
  isMember: boolean;
  muted: boolean;
  acked: boolean;
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
async function toItems(sql: Sql, msgs: MsgRow[], marks: MarkRow[], members: ChatMember[], me: string): Promise<ChatItem[]> {
  const byId = new Map(members.map((m) => [m.id, m]));
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

// Why I cannot write here, from what the database answered (chat_may_post) and the rules I can read.
async function readOnlyOf(sql: Sql, s: Session, c: { kind: Kind; member: boolean; canPost: boolean; acked: boolean; onlyBoss: boolean }, members: ChatMember[]): Promise<ReadOnly | null> {
  if (!c.member) return { reason: 'boss-reader' };
  if (c.canPost) return null;
  if (!c.acked) return { reason: 'needs-ack' };
  if (c.onlyBoss && !s.roles.includes('boss')) return { reason: 'only-boss' };
  if (c.kind === 'team') return { reason: 'closed' };
  const others = members.filter((m) => m.id !== s.userId && m.active && m.roles.length);
  if (!others.length) return { reason: 'nobody-left' };
  const rules = await sql.query<ChatRule>(`select role_a::text as "roleA", role_b::text as "roleB", allowed from public.chat_rules`);
  const mine = teamRoles(s.roles);
  for (const o of others) {
    if (pairAllowed(mine, o.roles, rules)) continue;
    for (const a of mine) {
      for (const b of o.roles) {
        if (!pairAllowed([a], [b], rules)) return { reason: 'pair-closed', pair: [CHAT_ROLE_NAME[a as ChatPairRole] ?? a, CHAT_ROLE_NAME[b as ChatPairRole] ?? b] };
      }
    }
  }
  return { reason: 'closed' };
}

/**
 * A conversation I can read (null: it does not exist, or RLS says no), with its last `limit` messages and the hidden
 * marks among them, who is in it and whether I can write. `limit` grows with «Ver anteriores».
 */
export async function conversation(sql: Sql, s: Session, id: string, limit = CHAT_PAGE): Promise<Conversation | null> {
  const c = await sql.one<{
    id: string; kind: Kind; title: string | null; only_boss_posts: boolean; member: boolean; can_post: boolean;
    hides: boolean; acked: boolean; last_read_at: Date | null; muted: boolean;
  }>(
    `select c.id, c.kind, c.title, c.only_boss_posts, public.chat_is_member(c.id) as member,
            public.chat_may_post(c.id) as can_post, public.chat_hides_agenda_for_me(c.id) as hides,
            exists (select 1 from public.chat_notice_ack n where n.user_id = auth.uid()) as acked,
            r.last_read_at, coalesce(r.muted, false) as muted
       from public.chat_conversations c
       left join public.chat_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
      where c.id = $1`,
    [id],
  );
  if (!c) return null;
  const n = Math.min(Math.max(limit, CHAT_PAGE), CHAT_MAX_PAGE);
  const members = c.kind === 'team' ? await teamMembers(sql, s) : (await membersOf(sql, [id])).get(id) ?? [];
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
  const items = await toItems(sql, msgs, marks, members, s.userId);
  const lastRead = c.last_read_at ? new Date(c.last_read_at).toISOString() : null;
  const firstUnread = c.member ? items.find((it) => it.authorId !== s.userId && (!lastRead || it.createdAt > lastRead)) : undefined;
  return {
    id: c.id,
    kind: c.kind,
    title: titleOf(c.kind, c.title, members, s.userId),
    members,
    onlyBoss: c.only_boss_posts,
    isMember: c.member,
    muted: c.muted,
    acked: c.acked,
    readOnly: await readOnlyOf(sql, s, { kind: c.kind, member: c.member, canPost: c.can_post, acked: c.acked, onlyBoss: c.only_boss_posts }, members),
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
 * What is new in a conversation I can read since `after` (with SINCE_OVERLAP_S of overlap), in time order: messages
 * and hidden marks. Without `after`, the last CHAT_PAGE. null: I cannot read it.
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
  const members = c.kind === 'team' ? await teamMembers(sql, s) : (await membersOf(sql, [id])).get(id) ?? [];
  return toItems(sql, msgs, marks, members, s.userId);
}

// ---------------------------------------------------------------------------------------------------------------
// «Quién habla con quién» (the boss)
// ---------------------------------------------------------------------------------------------------------------
export type RulePair = { roleA: ChatPairRole; roleB: ChatPairRole; label: string; allowed: boolean; namesA: string[]; namesB: string[] };

/** The 10 pairs with their state and who is in each role now; and «Todo el equipo» (if it exists). */
export async function chatRules(sql: Sql): Promise<{ pairs: RulePair[]; team: { id: string; onlyBoss: boolean } | null }> {
  const rules = await sql.query<{ a: string; b: string; allowed: boolean }>(`select role_a::text as a, role_b::text as b, allowed from public.chat_rules`);
  const people = await chatPeople(sql);
  const names = (r: ChatPairRole) => people.filter((p) => p.roles.includes(r)).map((p) => firstName(p.name));
  const team = await sql.one<{ id: string; only_boss_posts: boolean }>(`select id, only_boss_posts from public.chat_conversations where kind = 'team'`);
  return {
    pairs: CHAT_ROLE_PAIRS.map((p) => ({
      ...p,
      allowed: !rules.some((r) => r.a === p.roleA && r.b === p.roleB && !r.allowed),
      namesA: names(p.roleA),
      namesB: names(p.roleB),
    })),
    team: team ? { id: team.id, onlyBoss: team.only_boss_posts } : null,
  };
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
  await read('chat', `select id, case kind when 'team' then 'Todo el equipo' when 'group' then title else 'Una conversación' end as title
                        from public.chat_conversations where id = any($1::uuid[])`);
  for (const r of refs) out.set(r.href, { href: r.href, kind: LINK_KIND[r.kind] ?? '', title: titles.get(`${r.kind}:${r.id}`) ?? null });
  return out;
}
