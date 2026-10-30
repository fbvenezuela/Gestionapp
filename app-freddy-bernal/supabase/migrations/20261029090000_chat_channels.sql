-- Mensajes becomes channels, like Slack or Discord (R5, 29/10/2026, D-79 to D-88). Nothing here edits an earlier file:
-- it transforms what 20261028002400_internal_chat.sql made (applied on fb-dev, which holds no real messages).
--
--   * Two kinds of conversation: a CHANNEL (a name, a short description, members) and «Todo el equipo» (one; every
--     active team member is in it without a row). No directs, no groups made by anyone (D-84).
--   * Only the boss, with 2FA, makes a channel, renames it, describes it, chooses and changes who is in it, and archives
--     it (D-80). The boss is a member of EVERY channel, by the database: when a channel is made, and when the system
--     gives someone the boss's role; a boss is never taken out (D-81). Taking the role away takes them out.
--   * Who reads (D-82): the members of each channel, with 2FA when their role asks for it. The boss reads as a member:
--     there is no «read all» branch any more. Administración: none (no admin branch; an admin account is never a
--     member). 360: none (app.caller = 'assistant', chat_by_assistant()).
--   * Members change: whoever enters reads what was written before (like Slack); whoever leaves stops reading the
--     channel. Nobody is deleted: leaving is removed_at on the row, and entering again is a new row with the phone's
--     «Silenciar» off again (D-85). A member sees who is in the channel NOW: never who left, when or who took them
--     out (chat_members_select and chat_member_list); someone who left is named only as the author of an old message.
--   * Because whoever enters reads the history, a channel WITHOUT Redes or política keeps the strict rule for the
--     agenda_clear of a message from someone who knows the agenda: a relative word («mañana», «el sábado») marks it
--     too, so whoever with Redes or política is added later (or a member who gains either role) sees «Mensaje oculto»,
--     never a «mañana» that its time turns into a date. Where Redes or política already read, E1 stays as it was.
--     The messages written before this migration in a direct or group without Redes or política kept the old rule
--     (a relative word left agenda_clear true); the strict rule is applied to them here, once, before they become
--     channels the boss can take out of the archive and add Redes or política to (R5 review 2, point 2).
--   * An archived channel is read by its members and nobody writes in it (D-86).
--   * The agenda (D-52 with E1), phones (D-53), append-only messages (D-54), push without the text (D-55) and the
--     5-second loop (D-56) stay as they were. chat_hides_agenda() now counts the CURRENT members only (a member who left
--     cannot read anything there any more); agenda_clear guards the messages written before someone entered.
--   * The bosses are members by the database even when a boss's profile is inactive; the lists (chat_member_list) show
--     only active people of the team, so nobody reads «Jefe (ya no está)» in every channel.
--   * What existed (D-87): every direct and group becomes an ARCHIVED channel with the bosses in it, «Conversación
--     de <nombre> y <nombre>» when it had no name. Nothing is deleted. chat_notice_ack (the notice, D-59) and chat_rules («Quién
--     habla con quién», D-51) are dropped with their policies, triggers and grants; so are chat_start() and
--     chat_pair_allowed(). The audit rows they left stay (they never had content).
-- No enum values, no rows inserted except the bosses' memberships of what existed, nothing new in the Realtime
-- publication.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. What existed becomes channels (before any new guard, so the old shape can change)
-- ---------------------------------------------------------------------------------------------------------------
drop trigger chat_conversations_guard on public.chat_conversations;
alter table public.chat_conversations drop constraint chat_conv_shape;
alter table public.chat_conversations drop constraint chat_conversations_kind_check;
alter table public.chat_conversations
  add column description text,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id),
  add column updated_at timestamptz;

