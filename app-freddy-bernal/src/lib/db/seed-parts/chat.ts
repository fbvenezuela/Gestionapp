import type { SeedCtx } from './context';

// Mensajes in the demo (R3, D-57, design §9.1): every direct conversation between the eight people of the team, one
// group, «Todo el equipo» and an unread message for each of them, with the same ids on every server. INVENTED texts
// with no dates, times, days, phones or maps; nobody of the demo has accepted the notice (D-59).
// Paso 0 (integrator): it does nothing yet, so the demo and its stable ids stay as they were. WP-A seeds it, once the
// chat tables exist (supabase/migrations/20261028002400_internal_chat.sql).
export async function seedChat(ctx: SeedCtx): Promise<void> {
  void ctx;
}
