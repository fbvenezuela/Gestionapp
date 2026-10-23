-- Storage buckets/policies and Realtime publication. Only applies on a real Supabase
-- project (the `storage` schema and the `supabase_realtime` publication exist there).
-- The in-memory demo database skips this block.

do $outer$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values
      ('public-media', 'public-media', true, 52428800),
      ('material', 'material', false, 21474836480),
      ('covers', 'covers', false, 52428800),
      ('wardrobe', 'wardrobe', false, 52428800),
      ('citizen-private', 'citizen-private', false, 52428800)
    on conflict (id) do nothing;

    -- Private material: readable when the matching media_assets row is readable
    -- under its own RLS (so the date rule and assignments carry over to files).
    execute $p$
      create policy material_read on storage.objects for select to authenticated
      using (bucket_id in ('material', 'covers') and exists (
        select 1 from public.media_assets m where m.bucket = storage.objects.bucket_id and m.storage_path = storage.objects.name))
    $p$;
    -- Uploads: the app first creates the media_assets row (RLS checks the role and
    -- the assignment), then uploads to exactly that path.
    execute $p$
      create policy material_insert on storage.objects for insert to authenticated
      with check (bucket_id in ('material', 'covers') and exists (
        select 1 from public.media_assets m
         where m.bucket = storage.objects.bucket_id and m.storage_path = storage.objects.name
           and m.uploaded_by = auth.uid() and m.status = 'uploading'))
    $p$;
    execute $p$
      create policy material_update on storage.objects for update to authenticated
      using (bucket_id in ('material', 'covers') and owner_id = auth.uid()::text)
    $p$;
    execute $p$
      create policy public_media_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'public-media')
    $p$;
    execute $p$
      create policy wardrobe_rw on storage.objects for all to authenticated
      using (bucket_id = 'wardrobe' and public.has_any_role(array['admin', 'boss', 'social']::public.app_role[]))
      with check (bucket_id = 'wardrobe' and public.has_any_role(array['admin', 'boss', 'social']::public.app_role[]))
    $p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- event_schedule is deliberately NOT published.
    alter publication supabase_realtime add table public.events, public.pieces, public.tweets,
      public.publications, public.notifications, public.media_assets;
  end if;
end
$outer$;