-- The strict agenda rule (the one chat_message_guard() below keeps for a channel without Redes or política) on the
-- messages of a direct or group where neither role was: a relative word («mañana», «el lunes») from whoever knows the
-- agenda hides the message too, so nobody with Redes or política added later reads a «mañana» its time turns into a
-- date. Only ever from true to false; the same text the guard looks at (references out, and Grabación's bare time
-- codes out unless a relative day is also there). Messages are append-only: their guard is off for this one update.
alter table public.chat_messages disable trigger chat_messages_immutable;
with src as (
  select x.id, public.chat_strip_refs(normalize(x.body, NFKC)) as raw, public.chat_author_camera_only(x.author_id) as cam
    from public.chat_messages x join public.chat_conversations k on k.id = x.conversation_id
   where x.agenda_clear and k.kind in ('direct', 'group')
     and public.chat_author_knows_agenda(x.author_id)
     and not exists (select 1 from public.chat_members m join public.user_roles ur on ur.user_id = m.user_id
                      where m.conversation_id = k.id and ur.role::text in ('politics', 'social'))),
stripped as (
  select id, raw, case when cam then public.chat_strip_timecodes(raw) else raw end as cut from src),
looked as (
  select id, case when cut <> raw and public.text_has_datetime(cut) then raw else cut end as txt from stripped)
update public.chat_messages x set agenda_clear = false
  from looked l
 where x.id = l.id and (public.text_has_datetime(l.txt) or public.chat_has_map(l.txt));
alter table public.chat_messages enable trigger chat_messages_immutable;

-- A direct had no name: «Conversación de Daniela y Kevin» (first names, as the screens said it), at most 60 letters.
update public.chat_conversations k
   set kind = 'channel',
       title = coalesce(k.title, left(coalesce(
         (select 'Conversación de ' || string_agg(split_part(coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)), ' ', 1), ' y '
                                                 order by p.full_name, p.id)
            from public.chat_members m join public.profiles p on p.id = m.user_id where m.conversation_id = k.id),
         'Conversación anterior'), 60)),
       archived_at = now()
 where kind in ('direct', 'group');

alter table public.chat_conversations drop column direct_key;   -- and its unique constraint
alter table public.chat_conversations
  alter column title set not null,
  add constraint chat_conversations_kind_check check (kind in ('channel', 'team')),
  add constraint chat_conv_desc_len check (description is null or char_length(btrim(description)) between 1 and 140),
  add constraint chat_conv_desc_no_phone check (description is null or not public.text_has_phone(description)),
  add constraint chat_conv_team_fixed check (kind = 'channel' or (archived_at is null and description is null));

alter table public.chat_members
  add column via text not null default 'picked' check (via in ('picked', 'boss')),
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id);
alter table public.chat_members drop constraint chat_members_conversation_id_user_id_key;
create unique index chat_members_current on public.chat_members (conversation_id, user_id) where removed_at is null;
create index chat_members_user_current_idx on public.chat_members (user_id, conversation_id) where removed_at is null;

-- The bosses in every channel that exists (the converted ones). A boss who was already in it stays 'picked'.
insert into public.chat_members (conversation_id, user_id, via)
select k.id, ur.user_id, 'boss'
  from public.chat_conversations k cross join public.user_roles ur
 where k.kind = 'channel' and ur.role = 'boss'
on conflict (conversation_id, user_id) where removed_at is null do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Who is in, who reads, who writes (security definer: they read members and roles without recursing into RLS)
-- ---------------------------------------------------------------------------------------------------------------
-- A current member: a row not taken out, or «Todo el equipo» for every active team member. Never an admin account
-- (is_team_member()).
create or replace function public.chat_is_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_team_member() and exists (
    select 1 from public.chat_conversations k
     where k.id = c
       and (k.kind = 'team'
            or exists (select 1 from public.chat_members m
                        where m.conversation_id = c and m.user_id = auth.uid() and m.removed_at is null)))
$$;

