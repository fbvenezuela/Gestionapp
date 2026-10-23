import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession, type Session } from '../auth/session';
import { withUser, type Sql } from '../db';
import { friendlyDbError } from '../db/core';

export type Result<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

// Wraps a server action: validates input, runs it AS THE USER (RLS on), maps errors
// to short Spanish messages and refreshes the given paths.
export async function act<I, T>(
  schema: z.ZodType<I>,
  raw: unknown,
  fn: (sql: Sql, input: I, s: Session) => Promise<T>,
  opts: { revalidate?: string[] } = {},
): Promise<Result<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
  const s = await requireSession();
  try {
    const data = await withUser(s.claims, (sql) => fn(sql, parsed.data, s));
    for (const p of opts.revalidate ?? []) revalidatePath(p, 'layout');
    return { ok: true, data };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error('[action]', (e as Error).message);
    return { ok: false, error: friendlyDbError(e) };
  }
}

export class UserError extends Error {}
