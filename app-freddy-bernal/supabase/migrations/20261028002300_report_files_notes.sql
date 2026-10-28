-- A community report's papers and notes (audit of the round, 28/10/2026). Nothing here edits an earlier file.
--
--   1. A report's documents (a denuncia, an acta: names, ID numbers and phones of the community) are third-party data,
--      and D-41 keeps those with política, despacho and the boss. media_select (20261028002100_privacy_hardening.sql)
--      gave every file of a report to whoever reads the report's main part, Administración too. Now Administración
--      keeps the report's photos (before and after) and never its documents; política, despacho and the boss read all
--      of them. Redes and Grabación never read a report, so none of its files either. Every other branch of
--      media_select stays exactly as it was (the trash, deleted rows, is still Administración's).
--   2. Uploading to a report: política, despacho and the boss only, as community_reports_insert since D-41
--      (media_insert, 20261027001900_media_handoff.sql, still named admin). The other branches stay as they were.
--   3. A report's history note never carries a phone: Administración, despacho, política and the boss read the history
--      without 2FA, and the phones go in the report's contacts. The same rule as the app (phonesIn() of
--      src/lib/domain/phones.ts, through text_has_phone()), for the notes written by hand, the reason of a change of
--      state and the reason of «No va a la agenda» (both go into ficha_updates.note through app.history_note). NOT
--      VALID: the history is append-only, and what was written before stays as it was. An obra's notes are untouched
--      (its contacts' roles read its history: admin, the boss, despacho and the IVT).
-- No functions, no enum values, no rows, nothing new in the Realtime publication.

-- ---------------------------------------------------------------------------
-- 1. Reading a report's files: its photos for whoever reads the report, its documents for política, despacho and the boss
-- ---------------------------------------------------------------------------
alter policy media_select on public.media_assets
  using ((deleted_at is null and (
           (event_id is not null and public.can_see_event(event_id)
            and public.has_any_role(array['admin', 'boss', 'social', 'camera', 'dispatch']::public.app_role[]))
           or (event_id is null and obra_ficha_id is null and community_report_id is null and public.is_content_team())
           or (obra_ficha_id is not null and (
                 (public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
                  and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
                 or (kind in ('before', 'progress') and public.obra_visit_visible(media_assets.obra_ficha_id))))
           or (community_report_id is not null
               and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id)
               and (kind in ('before', 'after')
                    or public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])))))
         or (deleted_at is not null and public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- 2. Uploading to a report: política, despacho and the boss
-- ---------------------------------------------------------------------------
alter policy media_insert on public.media_assets
  with check (uploaded_by = auth.uid() and (
    (public.has_any_role(array['admin', 'social', 'boss']::public.app_role[])
     and obra_ficha_id is null and community_report_id is null)
    or (public.has_role('camera') and event_id is not null and public.is_assigned(event_id)
        and kind in ('boss', 'drone', 'broll', 'other', 'storyboard'))
    or (obra_ficha_id is not null and kind in ('before', 'progress', 'document')
        and public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[])
        and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id and f.deleted_at is null))
    or (community_report_id is not null and kind in ('before', 'after', 'document')
        and public.has_any_role(array['boss', 'dispatch', 'politics']::public.app_role[])
        and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id and r.deleted_at is null))
  ));

-- ---------------------------------------------------------------------------
-- 3. No phone in a report's history note (the app refuses it first: src/lib/actions/reports.ts)
-- ---------------------------------------------------------------------------
alter table public.ficha_updates add constraint ficha_updates_report_note_no_phone
  check (community_report_id is null or not public.text_has_phone(note)) not valid;
