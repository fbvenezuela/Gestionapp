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

// The Supabase shim, every migration and the demo's sign-in tables, on an empty database. Returns the migrations'
// names (the local database on disk keeps them, src/lib/db/local-data.ts).
export async function applySchema(db: PGlite): Promise<string[]> {
  await db.exec(readShim());
  const names: string[] = [];
  for (const m of readMigrations()) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
    }
    names.push(m.name);
  }
  await db.exec(readDemoAuth());
  return names;
}

// A fresh in-memory database with the Supabase shim and all migrations applied.
export async function createMemoryDb(): Promise<{ db: PGlite; backend: Backend }> {
  const db = new PGlite();
  await applySchema(db);
  return { db, backend: pgliteBackend(db) };
}
