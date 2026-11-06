import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { homeFor } from '@/lib/roles';

export const metadata = { title: 'Panel', robots: { index: false, follow: false } };

// The staff's entry (D-91): `/` becomes the public website, so the panel starts here (the installed app opens it too,
// manifest.ts). Signed in → the home of the person's role; otherwise the sign-in.
export default async function PanelEntry() {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (s.roles.length === 0) redirect('/sin-acceso');
  if (!s.mfaOk) redirect('/doble-factor');
  redirect(homeFor(s.roles));
}
