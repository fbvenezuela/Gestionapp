-- 360 says «la app», not «la plataforma» (12/11, decision 5 of the team-guide round): the generated fichas of
-- assistant_refresh() said «La plataforma se llama…», «En la plataforma se le dice…» and «la plataforma avisa a Redes»,
-- and 360 says a ficha as it is. The same function as in 20261027001600_six_roles.sql (nothing here edits an earlier
-- file), with those three texts in «la app» and the brand ficha titled «La marca y la app» («plataforma» stays among its
-- tags: people still say it). A ficha the team edited is not overwritten (assistant_put_auto).

create or replace function public.assistant_refresh()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_keys text[] := '{}';
  v_brand jsonb := (select value from public.app_settings where key = 'brand');
  v_slots jsonb := (select value from public.app_settings where key = 'tweets.slots');
  v_per_day jsonb := (select value from public.app_settings where key = 'tweets.per_day');
  v_low int := (select (value #>> '{}')::int from public.app_settings where key = 'tweets.low_stock_days');
  v_windows jsonb := (select value from public.app_settings where key = 'publishing.windows');
  v_deadlines jsonb := (select value from public.app_settings where key = 'review.deadlines_min');
  v_days text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_content constant public.app_role[] := array['admin', 'social', 'boss']::public.app_role[];
  v_text text;
  v_list text;
  r record;
  f record;
begin
  -- Brand and the app.
  if v_brand is null then
    v_text := 'Todavía no hay datos de la marca cargados. No inventes el nombre del cliente ni sus datos.';
  else
    v_text := format('La app se llama %s (%s). El equipo trabaja para %s, %s (%s). En la app se le dice «%s».',
      coalesce(v_brand ->> 'appName', 'sin nombre'), coalesce(v_brand ->> 'shortName', ''),
      coalesce(v_brand ->> 'clientName', 'sin dato'), coalesce(v_brand ->> 'clientTitle', 'sin dato'),
      coalesce(v_brand ->> 'region', 'sin dato'), coalesce(v_brand ->> 'bossLabel', 'el jefe'));
    if v_brand ? 'greeting' then v_text := v_text || format(' Saludo de los copies: «%s».', v_brand ->> 'greeting'); end if;
    if jsonb_typeof(v_brand -> 'closings') = 'array' then
      v_text := v_text || ' Cierres de marca: ' || (select string_agg('«' || x || '»', ', ') from jsonb_array_elements_text(v_brand -> 'closings') x) || '.';
    end if;
    if jsonb_typeof(v_brand -> 'hashtags') = 'array' then
      v_text := v_text || ' Hashtags base: ' || (select string_agg(x, ' ') from jsonb_array_elements_text(v_brand -> 'hashtags') x) || '.';
    end if;
  end if;
  perform public.assistant_put_auto('auto:marca', null, 'La marca y la app', v_text, array['marca', 'app', 'plataforma']);
  v_keys := array_append(v_keys, 'auto:marca'::text);

  -- Tweets of the week.
  if v_slots is null or jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) = 0 then
    v_text := 'No hay franjas de tweets guardadas. No inventes horarios de tweets.';
  else
    v_text := format('Los tweets salen de %s a %s al día, en estas franjas (hora local): %s.',
      coalesce(v_per_day ->> 'min', '2'), coalesce(v_per_day ->> 'max', '3'),
      (select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ', ') from jsonb_array_elements(v_slots) x));
    if v_low is not null then
      v_text := v_text || format(' Cuando quedan %s días o menos de tweets programados, la app avisa a Redes.', v_low);
    end if;
  end if;
  perform public.assistant_put_auto('auto:tweets', v_content, 'Horarios de los tweets', v_text, array['tweets', 'horarios']);
  v_keys := array_append(v_keys, 'auto:tweets'::text);

  -- Best hours per network (advice only, never blocks a publication).
  if v_windows is null or jsonb_typeof(v_windows) <> 'object' or v_windows = '{}'::jsonb then
    perform public.assistant_put_auto('auto:horas', v_content, 'Mejores horas para publicar',
      'No hay mejores horas guardadas para ninguna red. No inventes horarios.', array['horas', 'publicar']);
    v_keys := array_append(v_keys, 'auto:horas'::text);
  else
    for r in select j.key as net, j.value as w, coalesce(ns.label, initcap(j.key)) as label
               from jsonb_each(v_windows) j left join public.network_specs ns on ns.network = j.key
              where jsonb_typeof(j.value) = 'object' order by j.key loop
      v_text := format('Mejores horas en %s (hora local): %s.', r.label,
        coalesce((select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ' o ') from jsonb_array_elements(public.assistant_arr(r.w -> 'best')) x), 'sin dato'));
      v_list := (select string_agg(v_days[(d #>> '{}')::int], ', ') from jsonb_array_elements(public.assistant_arr(r.w -> 'bestDays')) d
                  where (d #>> '{}') ~ '^[1-7]$');
      if v_list is not null then v_text := v_text || ' Mejores días: ' || v_list || '.'; end if;
      v_list := (select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ' o ') from jsonb_array_elements(public.assistant_arr(r.w -> 'avoid')) x);
      if v_list is not null then v_text := v_text || ' Evitar: ' || v_list || '.'; end if;
      v_list := (select string_agg(v_days[(d #>> '{}')::int], ', ') from jsonb_array_elements(public.assistant_arr(r.w -> 'avoidDays')) d
                  where (d #>> '{}') ~ '^[1-7]$');
      if v_list is not null then v_text := v_text || ' Días que peor rinden: ' || v_list || '.'; end if;
      if coalesce(r.w ->> 'note', '') <> '' then v_text := v_text || ' ' || (r.w ->> 'note'); end if;
      v_text := v_text || ' Es un consejo: nunca bloquea una publicación.';
      perform public.assistant_put_auto('auto:horas:' || r.net, v_content,
        'Mejores horas en ' || r.label, v_text, array['horas', 'publicar', r.net]);
      v_keys := array_append(v_keys, ('auto:horas:' || r.net)::text);
    end loop;
  end if;

  -- Approval traffic light and its deadlines. One approver: the boss.
  v_text := format('Semáforo de aprobación. Todo lo aprueba el jefe: las piezas verdes, amarillas y rojas, y los tweets. '
    'Verde (rutina): plazo %s; el jefe aprueba todas las verdes de una vez, con un toque. '
    'Amarillo (normal): plazo %s. Rojo (sensible: política, crisis, aclaratorias): plazo %s. '
    'La falta de respuesta no es aprobación: vencido el plazo la pieza sigue sin aprobar, sale en «Trancado» y se avisa de nuevo. '
    'Lo que sale es exactamente lo aprobado: si cambia el video o un copy, vuelve a revisión.',
    public.assistant_minutes(coalesce((v_deadlines ->> 'verde')::int, 1440)),
    public.assistant_minutes(coalesce((v_deadlines ->> 'amarillo')::int, 60)),
    public.assistant_minutes(coalesce((v_deadlines ->> 'rojo')::int, 30)));
  perform public.assistant_put_auto('auto:semaforo', null, 'El semáforo de aprobación', v_text, array['aprobar', 'semaforo', 'color', 'nivel', 'plazo']);
  v_keys := array_append(v_keys, 'auto:semaforo'::text);

  -- Copy formulas: a summary and one ficha per active formula.
  v_list := (select string_agg(code || ' (' || name || ')', ', ' order by sort, code)
               from public.copy_formulas where active and deleted_at is null);
  perform public.assistant_put_auto('auto:formulas', v_content, 'Fórmulas de copies',
    coalesce('Fórmulas de copies activas: ' || v_list || '. Cada pieza lleva tres largos (largo, medio y corto), con voz del jefe o institucional y un cierre.',
             'No hay fórmulas de copies activas. No inventes ninguna.'),
    array['copies', 'formulas']);
  v_keys := array_append(v_keys, 'auto:formulas'::text);
  for f in select code, name, description, steps from public.copy_formulas where active and deleted_at is null order by sort, code loop
    v_text := f.name || '. ' || coalesce(nullif(f.description, ''), '') ||
      coalesce(' Pasos: ' || (select string_agg((s ->> 'label') || coalesce(' (' || nullif(s ->> 'hint', '') || ')', ''), '; ')
                                from jsonb_array_elements(case when jsonb_typeof(f.steps) = 'array' then f.steps else '[]'::jsonb end) s) || '.', '');
    perform public.assistant_put_auto('auto:formula:' || f.code, v_content, 'Fórmula ' || f.code, v_text, array['copies', 'formula', lower(f.code)]);
    v_keys := array_append(v_keys, ('auto:formula:' || f.code)::text);
  end loop;

  -- Video rules per network.
  for r in select network, label, formats, copy_max_chars, length_group, notes from public.network_specs order by network loop
    v_text := format('Reglas de %s: el copy va en su versión %s, de hasta %s caracteres.', r.label,
      case r.length_group when 'long' then 'larga' when 'medium' then 'media' else 'corta' end, r.copy_max_chars);
    for f in select key as fmt, value as v from jsonb_each(case when jsonb_typeof(r.formats) = 'object' then r.formats else '{}'::jsonb end) order by key loop
      v_list := concat_ws(', ',
        case when f.v ? 'min_duration_s' and f.v ? 'max_duration_s' then
               'dura de ' || (f.v ->> 'min_duration_s') || ' a ' || (f.v ->> 'max_duration_s') || ' segundos'
             when f.v ? 'max_duration_s' then 'dura hasta ' || (f.v ->> 'max_duration_s') || ' segundos'
             when f.v ? 'min_duration_s' then 'dura desde ' || (f.v ->> 'min_duration_s') || ' segundos' end,
        case when jsonb_typeof(f.v -> 'aspects') = 'array' then
          'formato ' || (select string_agg(a, ' o ') from jsonb_array_elements_text(f.v -> 'aspects') a) end,
        case when f.v ? 'min_width' then 'ancho mínimo ' || (f.v ->> 'min_width') || ' px' end,
        case when f.v ? 'max_size_mb' then 'hasta ' || (f.v ->> 'max_size_mb') || ' MB' end,
        case when f.v ? 'max_fps' then 'hasta ' || (f.v ->> 'max_fps') || ' cuadros por segundo' end);
      v_text := v_text || ' ' || case f.fmt when 'reel' then 'Reel' when 'photo' then 'Foto' when 'video' then 'Video'
          when 'short' then 'Short' when 'post' then 'Publicación' when 'carousel' then 'Carrusel' else initcap(f.fmt) end
        || ': ' || coalesce(nullif(v_list, ''), 'sin reglas guardadas') || '.';
    end loop;
    if coalesce(r.notes, '') <> '' then v_text := v_text || ' Nota: ' || r.notes; end if;
    perform public.assistant_put_auto('auto:red:' || r.network, v_content || 'camera'::public.app_role,
      'Reglas de video de ' || r.label, v_text, array['video', 'reglas', r.network]);
    v_keys := array_append(v_keys, ('auto:red:' || r.network)::text);
  end loop;

  -- Categories, per kind.
  for r in select distinct kind from public.categories where active and deleted_at is null order by kind loop
    v_list := (select string_agg(p.name || coalesce(' (' || (
                 select string_agg(c.name, ', ' order by c.sort, c.name) from public.categories c
                  where c.parent_id = p.id and c.active and c.deleted_at is null) || ')', ''), '; ' order by p.sort, p.name)
                 from public.categories p where p.kind = r.kind and p.parent_id is null and p.active and p.deleted_at is null);
    perform public.assistant_put_auto('auto:categorias:' || r.kind, null,
      'Categorías de ' || case r.kind when 'content' then 'contenido' when 'event' then 'eventos'
        when 'traceability' then 'trazabilidad' when 'youtube_pillar' then 'pilares de YouTube' else r.kind end,
      coalesce(v_list, 'No hay categorías activas de este tipo.') || '.', array['categorias', r.kind]);
    v_keys := array_append(v_keys, ('auto:categorias:' || r.kind)::text);
  end loop;

  update public.assistant_knowledge set active = false
   where origin = 'plataforma' and active and key like 'auto:%' and not (key = any (v_keys));
  return coalesce(array_length(v_keys, 1), 0);
end $$;

select public.assistant_refresh();

-- Privileges (rule of 20261026001400_functions_closed_to_anon.sql): CREATE OR REPLACE keeps them; stated again so this
-- file reads on its own.
revoke all on function public.assistant_refresh() from public, anon, authenticated;
