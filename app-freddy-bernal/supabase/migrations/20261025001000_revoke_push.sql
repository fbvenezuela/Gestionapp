-- Closing someone's sessions («Cerrar sus sesiones», «Reiniciar doble factor») is the lost or
-- changed phone flow: that phone must stop getting lock-screen notices too. The trigger from
-- 20261025000800_push.sql now also fires when sessions_revoked_at changes, so every path that
-- closes sessions drops the person's phones (they subscribe again after signing in).
drop trigger if exists profiles_drop_push_when_off on public.profiles;
create trigger profiles_drop_push_when_off
  after update of active, deleted_at, sessions_revoked_at on public.profiles
  for each row when (new.active is distinct from true or new.deleted_at is not null
                     or new.sessions_revoked_at is distinct from old.sessions_revoked_at)
  execute function public.drop_push_subscriptions_when_off();
