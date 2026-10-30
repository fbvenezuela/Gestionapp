'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createChannel, saveChannel } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import {
  CHAT_ADD_READS_BEFORE, CHAT_AGENDA_NOTE, CHAT_BOSS_ALWAYS, CHAT_DESC_MAX, CHAT_TEXT_REFUSED, CHAT_TITLE_MAX, chatChannelTextProblem,
} from '@/lib/domain/chat';
import type { Role } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CHAT_ROLE_ORDER, CHAT_ROLE_SHORT, chatRoles, firstName } from './chat-core';

// «Nuevo canal» and «Editar canal» (R5, D-80, D-85): the name, a short description and who goes, in ONE form with one
// button (nothing typed in one part is lost by saving the other). The bosses are a fixed row: they are in every
// channel. The people are grouped by their role. Whoever with Redes or política is checked brings the agenda's note;
// whoever is unchecked in «Editar canal» is asked about first (they stop reading the channel, also what came before).
// The database decides (chat_channel_create, chat_channel_update, chat_channel_set_members).

export type PickPerson = { id: string; name: string; roles: Role[]; boss: boolean };

/** «Kevin», «Kevin y Mariela», «Kevin, Yorman y Mariela». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** What the boss is asked before saving when someone is taken out. */
export function removeQuestion(names: string[]): string {
  return `${joinNames(names)} ${names.length === 1 ? 'deja' : 'dejan'} de ver este canal, también lo anterior.`;
}

/** The people by role, in the screen's order (a person with two roles goes under the first one). */
export function groupByRole(people: PickPerson[]): { role: string; label: string; people: PickPerson[] }[] {
  const groups = CHAT_ROLE_ORDER.filter((r) => r !== 'boss').map((r) => ({ role: r, label: CHAT_ROLE_SHORT[r], people: [] as PickPerson[] }));
  for (const p of people) {
    const g = groups.find((x) => p.roles.includes(x.role as Role));
    if (g) g.people.push(p);
  }
  return groups.filter((g) => g.people.length);
}

export function ChannelForm({
  mode, me, people, initial,
}: {
  mode: 'create' | 'edit';
  me: string;
  people: PickPerson[];
  initial?: { id: string; title: string; description: string | null; members: string[]; archived: boolean };
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const bosses = people.filter((p) => p.boss);
  const others = people.filter((p) => !p.boss);
  const [picked, setPicked] = useState<string[]>(() => others.filter((p) => initial?.members.includes(p.id)).map((p) => p.id));
  const membersLocked = !!initial?.archived;

  const titleProblem = title.trim() ? chatChannelTextProblem(title) : null;
  const descProblem = description.trim() ? chatChannelTextProblem(description) : null;
  const chosen = others.filter((p) => picked.includes(p.id));
  const agenda = chosen.some((p) => p.roles.includes('social') || p.roles.includes('politics'));
  const ready = title.trim().length > 0 && !titleProblem && !descProblem && (membersLocked || picked.length > 0);

  const submit = async () => {
    if (!ready) return;
    if (mode === 'create') {
      void run(() => createChannel({ title: title.trim(), description: description.trim() || undefined, memberIds: picked }), {
        refresh: false,
        onOk: (r) => (r.ok && r.data ? router.push(`/mensajes/${r.data.id}`) : undefined),
      });
      return;
    }
    const removed = others.filter((p) => initial!.members.includes(p.id) && !picked.includes(p.id)).map((p) => firstName(p.name));
    if (!membersLocked && removed.length && !(await confirm({ title: '¿Guardar los cambios?', body: removeQuestion(removed), confirmLabel: 'Guardar', tone: 'danger' }))) return;
    void run(() => saveChannel({ id: initial!.id, title: title.trim(), description: description.trim() || undefined, memberIds: membersLocked ? undefined : picked }), {
      refresh: false,
      onOk: () => router.push(`/mensajes/${initial!.id}`),
    });
  };

  const row = 'flex min-h-14 items-center gap-3 px-4 py-3 text-[15px]';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      {dialog}
      <Card className="flex flex-col gap-4 p-4">
        <Field label="Nombre del canal" htmlFor="canal-nombre" error={titleProblem ? CHAT_TEXT_REFUSED : undefined} hint={`Hasta ${CHAT_TITLE_MAX} letras.`}>
          <Input id="canal-nombre" value={title} maxLength={CHAT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Descripción corta (opcional)"
          htmlFor="canal-descripcion"
          error={descProblem ? CHAT_TEXT_REFUSED : undefined}
          hint={`Para qué es el canal. Hasta ${CHAT_DESC_MAX} letras.`}
        >
          <Textarea id="canal-descripcion" rows={2} value={description} maxLength={CHAT_DESC_MAX} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </Card>
      <fieldset disabled={membersLocked}>
        <legend className="mb-1 text-sm font-semibold">Quiénes van</legend>
        {mode === 'edit' ? (
          <p className="mb-2 text-sm text-text-2">{membersLocked ? 'Sácalo del archivo para cambiar quién está.' : CHAT_ADD_READS_BEFORE}</p>
        ) : null}
        <Card solid>
          <ul className="divide-y divide-border">
            {bosses.map((b) => (
              <li key={b.id}>
                <label className={row}>
                  <input type="checkbox" className="h-5 w-5 accent-accent" checked disabled readOnly />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{b.id === me ? 'Tú' : b.name}</span>
                    <span className="block text-sm text-text-2">{CHAT_BOSS_ALWAYS.replace('Tú estás', b.id === me ? 'Tú estás' : 'Está')}</span>
                  </span>
                  <Chip tone="accent">Jefe</Chip>
                </label>
              </li>
            ))}
          </ul>
        </Card>
        {groupByRole(others).map((g) => (
          <div key={g.role} className="mt-3">
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-text-2">{g.label}</h3>
            <Card solid>
              <ul className="divide-y divide-border">
                {g.people.map((p) => (
                  <li key={p.id}>
                    <label className={row}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-accent"
                        checked={picked.includes(p.id)}
                        onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))}
                      />
                      <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{p.name}</span>
                      <Chip>{chatRoles(p.roles)}</Chip>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ))}
      </fieldset>
      {agenda && !membersLocked ? <p className="text-sm text-text-2">{CHAT_AGENDA_NOTE}</p> : null}
      <div>
        <Button type="submit" size="lg" disabled={pending || !ready}>
          {mode === 'create' ? 'Crear canal' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
