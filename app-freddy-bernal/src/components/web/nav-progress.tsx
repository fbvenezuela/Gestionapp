'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// The website's loading state: a thin orange bar at the top from the tap on a link of the site until the new address is
// on screen (on a slow connection that can take a while, and a tap with no answer looks broken). The pages themselves
// arrive whole, with no streamed skeleton (src/app/(web) has no loading.tsx on purpose: a skeleton would hide the
// content from anyone without JavaScript and delay it for everyone else). Visual only: the router announces the new
// page's title to screen readers. With prefers-reduced-motion the bar appears without moving. Tiny: no libraries.

const GIVE_UP_MS = 15_000;

/** «/gestion?vista=linea»: the address as the router sees it, in one form for the router and for the browser. */
const addressOf = (pathname: string, search: { toString(): string } | null) => `${pathname}?${search?.toString() ?? ''}`;

export function NavProgress() {
  const address = addressOf(usePathname() ?? '/', useSearchParams());
  // The address the person was on when they tapped a link: the bar shows while that is still the address on screen.
  const [leaving, setLeaving] = useState<string | null>(null);
  const pending = leaving !== null && leaving === address;

  useEffect(() => {
    // Capture phase: the router's own click handler (it prevents the default to navigate in place) has not run yet.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest('a');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // The same page, or only an anchor in it («Saltar al contenido»): nothing to wait for.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setLeaving(addressOf(window.location.pathname, new URLSearchParams(window.location.search)));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // A navigation that never ends (no signal at all): the bar goes away instead of staying forever.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setLeaving(null), GIVE_UP_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-1 origin-left bg-action transition-transform duration-700 ease-out motion-reduce:transition-none ${pending ? 'scale-x-75' : 'scale-x-0'}`}
    />
  );
}
