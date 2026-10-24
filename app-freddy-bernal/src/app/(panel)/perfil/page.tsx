import { requireSession, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { ROLE_LABEL } from '@/lib/roles';
import { vapidPublicKey } from '@/lib/push/config';
import { brand } from '@/lib/client-config';
import { ProfileForm } from './profile-form';
import { PushCard } from './push-card';

export const metadata = { title: 'Mi perfil' };

export default async function ProfilePage() {
  const s = await requireSession();
  const { p, devices } = await db(s, async (sql) => ({
    p: await sql.one<{ full_name: string; phone: string | null; notify_prefs: Record<string, boolean | string> }>(`select full_name, phone, notify_prefs from public.profiles where id = auth.uid()`),
    devices: (await sql.one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions where user_id = auth.uid()`))?.n ?? 0,
  }));
  return (
    <>
      <PageHeader title="Mi perfil" subtitle={`${s.email} · ${s.roles.map((r) => ROLE_LABEL[r]).join(', ')}`} />
      <div className="flex flex-col gap-4">
        {/* The public key is rendered by the server (not a NEXT_PUBLIC variable). appName = the name on the home screen. */}
        <PushCard publicKey={vapidPublicKey()} devices={devices} appName={brand.shortName} />
        <ProfileForm fullName={p?.full_name ?? ''} phone={p?.phone ?? ''} prefs={p?.notify_prefs ?? {}} mfa={s.aal === 'aal2'} />
      </div>
    </>
  );
}
