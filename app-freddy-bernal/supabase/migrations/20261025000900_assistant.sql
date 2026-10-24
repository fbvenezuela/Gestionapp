-- Team assistant (docs/ASISTENTE.md, adapted from the "Un asistente para tu web" manual).
--
-- Rules that live here, not in a prompt:
--   * Every assistant table has RLS on, NO policies and NO grants to anon/authenticated.
--     Only the server touches them (withSystem), always checking in code that the
--     conversation belongs to the caller.
--   * People's data is read by the tools AS THE PERSON (db(session, ...)), never here.
--   * The boss's agenda (the private schedule table) is never copied into anything below.
--   * Nothing said by the assistant is deleted: messages are append-only.

-- ---------------------------------------------------------------------------
-- What it knows: fichas. 'plataforma' = generated (assistant_refresh) or seeded from
-- config/assistant; 'equipo' = written or edited by the team (never overwritten).
-- ---------------------------------------------------------------------------
create table public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  roles public.app_role[],                     -- null = every role
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  tags text[] not null default '{}',
  origin text not null default 'equipo' check (origin in ('plataforma', 'equipo')),
  key text unique,                             -- 'auto:...' (refresh), 'guia:...' (seed)
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- How it answers: example conversations (tone, not data).
create table public.assistant_scripts (
  id uuid primary key default gen_random_uuid(),
  roles public.app_role[],                     -- null = every role
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  triggers text[] not null default '{}',
  script text not null check (char_length(btrim(script)) between 1 and 6000),
  notes text,
  always boolean not null default false,
  active boolean not null default true,
  origin text not null default 'equipo' check (origin in ('fabrica', 'equipo', 'conversacion')),
  key text unique,                             -- 'fabrica:...' (seed)
  times_used int not null default 0,
  last_used_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversations. Scope is decided by the server, never by the window. Phase 3 (public
-- site) may add other scopes; today only 'equipo' exists and it always has a person.
create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  scope text not null default 'equipo' check (scope in ('equipo')),
  title text not null default '' check (char_length(title) <= 200),
  escalated_at timestamptz,
  escalated_reason text,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  check (scope <> 'equipo' or user_id is not null)
);
create index assistant_conversations_user_idx on public.assistant_conversations (user_id, last_at desc);
create index assistant_conversations_last_idx on public.assistant_conversations (last_at desc);

-- What was said. Person texts are stored already redacted (no emails, phones, times, dates).
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations (id),
  who text not null check (who in ('persona', 'asistente')),
  body text not null,
  model text,
  tokens_in int,
  tokens_out int,
  ms int,
  error text,
  degraded boolean not null default false,
  tools jsonb,
  go_to jsonb,
  created_at timestamptz not null default now()
);
create index assistant_messages_conv_idx on public.assistant_messages (conversation_id, created_at);
create index assistant_messages_at_idx on public.assistant_messages (created_at desc);

-- "Lo que preguntan": questions, already redacted. Shorter than 12 characters are ignored.
create table public.assistant_heard (
  id uuid primary key default gen_random_uuid(),
  role public.app_role,
  text text not null check (char_length(text) between 12 and 1000),
  knowledge_id uuid references public.assistant_knowledge (id),
  discarded boolean not null default false,
  created_at timestamptz not null default now()
);
create index assistant_heard_at_idx on public.assistant_heard (created_at desc);

-- "Prepara": what the assistant drafted and a person must confirm in the panel.
create table public.assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('aviso')),
  created_by uuid references public.profiles (id),
  conversation_id uuid references public.assistant_conversations (id),
  summary text not null default '',
  body text not null default '',
  target jsonb not null default '{}'::jsonb,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado', 'descartado')),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now()
);
create index assistant_drafts_status_idx on public.assistant_drafts (status, created_at desc);

-- "Hace": what the assistant wrote, with undo.
create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.assistant_conversations (id),
  user_id uuid references public.profiles (id),
  action text not null,
  entity text,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  undone_at timestamptz,
  undone_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index assistant_actions_at_idx on public.assistant_actions (created_at desc);

create trigger touch_assistant_knowledge before update on public.assistant_knowledge
  for each row execute function public.touch_updated_at();
create trigger touch_assistant_scripts before update on public.assistant_scripts
  for each row execute function public.touch_updated_at();

-- Nothing said is deleted or rewritten: it is the only proof of what the assistant said.
create or replace function public.assistant_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Lo que dijo el asistente no se borra ni se cambia.' using errcode = '42501';
end $$;
create trigger assistant_messages_append_only before update or delete on public.assistant_messages
  for each row execute function public.assistant_append_only();
