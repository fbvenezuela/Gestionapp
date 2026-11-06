'use client';

import { useState } from 'react';
import { inviteUser, resetTwoFactor, revokeInvitation, revokeSessions, setActive, setRole } from '@/lib/actions/team';
import { setAreaMember } from '@/lib/actions/attention-admin';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { BOSS_GRANT_MESSAGE, INVITABLE_ROLES, ROLE_LABEL, TEAM_ROLES, WEB_ROLES, isWebRole, roleGrantProblem, type InvitableRole, type Role } from '@/lib/roles';

// The six team roles, then the web's and the attention desk's (D-93: always with the second factor, a responsible of an
// area with its areas), then Administración apart: the technical role, never part of the team lists.
const roleLabel = (r: InvitableRole) => (r === 'admin' ? 'Administración (técnico)' : ROLE_LABEL[r]);
const GROUPS: { label: string; roles: readonly InvitableRole[] }[] = [
  { label: 'Equipo', roles: TEAM_ROLES },
  { label: 'Web y atención ciudadana (siempre con doble factor)', roles: WEB_ROLES },
  { label: 'Técnico', roles: ['admin'] },
];
const AREA_ROLE = 'reports_operator';

export type AreaChoice = { id: string; name: string };

function AreaChecks({ areas, value, onChange, disabled, legend }: { areas: AreaChoice[]; value: string[]; onChange: (id: string, on: boolean) => void; disabled?: boolean; legend: string }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {areas.length ? (
        areas.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={value.includes(a.id)} disabled={disabled} onChange={(e) => onChange(a.id, e.target.checked)} />
            {a.name}
          </label>
        ))
      ) : (
        <p className="text-sm text-text-2">Todavía no hay áreas: créalas en Atención → Áreas.</p>
      )}
    </fieldset>
  );
}

export function InviteForm({ areas }: { areas: AreaChoice[] }) {
  const { run, pending } = useAction();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'social' as InvitableRole, areaIds: [] as string[] });
  const web = isWebRole(form.role);
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => inviteUser({ ...form, areaIds: form.role === AREA_ROLE ? form.areaIds : [] }), {
          onOk: () => setForm({ email: '', fullName: '', role: form.role, areaIds: [] }),
        });
      }}
    >
      <Field label="Nombre" htmlFor="inv-name">
        <Input id="inv-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
      </Field>
      <Field label="Correo" htmlFor="inv-email">
        <Input id="inv-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </Field>
      {/* The boss's role is not given here (D-58): the option stays, off, with the reason under the list. */}
      <Field label="Rol" htmlFor="inv-role" hint={web ? 'Entra siempre con su código y el doble factor. No tiene 360 ni Mensajes: su pantalla es la de la web o la de atención.' : BOSS_GRANT_MESSAGE}>
        <Select id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as InvitableRole })}>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.roles.map((r) => (
                <option key={r} value={r} disabled={r === 'boss'}>
                  {r === 'boss' ? `${ROLE_LABEL[r]} (lo da el comando de instalación)` : roleLabel(r)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {form.role === AREA_ROLE ? (
        <AreaChecks
          legend="Sus áreas (ve y atiende lo de estas áreas y lo que le asignen)"
          areas={areas}
          value={form.areaIds}
          onChange={(id, on) => setForm({ ...form, areaIds: on ? [...form.areaIds, id] : form.areaIds.filter((x) => x !== id) })}
        />
      ) : null}
      <Button type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Enviar invitación'}</Button>
    </form>
  );
}

export function MemberActions({ userId, name, roles, active, isSelf, twoFactor, areas, memberAreas }: {
  userId: string; name: string; roles: Role[]; active: boolean; isSelf: boolean;
  // true/false = known; null = could not be read (still allow the reset).
  twoFactor: boolean | null;
  areas: AreaChoice[];
  memberAreas: string[];
}) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  // Roles that cannot be given here, and why (your own, Administración with the boss, despacho or a role of the web or
  // the desk, or the boss's role, which only the installation command gives). The database refuses them too; the screen
  // says why before anyone taps.
  const problems = new Map(INVITABLE_ROLES.map((r) => [r, roleGrantProblem({ isSelf, roles, role: r })] as const));
  const reasons = [...new Set([...problems.values()].filter((x): x is string => !!x))];
  const hintId = `roles-why-${userId}`;
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {dialog}
      <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Cerrar' : 'Cambiar'}
      </Button>
      {open ? (
        <div className="flex w-full flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3 sm:w-80">
          {GROUPS.map((g) => (
            <fieldset key={g.label} className="flex flex-col">
              <legend className="label-caps mb-1">{g.label}</legend>
              {g.roles.map((r) => (
                <label key={r} className="flex min-h-11 items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-accent"
                    checked={roles.includes(r)}
                    disabled={pending || (isSelf && r === 'admin') || !!problems.get(r)}
                    aria-describedby={problems.get(r) ? hintId : undefined}
                    onChange={(e) => run(() => setRole({ userId, role: r, on: e.target.checked }))}
                  />
                  {roleLabel(r)}
                </label>
              ))}
            </fieldset>
          ))}
          {reasons.length ? (
            <div id={hintId} className="text-sm text-text-2">
              {reasons.map((m) => <p key={m}>{m}</p>)}
            </div>
          ) : null}
          {roles.includes(AREA_ROLE) ? (
            <AreaChecks
              legend="Áreas de este responsable"
              areas={areas}
              value={memberAreas}
              disabled={pending}
              onChange={(areaId, on) => run(() => setAreaMember({ areaId, userId, on }), { success: on ? 'Quedó en el área.' : 'Salió del área.' })}
            />
          ) : null}
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
