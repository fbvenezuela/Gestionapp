'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { quickCreate } from '@/lib/actions/redes';
import { Sheet } from '@/components/ui/sheet';
import type { CardData } from '@/lib/data/redes';
import { FORMAT, FORMATS, type Format } from '@/lib/domain/redes';

// «¿Qué quieres crear?» (D-70, F12): the six formats with their short help and «Se creará en Mes 1». One tap creates the
// draft in the open month (quickCreate) and goes to its section with the card open. Inside a section, a piece of that
// same section is put on top right there, from the action's answer (no other address: the demo keeps it on this server,
// F3). `/piezas/nueva` stays for a piece born from an event.
export const CREATE_TITLE = '¿Qué quieres crear?';

export function CreateSheet({
  monthId, monthLabel, defaultOpen = false, open: controlled, onOpenChange, trigger, current, onCreated, closeHref,
}: {
  monthId: string | null;
  monthLabel: string;
  defaultOpen?: boolean; // /redes?crear=1 opens it (nothing is created on load)
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  trigger?: ReactNode;
  current?: Format; // the section it is opened from
  onCreated?: (card: CardData) => void; // a piece of `current`: shown in place
  closeHref?: string; // where closing leaves the address (without ?crear=1)
}) {
  const router = useRouter();
  const [inner, setInner] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const open = controlled ?? inner;
  const setOpen = (o: boolean) => {
    setInner(o);
    onOpenChange?.(o);
    if (!o && closeHref) router.replace(closeHref, { scroll: false });
  };

  const create = (f: Format) =>
    start(async () => {
      const r = await quickCreate({ format: f, monthId });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? 'Creada');
      setInner(false);
      onOpenChange?.(false);
      if (f === current && onCreated) onCreated(r.data!.card);
      else router.push(r.data!.href);
    });

  return (
    <Sheet open={open} onOpenChange={setOpen} title={CREATE_TITLE} description={`Se creará en ${monthLabel || 'el primer mes'}.`} trigger={trigger}>
      <ul className="grid gap-2">
        {FORMATS.map((f) => (
          <li key={f}>
            <button
              type="button"
              disabled={pending}
              onClick={() => create(f)}
              className="flex min-h-14 w-full flex-col items-start justify-center rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-left hover:border-accent hover:bg-accent-soft disabled:opacity-60"
            >
              <span className="font-semibold">{FORMAT[f].label}</span>
              <span className="text-sm text-text-2">{FORMAT[f].hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
