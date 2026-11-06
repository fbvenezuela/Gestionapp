'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// The phone menu is a native <details>: it opens on the FIRST tap, before any JavaScript arrives (the old site's menu
// needed two, docs/diagnostico.md problem 13). This tiny helper only tidies up once the page is running: it closes the
// menu after choosing a link (the header stays on screen between pages) and with Escape, giving the focus back to the
// button.
export function MenuCloser() {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const menu = ref.current?.closest('details');
    if (menu) menu.open = false;
  }, [pathname]);

  useEffect(() => {
    const menu = ref.current?.closest('details');
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !menu.open) return;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('a')) menu.open = false;
    };
    menu.addEventListener('keydown', onKey);
    menu.addEventListener('click', onClick);
    return () => {
      menu.removeEventListener('keydown', onKey);
      menu.removeEventListener('click', onClick);
    };
  }, []);

  return <span ref={ref} hidden />;
}
