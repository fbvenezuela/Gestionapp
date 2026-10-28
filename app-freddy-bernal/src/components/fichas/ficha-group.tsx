import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';

// A group of a ficha (Datos generales, Sobre la obra…): a card that folds, with how much of it is answered
// («4 de 6»). <details> folds without JavaScript and keeps working with bad signal.
// `data-tour` goes on the group's header (a tutorial's anchor in the ficha forms).
export function FichaGroup({ title, done, total, open = true, children, 'data-tour': tour }: { title: string; done?: number; total?: number; open?: boolean; children: React.ReactNode; 'data-tour'?: 'ficha-group' }) {
  const counted = done !== undefined && total !== undefined;
  return (
    <Card>
      <details open={open} className="group">
        <summary data-tour={tour} className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-semibold leading-6">{title}</h2>
          <span className="flex shrink-0 items-center gap-2">
            {counted ? <Chip tone={done === total ? 'ok' : 'neutral'}>{done} de {total}</Chip> : null}
            <ChevronDown className="h-5 w-5 text-text-2 transition-transform group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="border-t border-border p-4 sm:p-5">{children}</div>
      </details>
    </Card>
  );
}
