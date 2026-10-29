-- Mensajes, the team's internal network (R3, 28/10/2026, D-49 to D-57 and D-59). Nothing here edits an earlier file.
--
--   * Three kinds of conversation: direct (two people, one per pair), group (3 to 12 people, with a name) and «Todo el
--     equipo» (one, every active team member is in it). Members are fixed when it is made; nobody is added later.
--   * Who reads (D-50): each member reads their conversations (with 2FA when their role asks for it) and the boss with
--     2FA reads all of them. Administración has no branch here (no is_staff(), no has_role('admin')): an account that
--     has admin is not of the team for Mensajes even with a team role (D-49). 360 never reads them: whatever 360 runs
--     carries app.caller = 'assistant' and every chat function says no (chat_by_assistant()).
--   * Who talks to whom (D-51): the boss, with 2FA, closes or opens a pair of different roles in chat_rules (no row =
--     allowed). Everyone can always write to the boss and the boss to everyone. With two roles the most restrictive rule
--     wins. «Todo el equipo» does not follow the pairs; the boss can make it «Solo el jefe escribe».
--   * The agenda (D-52 with the integrator's amendment E1): in a conversation where Redes or política are (any member
--     row, active or not, any of their roles) or in «Todo el equipo», a message from someone who KNOWS the agenda (boss,
--     despacho, IVT, Grabación or admin, from user_roles) is refused when it has a CONCRETE date or time or a map:
--     text_has_concrete_datetime() (clock times, calendar dates) or chat_has_map() (map links, coordinates). Relative
--     words («hoy», «mañana», «el lunes», «esta tarde») pass: the app asks before sending. Each message keeps
--     agenda_clear (false when its author knows the agenda and it had a concrete date, time or map: that happens in a
--     conversation without Redes or política), and a message without it is read only by the boss with 2FA or by who has
--     boss, despacho, IVT or Grabación and neither Redes nor política (S3); the others see where it is
--     (chat_hidden_marks), never its text. To go back to the strict rule: text_has_datetime() in place of
--     text_has_concrete_datetime() in chat_message_guard() (and drop the composer's question).
--     Before the checks only the exact in-app reference /<section>/<uuid> and the number of an X post are taken out;
--     Grabación alone (without boss, despacho, IVT or admin) also has its bare video time codes («en el 2:15») taken
--     out, unless the message also has a relative day («mañana 7:00 salimos»: then the time code is an hour).
--     text_has_concrete_datetime(), chat_strip_refs(), chat_has_map() and chat_strip_timecodes() have exact copies in
--     src/lib/domain/chat.ts, compared on the cases of tests/unit/fixtures/chat-text-cases.ts and on generated texts
--     (tests/rls/chat.test.ts): a change to one is a change to the other, with a new migration.
--   * A group's name (no agenda_clear, everyone in it reads it): never a phone, a date, a time or a map (strict).
--   * Phones (D-53): never, in any conversation, from anyone (text_has_phone(), the same rule as phonesIn()).
--   * What is written stays (D-54): messages, members and the accepted notice are append-only, for the system too
--     (TRUNCATE). The audit keeps which table, which row, who and when: never a text, a group's name or the members.
--   * The notice (D-59): a person writes only after accepting it once (chat_notice_ack).
-- No enum values, no rows, nothing reads event_schedule, nothing new in the Realtime publication (D-56: the app asks
-- for what is new). 360 does not use these tables (tests/unit/chat-isolation.test.ts).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Who is of the team for Mensajes, who knows the agenda, and whether 360 is asking
-- ---------------------------------------------------------------------------------------------------------------
create function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(array['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social']::public.app_role[])
     and not public.has_role('admin')
$$;

-- Internal: the team roles of an ACTIVE person who is not an admin account (empty otherwise). Never for the API.
create function public.chat_team_roles(u uuid)
returns public.app_role[] language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.user_roles a where a.user_id = u and a.role = 'admin') then '{}'::public.app_role[]
         else (select coalesce(array_agg(ur.role order by ur.role), '{}')
                 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                where ur.user_id = u and p.active and p.deleted_at is null
                  and ur.role = any (array['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social']::public.app_role[]))
         end
