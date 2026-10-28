-- Privacy hardening (28/10/2026): what only the screens hid, the database now closes. Nothing here edits an earlier file.
--
--   1. Redes and the camera person of a live visit read the obra ficha's MAIN row as stored (obra_fichas_select,
--      20261027002000_shared_agenda.sql): the follow-up owner's name and the obra's own days (start, delivery,
--      follow-up, created/updated) reached them, and only the event's «Ficha de obra» tab left them out
--      (HIDDEN_WITHOUT_CONTACTS in src/lib/domain/ficha-tab.ts). Now:
--        * obra_fichas_select: the obra roles only (admin, boss, despacho, IVT);
--        * visit_obra_ficha(id): the columns that tab shows, nothing else, for an obra linked to a LIVE visit the
--          caller can see (can_see_event: not deleted, not cancelled, not rejected);
--        * obra_visit_visible(id): the same «live visit I can see» test, for the material policies: media_select and
--          media_update keep giving Redes and the camera person the obra's before and progress photos (never its
--          documents: 20261027002100_obra_documents.sql).
--   2. Phone numbers in text that Redes and Grabación read: the obra's main text fields (the ones that tab shows, and
--      «Lo que voy a decir») and events.cancel_reason refuse anything text_has_phone() calls a phone: the SAME rule as
--      src/lib/domain/phones.ts (phonesIn). cancel_reason also refuses what text_has_datetime() calls a date, a time
--      or a phone: the SAME rule as looksLikeDateTime() of src/lib/push/text.ts (the app's check on the reason, until
--      now the only one). Both rules are tested against the same cases in JavaScript and in SQL
--      (tests/unit/fixtures/privacy-text-cases.ts; tests/rls/privacy-hardening.test.ts compares them on thousands of
--      generated texts too). If one changes, the other changes in a new migration.
--   3. events.done_on (the day an event happened) is the agenda's date after the fact. D-06 and the spec (§8.3: «cuando
--      un evento ya pasó y se marca realizado, su fecha pasa a verse para que el material quede en el registro por
--      día») open it to whoever keeps the material by day: Redes (Biblioteca), besides whoever reads the date
--      (admin, the boss, despacho, the camera person assigned, the IVT for its obra visits). Política never reads a
--      date (cambios del 27/10/2026), and read done_on of the activities born from its reports. Now the column is
--      closed to every API role (column privileges: authenticated reads every column of events except done_on) and
--      event_done_on(id) gives the day to who may read it: can_see_event (admin, boss, despacho, Redes, the camera
--      person assigned) or can_see_schedule (who reads the date, with 2FA). Política gets null.
--      A column added to events later must be granted to authenticated on purpose (tests/rls/privacy-hardening.test.ts
--      lists the columns authenticated cannot read: done_on only).
-- No enum values, no rows, nothing new in the Realtime publication (Realtime and PostgREST follow column privileges).

