'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Info, X } from 'lucide-react';
import { NO_PERMISSION_PARAM } from './no-permission';

// When someone opens a screen that is not for their role, requireRole() sends them to their own
// home with ?sin-permiso=1 and this polite note explains why. Mounted once in the panel layout,
// so it shows on Hoy, on the boss's Inicio (/jefe) or any home.
export function NoPermissionBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}

function Banner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  if (params.get(NO_PERMISSION_PARAM) !== '1') return null;
  const close = () => {
    const rest = new URLSearchParams(params.toString());
    rest.delete(NO_PERMISSION_PARAM);
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-info-soft py-1 pl-3 pr-1 text-[15px] text-text">
      <Info className="mt-3 h-5 w-5 shrink-0 text-info" aria-hidden />
      <p className="min-w-0 flex-1 py-2.5">Esa pantalla no es de tu rol. Te trajimos a tu inicio.</p>
      <button type="button" onClick={close} aria-label="Cerrar aviso" className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] hover:bg-surface">
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
