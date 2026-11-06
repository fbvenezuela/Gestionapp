'use client';

import { useEffect } from 'react';

/** Moves the focus to an element when a view appears (a consultation that just opened): a screen reader starts there. */
export function FocusOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.focus();
  }, [targetId]);
  return null;
}