$$;

-- Internal: whether the author of a message KNOWS the agenda (the write rule): boss, despacho, IVT, Grabación or
-- admin, from user_roles, active or not (S4).
create function public.chat_author_knows_agenda(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur
                  where ur.user_id = u and ur.role::text in ('boss', 'dispatch', 'ivt', 'camera', 'admin'))
$$;

-- Internal: Grabación and none of the roles that know the whole agenda: only then are bare video time codes taken out.
create function public.chat_author_camera_only(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = u and ur.role::text = 'camera')
     and not exists (select 1 from public.user_roles ur where ur.user_id = u and ur.role::text in ('boss', 'dispatch', 'ivt', 'admin'))
$$;

-- For the read policy: may I read a message that had a date of the agenda? Boss, despacho, IVT or Grabación, and NOT
-- Redes or política (a person with política + IVT does not, S3). The boss also passes by can_approve() in the policy.
create function public.chat_reader_knows_agenda()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                  where ur.user_id = auth.uid() and p.active and p.deleted_at is null
                    and ur.role::text in ('boss', 'dispatch', 'ivt', 'camera'))
     and not exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role::text in ('politics', 'social'))
$$;

-- 360 runs its database work with set_config('app.caller', 'assistant', true). A person setting it only blocks
-- themselves.
create function public.chat_by_assistant()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.caller', true), '') = 'assistant'
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The text rules (pure; exact copies in src/lib/domain/chat.ts)
-- ---------------------------------------------------------------------------------------------------------------
-- A CONCRETE date or time (E1): the patterns of text_has_datetime() (datetime_patterns(),
-- 20261028002100_privacy_hardening.sql) without the 2nd (a phone: text_has_phone() checks those, for everyone), the
-- 15th (weekdays and relative days: «hoy», «mañana», «esta tarde») and the 14th, of which only «mediodía» and
-- «medianoche» stay («de la tarde» alone says no hour), and a weekday followed by a day number stays: «el sábado 24»,
-- «domingo 3» (the 4th only knows «sáb 24»). After NFKC, as text_has_phone() (full-width digits are digits).
-- «Barrio 23 de Enero» is still a date, and so is «el lunes 3 piezas»: false positives accepted.
create function public.text_has_concrete_datetime(p text)
returns boolean language sql immutable parallel safe set search_path = '' as $fn$
  select coalesce(p, '') <> '' and exists (
    select 1
      from (select x.re from unnest(public.datetime_patterns()) with ordinality as x(re, n) where x.n not in (2, 14, 15)
            union all
            select '(?<![a-záéíóúüñ])(?:mediod[ií]a|medianoche)(?![a-záéíóúüñ])'
            union all
            -- JavaScript's \s, as in chat_has_map()
            select '(?<![a-záéíóúüñ])(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?'
                   '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+'
                   '(?:de[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+)?[0-9]{1,2}(?![a-z0-9_])') c(re)
     where translate(normalize(p, NFKC), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑ', 'abcdefghijklmnopqrstuvwxyzáéíóúüñ') ~ c.re)
$fn$;

-- What is taken out BEFORE the checks (S2): only the exact in-app reference /<section>/<uuid> (with an optional
-- ?key=value of letters), and the number of an X post (/status/<15 to 20 digits> after x.com/<account> or
-- twitter.com/<account>, not inside another domain): the account name stays and is checked, and a number short enough
-- to be a phone is not an X post. Everything else, outside links included, is checked as text.
create function public.chat_strip_refs(p text)
returns text language sql immutable parallel safe set search_path = '' as $fn$
  select regexp_replace(
           regexp_replace(coalesce(p, ''),
             '/(?:eventos|piezas|aprobar|obras|reportes|publicar|tweets|mensajes)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\?[a-z]+=[a-z]+(?:&[a-z]+=[a-z]+)*)?',
             ' ', 'gi'),
           '(?<![a-z0-9-])((?:x|twitter)\.com/[a-z0-9_]{1,15})/status/[0-9]{15,20}', '\1 ', 'gi')
$fn$;

-- A map link, coordinates or a plus code count as the agenda (the exact place). After NFKC.
create function public.chat_has_map(p text)
returns boolean language plpgsql immutable parallel safe set search_path = '' as $fn$
declare
  t text := normalize(coalesce(p, ''), NFKC);
  -- JavaScript's \s
  sp constant text := '[\t\n\v\f\r    -     　﻿]';
begin
  return t ~* '(?:maps\.google\.|google\.[a-z.]{2,6}/maps|goo\.gl/maps|maps\.app\.goo\.gl|waze\.com|maps\.apple\.com|openstreetmap\.org|(?<![a-z0-9_])geo:)'
      or t ~ ('-?[0-9]{1,2}\.[0-9]{3,}' || sp || '*,' || sp || '*-?[0-9]{1,3}\.[0-9]{3,}')
      or t ~ ('[0-9]{1,3}' || sp || '*°' || sp || '*[0-9]{1,2}' || sp || '*[''′’]')
      or t ~* '(?<![a-z0-9])[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,3}(?![a-z0-9])';
end $fn$;

-- Grabación only: bare video time codes («en el 2:15», «del 2:15 al 3:40») out; «a las 2:15», «tipo 2:15»,
-- «2:15 pm», «2:15 h», «2:15 de la tarde», «2:15 del día» stay (and are refused). Letters written out in both cases
-- (Latin-1), so the database's locale does not change what a word is.
create function public.chat_strip_timecodes(p text)
returns text language plpgsql immutable parallel safe set search_path = '' as $fn$
declare
  re text := '(?<!(?<![{w}])(?:a|las?|desde|hasta|para|tipo){sp}{1,3})(?<![{w}])[0-9]{1,2}:[0-9]{2}(?![{w}])'
          || '(?!{sp}*(?:[ap]\.?{sp}?m\.?(?![{w}])|h(?:s|rs?|oras?)?(?![{w}]))'
          || '|{sp}+de(?:{sp}+la)?{sp}+(?:ma[ñÑ]ana|tarde|noche|madrugada)(?![{w}])'
          || '|{sp}+del?{sp}+d[iíÍ]a(?![{w}]))';
begin
  re := replace(replace(re, '{sp}', '[\t\n\v\f\r    -     　﻿]'),
                '{w}', 'A-Za-z0-9_À-ÖØ-öø-ÿ');
  return regexp_replace(coalesce(p, ''), re, ' ', 'gi');
end $fn$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------------------------------------------
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group', 'team')),
  title text,                                   -- group / team only; never in <title> nor in a notice
  direct_key text unique,                       -- 'least_uuid:greatest_uuid' for a direct: one per pair
  only_boss_posts boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint chat_conv_shape check (
    (kind = 'direct' and direct_key is not null and title is null and not only_boss_posts)
    or (kind in ('group', 'team') and direct_key is null and title is not null)),
  constraint chat_conv_title_len check (title is null or char_length(btrim(title)) between 1 and 60),
  constraint chat_conv_title_no_phone check (title is null or not public.text_has_phone(title))
);
create unique index chat_one_team_channel on public.chat_conversations ((true)) where kind = 'team';

create table public.chat_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id),
  user_id uuid not null references public.profiles (id),
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id, conversation_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),  -- the app sends its own uuid (clientId): a retried send never duplicates
  conversation_id uuid not null references public.chat_conversations (id),
  author_id uuid not null references public.profiles (id),
  body text not null,
  agenda_clear boolean not null default true,      -- set by chat_message_guard, never by the caller (D-52)
  created_at timestamptz not null default now(),   -- now() for people (chat_message_guard); the seed sets its own
  constraint chat_messages_len check (char_length(btrim(body)) between 1 and 2000)
);
create index chat_messages_conv_idx on public.chat_messages (conversation_id, created_at desc, id desc);

