'use client';

import { useSyncExternalStore } from 'react';
import { Info } from 'lucide-react';
import { deviceStore, notifyDevice, readKey, subscribeDevice, writeKey } from '@/components/ui/device-store';
import { DEMO_NOTICE_KEY, REDES_DEMO_NOTICE } from '@/lib/domain/redes';

const DONE = 'done';

// The box of DemoNotice (demo-notice.tsx decides that this is the demo). Hidden on the server and until the phone says
// it was not closed yet: no hydration mismatch. The phone's storage may throw (private mode): device-store catches it.
export function DemoNoticeBox({ userId }: { userId: string }) {
  const key = DEMO_NOTICE_KEY(userId);
  const raw = useSyncExternalStore(subscribeDevice, () => readKey(deviceStore(), key), () => DONE);
  if (raw === DONE) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-info-soft py-1 pl-3 pr-1 text-[15px] text-text">
      <Info className="mt-3 h-5 w-5 shrink-0 text-info" aria-hidden />
      <p className="min-w-0 flex-1 py-2.5">{REDES_DEMO_NOTICE}</p>
      <button
        type="button"
        onClick={() => {
          writeKey(deviceStore(), key, DONE);
          notifyDevice();
        }}
        className="min-h-11 shrink-0 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-info hover:bg-surface"
      >
        Entendido
      </button>
    </div>
  );
}
