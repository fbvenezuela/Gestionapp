// Loads the client configuration (categories, copy formulas, settings, network rules)
// into a real Supabase database. Idempotent: never overwrites what was edited in Ajustes.
// Usage: DATABASE_URL=... npx tsx scripts/seed-client.ts   (APP_BRAND selects the client file)
import postgres from 'postgres';
import { seedClient } from '../src/lib/db/seed-client';
import type { Row, Sql } from '../src/lib/db/core';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}
const client = postgres(url, { prepare: false, max: 1 });
await client.begin(async (tx) => {
  const sql: Sql = {
    query: async <T = Row,>(t: string, p: unknown[] = []) => (await tx.unsafe(t, p as never[])) as unknown as T[],
    one: async <T = Row,>(t: string, p: unknown[] = []) => ((await tx.unsafe(t, p as never[])) as unknown as T[])[0] ?? null,
  };
  await seedClient(sql, process.env.APP_BRAND);
});
await client.end();
console.log('Configuración del cliente cargada.');
