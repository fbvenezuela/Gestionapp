import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';

export default async function Root() {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (!s.mfaOk) redirect('/doble-factor');
  redirect(homeFor(s.roles));
}
