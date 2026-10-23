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
await sql`insert into public.invitations (email, full_name, roles) values (${email.toLowerCase()}, ${name}, '{admin}')`;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
if (error) console.error('Supabase:', error.message);
else console.log(`Listo: ${email} es administrador. Que entre con su correo y el código.`);
await sql.end();
