import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { fmtDateTime } from '@/lib/time';
import { InviteForm, MemberActions, RevokeInvite } from './team-client';
import { twoFactorUsers } from '@/lib/data/two-factor';

export const metadata = { title: 'Equipo' };

export default async function TeamPage() {
  const s = await requireRole('admin');
  const data = await db(s, async (sql) => {
    const members = await sql.query<{ id: string; email: string; full_name: string; active: boolean; roles: Role[] | null; created_at: string }>(
      `select p.id, p.email, p.full_name, p.active, p.created_at,
              (select array_agg(role::text order by role) from public.user_roles ur where ur.user_id = p.id) as roles
         from public.profiles p where p.deleted_at is null order by p.full_name`,
    );
    const invites = await sql.query<{ id: string; email: string; full_name: string; roles: string; created_at: string }>(
      `select id, email, full_name, roles::text, created_at from public.invitations where accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`,
    );
    return { members, invites };
  });
  // After db(), never inside it.
  const twoFactor = await twoFactorUsers(data.members.map((m) => m.id));

  return (
    <>
      <PageHeader title="Equipo" subtitle="Cada persona tiene su usuario, aunque compartan el mismo rol." back={{ href: '/ajustes', label: 'Ajustes' }} />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Personas" subtitle={`${data.members.length} en la plataforma`} />
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {m.full_name || m.email} {!m.active ? <Chip tone="danger">Desactivada</Chip> : null}
                  </p>
                  <p className="truncate text-sm text-text-2">{m.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(m.roles ?? []).map((r) => (
                      <Chip key={r} tone="info">{ROLE_LABEL[r]}</Chip>
                    ))}
                    {!m.roles?.length ? <Chip tone="warn">Sin rol</Chip> : null}
                    {twoFactor ? (twoFactor.has(m.id) ? <Chip tone="ok">Doble factor activo</Chip> : <Chip>Sin doble factor</Chip>) : null}
                  </div>
                </div>
                <MemberActions
                  userId={m.id}
                  name={m.full_name || m.email}
                  roles={m.roles ?? []}
                  active={m.active}
                  isSelf={m.id === s.userId}
                  twoFactor={twoFactor ? twoFactor.has(m.id) : null}
                />
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Invitar a alguien" subtitle="Le llega un correo y entra con un código." />
            <InviteForm />
          </Card>
          <Card>
            <CardHeader title="Invitaciones sin aceptar" />
            {data.invites.length ? (
              <ul className="divide-y divide-border">
                {data.invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{i.full_name || i.email}</p>
                      <p className="truncate text-sm text-text-2">{i.email} · {fmtDateTime(i.created_at)}</p>
                    </div>
                    <RevokeInvite id={i.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-[15px] text-text-2">No hay invitaciones pendientes.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
