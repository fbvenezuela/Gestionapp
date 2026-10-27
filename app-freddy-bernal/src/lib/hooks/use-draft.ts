'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction } from 'react';

// Drafts belong to the person who typed them: on a shared iPad the next person never sees (or saves) them. The panel
// layout says who is signed in; «Salir» clears every draft in the phone (clearDrafts).
const DraftUser = createContext('');
export function DraftUserProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return createElement(DraftUser.Provider, { value: userId }, children);
}

export const DRAFT_PREFIX = 'draft:';
export function draftStorageKey(userId: string, key: string) {
  return userId ? `${DRAFT_PREFIX}${userId}:${key}` : `${DRAFT_PREFIX}${key}`;
}

// Every draft in this phone (anyone's): on sign-out.
export function clearDrafts(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

// Keeps what someone is typing in the phone (localStorage) until it is sent, so a
// power cut or lost signal never loses work. `clear()` after a successful save (and on «Cancelar»).
//   * Nothing is written until the person really changes something: opening a form and leaving keeps no draft
//     (a draft of the starting values would later hide someone else's newer save).
//   * A saved draft equal to the starting values is thrown away, not restored.
//   * `restore(saved)` lets a form decide what of a saved draft still applies (null = nothing): the fichas keep only
//     the changed fields and compare them with the server's current values (src/lib/domain/ficha-draft.ts).
export function useDraft<T>(key: string, initial: T, opts: { restore?: (saved: unknown) => T | null } = {}) {
  const storageKey = draftStorageKey(useContext(DraftUser), key);
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const dirty = useRef(false);
  const start = useRef(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const next = opts.restore ? opts.restore(parsed) : ({ ...start.current, ...(parsed as object) } as T);
        if (next === null || sameJson(next, start.current)) {
          localStorage.removeItem(storageKey);
        } else {
          // Restoring a saved draft once on mount.
          setValue(next);
          setRestored(true);
        }
      }
    } catch {
      /* storage unavailable or a broken draft: work without it */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!dirty.current) return;
    try {
      if (sameJson(value, start.current)) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* full or unavailable */
    }
  }, [storageKey, value]);

  // A real change by the person: from now on it is kept in the phone.
  const update = useCallback((next: SetStateAction<T>) => {
    dirty.current = true;
    setValue(next);
  }, []);

  const clear = useCallback(() => {
    dirty.current = false;
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setRestored(false);
  }, [storageKey]);

  return { value, setValue: update, restored, clear };
}

// The same data, whatever the order of the keys.
export function sameJson(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x)
      .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x) ?? 'null';
}