-- Read: a member, with 2FA when their role asks for it. The boss reads because he is a member of every channel; there
-- is no other branch (D-82). Never for 360.
create or replace function public.chat_can_read(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.chat_by_assistant() and public.chat_is_member(c) and public.mfa_ok()
$$;

-- Whether Redes or política read this channel (D-52): «Todo el equipo», or a CURRENT member (active profile or not)
-- with either role.
create or replace function public.chat_hides_agenda(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_conversations k where k.id = c and k.kind = 'team')
      or exists (select 1 from public.chat_members m join public.user_roles ur on ur.user_id = m.user_id
                  where m.conversation_id = c and m.removed_at is null and ur.role::text in ('politics', 'social'))
$$;

-- Write: a member with 2FA ok, in a channel that is not archived; with «Solo el jefe escribe», only the boss. Never for
-- 360. No notice to accept and no pairs any more.
create or replace function public.chat_may_post(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.chat_by_assistant() and public.chat_is_member(c) and public.mfa_ok()
     and coalesce((select k.archived_at is null and ((not k.only_boss_posts) or public.has_role('boss'))
                     from public.chat_conversations k where k.id = c), false)
$$;

-- The same guard as before (the agenda, phones, as oneself, now), with two changes: its first refusal says «canal»,
-- and agenda_clear is STRICT in a channel without Redes or política (relative words count): whoever is added later
-- reads the history, and «mañana» with the message's time is a date (R5 review, point 1).
create or replace function public.chat_message_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_raw text;
  v_text text;
  v_when boolean := false;
begin
  if auth.uid() is not null then
    if new.author_id is distinct from auth.uid() or not public.chat_may_post(new.conversation_id) then
      raise exception 'Ya no puedes escribir en este canal.' using errcode = '42501';
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
      if v_text <> v_raw and public.text_has_datetime(v_text) then v_text := v_raw; end if;
    end if;
    if public.chat_hides_agenda(new.conversation_id) then
      -- Redes or política read it now: a concrete date, time or map is refused; relative words pass (E1, the app asks).
      if public.text_has_concrete_datetime(v_text) or public.chat_has_map(v_text) then
        raise exception 'chat_messages_no_agenda_when' using errcode = '23514', constraint = 'chat_messages_no_agenda_when';
      end if;
    else
      -- Nobody with Redes or política reads it now: it is saved, and kept from whoever with either role reads it later.
      v_when := public.text_has_datetime(v_text) or public.chat_has_map(v_text);
    end if;
  end if;
  new.agenda_clear := not v_when;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. What goes: the notice, «Quién habla con quién», directs and groups
-- ---------------------------------------------------------------------------------------------------------------
drop table public.chat_notice_ack;     -- its policies, its triggers (append-only, audit) and its grants go with it
drop table public.chat_rules;          -- the same (chat_rules_stamp, audit_chat_rules, the three policies)
drop function public.chat_start(text, uuid[], text);
drop function public.chat_pair_allowed(uuid, uuid);
drop function public.chat_stamp_rule();
drop function public.chat_people();            -- comes back below for the boss only, without can_write
drop function public.chat_member_list(uuid);   -- comes back below with «current»

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Lists
-- ---------------------------------------------------------------------------------------------------------------
-- The people the boss can put in a channel: the active team (never an admin account), with their team roles. The
-- bosses come too: the screen shows them fixed. Only the boss with 2FA; never for 360.
create function public.chat_people()
returns table (id uuid, full_name text, roles public.app_role[])
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)), public.chat_team_roles(p.id)
    from public.profiles p
   where not public.chat_by_assistant() and public.can_approve() and public.chat_team_roles(p.id) <> '{}'
   order by 2, 1
$$;

