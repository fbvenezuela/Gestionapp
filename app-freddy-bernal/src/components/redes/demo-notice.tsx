import { isDemo } from '@/lib/env';
import { DemoNoticeBox } from './demo-notice-box';

// The demo's honest notice on every page of Redes (R4, D-76, F3): each demo server keeps its own database (D-39), so
// what one creates or moves may not show after a reload, with another account or on another phone. Only in the demo
// (never with the real database), once per person: «Entendido» closes it for good on this phone. Paso 0; then the
// integrator's.
export function DemoNotice({ userId }: { userId: string }) {
  if (!isDemo()) return null;
  return <DemoNoticeBox userId={userId} />;
}
