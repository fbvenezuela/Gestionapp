'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

// On a phone the tabs scroll sideways and only two or three fit: the current one is brought
// into view (centered), so the person always sees where they are. Only the strip scrolls,
// never the page.
export function TabStrip({ current, className, children }: { current: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const ul = ref.current;
    const pill = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !pill || ul.scrollWidth <= ul.clientWidth) return;
    const u = ul.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    ul.scrollLeft += p.left + p.width / 2 - (u.left + u.width / 2);
  }, [current]);
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
