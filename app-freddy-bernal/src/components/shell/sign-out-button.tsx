'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth/actions';
import { releaseThisPhone } from '@/lib/push/client';

// «Salir»: first this phone stops receiving the person's notices (never blocks, at most
// a few seconds), then the session closes. On a shared phone the next person turns them on.
export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await releaseThisPhone();
          await signOut();
        })
      }
      className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-surface-2 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden /> {pending ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
