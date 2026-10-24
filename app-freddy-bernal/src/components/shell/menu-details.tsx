'use client';

import { useEffect, useRef, type ComponentProps } from 'react';
import { dismissMenu } from './menu-core';

// A <details> menu that also closes on a tap outside it and on Escape (menu-core.ts), and when
// an item is chosen: the header stays in place when the page changes, so it would stay open.
export function MenuDetails(props: Omit<ComponentProps<'details'>, 'ref' | 'onClick'>) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => (ref.current ? dismissMenu(ref.current, document) : undefined), []);
  return (
    <details
      ref={ref}
      {...props}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('a[href]')) e.currentTarget.open = false;
      }}
    />
  );
}
