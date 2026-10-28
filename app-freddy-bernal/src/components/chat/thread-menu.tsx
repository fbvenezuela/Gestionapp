'use client';

import { Bell, BellOff, Megaphone, MoreHorizontal } from 'lucide-react';
import { setMuted, setOnlyBoss } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import { buttonVariants } from '@/components/ui/button';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { MenuDetails } from '@/components/shell/menu-details';
import { cn } from '@/lib/cn';

// «⋯» of a conversation: silence it (members), and «Solo el jefe escribe» in a group or «Todo el equipo» (the boss).
export function ThreadMenu({ conversationId, isMember, muted, boss, onlyBoss }: { conversationId: string; isMember: boolean; muted: boolean; boss: boolean; onlyBoss: boolean | null }) {
  const { run, pending } = useAction();
  if (!isMember && !(boss && onlyBoss !== null)) return null;
  const item = 'flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-50';
  return (
    <MenuDetails className="relative">
      <summary className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'list-none [&::-webkit-details-marker]:hidden cursor-pointer' })} aria-label="Opciones de la conversación">
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </summary>
      <div className={cn(menuPanelClass, 'absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)]')}>
        {isMember ? (
          <button type="button" className={item} disabled={pending} onClick={() => run(() => setMuted({ conversationId, muted: !muted }))}>
            {muted ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
            {muted ? 'Quitar el silencio' : 'Silenciar'}
          </button>
        ) : null}
        {boss && onlyBoss !== null ? (
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
      </div>
    </MenuDetails>
  );
}
