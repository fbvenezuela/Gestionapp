'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { chooseMonth } from '@/lib/actions/redes';
import { cn } from '@/lib/cn';
import type { PeriodLink } from './period-core';

// «Por mes» / «Por trimestre», «Anterior» and «Siguiente» of the board (R4, D-71). The period lives in the address:
// ?mes= is the open month (the same one every section and the feed follow, F2) and ?vista=trimestre shows the three
// months in a row of the list that hold it. Moving the period moves the open month, so it is remembered for this person
// too (chooseMonth, without waiting). At the ends the arrow is there but off. On the phone the label breaks in two lines.

export type PeriodNavProps = {
  mode: 'month' | 'quarter';
  label: string; // «Mes 1» or «Trimestre 1»
  detail?: string; // the quarter's months: «Mes 1 a Mes 3»
  monthHref: string; // «Por mes»
  quarterHref: string; // «Por trimestre»
  prev: PeriodLink;
  next: PeriodLink;
};

const seg = (on: boolean) =>
  cn(
    'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold',
    on ? 'bg-slate text-on-slate' : 'text-text-2 hover:bg-surface-2 hover:text-text',
  );
const arrow = 'grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-text';

function Arrow({ to, dir, noun }: { to: PeriodLink; dir: 'prev' | 'next'; noun: string }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  const name = `${dir === 'prev' ? 'Anterior' : 'Siguiente'}: ${noun}`;
  if (!to) {
    return (
      <button type="button" disabled aria-label={name} className={cn(arrow, 'opacity-40')}>
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    );
  }
  return (
    <Link href={to.href} aria-label={name} onClick={() => void chooseMonth({ monthId: to.monthId })} className={cn(arrow, 'hover:bg-surface-2')}>
      <Icon className="h-5 w-5" aria-hidden />
    </Link>
  );
}

export function PeriodNav({ mode, label, detail, monthHref, quarterHref, prev, next }: PeriodNavProps) {
  const noun = mode === 'quarter' ? 'trimestre' : 'mes';
  return (
    <div data-tour="redes-period" className="flex min-w-0 flex-wrap items-center gap-2">
      <nav aria-label="Ver el tablero" className="flex rounded-full border border-border bg-surface p-0.5">
        <Link href={monthHref} aria-current={mode === 'month' ? 'page' : undefined} className={seg(mode === 'month')}>
          Por mes
        </Link>
        <Link href={quarterHref} aria-current={mode === 'quarter' ? 'page' : undefined} className={seg(mode === 'quarter')}>
          Por trimestre
        </Link>
      </nav>
      <div className="flex min-w-0 items-center gap-2">
        <Arrow to={prev} dir="prev" noun={noun} />
        <p aria-live="polite" className="min-w-0 text-center leading-tight">
          <span className="block font-bold">{label}</span>
          {detail ? <span className="block text-sm text-text-2">{detail}</span> : null}
        </p>
        <Arrow to={next} dir="next" noun={noun} />
      </div>
    </div>
  );
}
