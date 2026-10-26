// Creates the first administrator in a real Supabase project (there is no open sign-up,
// so someone has to be first). Sends nothing: the person then signs in with the code.
// Exits with 1 on any failure and never prints the email (the steps are in ./first-admin.ts).
// Usage: DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//        npm run db:first-admin -- correo@dominio.com "Nombre Apellido"   (= npx tsx scripts/create-first-admin.mts)
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { pgTls } from '../src/lib/db/ssl';
import type { Row, Sql } from '../src/lib/db/core';
import { createFirstAdmin, hideEmails } from './first-admin';

const [email, name = ''] = process.argv.slice(2);
const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!email || !DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Uso: npm run db:first-admin -- <correo> "<nombre>" con DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { ...pgTls(DATABASE_URL), prepare: false, max: 1, onnotice: () => {} });
// No transaction: Supabase Auth must see the invitation from its own connection.
const sql: Sql = {
  query: async <T = Row,>(t: string, p: unknown[] = []) => (await client.unsafe(t, p as never[])) as unknown as T[],
  one: async <T = Row,>(t: string, p: unknown[] = []) => ((await client.unsafe(t, p as never[])) as unknown as T[])[0] ?? null,
};
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

try {
  const r = await createFirstAdmin({
    sql,
    email,
    name,
    createUser: async (e, n) => {
      const { error } = await admin.auth.admin.createUser({ email: e, email_confirm: true, user_metadata: { full_name: n } });
      return { error: error ? error.message || 'error desconocido' : null };
    },
    warn: (m) => console.warn(`Ojo: ${m}`),
  });
  if (r.ok) {
    console.log(`Listo: el administrador ya puede entrar con su correo y el código.${r.reused ? ' Se usó la invitación pendiente que ya existía.' : ''}`);
  } else {
    console.error(r.message);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Falló: ${hideEmails((e as Error).message ?? String(e))}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
