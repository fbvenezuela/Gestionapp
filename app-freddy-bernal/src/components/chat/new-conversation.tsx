'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { Role } from '@/lib/roles';
import { startConversation } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import { CHAT_AGENDA_NOTE, CHAT_GROUP_MAX, CHAT_TITLE_MAX, chatTitleProblem, knowsAgenda } from '@/lib/domain/chat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { chatRoles } from './chat-core';

// «Escribirle a alguien» (design §5.3): one person (the direct that exists, or a new one: in the demo the seeded id, the
// same on every server, D-57) or a group of 3 to 12 with a name. The people the boss does not let me write to are not
// listed, and one line says how many. The database decides (chat_start).

export type PickPerson = { id: string; name: string; roles: Role[] };

const TITLE_REFUSED = 'El nombre del grupo no lleva teléfonos, ni fechas, horas o mapas si en el grupo está Redes o política.';

export function blockedLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? 'Hay 1 persona con la que el jefe no permite mensajes.' : `Hay ${n} personas con las que el jefe no permite mensajes.`;
}

export function NewConversation({ mode, people, blocked, myRoles }: { mode: 'persona' | 'grupo'; people: PickPerson[]; blocked: number; myRoles: Role[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const open = (id: string) => router.push(`/mensajes/${id}`);
  const line = blockedLine(blocked);

  if (mode === 'persona') {
    return (
      <>
        {people.length ? (
          <Card solid>
            <ul className="divide-y divide-border">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => startConversation({ kind: 'direct', memberIds: [p.id] }), { refresh: false, onOk: (r) => (r.ok && r.data ? open(r.data.id) : undefined) })}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.name}</span>
                    </span>
                    <Chip>{chatRoles(p.roles)}</Chip>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-2" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-[15px] text-text-2">No hay nadie del equipo a quien puedas escribirle ahora.</p>
        )}
        {line ? <p className="mt-3 text-sm text-text-2">{line}</p> : null}
      </>
    );
  }

  const chosen = people.filter((p) => picked.includes(p.id));
  const withRedesOrPolitics = [...chosen.flatMap((p) => p.roles), ...myRoles].some((r) => r === 'social' || r === 'politics');
  const titleProblem = title.trim() ? chatTitleProblem(title, { withRedesOrPolitics }) : null;
  const full = picked.length >= CHAT_GROUP_MAX - 1;
  const ready = picked.length >= 2 && title.trim().length > 0 && !titleProblem;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        void run(() => startConversation({ kind: 'group', memberIds: picked, title: title.trim() }), { refresh: false, onOk: (r) => (r.ok && r.data ? open(r.data.id) : undefined) });
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Nombre del grupo" htmlFor="grupo-nombre" error={titleProblem ? TITLE_REFUSED : undefined} hint={`Hasta ${CHAT_TITLE_MAX} letras.`}>
        <Input id="grupo-nombre" value={title} maxLength={CHAT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {withRedesOrPolitics && knowsAgenda(myRoles) ? <p className="text-sm text-text-2">{CHAT_AGENDA_NOTE}</p> : null}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Quiénes van (de 2 a {CHAT_GROUP_MAX - 1}, más tú)</legend>
        <Card solid>
          <ul className="divide-y divide-border">
            {people.map((p) => {
              const on = picked.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-[15px]">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-accent"
                      checked={on}
                      disabled={!on && full}
                      onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))}
                    />
                    <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                    <Chip>{chatRoles(p.roles)}</Chip>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      </fieldset>
      {line ? <p className="text-sm text-text-2">{line}</p> : null}
      <div>
        <Button type="submit" size="lg" disabled={pending || !ready}>
          Crear grupo
        </Button>
      </div>
    </form>
  );
}
