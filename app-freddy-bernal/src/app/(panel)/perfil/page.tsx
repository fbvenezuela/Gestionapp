import { requireSession, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { ROLE_LABEL } from '@/lib/roles';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Mi perfil' };

export default async function ProfilePage() {
  const s = await requireSession();
  const p = await db(s, (sql) => sql.one<{ full_name: string; phone: string | null; notify_prefs: Record<string, boolean> }>(`select full_name, phone, notify_prefs from public.profiles where id = auth.uid()`));
  return (
    <>
      <PageHeader title="Mi perfil" subtitle={`${s.email} · ${s.roles.map((r) => ROLE_LABEL[r]).join(', ')}`} />
      <ProfileForm fullName={p?.full_name ?? ''} phone={p?.phone ?? ''} prefs={p?.notify_prefs ?? {}} mfa={s.aal === 'aal2'} />
    </>
  );
}
