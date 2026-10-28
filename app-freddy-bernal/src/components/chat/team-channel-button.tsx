'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { openTeamChannel } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';

// «Todo el equipo» before anybody opened it: the database makes it now (chat_team_channel) and the screen opens it.
export function TeamChannelButton({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => openTeamChannel(), { refresh: false, onOk: (r) => (r.ok && r.data ? router.push(`/mensajes/${r.data.id}`) : undefined) })}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