-- Own read state; not audited (like notifications.read_at): it changes on every visit and says nothing of content.
create table public.chat_reads (
  conversation_id uuid not null references public.chat_conversations (id),
  user_id uuid not null references public.profiles (id),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);

-- Who talks to whom, by pair of DIFFERENT roles (D-51). No row = allowed. The boss is always reachable: no boss rows.
create table public.chat_rules (
  id uuid not null default gen_random_uuid() unique, -- audit_row() and the stable demo ids want an id
  role_a public.app_role not null,
  role_b public.app_role not null,
  allowed boolean not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (role_a, role_b),
  constraint chat_rules_order check (role_a < role_b),
  constraint chat_rules_roles check (
    role_a in ('dispatch', 'politics', 'ivt', 'camera', 'social')
    and role_b in ('dispatch', 'politics', 'ivt', 'camera', 'social'))
);

-- «Lo lee el jefe»: accepted once before writing (D-59). Own row only; no admin branch.
create table public.chat_notice_ack (
  user_id uuid primary key references public.profiles (id),
  ack_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- 4. The rules (security definer: they read members and roles without recursing into RLS, base.sql)
-- ---------------------------------------------------------------------------------------------------------------
-- The most restrictive rule wins (S5): allowed unless SOME pair of their team roles is closed. The boss on either
-- side: always. Never with an admin account, an inactive person or oneself.
create function public.chat_pair_allowed(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with ra as (select unnest(public.chat_team_roles(a)) r),
       rb as (select unnest(public.chat_team_roles(b)) r)
  select a is not null and b is not null and a <> b
     and exists (select 1 from ra) and exists (select 1 from rb)
     and (exists (select 1 from ra where r = 'boss') or exists (select 1 from rb where r = 'boss')
          or not exists (select 1 from ra, rb, public.chat_rules cr
                          where cr.role_a = least(ra.r, rb.r) and cr.role_b = greatest(ra.r, rb.r) and not cr.allowed))
$$;

create function public.chat_is_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_team_member() and (
    exists (select 1 from public.chat_members m where m.conversation_id = c and m.user_id = auth.uid())
    or exists (select 1 from public.chat_conversations k where k.id = c and k.kind = 'team'))
$$;

-- Read: a member (2FA when their role asks for it) or the boss with 2FA. No admin branch, no is_staff() (D-50).
-- Never for 360 (S8).
create function public.chat_can_read(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.chat_by_assistant()
     and ((public.chat_is_member(c) and public.mfa_ok()) or public.can_approve())
$$;

-- Whether Redes or política read this conversation (D-52): «Todo el equipo», or ANY member row (active or not) whose
-- roles (active or not) include them (S3).
create function public.chat_hides_agenda(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_conversations k where k.id = c and k.kind = 'team')
      or exists (select 1 from public.chat_members m join public.user_roles ur on ur.user_id = m.user_id
                  where m.conversation_id = c and ur.role::text in ('politics', 'social'))
$$;

-- For the app (the agenda note and its check before sending): the same answer, only for a conversation I can read.
create function public.chat_hides_agenda_for_me(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.chat_can_read(c) and public.chat_hides_agenda(c)
$$;

-- Write: the notice accepted, a member with 2FA ok, allowed with every other ACTIVE member (inactive people are
-- ignored) and at least one other active member; with «Solo el jefe escribe», only the boss. «Todo el equipo» ignores
-- the pairs (D-51, S6). Never for 360.
create function public.chat_may_post(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.chat_by_assistant() and public.chat_is_member(c) and public.mfa_ok()
     and exists (select 1 from public.chat_notice_ack n where n.user_id = auth.uid())
     and coalesce((
       select case k.kind
                when 'team' then (not k.only_boss_posts) or public.has_role('boss')
                else exists (select 1 from public.chat_members m
                              where m.conversation_id = c and m.user_id <> auth.uid()
                                and public.chat_team_roles(m.user_id) <> '{}')
                     and not exists (select 1 from public.chat_members m
                                      where m.conversation_id = c and m.user_id <> auth.uid()
                                        and public.chat_team_roles(m.user_id) <> '{}'
                                        and not public.chat_pair_allowed(auth.uid(), m.user_id))
                     and ((not k.only_boss_posts) or public.has_role('boss'))
              end
         from public.chat_conversations k where k.id = c), false)
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. RPC (definer: they make a conversation and its members together, and check every pair)
-- ---------------------------------------------------------------------------------------------------------------
create function public.chat_start(p_kind text, p_members uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_all uuid[];
  v_id uuid;
  v_key text;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  a uuid;
  b uuid;
begin
  if me is null or public.chat_by_assistant() or not public.is_team_member() or not public.mfa_ok() then
    raise exception 'chat: not allowed' using errcode = '42501';
  end if;
  v_all := array(select distinct x from unnest(coalesce(p_members, '{}') || me) x where x is not null order by 1);
  if exists (select 1 from unnest(v_all) x where public.chat_team_roles(x) = '{}') then
    raise exception 'chat: not a team member' using errcode = '42501';
  end if;
  if p_kind = 'direct' then
    if cardinality(v_all) <> 2 or v_title is not null then
      raise exception 'chat: direct shape' using errcode = '22023';
    end if;
    v_key := v_all[1]::text || ':' || v_all[2]::text;
    select id into v_id from public.chat_conversations where direct_key = v_key;
    if v_id is not null then return v_id; end if;           -- the history stays readable even if now restricted
  elsif p_kind = 'group' then
    if cardinality(v_all) not between 3 and 12 or v_title is null then
      raise exception 'chat: group shape' using errcode = '22023';
    end if;
  else
    raise exception 'chat: kind' using errcode = '22023';
  end if;
  foreach a in array v_all loop
    foreach b in array v_all loop
      if a < b and not public.chat_pair_allowed(a, b) then
        raise exception 'chat_pair_not_allowed' using errcode = '23514', constraint = 'chat_pair_not_allowed';
      end if;
    end loop;
  end loop;
  -- A group's name: never a phone, a date, a time or a map, whoever is in it (the strict rule: a name is read by
  -- everyone in it, every time, nobody is asked before it is saved, and it has no agenda_clear: a member who gains
  -- Redes or política later still reads it).
  if v_title is not null and (public.text_has_phone(v_title) or public.text_has_datetime(v_title)
                              or public.chat_has_map(v_title)) then
    raise exception 'chat_title_private' using errcode = '23514', constraint = 'chat_title_private';
  end if;
  insert into public.chat_conversations (kind, title, direct_key, created_by)
  values (p_kind, v_title, v_key, me)
  on conflict (direct_key) do nothing
  returning id into v_id;
  if v_id is null then                                     -- a race on the same pair: the other one won
    select id into v_id from public.chat_conversations where direct_key = v_key;
    return v_id;
  end if;
  insert into public.chat_members (conversation_id, user_id, added_by) select v_id, x, me from unnest(v_all) x;
  return v_id;
end $$;

create function public.chat_team_channel()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or public.chat_by_assistant() or not public.is_team_member() or not public.mfa_ok() then
    raise exception 'chat: not allowed' using errcode = '42501';
  end if;
  select id into v_id from public.chat_conversations where kind = 'team';
  if v_id is null then
    insert into public.chat_conversations (kind, title, created_by) values ('team', 'Todo el equipo', auth.uid())
    on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from public.chat_conversations where kind = 'team'; end if;
  end if;
  return v_id;
end $$;

create function public.chat_set_only_boss(c uuid, v boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
  v_n int;
begin
  if public.chat_by_assistant() or not public.can_approve() then
    raise exception 'chat: boss only' using errcode = '42501';
  end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.chat_conversations set only_boss_posts = coalesce(v, false) where id = c and kind in ('group', 'team');
  get diagnostics v_n = row_count;
  perform set_config('app.trusted_update', v_trusted, true);
  if v_n = 0 then raise exception 'chat: not found' using errcode = 'P0002'; end if;
end $$;

-- The people I may see in «Escribirle a alguien» (active team members, never admin accounts), their TEAM roles only,
-- and whether I may write to them now. The boss's «Quién habla con quién» uses it too (names on each row).
create function public.chat_people()
returns table (id uuid, full_name text, roles public.app_role[], can_write boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)), public.chat_team_roles(p.id),
         public.chat_pair_allowed(auth.uid(), p.id)
    from public.profiles p
   where not public.chat_by_assistant() and public.is_team_member() and public.mfa_ok()
     and p.id <> auth.uid() and public.chat_team_roles(p.id) <> '{}'
   order by 2, 1
$$;

-- Members of a conversation I can read, with names and team roles (for the header and the bubbles). «Todo el equipo»
-- has no member rows: the app lists chat_people() and the person instead.
create function public.chat_member_list(c uuid)
returns table (user_id uuid, full_name text, roles public.app_role[], active boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)), public.chat_team_roles(m.user_id),
         public.chat_team_roles(m.user_id) <> '{}'
    from public.chat_members m join public.profiles p on p.id = m.user_id
   where m.conversation_id = c and public.chat_can_read(c)
   order by 2, 1
$$;

-- Where a message I cannot read sits (D-52: «Mensaje oculto»): id, author and time, never the body. The same condition
-- as the read policy of chat_messages.
create function public.chat_hidden_marks(c uuid, p_before timestamptz default null)
returns table (id uuid, author_id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, x.author_id, x.created_at
    from public.chat_messages x
   where x.conversation_id = c and public.chat_can_read(c)
     and not (x.agenda_clear or public.chat_reader_knows_agenda() or public.can_approve())
     and (p_before is null or x.created_at < p_before)
   order by x.created_at desc, x.id desc
   limit 200
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Triggers: the text guard, append-only, who changed a rule, an audit without content
-- ---------------------------------------------------------------------------------------------------------------
-- BEFORE the policies: a person writes only where they may (the same test as the insert policy, so a refusal never
-- says anything about a conversation they cannot write in), as themselves, now. Then, for everyone (the seed too):
-- phones never; a concrete date, time or map from who knows the agenda never where Redes or política read; and
-- agenda_clear. The error names the rule, never the text.
create function public.chat_message_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_raw text;
  v_text text;
  v_when boolean := false;
begin
  if auth.uid() is not null then
    if new.author_id is distinct from auth.uid() or not public.chat_may_post(new.conversation_id) then
      raise exception 'Ya no puedes escribir en esta conversación.' using errcode = '42501';
    end if;
    new.created_at := now();
  end if;
  v_raw := public.chat_strip_refs(normalize(new.body, NFKC));
  if public.text_has_phone(v_raw) then
    raise exception 'chat_messages_no_phone' using errcode = '23514', constraint = 'chat_messages_no_phone';
  end if;
  if public.chat_author_knows_agenda(new.author_id) then
    v_text := v_raw;
    if public.chat_author_camera_only(new.author_id) then
      v_text := public.chat_strip_timecodes(v_raw);
      -- A time code with «mañana», «el sábado» or «esta tarde» in the same message is an hour of the agenda: then
      -- nothing is taken out (the strict text_has_datetime() looks for those words).
      if v_text <> v_raw and public.text_has_datetime(v_text) then v_text := v_raw; end if;
    end if;
    v_when := public.text_has_concrete_datetime(v_text) or public.chat_has_map(v_text);
  end if;
  if v_when and public.chat_hides_agenda(new.conversation_id) then
    raise exception 'chat_messages_no_agenda_when' using errcode = '23514', constraint = 'chat_messages_no_agenda_when';
  end if;
  new.agenda_clear := not v_when;
  return new;
end $$;
create trigger chat_messages_guard before insert on public.chat_messages
  for each row execute function public.chat_message_guard();

create function public.chat_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
create trigger chat_messages_immutable before update or delete on public.chat_messages
  for each row execute function public.chat_append_only();
create trigger chat_messages_no_truncate before truncate on public.chat_messages
  for each statement execute function public.chat_append_only();
create trigger chat_members_immutable before update or delete on public.chat_members
  for each row execute function public.chat_append_only();
create trigger chat_members_no_truncate before truncate on public.chat_members
  for each statement execute function public.chat_append_only();
create trigger chat_conversations_no_delete before delete on public.chat_conversations
  for each row execute function public.chat_append_only();
create trigger chat_conversations_no_truncate before truncate on public.chat_conversations
  for each statement execute function public.chat_append_only();
create trigger chat_notice_ack_immutable before update or delete on public.chat_notice_ack
  for each row execute function public.chat_append_only();
create trigger chat_notice_ack_no_truncate before truncate on public.chat_notice_ack
  for each statement execute function public.chat_append_only();

-- A conversation changes only «Solo el jefe escribe», only through chat_set_only_boss (or the system).
create function public.guard_chat_conversation_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.trusted_update', true), '') <> 'on' then
    raise exception 'chat_conversations: use chat_set_only_boss' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'only_boss_posts') <> (to_jsonb(old) - 'only_boss_posts') then
    raise exception 'chat_conversations: only only_boss_posts changes' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger chat_conversations_guard before update on public.chat_conversations
  for each row execute function public.guard_chat_conversation_update();

create function public.chat_stamp_rule()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger chat_rules_stamp before insert or update on public.chat_rules
  for each row execute function public.chat_stamp_rule();

-- Audit WITHOUT content: which table, which row, who, when. Never the body, the title or the member ids (Administración
-- reads audit_log; the pattern of audit_drive_connection, 20261026001200_drive.sql).
create function public.audit_chat_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
begin
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(r ->> 'id', r ->> 'user_id'), lower(tg_op), null, null);
  return null;
end $$;
create trigger audit_chat_conversations after insert or update on public.chat_conversations
  for each row execute function public.audit_chat_row();
create trigger audit_chat_members after insert on public.chat_members
  for each row execute function public.audit_chat_row();
create trigger audit_chat_messages after insert on public.chat_messages
  for each row execute function public.audit_chat_row();
create trigger audit_chat_notice_ack after insert on public.chat_notice_ack
  for each row execute function public.audit_chat_row();
-- chat_rules: role pairs only (no content, no people): the standard trail; chat_stamp_rule keeps updated_at.
select public.wire_standard_triggers('public.chat_rules', false, false);

-- ---------------------------------------------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_rules enable row level security;
alter table public.chat_notice_ack enable row level security;

create policy chat_conv_select on public.chat_conversations for select to authenticated using (public.chat_can_read(id));
create policy chat_members_select on public.chat_members for select to authenticated using (public.chat_can_read(conversation_id));
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (public.chat_can_read(conversation_id)
         and (agenda_clear or public.chat_reader_knows_agenda() or public.can_approve()));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (author_id = auth.uid() and public.chat_may_post(conversation_id));
create policy chat_reads_select on public.chat_reads for select to authenticated using (user_id = auth.uid());
create policy chat_reads_insert on public.chat_reads for insert to authenticated
  with check (user_id = auth.uid() and public.chat_is_member(conversation_id) and public.mfa_ok());
create policy chat_reads_update on public.chat_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.chat_is_member(conversation_id));
create policy chat_rules_select on public.chat_rules for select to authenticated
  using (public.is_team_member() or public.can_approve());
create policy chat_rules_insert on public.chat_rules for insert to authenticated with check (public.can_approve());
create policy chat_rules_update on public.chat_rules for update to authenticated
  using (public.can_approve()) with check (public.can_approve());
create policy chat_notice_ack_select on public.chat_notice_ack for select to authenticated using (user_id = auth.uid());
create policy chat_notice_ack_insert on public.chat_notice_ack for insert to authenticated
  with check (user_id = auth.uid() and public.is_team_member());
-- No policy and no grant for conversations and members INSERT: only chat_start and chat_team_channel make them.

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Privileges (explicit; nothing for anon; no DELETE, TRUNCATE, TRIGGER or REFERENCES). Rule of
--    20261026001400_functions_closed_to_anon.sql for every function.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads,
              public.chat_rules, public.chat_notice_ack from public, anon, authenticated;
grant select on public.chat_conversations, public.chat_members to authenticated;
grant select on public.chat_messages to authenticated;
grant insert (id, conversation_id, author_id, body) on public.chat_messages to authenticated;   -- never agenda_clear
grant select on public.chat_reads to authenticated;
grant insert (conversation_id, user_id, last_read_at, muted) on public.chat_reads to authenticated;
grant update (last_read_at, muted) on public.chat_reads to authenticated;
grant select on public.chat_rules to authenticated;
grant insert (role_a, role_b, allowed) on public.chat_rules to authenticated;
grant update (allowed) on public.chat_rules to authenticated;
grant select on public.chat_notice_ack to authenticated;
grant insert (user_id) on public.chat_notice_ack to authenticated;

revoke all on function public.is_team_member(), public.chat_team_roles(uuid), public.chat_author_knows_agenda(uuid),
  public.chat_author_camera_only(uuid), public.chat_reader_knows_agenda(), public.chat_by_assistant(),
  public.text_has_concrete_datetime(text), public.chat_strip_refs(text), public.chat_has_map(text),
  public.chat_strip_timecodes(text), public.chat_pair_allowed(uuid, uuid), public.chat_is_member(uuid),
  public.chat_can_read(uuid), public.chat_hides_agenda(uuid), public.chat_hides_agenda_for_me(uuid),
  public.chat_may_post(uuid), public.chat_start(text, uuid[], text), public.chat_team_channel(),
  public.chat_set_only_boss(uuid, boolean), public.chat_people(), public.chat_member_list(uuid),
  public.chat_hidden_marks(uuid, timestamptz) from public, anon;
-- Internal only: they answer about OTHER people (their roles, who is in a conversation), so only other definer
-- functions call them.
revoke all on function public.chat_team_roles(uuid), public.chat_author_knows_agenda(uuid),
  public.chat_author_camera_only(uuid), public.chat_pair_allowed(uuid, uuid), public.chat_hides_agenda(uuid)
  from authenticated;
grant execute on function public.is_team_member(), public.chat_reader_knows_agenda(), public.chat_by_assistant(),
  public.text_has_concrete_datetime(text), public.chat_strip_refs(text), public.chat_has_map(text),
  public.chat_strip_timecodes(text), public.chat_is_member(uuid), public.chat_can_read(uuid),
  public.chat_hides_agenda_for_me(uuid), public.chat_may_post(uuid), public.chat_start(text, uuid[], text),
  public.chat_team_channel(), public.chat_set_only_boss(uuid, boolean), public.chat_people(),
  public.chat_member_list(uuid), public.chat_hidden_marks(uuid, timestamptz) to authenticated;
revoke all on function public.chat_message_guard(), public.chat_append_only(), public.guard_chat_conversation_update(),
  public.chat_stamp_rule(), public.audit_chat_row() from public, anon, authenticated;
