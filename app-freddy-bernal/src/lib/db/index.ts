import 'server-only';
import postgres from 'postgres';
import { env } from '../env';
import { asSystem, asUser, type Backend, type Claims, type Row, type Sql } from './core';
import { pgTls } from './ssl';

export type { Sql, Claims } from './core';

type Globals = { __fbBackend?: Promise<Backend> };
const g = globalThis as unknown as Globals;

function postgresBackend(url: string): Backend {
  // Supabase transaction pooler: no prepared statements. TLS unless the database is local (./ssl.ts).
  const client = postgres(url, { ...pgTls(url), prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
  const wrap = (tx: postgres.TransactionSql): Sql => ({
    async query<T = Row>(text: string, params: unknown[] = []) {
      return (await tx.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[];
    },
    async one<T = Row>(text: string, params: unknown[] = []) {
      const rows = (await tx.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[];
      return rows[0] ?? null;
    },
  });
  return {
    transaction: (fn) => client.begin((tx) => fn(wrap(tx))) as Promise<never>,
    exec: async (text) => {
      await client.unsafe(text);
    },
  };
}

async function createDemoBackend(): Promise<Backend> {
  const { createMemoryDb } = await import('./pglite');
  const { seedClient } = await import('./seed-client');
  const { seedDemo } = await import('./seed-demo');
  const { withStableIds } = await import('./stable-ids');
  const { backend } = await createMemoryDb();
  // Same ids on every server, so a link made by one opens on another (./stable-ids.ts).
  await asSystem(backend, (sql) =>
    withStableIds(sql, async () => {
      await seedClient(sql);
      await seedDemo(sql, env.appTz);
    }),
  );
  return backend;
}

export function getBackend(): Promise<Backend> {
  if (!g.__fbBackend) {
    g.__fbBackend = env.dataMode === 'supabase' ? Promise.resolve(postgresBackend(env.databaseUrl)) : createDemoBackend();
    g.__fbBackend.catch(() => {
      g.__fbBackend = undefined;
    });
  }
  return g.__fbBackend;
}

export async function withUser<T>(claims: Claims, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return asUser(await getBackend(), claims, fn);
}

// Bypasses RLS. Only for server tasks with no user behind them (emails, cron, sign-in bookkeeping).
export async function withSystem<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return asSystem(await getBackend(), fn);
}
