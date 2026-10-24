import type { Sql } from '../db/core';
import type { Role } from '../roles';
import { mergeProfile, suggestedQuestions, type AssistantProfile } from '../assistant/config';

// What the assistant's window needs to draw its button (name, emoji, intro) and its
// suggested questions. Reads app_settings AS THE PERSON (every team member can read
// settings): call it inside db(session, …). Nothing about people here.
export async function assistantWindowData(sql: Sql, roles: Role[]): Promise<{ profile: AssistantProfile; suggestions: string[] }> {
  const rows = await sql.query<{ key: string; value: unknown }>(`select key, value from public.app_settings where key in ('assistant', 'brand')`);
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const brand = (get('brand') ?? {}) as { bossLabel?: string };
  return { profile: mergeProfile(get('assistant')), suggestions: suggestedQuestions(roles, brand.bossLabel || 'el jefe') };
}
