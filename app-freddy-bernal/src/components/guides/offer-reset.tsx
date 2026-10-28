'use client';

import { useState, useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import { deviceStore, notifyDevice, readKey, subscribeDevice, writeKey } from '@/components/ui/device-store';
import { offerStateKey } from '@/components/tour/tour-core';
import { Button } from '@/components/ui/button';

// «Volver a ofrecerme ayuda» in /ayuda (R3, D-47, design §5.4, §8.6): after two «Ahora no», 360 stops offering help on
// this phone for this person ({ no, off, dia } under offerStateKey). This turns it back on: it clears `off`, `no` and
// `dia` (not what each tutorial remembers). Shown only when 360 stopped offering; nothing on the server.

/** Whether 360 stopped offering help to this person on this phone. */
export function offerIsOff(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { off?: unknown })?.off === true;
  } catch {
    return false;
  }
}

export function OfferReset({ userId }: { userId: string }) {
  const key = offerStateKey(userId);
  const raw = useSyncExternalStore(subscribeDevice, () => readKey(deviceStore(), key), () => null);
  const [done, setDone] = useState(false);
  if (done) return <p className="text-[15px] text-text-2" role="status">Listo: 360 te vuelve a ofrecer ayuda en tus pantallas.</p>;
  if (!offerIsOff(raw)) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] text-text-2">360 dejó de ofrecerte ayuda en este teléfono.</p>
      <Button
        variant="secondary"
        className="w-fit"
        onClick={() => {
          writeKey(deviceStore(), key, JSON.stringify({}));
          notifyDevice();
          setDone(true);
        }}
      >
        <RotateCcw className="h-4 w-4" aria-hidden /> Volver a ofrecerme ayuda
      </Button>
    </div>
  );
}
