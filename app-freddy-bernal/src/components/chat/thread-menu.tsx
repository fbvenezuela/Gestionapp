'use client';

import Link from 'next/link';
import { Archive, ArchiveRestore, Bell, BellOff, Megaphone, MoreHorizontal, Pencil } from 'lucide-react';
import { setMuted, setOnlyBoss } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import { buttonVariants } from '@/components/ui/button';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MenuDetails } from '@/components/shell/menu-details';
import { cn } from '@/lib/cn';
import { ArchiveButton } from './archive-button';

// «⋯» of a channel (R5, D-80, D-86): «Silenciar» for everyone in it; for the boss with 2FA, «Solo el jefe escribe»,
// «Editar canal» and «Archivar» / «Sacar del archivo» (in «Todo el equipo», only «Solo el jefe escribe»).
export function ThreadMenu({
  conversationId, kind, title, muted, boss, onlyBoss, archived,
}: {
  conversationId: string;
  kind: 'channel' | 'team';
  title: string;
  muted: boolean;
  // The boss with the second factor (can_approve()): only then the boss's entries.
  boss: boolean;
  onlyBoss: boolean;
  archived: boolean;
}) {
  const { run, pending } = useAction();
  // The archive question lives outside the menu: the menu closes when it opens.
  const { confirm, dialog } = useConfirm();
  const item = 'flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-50';
  const channel = kind === 'channel';
  return (
    <>
      {dialog}
      <MenuDetails className="relative">
        <summary className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'list-none [&::-webkit-details-marker]:hidden cursor-pointer' })} aria-label="Opciones del canal">
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </summary>
        <div className={cn(menuPanelClass, 'absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)]')}>
          <button type="button" className={item} disabled={pending} onClick={() => run(() => setMuted({ conversationId, muted: !muted }))}>
            {muted ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            {muted ? 'Quitar el silencio' : 'Silenciar'}
          </button>
          {boss && !archived ? (
            <button
              type="button"
              role="switch"
              aria-checked={onlyBoss}
              className={item}
              disabled={pending}
              onClick={() => run(() => setOnlyBoss({ conversationId, value: !onlyBoss }))}
            >
              <Megaphone className="h-4 w-4" aria-hidden />
              Solo el jefe escribe
            </button>
          ) : null}
          {boss && channel ? (
            <>
              <Link href={`/mensajes/${conversationId}/editar`} className={item}>
                <Pencil className="h-4 w-4" aria-hidden />
                Editar canal
              </Link>
              <ArchiveButton id={conversationId} title={title} archived={archived} className={item} confirm={confirm}>
                {archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                {archived ? 'Sacar del archivo' : 'Archivar'}
              </ArchiveButton>
            </>
          ) : null}
        </div>
      </MenuDetails>
    </>
  );
}
