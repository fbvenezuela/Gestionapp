'use client';

import { useState } from 'react';
import { inviteUser, revokeInvitation, revokeSessions, setActive, setRole } from '@/lib/actions/team';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { INVITABLE_ROLES, ROLE_LABEL, type Role } from '@/lib/roles';

export function InviteForm() {
  const { run, pending } = useAction();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'social' as Role });
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => inviteUser(form), { onOk: () => setForm({ email: '', fullName: '', role: form.role }) });
      }}
    >
      <Field label="Nombre" htmlFor="inv-name">
        <Input id="inv-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
      </Field>
      <Field label="Correo" htmlFor="inv-email">
        <Input id="inv-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </Field>
      <Field label="Rol" htmlFor="inv-role">
        <Select id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Enviar invitación'}</Button>
    </form>
  );
}

export function MemberActions({ userId, roles, active, isSelf }: { userId: string; roles: Role[]; active: boolean; isSelf: boolean }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Cerrar' : 'Cambiar'}
      </Button>
      {open ? (
        <div className="flex w-full flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3 sm:w-72">
          <p className="label-caps">Roles</p>
          {INVITABLE_ROLES.map((r) => (
            <label key={r} className="flex min-h-9 items-center gap-2 text-[15px]">
              <input
                type="checkbox"
                className="h-5 w-5 accent-accent"
                checked={roles.includes(r)}
                disabled={pending || (isSelf && r === 'admin')}
                onChange={(e) => run(() => setRole({ userId, role: r, on: e.target.checked }))}
              />
              {ROLE_LABEL[r]}
            </label>
          ))}
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => revokeSessions({ userId }), { success: 'Sesiones cerradas.' })}>
            Cerrar sus sesiones
          </Button>
          {!isSelf ? (
            <Button
              variant={active ? 'danger' : 'secondary'}
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!active || confirm('¿Desactivar a esta persona? No podrá entrar.')) run(() => setActive({ userId, active: !active }));
              }}
            >
              {active ? 'Desactivar' : 'Activar'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInvitation({ id }), { success: 'Invitación anulada.' })}>
      Anular
    </Button>
  );
}
