'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Shows when the phone has no signal. Drafts stay saved on the phone (see use-draft).
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-slate px-4 py-2 text-sm font-medium text-on-slate">
      <WifiOff className="h-4 w-4" aria-hidden />
      Sin señal. Lo que escribas se guarda en el teléfono y se envía cuando vuelva.
    </div>
  );
}
