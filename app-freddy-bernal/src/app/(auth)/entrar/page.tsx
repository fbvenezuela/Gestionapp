import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isDemo } from '@/lib/env';
import { DEMO_USERS } from '@/lib/db/seed-demo';
import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar' };

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect('/');
  const demo = isDemo();
  return <LoginForm demoUsers={demo ? DEMO_USERS.map((u) => ({ email: u.email, label: u.label, name: u.name })) : null} />;
}
