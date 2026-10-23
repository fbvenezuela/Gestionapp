'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Keeps what someone is typing in the phone (localStorage) until it is sent, so a
// power cut or lost signal never loses work. `clear()` after a successful save.
export function useDraft<T>(key: string, initial: T) {
  const storageKey = `draft:${key}`;
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved draft once on mount
        setValue({ ...initial, ...JSON.parse(raw) });
        setRestored(true);
      }
    } catch {
      /* storage unavailable: work without drafts */
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* full or unavailable */
    }
  }, [storageKey, value]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setRestored(false);
  }, [storageKey]);

  return { value, setValue, restored, clear };
}
