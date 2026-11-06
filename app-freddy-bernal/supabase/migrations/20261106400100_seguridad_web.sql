-- The security review of the public website and the attention desk (6/11/2026, docs/SEGURIDAD.md «Web pública y
-- atención ciudadana: revisión del 06/11»). Nothing here edits an earlier file.
--
--   * The audit trail never widens who reads a value. Auditoría reads audit_log for the web's tables
--     (20261106000200_participacion.sql, audit_select_auditor), but it does not read web_media (the library: the keys of
--     photos and PDFs that may not be published yet, and the public bucket serves any key) nor the private rows of
--     web_settings (site.internal_notes, the team's notes about the site's accounts). Their trail was a full copy of
--     the row (audit_row()), so Auditoría could read through the audit log what RLS keeps from it. From now on the
--     trail of those two keeps which row, who, when, the workflow fields and the NAMES of the fields that changed:
--     never a storage key, the words of a library file, or the value of a private setting. A public setting keeps its
--     value in the trail (anyone reads it anyway). Administración reads both tables directly, so it loses nothing.
--   * Rows already written stay as they were (the trail is append-only, for the system too). A real project that already
--     has library uploads or private settings in its trail keeps those rows; docs/SEGURIDAD.md says so.

create function public.audit_web_side_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_drop text[];
  v_fields jsonb;
begin
  if tg_op = 'UPDATE' and v_new = v_old then return null; end if;
  if tg_table_name = 'web_media' then
    v_drop := array['storage_key', 'alt', 'caption', 'credit', 'title'];
  elsif coalesce((v_old ->> 'is_public')::boolean, true) and coalesce((v_new ->> 'is_public')::boolean, true) then
    v_drop := array[]::text[];
  else
    -- A private setting (now or before): its value never goes to the trail.
    v_drop := array['value'];
  end if;
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_fields
    from unnest(v_drop) k
   where case when tg_op = 'UPDATE' then (v_new -> k) is distinct from (v_old -> k) else coalesce(v_new, v_old) ? k end;
  insert into public.audit_log (actor_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'), lower(tg_op),
          v_old - v_drop,
          case when v_new is null then null else (v_new - v_drop) || jsonb_build_object('content_fields', v_fields) end);
  return null;
end $$;

-- The standard trail (wire_standard_triggers) gave both tables audit_row(); the same trigger names, the new function.
drop trigger audit_web_media on public.web_media;
create trigger audit_web_media after insert or update or delete on public.web_media
  for each row execute function public.audit_web_side_row();
drop trigger audit_web_settings on public.web_settings;
create trigger audit_web_settings after insert or update or delete on public.web_settings
  for each row execute function public.audit_web_side_row();

-- A trigger function: nobody calls it (rule of 20261026001400_functions_closed_to_anon.sql).
revoke all on function public.audit_web_side_row() from public, anon, authenticated;
