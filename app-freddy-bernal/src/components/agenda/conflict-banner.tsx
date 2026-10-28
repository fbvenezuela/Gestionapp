'use client';

import { Button } from '@/components/ui/button';
import { FIELD_LABEL } from '@/lib/domain/agenda-merge';

// «Mientras escribías, otra persona cambió esto»: for each field both changed, take theirs or keep mine. Saving
// keeps the choice; what is replaced stays in the event's history. Values are shown only here, to someone who
// already sees them in the same editor.
export function ConflictBanner({
  conflicts,
  theirs,
  onTheirs,
  onMine,
  labels = FIELD_LABEL,
}: {
  conflicts: string[];
  theirs: (k: string) => unknown;
  onTheirs: (k: string) => void;
  onMine: (k: string) => void;
  labels?: Record<string, string>;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-3 text-sm text-warn" role="status" aria-live="polite">
      <p className="font-semibold">Mientras escribías, otra persona cambió esto. ¿Con cuál te quedas?</p>
      <ul className="mt-2 flex flex-col gap-2">
        {conflicts.map((k) => (
          <li key={k} className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface px-3 py-2 text-text sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1">
              <b>{labels[k] ?? k}</b>
              <span className="block text-text-2 [overflow-wrap:anywhere]">Lo de la otra persona: {String(theirs(k) ?? '') || '(vacío)'}</span>
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => onTheirs(k)}>Usar lo de él</Button>
              <Button type="button" variant="secondary" onClick={() => onMine(k)}>Dejar lo mío</Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