create trigger assistant_conversations_no_delete before delete on public.assistant_conversations
  for each row execute function public.assistant_append_only();

-- ---------------------------------------------------------------------------
-- RLS on, no policies, no grants: a browser cannot read or write anything here.
-- (Supabase grants new tables to the API roles by default; take that back.)
-- ---------------------------------------------------------------------------
alter table public.assistant_knowledge enable row level security;
alter table public.assistant_scripts enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_heard enable row level security;
alter table public.assistant_drafts enable row level security;
alter table public.assistant_actions enable row level security;

revoke all on public.assistant_knowledge, public.assistant_scripts, public.assistant_conversations,
  public.assistant_messages, public.assistant_heard, public.assistant_drafts, public.assistant_actions
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Plain text to compare without accents or signs: '¿Cómo te LLAMAS?' -> 'como te llamas'.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_plain(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''),
      'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖáéíóúüñàèìòùâêîôûäëïö',
      'AEIOUUNAEIOUAEIOUAEIOaeiouunaeiouaeiouaeio')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Pick the scripts that look like the question (manual §6):
--   3 points per trigger that appears whole (from the start of a word),
--   1 point per word of 4+ letters found in the topic or the triggers,
--   at least 2 points, the best p_top (3), ties go to the least used,
--   'always' scripts come every time. Only scripts offered to one of p_roles.
-- p_count = false is the panel's tester: it does not count usage.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_scripts_for(
  p_text text, p_roles public.app_role[], p_top int default 3, p_count boolean default true)
returns table (script_id uuid, script_key text, script_topic text, script_text text, script_always boolean, script_points int)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_text text := public.assistant_plain(p_text);
  v_words text[];
  v_ids uuid[] := '{}';
  r record;
begin
  select coalesce(array_agg(distinct w), '{}') into v_words
    from regexp_split_to_table(v_text, '\s+') w where length(w) >= 4;

  for r in
    with cand as (
      select s.id, s.key, s.topic, s.script, s.always, s.times_used,
             (select count(*) from unnest(s.triggers) d
               where public.assistant_plain(d) <> ''
                 and position(' ' || public.assistant_plain(d) in ' ' || v_text) > 0)::int * 3
           + (select count(*) from unnest(v_words) w
               where position(w in public.assistant_plain(s.topic || ' ' || array_to_string(s.triggers, ' '))) > 0)::int
             as points
        from public.assistant_scripts s
       where s.active and (s.roles is null or s.roles && coalesce(p_roles, '{}'::public.app_role[]))
    ), chosen as (
      select * from cand where always
      union all
      (select * from cand where not always and points >= 2
        order by points desc, times_used asc, topic
        limit greatest(coalesce(p_top, 3), 0))
    )
    select * from chosen order by always desc, points desc, times_used asc, topic
  loop
    script_id := r.id;
    script_key := r.key;
    script_topic := r.topic;
    script_text := r.script;
    script_always := r.always;
    script_points := r.points;
    v_ids := v_ids || r.id;
    return next;
  end loop;

  if p_count and array_length(v_ids, 1) > 0 then
    update public.assistant_scripts set times_used = times_used + 1, last_used_at = now() where id = any (v_ids);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Automatic fichas (manual §5). One upsert helper that only ever rewrites rows of origin
-- 'plataforma': what the team edited (origin 'equipo') is never touched.
-- ---------------------------------------------------------------------------
create or replace function public.assistant_put_auto(p_key text, p_roles public.app_role[], p_title text, p_body text, p_tags text[])
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.assistant_knowledge as k (key, roles, title, body, tags, origin, active)
  values (p_key, p_roles, left(p_title, 200), left(p_body, 6000), coalesce(p_tags, '{}'), 'plataforma', true)
  on conflict (key) do update
     set roles = excluded.roles, title = excluded.title, body = excluded.body, tags = excluded.tags, active = true
   where k.origin = 'plataforma'
     and (k.roles, k.title, k.body, k.tags, k.active)
         is distinct from (excluded.roles, excluded.title, excluded.body, excluded.tags, true)
$$;

