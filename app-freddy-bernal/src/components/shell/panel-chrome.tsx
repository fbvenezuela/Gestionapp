import { Toaster } from 'sonner';
import { GlassScript } from './glass-script';
import { OfflineBanner } from './offline-banner';
import { SwRegister } from './sw-register';

// The panel's own frame (until the public website it lived in the root layout, D-91): the glass switch for weak phones,
// «Sin señal», the toasts and the service worker. The team's screens, the sign-in and the internal platform's public
// pages wrap themselves in it; the public website does not load any of it (its pages stay light).
export function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GlassScript />
      <OfflineBanner />
      {children}
      <Toaster position="top-center" richColors closeButton />
      <SwRegister />
    </>
  );
}
