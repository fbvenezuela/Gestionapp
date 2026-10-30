import { Search } from 'lucide-react';
import { Input } from '@/components/ui/field';
import { buttonVariants } from '@/components/ui/button';

// «Buscar en Redes» (R4, D-71): a plain form to /redes/buscar?q= (it works before the page comes alive), on the board
// and on the search page itself. It carries the open month so the results' links keep it. Titles, card fields, copies,
// notices and tweets; never a date, an hour or a place of the agenda (those are not searched, D-75).
export function SearchBox({ monthId, q = '' }: { monthId: string | null; q?: string }) {
  return (
    <form role="search" aria-label="Buscar en Redes" action="/redes/buscar" data-tour="redes-search" className="flex min-w-0 gap-2">
      {monthId ? <input type="hidden" name="mes" value={monthId} /> : null}
      <label htmlFor="redes-q" className="sr-only">
        Buscar en Redes
      </label>
      <Input
        id="redes-q"
        name="q"
        type="search"
        defaultValue={q}
        minLength={2}
        maxLength={100}
        placeholder="Título, copy, aviso o tweet"
        className="min-w-0 flex-1"
      />
      <button type="submit" className={buttonVariants({ className: 'shrink-0' })}>
        <Search className="h-4 w-4" aria-hidden /> Buscar
      </button>
    </form>
  );
}
