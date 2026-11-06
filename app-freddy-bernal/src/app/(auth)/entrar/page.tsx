import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { demoShortcuts, isDemo } from '@/lib/env';
import { DEMO_USERS, WEB_DEMO_USERS } from '@/lib/db/seed-demo';
import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar' };

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect('/panel');
  const demo = isDemo();
  // The team first; the website's and the attention desk's people under their own heading (D-93).
  const web = new Set<string>(WEB_DEMO_USERS.map((u) => u.email));
  return (
    <LoginForm
      demoUsers={demo ? DEMO_USERS.map((u) => ({ email: u.email, label: u.label, name: u.name, web: web.has(u.email) })) : null}
      quick={demoShortcuts()}
    />
  );
}
