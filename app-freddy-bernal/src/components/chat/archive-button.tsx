'use client';

import type { ReactNode } from 'react';
import { archiveChannel } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import { useConfirm, type ConfirmOptions } from '@/components/ui/confirm-dialog';

// «Archivar» / «Sacar del archivo» of a channel (R5, D-86), the same in the «⋯» menu and in «Editar canal». Archiving
// asks first (nobody writes there afterwards); taking it out of the archive does not. Inside a «⋯» menu the menu
// passes its own `confirm`, so the dialog lives outside the <details> and stays open when the menu closes.

export const archiveQuestion = (title: string) => `¿Archivar «${title}»?`;
export const ARCHIVE_BODY = 'Nadie podrá escribir en él. Se sigue leyendo en «Archivados», y puedes sacarlo del archivo cuando quieras.';

export function ArchiveButton({
  id, title, archived, className, children, confirm: outer,
}: {
  id: string;
  title: string;
  archived: boolean;
  className?: string;
  children: ReactNode;
  confirm?: (o: ConfirmOptions) => Promise<boolean>;
}) {
  const { run, pending } = useAction();
  const own = useConfirm();
  const confirm = outer ?? own.confirm;
  return (
    <>
      {outer ? null : own.dialog}
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={async () => {
          if (!archived && !(await confirm({ title: archiveQuestion(title), body: ARCHIVE_BODY, confirmLabel: 'Archivar', tone: 'danger' }))) return;
          void run(() => archiveChannel({ id, archived: !archived }));
        }}
      >
        {children}
      </button>
    </>
  );
}
