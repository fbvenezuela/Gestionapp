-- The security review of 06/11 (docs/SEGURIDAD.md «Web pública y atención ciudadana: revisión del 06/11»), second
-- part: the citizen functions answer only the app. Nothing here edits an earlier file; one function is replaced.
--
--   * The functions of the schema citizen (20261106000300_citizen.sql) take the rate limit's keys from their caller:
--     the app makes them (HMAC of its device cookie and of the visitor's network) after its own checks (zod, the
--     honeypot, Turnstile). They are safe only while nobody else can call them, and the only thing that keeps anyone
--     else out is that `citizen` is not among the schemas the Supabase Data API exposes. If someone ever adds it (one
--     setting in the dashboard), anyone with the public anon key could call them straight, with a new key on each try:
--     no limit, no Turnstile.
--   * A request of the Data API (PostgREST, and GraphQL through it) always carries its HTTP headers in the setting
--     request.headers; the app's connection never sets it (withAnon sets only request.jwt.claims). So every limited
--     citizen function now refuses a call that comes with request.headers: the same function, from the app, works as
--     before. citizen.request_stats (the public figures, no limit) stays as it was.

create or replace function public.citizen_rate_limit(p_action text, p_device_key text, p_ip_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_device boolean;
  v_ip boolean;
begin
  -- Through the Data API (the schema exposed by mistake): never.
  if nullif(current_setting('request.headers', true), '') is not null then
    raise exception 'La participación se usa desde la web, no desde la API.' using errcode = '42501';
  end if;
  if coalesce(p_device_key, '') !~ '^[0-9a-f]{64}$' or coalesce(p_ip_key, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Faltan las llaves del límite de envíos.' using errcode = '22023';
  end if;
  v_device := public.rate_limit_pass(p_action || '_device', p_device_key);
  v_ip := public.rate_limit_pass(p_action || '_ip', p_ip_key);
  if not (v_device and v_ip) then
    raise exception 'Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.' using errcode = 'P0429';
  end if;
end $$;

-- An internal helper (rule of 20261026001400_functions_closed_to_anon.sql): only the citizen functions call it.
revoke all on function public.citizen_rate_limit(text, text, text) from public, anon, authenticated;