-- A JSON value as an array (anything else = empty), so a malformed setting never breaks a refresh.
create or replace function public.assistant_arr(j jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end
$$;

create or replace function public.assistant_minutes(m int)
returns text language sql immutable as $$
  select case when m is null then 'sin plazo'
              when m < 120 then m || ' minutos'
              when m % 1440 = 0 then (m / 1440) || case when m = 1440 then ' día' else ' días' end
              else (m / 60) || ' horas' end
$$;

-- Regenerates the 'plataforma' fichas from the platform's own data: copy formulas, network
-- rules, settings (brand, tweet slots, best hours, review deadlines) and categories. Only
-- active rows. What no longer exists is switched off, never deleted. Returns how many
-- fichas it produced. A missing datum is declared, not omitted.
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
  v_content constant public.app_role[] := array['admin', 'social', 'supervisor']::public.app_role[];
  v_text text;
  v_list text;
  r record;
  f record;
begin
  -- Brand and platform.
  if v_brand is null then
    v_text := 'Todavía no hay datos de la marca cargados. No inventes el nombre del cliente ni sus datos.';
  else
    v_text := format('La plataforma se llama %s (%s). El equipo trabaja para %s, %s (%s). En la plataforma se le dice «%s».',
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
  perform public.assistant_put_auto('auto:marca', null, 'La marca y la plataforma', v_text, array['marca', 'plataforma']);
  v_keys := array_append(v_keys, 'auto:marca'::text);

  -- Tweets of the week.
  if v_slots is null or jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) = 0 then
    v_text := 'No hay franjas de tweets guardadas. No inventes horarios de tweets.';
  else
    v_text := format('Los tweets salen de %s a %s al día, en estas franjas (hora local): %s.',
      coalesce(v_per_day ->> 'min', '2'), coalesce(v_per_day ->> 'max', '3'),
      (select string_agg((x ->> 'from') || '–' || (x ->> 'to'), ', ') from jsonb_array_elements(v_slots) x));
    if v_low is not null then
      v_text := v_text || format(' Cuando quedan %s días o menos de tweets programados, la plataforma avisa a Redes.', v_low);
    end if;
  end if;
  perform public.assistant_put_auto('auto:tweets', v_content, 'Horarios de los tweets', v_text, array['tweets', 'horarios']);
  v_keys := array_append(v_keys, 'auto:tweets'::text);

  -- Best hours per network (advice only, never blocks a publication).
  if v_windows is null or jsonb_typeof(v_windows) <> 'object' or v_windows = '{}'::jsonb then
    perform public.assistant_put_auto('auto:horas', v_content || 'boss'::public.app_role, 'Mejores horas para publicar',
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
      perform public.assistant_put_auto('auto:horas:' || r.net, v_content || 'boss'::public.app_role,
        'Mejores horas en ' || r.label, v_text, array['horas', 'publicar', r.net]);
      v_keys := array_append(v_keys, ('auto:horas:' || r.net)::text);
    end loop;
  end if;

  -- Approval traffic light and its deadlines.
  v_text := format('Semáforo de aprobación. Verde (rutina): la aprueba supervisión, plazo %s; puede aprobar varias a la vez. '
    'Amarillo (normal): la aprueba supervisión, plazo %s. Rojo (sensible: política, crisis, aclaratorias): solo la aprueba el jefe, plazo %s. '
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

-- Statement triggers on the source tables (ten rows at once = one refresh). Wrapped in
-- their own error handler: if the assistant cannot catch up, the change is saved anyway.
-- seedClient sets app.assistant_skip_refresh = 'on' while it loads, then refreshes once.
create or replace function public.assistant_on_source_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.assistant_skip_refresh', true), '') = 'on' then
    return null;
  end if;
  begin
    perform public.assistant_refresh();
  exception when others then
    raise warning 'El asistente no pudo ponerse al día: %', sqlerrm;
  end;
  return null;
end $$;

create trigger assistant_refresh_formulas after insert or update or delete on public.copy_formulas
  for each statement execute function public.assistant_on_source_change();
create trigger assistant_refresh_specs after insert or update or delete on public.network_specs
  for each statement execute function public.assistant_on_source_change();
create trigger assistant_refresh_settings after insert or update or delete on public.app_settings
  for each statement execute function public.assistant_on_source_change();
create trigger assistant_refresh_categories after insert or update or delete on public.categories
  for each statement execute function public.assistant_on_source_change();

-- Server only. (Postgres grants EXECUTE to PUBLIC by default; Supabase also to the API roles.)
revoke all on function public.assistant_plain(text) from public, anon, authenticated;
revoke all on function public.assistant_scripts_for(text, public.app_role[], int, boolean) from public, anon, authenticated;
revoke all on function public.assistant_put_auto(text, public.app_role[], text, text, text[]) from public, anon, authenticated;
revoke all on function public.assistant_minutes(int) from public, anon, authenticated;
revoke all on function public.assistant_arr(jsonb) from public, anon, authenticated;
revoke all on function public.assistant_refresh() from public, anon, authenticated;
revoke all on function public.assistant_on_source_change() from public, anon, authenticated;
revoke all on function public.assistant_append_only() from public, anon, authenticated;

select public.assistant_refresh();
