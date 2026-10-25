import postgres from 'postgres';
import { createMemoryDb } from '@/lib/db/pglite';
import { asSystem, asUser, type Backend, type Row, type Sql } from '@/lib/db/core';
import { readDemoAuth, readMigrations, readShim } from '@/lib/db/migrations';
import { seedClient } from '@/lib/db/seed-client';
import { seedDemo, type DemoUserKey } from '@/lib/db/seed-demo';

export type TestDb = {
  backend: Backend;
  ids: Record<DemoUserKey, string>;
  as: <T>(who: DemoUserKey, fn: (sql: Sql) => Promise<T>, aal?: 'aal1' | 'aal2') => Promise<T>;
  system: <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;
};

// TEST_DATABASE_URL = a THROWAWAY Postgres server (CI service container). A new
// database is created per run. Never point it at production.
async function postgresBackend(url: string): Promise<Backend> {
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  // The RLS files start in parallel: the time alone can repeat within the same millisecond.
  const name = `fb_rls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const u = new URL(url);
  u.pathname = `/${name}`;
  const client = postgres(u.toString(), { max: 4, onnotice: () => {} });
  await client.unsafe(readShim());
  for (const m of readMigrations()) await client.unsafe(m.sql);
  await client.unsafe(readDemoAuth());
  const wrap = (tx: postgres.TransactionSql): Sql => ({
    query: async <T = Row>(t: string, p: unknown[] = []) => (await tx.unsafe(t, p as never[])) as unknown as T[],
    one: async <T = Row>(t: string, p: unknown[] = []) => ((await tx.unsafe(t, p as never[])) as unknown as T[])[0] ?? null,
  });
  return {
    transaction: (fn) => client.begin((tx) => fn(wrap(tx))) as Promise<never>,
    exec: async (t) => {
      await client.unsafe(t);
    },
  };
}

export async function makeTestDb(): Promise<TestDb> {
  const backend = process.env.TEST_DATABASE_URL ? await postgresBackend(process.env.TEST_DATABASE_URL) : (await createMemoryDb()).backend;
  const ids = await asSystem(backend, async (sql) => {
    await seedClient(sql);
    return seedDemo(sql);
  });
  return {
    backend,
    ids,
    as: (who, fn, aal = 'aal2') => asUser(backend, { sub: ids[who], aal }, fn),
    system: (fn) => asSystem(backend, fn),
  };
}
