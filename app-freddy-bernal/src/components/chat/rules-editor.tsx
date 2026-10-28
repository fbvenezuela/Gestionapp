'use client';

import { useId } from 'react';
import { setOnlyBoss, setRoleRule } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import { CHAT_ROLE_NAME } from '@/lib/domain/chat';
import type { RulePair } from '@/lib/data/chat';
import { Card, CardHeader } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';

// «Quién habla con quién» (D-51, design §5.3): the boss's switches, one per pair of different roles, with the people
// of each role on the row so he knows what will happen. Closing a pair asks first and says that «Todo el equipo» does
// not follow these rules; «Solo el jefe escribe en Todo el equipo» is right here. The database decides (chat_rules,
// RLS: the boss with 2FA).

/** «Redes (Daniela, Yorman) ↔ Política (Elio)». */
export function pairLabel(p: Pick<RulePair, 'roleA' | 'roleB' | 'namesA' | 'namesB'>): string {
  const side = (role: keyof typeof CHAT_ROLE_NAME, names: string[]) => `${CHAT_ROLE_NAME[role]} (${names.length ? names.join(', ') : 'nadie'})`;
  return `${side(p.roleA, p.namesA)} ↔ ${side(p.roleB, p.namesB)}`;
}

function Switch({ on, label, hint, alert = false, onToggle, disabled }: { on: boolean; label: string; hint: string; alert?: boolean; onToggle: () => void; disabled: boolean }) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-hint`}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-name`} className="block font-medium">{label}</span>
        <span id={`${id}-hint`} className={cn('block text-sm', alert ? 'font-semibold text-danger' : 'text-text-2')}>{hint}</span>
      </span>
      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full border-2 ${on ? 'border-accent bg-accent' : 'border-border bg-surface-2'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full ${on ? 'right-0.5 bg-on-accent' : 'left-0.5 bg-muted'}`} />
      </span>
    </button>
  );
}

export function RulesEditor({ pairs, team, demo }: { pairs: RulePair[]; team: { id: string; onlyBoss: boolean } | null; demo: boolean }) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const toggle = async (p: RulePair) => {
    if (p.allowed) {
      const ok = await confirm({
        title: `¿Cerrar los mensajes entre ${CHAT_ROLE_NAME[p.roleA]} y ${CHAT_ROLE_NAME[p.roleB]}?`,
        body: 'Lo que ya se escribieron se sigue leyendo, pero no podrán escribir más. En Todo el equipo siguen escribiendo todos. ¿Cerrar?',
        confirmLabel: 'Cerrar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await run(() => setRoleRule({ roleA: p.roleA, roleB: p.roleB, allowed: !p.allowed }));
  };
  const onlyBoss = team?.onlyBoss ?? false;
  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <p className="text-[15px] text-text">Todos pueden escribirle al jefe, y tú a todos.</p>
      <Card solid>
        <CardHeader title="Quién habla con quién" subtitle="Por defecto todos hablan con todos. Con dos roles, gana el más cerrado." />
        <ul className="divide-y divide-border">
          {pairs.map((p) => (
            <li key={`${p.roleA}:${p.roleB}`}>
              <Switch on={p.allowed} label={pairLabel(p)} hint={p.allowed ? 'Pueden escribirse' : 'No pueden'} alert={!p.allowed} disabled={pending} onToggle={() => void toggle(p)} />
            </li>
          ))}
        </ul>
      </Card>
      <Card solid>
        <CardHeader title="Todo el equipo" subtitle="Aquí escriben todos y lo lee todo el equipo; las reglas de arriba no cuentan aquí." />
        <Switch
          on={onlyBoss}
          label="Solo el jefe escribe en Todo el equipo"
          hint={onlyBoss ? 'Solo tú escribes; los demás leen' : 'Escriben todos'}
          disabled={pending}
          onToggle={() => void run(() => setOnlyBoss({ conversationId: team?.id ?? 'team', value: !onlyBoss }))}
        />
      </Card>
      <p className="text-sm text-text-2">
        Las reglas son solo para Mensajes; las notas de trabajo (la nota de Grabación al editor, los comentarios de piezas) siguen igual.
      </p>
      {demo ? <p className="text-sm text-text-2">En la demostración, un cambio aquí puede no verse en otro teléfono.</p> : null}
    </div>
  );
}