-- Who is in a channel I can read NOW (current = true): active people of the team only (a boss whose profile is
-- inactive stays a member by the database, and is not listed). Then, with current = false and only to name the
-- author of an old message, whoever wrote there and is not listed (left the channel, or the team): never who was
-- taken out, when or by whom (R5 review, point 5). «Todo el equipo»: the active team.
create function public.chat_member_list(c uuid)
returns table (user_id uuid, full_name text, roles public.app_role[], active boolean, current boolean)
language sql stable security definer set search_path = public as $$
  with k as (select kind from public.chat_conversations where id = c and public.chat_can_read(c)),
  cur as (
    select m.user_id from public.chat_members m, k
     where k.kind = 'channel' and m.conversation_id = c and m.removed_at is null and public.chat_team_roles(m.user_id) <> '{}'
    union
    select p.id from public.profiles p, k where k.kind = 'team' and public.chat_team_roles(p.id) <> '{}'),
  people as (
    select cur.user_id, true as current from cur
    union all
    select distinct x.author_id, false from public.chat_messages x, k
     where x.conversation_id = c and not exists (select 1 from cur where cur.user_id = x.author_id))
  select pe.user_id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)),
         public.chat_team_roles(pe.user_id), public.chat_team_roles(pe.user_id) <> '{}', pe.current
    from people pe join public.profiles p on p.id = pe.user_id
   order by 5 desc, 2, 1
$$;

