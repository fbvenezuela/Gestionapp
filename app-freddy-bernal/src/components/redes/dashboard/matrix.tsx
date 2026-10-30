'use client';

import { useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FORMAT, FORMATS, type Format } from '@/lib/domain/redes';
import { CATEGORIES, CATEGORY_LABEL, CELL_EMPTY, type Category } from '@/lib/domain/redes-dashboard';
import { cn } from '@/lib/cn';
import { WARN_CATEGORIES, cellName, cursorKey, jumpTarget, pieceHref, type MatrixProps } from './matrix-core';

// «Estado del contenido» (R4, D-71): formats × seven categories for the month or the quarter. Every number goes to a
// piece of that cell: the first time to the first one and each time after to the next one (back to the first after the
// last), remembered in this tab per cell and period. The jump goes to the piece's own section and month with its anchor
// (/redes/posts?mes=…#pieza-…), where the card opens and takes the focus. Before the page comes alive a number is a
// plain link to the first piece. Zero says «¡al día!». On the phone, one block per format with its seven numbers in two
// columns instead of the table.

function readCursor(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeCursor(key: string, id: string) {
  try {
    globalThis.sessionStorage?.setItem(key, id);
  } catch {
    // Blocked storage: every tap goes to the first piece, as before the page came alive.
  }
}

const pill = (n: number, c: Category) =>
  cn(
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-base font-bold tabular',
    n === 0 ? 'bg-surface-2 text-text-2' : WARN_CATEGORIES.has(c) ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-ink',
  );

export function Matrix(props: MatrixProps) {
  const { cells, monthOf, fallbackMonthId, period } = props;
  const router = useRouter();
  const [said, setSaid] = useState('');

  const go = (e: MouseEvent<HTMLAnchorElement>, f: Format, c: Category) => {
    // A new tab or window keeps the plain link (the first piece).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const key = cursorKey(f, c, period);
    const next = jumpTarget(props, f, c, readCursor(key));
    if (!next) return;
    writeCursor(key, next.id);
    router.push(next.href);
  };

  const empty = () => {
    toast(CELL_EMPTY);
    setSaid((s) => (s === CELL_EMPTY ? `${CELL_EMPTY}​` : CELL_EMPTY));
  };

  const number = (f: Format, c: Category) => {
    const ids = cells[f][c];
    const n = ids.length;
    if (!n) {
      return (
        <button type="button" aria-label={cellName(f, c, 0)} onClick={empty} className={pill(0, c)}>
          0
        </button>
      );
    }
    return (
      <a href={pieceHref(f, ids[0], monthOf, fallbackMonthId)} aria-label={cellName(f, c, n)} onClick={(e) => go(e, f, c)} className={cn(pill(n, c), 'hover:ring-2 hover:ring-accent')}>
        {n}
      </a>
    );
  };

  return (
    <div data-tour="redes-matrix" className="min-w-0">
      <table className="hidden w-full table-fixed text-left md:table">
        <caption className="sr-only">Estado del contenido</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-28 py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-text-2">
              Formato
            </th>
            {CATEGORIES.map((c) => (
              <th key={c} scope="col" className="px-1 py-2 text-center text-xs font-semibold uppercase leading-tight tracking-wide text-text-2">
                {CATEGORY_LABEL[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FORMATS.map((f) => (
            <tr key={f} className="border-b border-border last:border-0">
              <th scope="row" className="py-1.5 pr-2 font-semibold">
                {FORMAT[f].plural}
              </th>
              {CATEGORIES.map((c) => (
                <td key={c} className="px-1 py-1.5 text-center">
                  {number(f, c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label="Estado del contenido por formato" className="grid gap-3 md:hidden">
        {FORMATS.map((f) => (
          <li key={f} className="rounded-[var(--radius-control)] border border-border bg-surface-2 p-3">
            <h3 id={`matriz-${f}`} className="text-base font-semibold">
              {FORMAT[f].plural}
            </h3>
            <ul aria-labelledby={`matriz-${f}`} className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              {CATEGORIES.map((c) => (
                <li key={c} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 text-sm leading-tight text-text-2">{CATEGORY_LABEL[c]}</span>
                  {number(f, c)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
