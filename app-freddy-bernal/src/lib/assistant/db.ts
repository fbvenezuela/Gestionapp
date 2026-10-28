import 'server-only';
import { db as personDb, type Session } from '../auth/session';
import { withSystem } from '../db';
import type { Sql } from '../db/core';

// The only way 360 opens the database (R3, D-50, design §8.7). Every transaction it opens is marked
// app.caller = 'assistant' first (local to that transaction), and the Mensajes functions and policies say no to
// that mark (chat_by_assistant(), 20261028002400_internal_chat.sql): whatever 360 reads or writes, as the person or
// as the system, it never reaches the team's messages. The rest is unchanged: `db` still runs AS THE PERSON (RLS on),
// `system` still bypasses RLS for the assistant's own tables. tests/unit/assistant-db-caller.test.ts checks that no
// file of 360 opens the database any other way. Never call `system` from inside `db` (the demo database runs one
// transaction at a time).

export const ASSISTANT_CALLER = 'assistant';

/** Marks this transaction as 360's. Returns the same handle, so it reads `fn(await asAssistant(sql))`. */
export async function asAssistant(sql: Sql): Promise<Sql> {
  await sql.query(`select set_config('app.caller', $1, true)`, [ASSISTANT_CALLER]);
  return sql;
}

/** As the person (RLS on), marked as 360's. */
export function db<T>(s: Session, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return personDb(s, async (sql) => fn(await asAssistant(sql)));
}

/** As the system (no person behind it: the assistant's own tables), marked as 360's. */
export function system<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return withSystem(async (sql) => fn(await asAssistant(sql)));
}
