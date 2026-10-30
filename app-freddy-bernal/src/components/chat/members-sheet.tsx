'use client';

import { useId, useRef } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { dialogPanelClass } from '@/components/ui/confirm-dialog';
import { chatRoles, membersLine, peopleCount, type ChatMember } from './chat-core';

// «Quién está» (R5, D-79, D-81): the button under a channel's name with how many are in it and the first names (the
// boss first), and the native dialog «Miembros» with everyone and their role. This list is what tells people who reads
// a channel: there is no notice. It shows who is in it NOW, never who left. Escape and «Cerrar» close it.

export function MembersSheet({ members, me, editHref, description, className }: { members: ChatMember[]; me: string; editHref?: string; description?: string | null; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        data-tour="chat-members"
        onClick={() => ref.current?.showModal()}
        className={cn('inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-[var(--radius-control)] text-left text-sm text-text-2 hover:text-text', className)}
        aria-haspopup="dialog"
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        <span className="shrink-0 font-semibold text-text">{peopleCount(members.length)}</span>
        <span className="min-w-0 truncate">· {membersLine(members)}</span>
      </button>
      <dialog ref={ref} aria-labelledby={titleId} className={cn(dialogPanelClass, 'mb-0 sm:mb-auto')}>
        <h2 id={titleId} className="text-lg font-semibold">Miembros</h2>
        {description ? <p className="mt-1 text-[15px] text-text-2 [overflow-wrap:anywhere]">{description}</p> : null}
        <ul className="mt-3 flex max-h-[60dvh] flex-col divide-y divide-border overflow-y-auto">
          {members.map((m) => (
            <li key={m.id} className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 py-2 text-[15px]">
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{m.id === me ? `${m.name} (tú)` : m.name}</span>
              {m.roles.length ? <Chip tone={m.boss ? 'accent' : undefined}>{chatRoles(m.roles)}</Chip> : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" autoFocus onClick={() => ref.current?.close()}>
            Cerrar
          </Button>
          {editHref ? (
            <Link href={editHref} className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] px-4 text-[15px] font-semibold text-accent-ink underline underline-offset-2">
              Editar miembros
            </Link>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
