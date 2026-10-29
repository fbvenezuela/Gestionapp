import type { SeedCtx } from './context';

// Redes by format in the demo (R4, D-76, design §7.1): Mes 1, Mes 2 and Mes 3; the six pieces of always as reels of
// Mes 1; Mes 1 filled with INVENTED pieces for each format, 21 of the 24 feed slots taken, a post and a carousel in
// review, design marks, ratings and notices; the same ids on every server. No days, dates, times or phones in any text.
// Paso 0 (integrator): it does nothing yet, so the demo and its stable ids stay as they were. WP-A seeds it, once the
// tables exist (supabase/migrations/20261029000100_redes_formatos.sql).
export async function seedRedes(ctx: SeedCtx): Promise<void> {
  void ctx;
}
