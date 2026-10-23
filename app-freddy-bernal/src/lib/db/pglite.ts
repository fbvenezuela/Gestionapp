import { PGlite } from '@electric-sql/pglite';
import type { Backend, Row, Sql } from './core';
import { readDemoAuth, readMigrations, readShim } from './migrations';

type Queryable = { query: <T>(q: string, p?: unknown[]) => Promise<{ rows: T[] }> };

function wrap(q: Queryable): Sql {
  return {
    async query<T = Row>(text: string, params: unknown[] = []) {
      return (await q.query<T>(text, params)).rows;
    },
    async one<T = Row>(text: string, params: unknown[] = []) {
      return (await q.query<T>(text, params)).rows[0] ?? null;
    },
  };
}

export function pgliteBackend(db: PGlite): Backend {
  return {
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx as unknown as Queryable))),
    exec: async (text) => {
      await db.exec(text);
    },
  };
}

// A fresh in-memory database with the Supabase shim and all migrations applied.
export async function createMemoryDb(): Promise<{ db: PGlite; backend: Backend }> {
  const db = new PGlite();
  await db.exec(readShim());
  for (const m of readMigrations()) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
    }
  }
  await db.exec(readDemoAuth());
  return { db, backend: pgliteBackend(db) };
}
