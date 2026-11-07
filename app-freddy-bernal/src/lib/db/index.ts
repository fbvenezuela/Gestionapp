import 'server-only';
import postgres from 'postgres';
import { env } from '../env';
import { asAnon, asSystem, asUser, type Backend, type Claims, type Row, type Sql } from './core';
import { pgTls } from './ssl';
import type { ClientConfig } from '../client-config';
import type { RealSnapshot } from '../web/real-site';

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

/**
 * The demo's data on a database that has only its schema: the client's configuration, the invented demo and, when the
 * build left the official site's content (.real-site/, src/lib/web/real-site.ts), that content instead of the invented
 * web content (the invented citizen requests stay; the invented web items and the public «lo atendido» do not). Same
 * ids on every server, so a link made by one opens on another (./stable-ids.ts). The whole seed is one transaction: if
 * the real content cannot be seeded, nothing of it stays and the invented content is seeded instead (the same on every
 * server: they all have the same file). Says which one it seeded. Exported for the tests.
 */
export async function seedDemoData(backend: Backend, real: RealSnapshot | null, cfg?: ClientConfig): Promise<'real' | 'invented'> {
  const { seedClient } = await import('./seed-client');
  const { seedDemo } = await import('./seed-demo');
  const { withStableIds } = await import('./stable-ids');
  const seedWith = (snapshot: RealSnapshot | null) =>
    asSystem(backend, (sql) =>
      withStableIds(sql, async () => {
        await seedClient(sql);
        const ids = await seedDemo(sql, env.appTz, { webContent: true, inventedWebItems: !snapshot, publicAttended: !snapshot });
        if (snapshot) {
          const { seedRealWeb } = await import('./seed-parts/web-real');
          await seedRealWeb({ sql, ids }, snapshot, cfg);
        }
      }),
    );
  const { noteSeeded } = await import('../web/real-site');
  if (!real) {
    await seedWith(null);
    return 'invented';
  }
  try {
    await seedWith(real);
    noteSeeded('real');
    return 'real';
  } catch (e) {
    console.error(`[web] El contenido real no se pudo sembrar (${(e as Error).message}): la demo sigue con el contenido inventado.`);
    await seedWith(null);
    // The pages' cache keys and the locked settings follow what was seeded, not the file (src/lib/web/real-site.ts).
    noteSeeded('invented');
    return 'invented';
  }
}

async function createDemoBackend(): Promise<Backend> {
  const { seedClient } = await import('./seed-client');
  const { loadRealSnapshot } = await import('../web/real-site');
  const seed = (backend: Backend) => seedDemoData(backend, loadRealSnapshot());
  // LOCAL_DATA_DIR (D-94): the same demo on disk, seeded once and kept across restarts. Not while `next build` runs
  // (its workers would share the folder): the build gets the in-memory one, as always.
  if (env.localDataDir && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { openLocalDb } = await import('./local-data');
    const local = await openLocalDb(env.localDataDir, { seed, refresh: (backend) => asSystem(backend, (sql) => seedClient(sql)) });
    // The folder keeps its first seed (D-101): say so when the build around it no longer matches it.
    const real = !!loadRealSnapshot();
    if (!local.fresh && local.content === 'real' && !real) {
      console.warn(`[web] ${env.localDataDir} se sembró con el contenido de la web oficial y esta construcción ya no lo trae: sus fotos y PDF no se verán. Borra la carpeta para sembrar de nuevo.`);
    } else if (!local.fresh && local.content !== 'real' && real) {
      console.warn(`[web] ${env.localDataDir} se sembró con el contenido inventado: sigue así aunque esta construcción traiga el de la web oficial. Borra la carpeta para sembrarlo.`);
    }
    return local.backend;
  }
  const { createMemoryDb } = await import('./pglite');
  const { backend } = await createMemoryDb();
  await seed(backend);
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

// The public site and the citizen functions (D-96): as `anon`, RLS on, whoever is signed in. Never nested inside
// withUser or withSystem (the demo database runs one transaction at a time).
export async function withAnon<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return asAnon(await getBackend(), fn);
}

// Bypasses RLS. Only for server tasks with no user behind them (emails, cron, sign-in bookkeeping).
export async function withSystem<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return asSystem(await getBackend(), fn);
}
