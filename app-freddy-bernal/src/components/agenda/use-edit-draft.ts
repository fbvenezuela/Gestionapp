'use client';

import { useState } from 'react';
import { useDraft } from '@/lib/hooks/use-draft';
import {
  draftConflicts,
  editField,
  emptyDraft,
  restoreEditDraft,
  savePayload,
  shownValues,
  takeTheirs,
  type EditDraft,
  type Value,
} from '@/lib/domain/agenda-merge';

// An editor of the shared agenda (an event's data, its date and place, its brief). What this person types is kept
// in the phone (per person: useDraft) until it is saved, with the values and the version it started from. When it
// opens again after someone else saved, the fields both changed show in the conflict banner: «Usar lo de él» or
// «Dejar lo mío». The save sends the starting version and values, so the server writes only this person's changes
// and tells the other one when the same field was overwritten (domain/agenda-merge.ts).
export function useEditDraft(key: string, current: Record<string, Value>, rev: number | null) {
  const { value: d, setValue, restored, clear } = useDraft<EditDraft>(key, emptyDraft(), { restore: (saved) => restoreEditDraft(saved, current) });
  const [kept, setKept] = useState<string[]>([]);
  const conflicts = draftConflicts(d, current).filter((k) => !kept.includes(k));
  return {
    values: shownValues(d, current) as Record<string, string>,
    set: (k: string, v: Value) => setValue((x) => editField(x, current, rev, k, v)),
    conflicts,
    theirs: (k: string) => current[k],
    takeTheirs: (k: string) => setValue((x) => takeTheirs(x, k)),
    keepMine: (k: string) => setKept((x) => [...x, k]),
    restored,
    dirty: Object.keys(d.values).length > 0,
    payload: () => savePayload(d, current, rev),
    clear: () => {
      setKept([]);
      clear();
    },
  };
}
