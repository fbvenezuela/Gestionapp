// Creates the first administrator in a real Supabase project (there is no open sign-up,
// so someone has to be first). Sends nothing: the person then signs in with the code.
// Usage: DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//        npx tsx scripts/create-first-admin.ts correo@dominio.com "Nombre Apellido"
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const [email, name = ''] = process.argv.slice(2);
const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!email || !DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Uso: create-first-admin.ts <correo> "<nombre>" con DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
// «Cerrar sus sesiones» deletes the person's Supabase Auth sessions, and every request reads when
// its session began (D-25). The app degrades without these grants; warn now so they get fixed.
const [g] = await sql<{ del: boolean | null; fn: boolean | null }[]>`
  select case when to_regclass('auth.sessions') is null then null else has_table_privilege(current_user, 'auth.sessions', 'DELETE') end as del,
         case when to_regprocedure('public.auth_session_started(uuid)') is null then null
              else has_function_privilege(current_user, 'public.auth_session_started(uuid)', 'EXECUTE') end as fn`;
if (g.del === false) console.warn('Ojo: el rol de DATABASE_URL no puede borrar en auth.sessions. «Cerrar sus sesiones» no cerrará las de Supabase.');
if (g.fn === null) console.warn('Ojo: falta la migración 20261025001100_session_started.sql.');
if (g.fn === false) console.warn('Ojo: el rol de DATABASE_URL no puede usar public.auth_session_started. Dale EXECUTE.');
await sql`insert into public.invitations (email, full_name, roles) values (${email.toLowerCase()}, ${name}, '{admin}')`;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
if (error) console.error('Supabase:', error.message);
else console.log(`Listo: ${email} es administrador. Que entre con su correo y el código.`);
await sql.end();
