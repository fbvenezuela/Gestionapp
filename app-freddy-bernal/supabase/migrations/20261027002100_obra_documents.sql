-- Fixes found in the review of the ficha inside its event (wave D). Nothing here edits an earlier file.
--
--   1. An obra's «Documentos» (kind 'document': the community's denuncia, actas, oficios, «un PDF o la foto de un
--      papel») carry the names, ID numbers and phones that the ficha keeps in obra_ficha_private for the obra roles.
--      media_select's obra branch (20261027001900_media_handoff.sql) gave every file of an obra to whoever reads the
--      obra row, so Redes and the camera person of a live visit read and downloaded them. Now they read only the
--      photos the visit needs: 'before' and 'progress'. Documents stay with the obra roles (admin, boss, despacho,
--      IVT), the ones that read the private part.
--   2. media_update's Redes / boss branch (20261027001950_fichas_media_fixes.sql) follows: Redes changes only the
--      obra files it can read (the before and progress photos); the boss any of the obra's files.
-- A report's files are untouched: Redes and Grabación never read a report (community_reports_select).
-- No enum values and no rows (stable demo ids renumber migration rows with UPDATE).

drop policy media_select on public.media_assets;
create policy media_select on public.media_assets for select to authenticated
  using ((deleted_at is null and (
           (event_id is not null and public.can_see_event(event_id)
            and public.has_any_role(array['admin', 'boss', 'social', 'camera', 'dispatch']::public.app_role[]))
           or (event_id is null and obra_ficha_id is null and community_report_id is null and public.is_content_team())
           -- An obra's files: whoever reads the obra under its own RLS (obra_fichas_select); its documents only the
           -- obra roles (Redes and Grabación read a live visit's obra, never its papers).
           or (obra_ficha_id is not null
               and (kind in ('before', 'progress')
                    or public.has_any_role(array['admin', 'boss', 'dispatch', 'ivt']::public.app_role[]))
               and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
           or (community_report_id is not null
               and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id))))
         or (deleted_at is not null and public.has_role('admin')));

drop policy media_update on public.media_assets;
create policy media_update on public.media_assets for update to authenticated
  using (uploaded_by = auth.uid() or public.has_role('admin')
         or (public.has_any_role(array['social', 'boss']::public.app_role[]) and deleted_at is null and (
               (event_id is not null and public.can_see_event(event_id))
               or (event_id is null and obra_ficha_id is null and community_report_id is null)
               or (obra_ficha_id is not null
                   and (kind in ('before', 'progress') or public.has_role('boss'))
                   and exists (select 1 from public.obra_fichas f where f.id = media_assets.obra_ficha_id))
               or (community_report_id is not null
                   and exists (select 1 from public.community_reports r where r.id = media_assets.community_report_id)))))
  with check (uploaded_by = auth.uid() or public.has_any_role(array['admin', 'social', 'boss']::public.app_role[]));
