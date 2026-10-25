import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireSession, type Session } from '../auth/session';
import { withUser, type Sql } from '../db';
import { friendlyDbError } from '../db/core';
import { DriveError, driveMessage } from '../storage/drive/errors';

export type Result<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

// Wraps a server action: validates input, runs it AS THE USER (RLS on), maps errors
// to short Spanish messages and refreshes the given paths.
export async function act<I, T>(
  schema: z.ZodType<I>,
  raw: unknown,
  fn: (sql: Sql, input: I, s: Session) => Promise<T>,
  opts: { revalidate?: string[] } = {},
): Promise<Result<T>> {
  // Session first: nobody who is not signed in gets their input parsed or checked.
  const s = await requireSession();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
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

// Like act(), but opens no transaction around `fn`: for actions that call a slow outside service
// (Google Drive) between short database steps of their own (db(s) / withSystem, never nested).
// Session first, then the input, as in act().
export async function actOutside<I, T>(
  schema: z.ZodType<I>,
  raw: unknown,
  fn: (input: I, s: Session) => Promise<T>,
  opts: { revalidate?: string[] } = {},
): Promise<Result<T>> {
  const s = await requireSession();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' };
  try {
    const data = await fn(parsed.data, s);
    for (const p of opts.revalidate ?? []) revalidatePath(p, 'layout');
    return { ok: true, data };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof DriveError) {
      console.error('[action] drive:', e.message);
      return { ok: false, error: driveMessage(e) };
    }
    console.error('[action]', (e as Error).message);
    return { ok: false, error: friendlyDbError(e) };
  }
}