-- Whether I was taken out of this channel (a row of mine with removed_at and none current): only then does an open
-- channel say «Ya no estás en este canal.» and stop asking. Anything else the person cannot read (2FA, a channel made
-- on another server of the demo, D-88) is only «nothing this time» (R5 review 2, point 1). It says nothing about anyone
-- else and nothing about a channel I was never in. Never for 360.
create function public.chat_was_removed(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.chat_by_assistant()
     and exists (select 1 from public.chat_members m where m.conversation_id = c and m.user_id = auth.uid() and m.removed_at is not null)
     and not exists (select 1 from public.chat_members m where m.conversation_id = c and m.user_id = auth.uid() and m.removed_at is null)
$$;

-- A member reads the rows of who is in the channel now (and their own): never the rows of who left.
drop policy chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members for select to authenticated
  using (public.chat_can_read(conversation_id) and (removed_at is null or user_id = auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The boss's functions (D-80): make, rename and describe, choose who is in, archive. 2FA (can_approve()).
-- ---------------------------------------------------------------------------------------------------------------
create function public.chat_channel_people(p_members uuid[])
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v uuid[];
begin
  -- The bosses are in every channel on their own: they are left out of the list the screen sends.
  v := array(select distinct x from unnest(coalesce(p_members, '{}')) x
              where x is not null
                and not exists (select 1 from public.user_roles ur where ur.user_id = x and ur.role = 'boss')
              order by 1);
  if cardinality(v) = 0 then
    raise exception 'chat_channel_needs_member' using errcode = '23514', constraint = 'chat_channel_needs_member';
  end if;
  if exists (select 1 from unnest(v) x where public.chat_team_roles(x) = '{}') then
    raise exception 'chat: not a team member' using errcode = '42501';
  end if;
  return v;
end $$;

create function public.chat_channel_create(p_title text, p_description text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_people uuid[];
  v_id uuid;
begin
  if me is null or public.chat_by_assistant() or not public.can_approve() then
    raise exception 'chat: boss only' using errcode = '42501';
  end if;
  v_people := public.chat_channel_people(p_members);
  insert into public.chat_conversations (kind, title, description, created_by)
  values ('channel', p_title, p_description, me)
  returning id into v_id;                                   -- chat_channel_add_bosses puts the bosses in
  insert into public.chat_members (conversation_id, user_id, added_by, via)
  select v_id, x, me, 'picked' from unnest(v_people) x;
  return v_id;
end $$;

create function public.chat_channel_update(c uuid, p_title text, p_description text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
  v_n int;
begin
  if public.chat_by_assistant() or not public.can_approve() then
    raise exception 'chat: boss only' using errcode = '42501';
  end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.chat_conversations set title = p_title, description = p_description where id = c and kind = 'channel';
  get diagnostics v_n = row_count;
  perform set_config('app.trusted_update', v_trusted, true);
  if v_n = 0 then raise exception 'chat: not found' using errcode = 'P0002'; end if;
end $$;

-- Who is in, as the boss's list says it: the ones missing enter (a new row), the ones not on it leave (removed_at).
-- The bosses never leave (they are not on the list and the member guard refuses it anyway).
create function public.chat_channel_set_members(c uuid, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
  v_kind text;
  v_archived timestamptz;
  v_people uuid[];
begin
  if me is null or public.chat_by_assistant() or not public.can_approve() then
    raise exception 'chat: boss only' using errcode = '42501';
  end if;
  select kind, archived_at into v_kind, v_archived from public.chat_conversations where id = c for update;
  if v_kind is distinct from 'channel' then raise exception 'chat: not found' using errcode = 'P0002'; end if;
  if v_archived is not null then
    raise exception 'chat_channel_archived' using errcode = '23514', constraint = 'chat_channel_archived';
  end if;
  v_people := public.chat_channel_people(p_members);
  perform set_config('app.trusted_update', 'on', true);
  -- Only the people the editor shows (the active team, chat_member_list): someone deactivated, or left without a team
  -- role, is not on the list the boss sends and stays a member, as they were, for when Administración brings them back
  -- (R5 review 2, point 3). They read nothing meanwhile (chat_is_member() asks is_team_member()).
  update public.chat_members m set removed_at = now(), removed_by = me
   where m.conversation_id = c and m.removed_at is null and not (m.user_id = any (v_people))
     and public.chat_team_roles(m.user_id) <> '{}'
     and not exists (select 1 from public.user_roles ur where ur.user_id = m.user_id and ur.role = 'boss');
  -- Whoever enters again starts with the phone's «Silenciar» off (their old setting does not come back, D-85).
  with entered as (
    insert into public.chat_members (conversation_id, user_id, added_by, via)
    select c, x, me, 'picked' from unnest(v_people) x
    on conflict (conversation_id, user_id) where removed_at is null do nothing
    returning user_id)
  update public.chat_reads r set muted = false from entered e where r.conversation_id = c and r.user_id = e.user_id;
  perform set_config('app.trusted_update', v_trusted, true);
end $$;

create function public.chat_channel_archive(c uuid, v boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
  v_n int;
begin
  if public.chat_by_assistant() or not public.can_approve() then
    raise exception 'chat: boss only' using errcode = '42501';
  end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.chat_conversations
     set archived_at = case when v then coalesce(archived_at, now()) end,
         archived_by = case when v then coalesce(archived_by, auth.uid()) end
   where id = c and kind = 'channel';
  get diagnostics v_n = row_count;
  perform set_config('app.trusted_update', v_trusted, true);
  if v_n = 0 then raise exception 'chat: not found' using errcode = 'P0002'; end if;
end $$;

-- «Solo el jefe escribe», now in a channel or in «Todo el equipo».
create or replace function public.chat_set_only_boss(c uuid, v boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
  v_n int;
begin
  if public.chat_by_assistant() or not public.can_approve() then
    raise exception 'chat: boss only' using errcode = '42501';
  end if;
  perform set_config('app.trusted_update', 'on', true);
  update public.chat_conversations set only_boss_posts = coalesce(v, false) where id = c and kind in ('channel', 'team');
  get diagnostics v_n = row_count;
  perform set_config('app.trusted_update', v_trusted, true);
  if v_n = 0 then raise exception 'chat: not found' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Triggers: what a channel may say, what changes, the bosses always in
-- ---------------------------------------------------------------------------------------------------------------
-- A channel's name and description: never a phone, a date, a time or a map (the strict rule of the old group name:
-- everyone in it reads them, every time, and they have no agenda_clear). For everyone, the system too.
create function public.guard_chat_channel_text()
returns trigger language plpgsql set search_path = public as $$
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  if (tg_op = 'INSERT' or new.title is distinct from old.title)
     and (public.text_has_phone(new.title) or public.text_has_datetime(new.title) or public.chat_has_map(new.title)) then
    raise exception 'chat_title_private' using errcode = '23514', constraint = 'chat_title_private';
  end if;
  if new.description is not null and (tg_op = 'INSERT' or new.description is distinct from old.description)
     and (public.text_has_phone(new.description) or public.text_has_datetime(new.description) or public.chat_has_map(new.description)) then
    raise exception 'chat_desc_private' using errcode = '23514', constraint = 'chat_desc_private';
  end if;
  return new;
end $$;
create trigger chat_conversations_text before insert or update on public.chat_conversations
  for each row execute function public.guard_chat_channel_text();

-- A channel changes only its name, description, «Solo el jefe escribe» and archive, only through the boss's
-- functions (or the system). «Todo el equipo» keeps its name, has no description and is never archived.
create or replace function public.guard_chat_conversation_update()
returns trigger language plpgsql set search_path = public as $$
declare
  free constant text[] := array['title', 'description', 'only_boss_posts', 'archived_at', 'archived_by', 'updated_at'];
begin
  if auth.uid() is not null and coalesce(current_setting('app.trusted_update', true), '') <> 'on' then
    raise exception 'chat_conversations: use the boss''s functions' using errcode = '42501';
  end if;
  if (to_jsonb(new) - free) <> (to_jsonb(old) - free) then
    raise exception 'chat_conversations: only the name, the description, only_boss_posts and the archive change' using errcode = '42501';
  end if;
  if new.kind = 'team' and new.title is distinct from old.title then
    raise exception 'chat_conversations: «Todo el equipo» keeps its name' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger chat_conversations_guard before update on public.chat_conversations
  for each row execute function public.guard_chat_conversation_update();

-- Members: rows are never deleted; one enters as a new row (only in a channel, only a team account: never an admin
-- account); one leaves once (removed_at), only through chat_channel_set_members or the system; a boss never leaves.
drop trigger chat_members_immutable on public.chat_members;
create function public.guard_chat_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'chat_members is append-only' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.chat_conversations k where k.id = new.conversation_id and k.kind = 'channel') then
      raise exception 'chat_members: only a channel has members' using errcode = '42501';
    end if;
    if exists (select 1 from public.user_roles ur where ur.user_id = new.user_id and ur.role = 'admin')
       or not exists (select 1 from public.user_roles ur where ur.user_id = new.user_id
                       and ur.role::text in ('boss', 'dispatch', 'politics', 'ivt', 'camera', 'social')) then
      raise exception 'chat_members: not a team member' using errcode = '42501';
    end if;
    new.removed_at := null;
    new.removed_by := null;
    return new;
  end if;
  if auth.uid() is not null and coalesce(current_setting('app.trusted_update', true), '') <> 'on' then
    raise exception 'chat_members: use chat_channel_set_members' using errcode = '42501';
  end if;
  if old.removed_at is not null or new.removed_at is null
     or (to_jsonb(new) - array['removed_at', 'removed_by']) <> (to_jsonb(old) - array['removed_at', 'removed_by']) then
    raise exception 'chat_members: a member only leaves, once' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = old.user_id and ur.role = 'boss') then
    raise exception 'chat_boss_stays' using errcode = '23514', constraint = 'chat_boss_stays';
  end if;
  return new;
end $$;
create trigger chat_members_guard before insert or update or delete on public.chat_members
  for each row execute function public.guard_chat_member_change();
create trigger audit_chat_members_out after update on public.chat_members
  for each row execute function public.audit_chat_row();

-- A new channel: every boss is in it.
create function public.chat_channel_add_bosses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'channel' then
    insert into public.chat_members (conversation_id, user_id, added_by, via)
    select new.id, ur.user_id, new.created_by, 'boss' from public.user_roles ur where ur.role = 'boss'
    on conflict (conversation_id, user_id) where removed_at is null do nothing;
  end if;
  return null;
end $$;
create trigger chat_channel_add_bosses after insert on public.chat_conversations
  for each row execute function public.chat_channel_add_bosses();

-- The boss's role given (only the system can, D-58): in every channel, archived ones too. Taken away: out of the
-- channels they were in only as the boss (a channel they were picked for before keeps them). Never an admin account
-- (guard_role_mix refuses that mix anyway).
create function public.chat_boss_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_trusted text := coalesce(current_setting('app.trusted_update', true), '');
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.role::text = 'boss'
       and not exists (select 1 from public.user_roles ur where ur.user_id = old.user_id and ur.role = 'boss') then
      perform set_config('app.trusted_update', 'on', true);
      update public.chat_members set removed_at = now(), removed_by = auth.uid()
       where user_id = old.user_id and via = 'boss' and removed_at is null;
      perform set_config('app.trusted_update', v_trusted, true);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.role::text = 'boss'
       and not exists (select 1 from public.user_roles ur where ur.user_id = new.user_id and ur.role = 'admin') then
      insert into public.chat_members (conversation_id, user_id, via)
      select k.id, new.user_id, 'boss' from public.chat_conversations k where k.kind = 'channel'
      on conflict (conversation_id, user_id) where removed_at is null do nothing;
    end if;
  end if;
  return null;
end $$;
-- «zz_»: AFTER triggers on a table fire in name order, and this one must come after guard_role_mix and
-- guard_role_to_boss, so a refused role says why (theirs) and not «chat_members: not a team member».
create trigger zz_chat_boss_membership after insert or update or delete on public.user_roles
  for each row execute function public.chat_boss_role_change();

-- The notice of a team role given by a person (D-58) now opens Mensajes (where the boss puts the person in channels),
-- not «Quién habla con quién». Same body as 20261028002350_boss_grant.sql otherwise.
create or replace function public.notify_team_role_grant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_body text;
  v_name text;
  v_roles text;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'user_roles' then
    if new.role::text not in ('dispatch', 'politics', 'ivt', 'camera', 'social') then return null; end if;
    select nullif(btrim(full_name), '') into v_name from public.profiles where id = new.user_id;
    v_title := 'Un rol nuevo en el equipo';
    v_body := 'Administración le dio el rol ' || public.team_role_label(new.role::text) || ' a '
              || coalesce(v_name, 'una persona') || '.';
  else
    select string_agg(public.team_role_label(r::text), ', ' order by r) into v_roles
      from unnest(new.roles) r where r::text in ('dispatch', 'politics', 'ivt', 'camera', 'social');
    if v_roles is null then return null; end if;
    v_title := 'Alguien nuevo en el equipo';
    v_body := 'Administración invitó a ' || coalesce(nullif(btrim(new.full_name), ''), 'una persona') || ' como ' || v_roles || '.';
  end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select ur.user_id, 'team_role_granted', v_title, v_body, '/mensajes'
    from public.user_roles ur join public.profiles p on p.id = ur.user_id
   where ur.role = 'boss' and p.active and p.deleted_at is null;
  return null;
end $$;
update public.notifications set link = '/mensajes' where kind = 'team_role_granted' and link = '/mensajes/permisos';

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). The policies of 002400 stay as they are:
--    they call chat_can_read() and chat_may_post(), which changed above. No new grant on any table: channels and
--    members are made only by the functions.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.chat_people(), public.chat_member_list(uuid), public.chat_was_removed(uuid), public.chat_channel_people(uuid[]),
  public.chat_channel_create(text, text, uuid[]), public.chat_channel_update(uuid, text, text),
  public.chat_channel_set_members(uuid, uuid[]), public.chat_channel_archive(uuid, boolean) from public, anon;
revoke all on function public.chat_channel_people(uuid[]) from authenticated;   -- internal: says who is a boss
grant execute on function public.chat_people(), public.chat_member_list(uuid), public.chat_was_removed(uuid), public.chat_channel_create(text, text, uuid[]),
  public.chat_channel_update(uuid, text, text), public.chat_channel_set_members(uuid, uuid[]),
  public.chat_channel_archive(uuid, boolean) to authenticated;
revoke all on function public.guard_chat_channel_text(), public.guard_chat_member_change(),
  public.chat_channel_add_bosses(), public.chat_boss_role_change() from public, anon, authenticated;
