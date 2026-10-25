'use client';

import { useState } from 'react';
import { inviteUser, resetTwoFactor, revokeInvitation, revokeSessions, setActive, setRole } from '@/lib/actions/team';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
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

export function MemberActions({ userId, name, roles, active, isSelf, twoFactor }: {
  userId: string; name: string; roles: Role[]; active: boolean; isSelf: boolean;
  // true/false = known; null = could not be read (still allow the reset).
  twoFactor: boolean | null;
}) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {dialog}
      <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Cerrar' : 'Cambiar'}
      </Button>
      {open ? (
        <div className="flex w-full flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3 sm:w-72">
          <p className="label-caps">Roles</p>
          {INVITABLE_ROLES.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2 text-[15px]">
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
          <Button variant="secondary" size="sm" className="min-h-11" disabled={pending} onClick={() => run(async () => {
            // The action's own message (a partial success) wins; a plain success gets this one.
            const r = await revokeSessions({ userId });
            return r.ok && !r.message ? { ...r, message: 'Sesiones cerradas.' } : r;
          })}>
            Cerrar sus sesiones
          </Button>
          {!isSelf && twoFactor !== false ? (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: `¿Reiniciar el doble factor de ${name}?`,
                  body: 'Úsalo si perdió o cambió el teléfono. Se cierran sus sesiones y, la próxima vez que entre, tendrá que activar el doble factor otra vez con su teléfono.',
                  confirmLabel: 'Reiniciar',
                  tone: 'danger',
                });
                if (ok) run(() => resetTwoFactor({ userId }));
              }}
            >
              Reiniciar doble factor
            </Button>
          ) : null}
          {!isSelf ? (
            <Button
              variant={active ? 'danger' : 'secondary'}
              size="sm"
              className="min-h-11"
              disabled={pending}
              onClick={async () => {
                if (active) {
                  const ok = await confirm({ title: `¿Desactivar a ${name}?`, body: 'No podrá entrar hasta que la actives de nuevo.', confirmLabel: 'Desactivar', tone: 'danger' });
                  if (!ok) return;
                }
                run(() => setActive({ userId, active: !active }));
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
    <Button variant="ghost" size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => revokeInvitation({ id }), { success: 'Invitación anulada.' })}>
      Anular
    </Button>
  );
}
