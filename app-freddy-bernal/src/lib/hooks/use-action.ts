'use client';

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type R = { ok: true; data?: unknown; message?: string } | { ok: false; error: string };

// Calls a server action, shows a short toast and refreshes the page data.
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T extends R>(fn: () => Promise<T>, opts: { success?: string; onOk?: (r: T) => void; refresh?: boolean } = {}) =>
      new Promise<T | null>((resolve) =>
        start(async () => {
          try {
            const r = await fn();
            if (r.ok) {
              const msg = opts.success ?? (r as { message?: string }).message;
              if (msg) toast.success(msg);
              opts.onOk?.(r);
              if (opts.refresh !== false) router.refresh();
            } else toast.error(r.error);
            resolve(r);
          } catch {
            toast.error('No se pudo guardar. Revisa la señal y vuelve a intentar.');
            resolve(null);
          }
        }),
      ),
    [router],
  );
  return { run, pending };
}
