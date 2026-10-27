'use client';

import { useLayoutEffect } from 'react';
import { GLASS_SCRIPT, applyGlass, type GlassNavigator } from './glass-core';

// Turns the glass off on weak phones before the first paint on a full load (inline script) and again
// after React's dev remount (layout effect). Mounted in the root layout, so the sign-in and public
// pages are covered too. Same pattern as SunModeScript: on the client the script is rendered as
// text/plain, so React neither runs it twice nor warns about it.
export function GlassScript() {
  // deviceMemory and connection are not in TypeScript's DOM types yet (Chromium only).
  useLayoutEffect(() => applyGlass(document.documentElement, navigator as Navigator & GlassNavigator), []);
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: GLASS_SCRIPT }}
    />
  );
}
