'use client';

import { useId, useLayoutEffect, useSyncExternalStore } from 'react';
import { Sun } from 'lucide-react';
import { deviceStore, notifyDevice, subscribeDevice } from '@/components/ui/device-store';
import { SUN_SCRIPT, applySun, readSun, watchSun, writeSun } from './sun-mode-core';

// Applies «Modo sol» before the first paint on a full load (inline script), again after client
// navigations or React's dev remount, and whenever the value changes in this or another tab
// (layout effect). On the client the script is rendered as text/plain, so React neither runs it
// twice nor warns about it.
export function SunModeScript() {
  useLayoutEffect(() => watchSun(document.documentElement, deviceStore, subscribeDevice), []);
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SUN_SCRIPT }}
    />
  );
}

export function SunModeToggle() {
  const on = useSyncExternalStore(subscribeDevice, () => readSun(deviceStore()), () => false);
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-hint`}
      onClick={() => {
        writeSun(deviceStore(), !on);
        applySun(document.documentElement, !on);
        notifyDevice();
      }}
      className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-left text-[15px] hover:bg-surface-2"
    >
      <Sun className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span id={`${id}-name`} className="block">Modo sol</span>
        <span id={`${id}-hint`} className="block text-xs text-text-2">Más contraste y letra más grande para leer en la calle</span>
      </span>
      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full border-2 ${on ? 'border-accent bg-accent' : 'border-border bg-surface-2'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full ${on ? 'right-0.5 bg-on-accent' : 'left-0.5 bg-muted'}`} />
      </span>
    </button>
  );
}
