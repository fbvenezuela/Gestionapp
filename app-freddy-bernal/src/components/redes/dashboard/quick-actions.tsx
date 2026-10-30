'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, LayoutGrid, MessageSquareText, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { quickCreate } from '@/lib/actions/redes';
import { FORMAT, FORMATS, withMonth, type Format } from '@/lib/domain/redes';

// «Acciones rápidas» of the board (R4, D-71): a new piece of each format, made in the open month with one tap
// (quickCreate) and opened in its section; then the Feed, the week's tweets and a new publication. The same stable
// selector as before (nav[aria-label="Crear en Redes"]), which the tutorials point at.
const row =
  'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-left hover:border-accent hover:bg-accent-soft disabled:opacity-60';
const icon = 'grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-accent-soft text-accent-ink';

export function QuickActions({ monthId, monthLabel }: { monthId: string | null; monthLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const create = (f: Format) =>
    start(async () => {
      const r = await quickCreate({ format: f, monthId });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? 'Creada');
      router.push(r.data!.href);
    });

  const where = monthLabel ? `En ${monthLabel}` : 'En el primer mes';
  return (
    <nav aria-label="Crear en Redes" className="flex min-w-0 flex-col gap-2">
      <ul className="grid gap-2">
        {FORMATS.map((f) => (
          <li key={f}>
            <button type="button" disabled={pending} onClick={() => create(f)} className={row}>
              <span className={icon}>
                <Plus className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{FORMAT[f].newLabel}</span>
                <span className="block text-sm text-text-2">
                  {FORMAT[f].hint} · {where}
                </span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <Link href={withMonth('/redes/feed', monthId)} className={row}>
            <span className={icon}>
              <LayoutGrid className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Feed</span>
              <span className="block text-sm text-text-2">Los 24 espacios del mes, en el orden en que salen</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
        <li>
          <Link href="/tweets/nueva" className={row}>
            <span className={icon}>
              <MessageSquareText className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Tweets de la semana</span>
              <span className="block text-sm text-text-2">Desde el documento de la semana</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
        <li>
          <Link href="/publicar/nueva" className={row}>
            <span className={icon}>
              <Send className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Nueva publicación</span>
              <span className="block text-sm text-text-2">Una pieza aprobada, en una o varias redes</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
