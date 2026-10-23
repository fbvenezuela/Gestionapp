import { createMemoryDb } from '@/lib/db/pglite';
import { asSystem, asUser, type Backend, type Sql } from '@/lib/db/core';
import { seedClient } from '@/lib/db/seed-client';
import { seedDemo, type DemoUserKey } from '@/lib/db/seed-demo';

export type TestDb = {
  backend: Backend;
  ids: Record<DemoUserKey, string>;
  as: <T>(who: DemoUserKey, fn: (sql: Sql) => Promise<T>, aal?: 'aal1' | 'aal2') => Promise<T>;
  system: <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;
};

export async function makeTestDb(): Promise<TestDb> {
  const { backend } = await createMemoryDb();
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
