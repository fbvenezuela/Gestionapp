'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/cn';
import { deviceStore, notifyDevice, subscribeDevice } from './device-store';
import { countTipView, dismissTip, isTipVisible, readTip } from './tip-store';

// One short sentence of help, shown the first times someone opens a screen (remembered per phone).
//   <Tip id="aprobar">Las verdes se pueden aprobar juntas; las rojas las aprueba el jefe.</Tip>
// Hidden on the server and until the phone says it has not been dismissed: no hydration mismatch.
export function Tip({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const raw = useSyncExternalStore(subscribeDevice, () => readTip(deviceStore(), id), () => 'done');
  const visible = isTipVisible(raw);

  // A view counts when the person leaves the screen after seeing the tip for a few seconds.
  useEffect(() => {
    if (!visible) return;
    const shownAt = Date.now();
    return () => countTipView(deviceStore(), id, Date.now() - shownAt);
  }, [visible, id]);

  if (!visible) return null;
  return (
    <aside aria-label="Consejo" className={cn('mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-info-soft py-1 pl-3 pr-1 text-[15px] text-text', className)}>
      <Lightbulb className="mt-3 h-5 w-5 shrink-0 text-info" aria-hidden />
      <p className="min-w-0 flex-1 py-2.5">{children}</p>
      <button
        type="button"
        onClick={() => {
          dismissTip(deviceStore(), id);
          notifyDevice();
        }}
        className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-info hover:bg-surface"
      >
        Entendido
      </button>
    </aside>
  );
}