-- ---------------------------------------------------------------------------
-- 1. The two text rules (pure functions; a CHECK runs them with the caller's EXECUTE right)
-- ---------------------------------------------------------------------------
-- A phone in free text, as phonesIn() of src/lib/domain/phones.ts: after NFKC, a run of digits joined by phone
-- separators (space, tab, dot, slash, underscore, dash, parentheses: up to three between two digits), with an optional
-- + and ( in front, not right after a digit nor after «letter-» (an ID: «V-12345678»). It is a phone with 7 digits or
-- more, except: an amount with dots for thousands («1.500.000»), a date («15/03/2024», «2024-03-15»), bare digits
-- shorter than 10 without a + («1500000»). \p{L} of the JavaScript is [[:alpha:]] plus the Latin, Greek and Cyrillic
-- letters spelled out (so a database in the C locale reads «Ñ-1234567» as an ID too).
create function public.text_has_phone(p text)
returns boolean language plpgsql immutable parallel safe set search_path = '' as $fn$
declare
  run text;
  digits text;
  piece text;
  figures boolean;
begin
  if p is null or p = '' then return false; end if;
  for run in
    select m[1] from regexp_matches(normalize(p, NFKC),
      '((?<![[:alpha:]À-ÖØ-öø-ɏͰ-ϿЀ-ӿ]-)(?<![0-9])\+?\(?[0-9](?:[ \t  ()./_-]{0,3}[0-9])*)', 'g') as m
  loop
    digits := regexp_replace(run, '[^0-9]', '', 'g');
    continue when length(digits) < 7;
    if run ~ '^\+?\(?[0-9]+$' then
      if left(run, 1) = '+' or length(digits) >= 10 then return true; end if;
      continue;
    end if;
    figures := true;
    foreach piece in array regexp_split_to_array(run, '[ \t  ]+') loop
      continue when piece !~ '[0-9]';
      if not (piece ~ '^\(?[0-9]{1,3}(?:\.[0-9]{3})+\)?$'
              or piece ~ '^(?:[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})$') then
        figures := false;
        exit;
      end if;
    end loop;
    if not figures then return true; end if;
  end loop;
  return false;
end $fn$;

-- The patterns of looksLikeDateTime() (src/lib/push/text.ts, PATTERNS), in the same order, written for PostgreSQL:
-- the text is lowercased first (A-Z and ÁÉÍÓÚÜÑ, as the JavaScript «i» flag does), \s is spelled out as JavaScript
-- reads it ({sp}), \b next to a digit is «no [a-z0-9_] on that side», and an optional tail with nothing after it is
-- left out (it never changes whether the text matches).
create function public.datetime_patterns()
returns text[] language plpgsql immutable parallel safe set search_path = '' as $fn$
declare
  pats text[] := array[
    -- ISO date or date-time: 2026-10-24, 2026-10-24T13:00:00Z
    '(?<![{w}])[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}',
    -- Phone numbers, 10 digits or more: 0414-1234567, +58 414 123 4567, (0276) 555-1234
    '[0-9](?:[{spc}().-]{0,2}[0-9]){9,}',
    -- Numeric dates: 24/10, 24-10-2026, 24.10.26
    '(?<![{w}])[0-9]{1,2}[/.-][0-9]{1,2}(?:[/.-][0-9]{2,4})?(?![{w}])',
    -- Short weekday before a day number: «sáb 24»
    '(?<![{l}])(?:{weekdays_short})\.?{sp}+(?=[0-9])',
    -- Day + month: «24 de octubre», «24 oct», «25-oct», «25/oct/2026»
    '(?<![{w}])[0-9]{1,2}(?:{sp}+(?:de{sp}+)?|{sp}*[/.-]{sp}*)(?:{months}|{months_short})\.?(?![{l}])',
    -- Month + day: «octubre 24», «oct. 25», «oct 25»
    '(?<![{l}])(?:{months}){sp}+[0-9]{1,2}(?![{w}])',
    '(?<![{l}])(?:{months_short})(?:\.{sp}*|{sp}+)[0-9]{1,2}(?![{w}])',
    -- «a las 9», «a las 9:30 p. m.», «a la 1 de la tarde», «a las 19h», «las 7 y media»
    '(?<![{l}])(?:a{sp}+)?las?{sp}+[0-9]{1,2}(?:(?::|h)[0-9]{2})?{hour_suffix}(?:{sp}*(?:a\.?{sp}?m|p\.?{sp}?m)\.?)?{after_hour}{daypart}(?![{l}0-9])',
    -- Hours in words: «a las nueve», «a la una y media»
    '(?<![{l}])(?:a{sp}+)?las?{sp}+(?:{hour_words}){after_hour}{daypart}(?![{l}])',
    -- Clock times: 9:30, 14h30
    '(?<![{w}])[0-9]{1,2}(?::|h)[0-9]{2}',
    -- 9am, 9 p. m.
    '(?<![{w}])[0-9]{1,2}{sp}*(?:a\.?{sp}?m|p\.?{sp}?m)\.?(?![{l}])',
    -- «nueve de la noche», «9 de la mañana»
    '(?<![{l}0-9])(?:{hour_words}|[0-9]{1,2}){after_hour}{sp}+de{sp}+la{sp}+(?:mañana|tarde|noche|madrugada)(?![{l}])',
    -- «19h», «19 horas», «8hs»
    '(?<![{w}])[0-9]{1,2}{sp}*(?:h|hs|hrs?|horas?)\.?(?![{l}0-9])',
    -- «de la mañana», «mediodía», «medianoche»
    '(?<![{l}])(?:de{sp}+la{sp}+(?:mañana|tarde|noche)|mediod[ií]a|medianoche)(?![{l}])',
    -- Weekdays and relative days
    '(?<![{l}])(?:{weekdays}|pasado{sp}+mañana|mañana|hoy|anoche|esta{sp}+(?:noche|tarde))(?![{l}])'
  ];
  -- The JavaScript constants. Compound pieces first (they hold the simple ones), then the simple ones.
  tokens text[] := array[
    '{after_hour}', '(?:{sp}+(?:y|menos){sp}+(?:{minute_words}))?(?:{sp}+en{sp}+punto)?',
    '{hour_suffix}', '(?:{sp}*(?:h|hs|hrs?|horas?)\.?)?',
    '{daypart}', '(?:{sp}+(?:de{sp}+la{sp}+)?(?:mañana|tarde|noche|madrugada))?',
    '{months_short}', 'ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic',
    '{months}', 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre',
    '{weekdays_short}', 'lun|mar|mi[eé]|jue|vie|s[aá]b|dom',
    '{weekdays}', 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo',
    '{hour_words}', 'una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce',
    '{minute_words}', 'media|cuarto|cinco|diez|quince|veinte|veinticinco|[0-9]{1,2}',
    '{sp}', '[{spc}]',
    -- JavaScript's \s
    '{spc}', '\t\n\v\f\r    -     　﻿',
    -- letters (after lowercasing) and word characters
    '{l}', 'a-záéíóúüñ',
    '{w}', 'a-z0-9_'
  ];
  i int;
  j int;
begin
  for i in 1 .. array_length(pats, 1) loop
    j := 1;
    while j < array_length(tokens, 1) loop
      pats[i] := replace(pats[i], tokens[j], tokens[j + 1]);
      j := j + 2;
    end loop;
  end loop;
  return pats;
end $fn$;

-- A date, a time or a phone in free text, as looksLikeDateTime().
create function public.text_has_datetime(p text)
returns boolean language sql immutable parallel safe set search_path = '' as $fn$
  select coalesce(p, '') <> '' and exists (
    select 1 from unnest(public.datetime_patterns()) as re
     where translate(p, 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑ', 'abcdefghijklmnopqrstuvwxyzáéíóúüñ') ~ re)
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The checks. A newline joins the fields: it ends a run of digits, so two fields never make one phone.
-- ---------------------------------------------------------------------------
-- The obra's main text that Redes and Grabación read (visit_obra_ficha below): the app refuses the same on save
-- (mainTextPhone, and dialogContactProblem for «Lo que voy a decir»).
alter table public.obra_fichas add constraint obra_fichas_main_no_phone check (not public.text_has_phone(concat_ws(E'\n',
  name, parish, sector, engineer_name, problem, problem_since, why_decided, works, communities, benefits, executor,
  investment, funding_source, difficulties, solutions, other_aid, pending_needs, next_action, fab_dialog)));

-- The reason of a cancelled event: everyone who sees the event reads it (Redes too), and the obra's history keeps it.
alter table public.events add constraint events_cancel_reason_private
  check (not public.text_has_phone(cancel_reason) and not public.text_has_datetime(cancel_reason));

-- ---------------------------------------------------------------------------
-- 3. An obra for Redes and Grabación: the columns of the «Ficha de obra» tab, while a live visit they see links to it
-- ---------------------------------------------------------------------------
-- Whether the caller sees a LIVE visit linked to this obra (not deleted, not cancelled, not rejected by the boss).
-- can_see_event: admin, boss, despacho, Redes, the camera person assigned; never the IVT nor política.
create function public.obra_visit_visible(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_obra is not null and exists (
    select 1 from public.obra_fichas f join public.events e on e.obra_ficha_id = f.id
     where f.id = p_obra and f.deleted_at is null
       and e.deleted_at is null and e.cancelled_at is null and e.boss_decision <> 'rejected'
       and public.can_see_event(e.id))
$$;

-- Exactly what the tab shows without the contacts (ficha-tab.ts): no stage, no rev, no author, no times, no follow-up
-- owner, no start, delivery or follow-up day, and marks only for these fields. The obra roles read the table itself.
create function public.visit_obra_ficha(p_obra uuid)
returns table (
  id uuid, code text, name text, municipality text, parish text, sector text, engineer_name text,
  problem text, problem_since text, why_decided text, works text, communities text,
  people_count int, families_count int, benefits text,
  executor text, investment text, currency text, funding_source text, work_state text, progress_pct smallint,
  difficulties text, solutions text, other_aid text, pending_needs text, next_action text,
  fab_dialog text, marks jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.code, f.name, f.municipality, f.parish, f.sector, f.engineer_name,
         f.problem, f.problem_since, f.why_decided, f.works, f.communities,
         f.people_count, f.families_count, f.benefits,
         f.executor, f.investment, f.currency, f.funding_source, f.work_state, f.progress_pct,
         f.difficulties, f.solutions, f.other_aid, f.pending_needs, f.next_action,
         f.fab_dialog,
         coalesce((select jsonb_object_agg(m.key, m.value) from jsonb_each(f.marks) m
                    where m.key = any (array['parish', 'sector', 'engineer_name', 'problem', 'problem_since', 'why_decided',
                                             'works', 'communities', 'people_count', 'families_count', 'benefits', 'executor',
                                             'investment', 'currency', 'funding_source', 'work_state', 'progress_pct',
                                             'difficulties', 'solutions', 'other_aid', 'pending_needs', 'next_action'])),
                  '{}'::jsonb)
    from public.obra_fichas f
   where f.id = p_obra and public.obra_visit_visible(f.id)
$$;

-- The table: the obra roles only (Redes and Grabación go through visit_obra_ficha). Inline, so INSERT ... RETURNING
-- sees the new row.
drop policy obra_fichas_select on public.obra_fichas;
create policy obra_fichas_select on public.obra_fichas for select to authenticated
  using ((deleted_at is null and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[]))
         or (deleted_at is not null and public.has_role('admin')));

-- An obra's files: its roles all of them (they read the obra row); whoever sees a live visit of it (Redes, the camera
-- person assigned) only the before and progress photos. The rest as in 20261027002100_obra_documents.sql.
drop policy media_select on public.media_assets;
create policy media_select on public.media_assets for select to authenticated
  using ((deleted_at is null and (
           (event_id is not null and public.can_see_event(event_id)
            and public.has_any_role(array['admin', 'boss', 'social', 'camera', 'dispatch']::public.app_role[]))
           or (event_id is null and obra_ficha_id is null and community_report_id is null and public.is_content_team())
           or (obra_ficha_id is not null and (
                 (public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
                  and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
                 or (kind in ('before', 'progress') and public.obra_visit_visible(media_assets.obra_ficha_id))))
           or (community_report_id is not null
               and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id))))
         or (deleted_at is not null and public.has_role('admin')));

-- Changing a file: your own upload; admin any; the boss any file he reads; Redes only what it reads (an obra's before
-- and progress photos while the visit is live).
drop policy media_update on public.media_assets;
create policy media_update on public.media_assets for update to authenticated
  using (uploaded_by = auth.uid() or public.has_role('admin')
         or (public.has_any_role(array['social', 'boss']::public.app_role[]) and deleted_at is null and (
               (event_id is not null and public.can_see_event(event_id))
               or (event_id is null and obra_ficha_id is null and community_report_id is null)
               or (obra_ficha_id is not null and (
                     (public.has_role('boss') and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
                     or (kind in ('before', 'progress') and public.obra_visit_visible(media_assets.obra_ficha_id))))
               or (community_report_id is not null
                   and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id)))))
  with check (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- 4. The day an event happened: closed as a column, given by event_done_on() to who may read it
-- ---------------------------------------------------------------------------
revoke select on public.events from authenticated;
grant select (id, code, title, place_name, municipality, summary, category_id, priority, boss_decision, work_status,
              urgency, created_by, created_at, updated_at, deleted_at, obra_ficha_id, community_report_id, kind, origin,
              rev, updated_by, cancelled_at, cancelled_by, cancel_reason)
  on public.events to authenticated;

create function public.event_done_on(p_event uuid)
returns date language sql stable security definer set search_path = public as $$
  select e.done_on from public.events e
   where e.id = p_event and e.done_on is not null
     and (e.deleted_at is null or public.has_role('admin'))
     and (public.can_see_event(e.id) or public.can_see_schedule(e.id))
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges (rule of 20261026001400_functions_closed_to_anon.sql). The text rules run inside CHECKs, which need
--    EXECUTE for whoever writes the row; the rest is called by policies and the app.
-- ---------------------------------------------------------------------------
revoke all on function public.text_has_phone(text) from public, anon;
revoke all on function public.datetime_patterns() from public, anon;
revoke all on function public.text_has_datetime(text) from public, anon;
revoke all on function public.obra_visit_visible(uuid) from public, anon;
revoke all on function public.visit_obra_ficha(uuid) from public, anon;
revoke all on function public.event_done_on(uuid) from public, anon;
grant execute on function public.text_has_phone(text), public.datetime_patterns(), public.text_has_datetime(text),
  public.obra_visit_visible(uuid), public.visit_obra_ficha(uuid), public.event_done_on(uuid) to authenticated;
