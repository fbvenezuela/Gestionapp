import Link from 'next/link';
import { ImageOff, Search, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { TabStrip } from '@/app/(panel)/ajustes/asistente/tab-strip';
import { FORMAT, FORMATS, withMonth, type Format, type NavCount } from '@/lib/domain/redes';

// The section bar of Redes (R4, D-60, F1): Tablero · Reels · Posts · Carruseles · Historias · YouTube · Fin de mes ·
// Feed · Tweets, and «Buscar en Redes». Every link carries the open month (?mes=), so changing the month in one section
// follows in the others (F2). With `counts` (getNavCounts, the board's own matrix) each format says what is pending in
// that month: reviewed of its quota («3/8»), without copy («⚠ 2») and without image, also for screen readers. On the
// phone the row scrolls inside itself (TabStrip brings the current one into view); the page never scrolls sideways.
// Every page of Redes renders it under its header (a layout does not get ?mes=). Paso 0; then the integrator's.

export type RedesSection = 'dashboard' | Format | 'feed' | 'search';

// «revisadas» for the pieces of these sections, «revisados» for the rest («Historias: 3 de 30 revisadas»).
const FEMININE: ReadonlySet<Format> = new Set<Format>(['story', 'month_end']);

/** What a format's numbers say to a screen reader: «: 3 de 8 revisados, 2 sin copy, 1 sin imagen». */
export function navCountText(f: Format, c: NavCount): string {
  const done = FEMININE.has(f) ? 'revisadas' : 'revisados';
  const parts = [c.quota === null ? `${c.reviewed} ${done}` : `${c.reviewed} de ${c.quota} ${done}`];
  if (c.copyMissing > 0) parts.push(`${c.copyMissing} sin copy`);
  if (c.imageMissing > 0) parts.push(`${c.imageMissing} sin imagen`);
  return `: ${parts.join(', ')}`;
}

const pill = (current: boolean) =>
  cn(
    'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold',
    current ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
  );

export function RedesNav({ active, monthId, counts }: { active: RedesSection; monthId: string | null; counts?: Partial<Record<Format, NavCount>> }) {
  const items: { key: string; href: string; label: string; format?: Format }[] = [
    { key: 'dashboard', href: withMonth('/redes', monthId), label: 'Tablero' },
    ...FORMATS.map((f) => ({ key: f, href: withMonth(`/redes/${FORMAT[f].slug}`, monthId), label: FORMAT[f].plural, format: f })),
    { key: 'feed', href: withMonth('/redes/feed', monthId), label: 'Feed' },
    { key: 'tweets', href: withMonth('/tweets', monthId), label: 'Tweets' },
  ];
  return (
    <nav aria-label="Secciones de Redes" className="mb-5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
      <TabStrip current={active} className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {items.map((it) => {
          const current = it.key === active;
          const c = it.format ? counts?.[it.format] : undefined;
          return (
            <li key={it.key} className="shrink-0">
              <Link href={it.href} aria-current={current ? 'page' : undefined} className={pill(current)}>
                {it.label}
                {c && it.format ? (
                  <>
                    <span aria-hidden className="tabular font-bold">
                      {c.quota === null ? c.reviewed : `${c.reviewed}/${c.quota}`}
                    </span>
                    {c.copyMissing > 0 ? (
                      <span aria-hidden className={cn('inline-flex items-center gap-0.5 tabular', current ? 'text-on-accent' : 'text-warn')}>
                        <TriangleAlert className="h-3.5 w-3.5" /> {c.copyMissing}
                      </span>
                    ) : null}
                    {c.imageMissing > 0 ? (
                      <span aria-hidden className={cn('inline-flex items-center gap-0.5 tabular', current ? 'text-on-accent' : 'text-warn')}>
                        <ImageOff className="h-3.5 w-3.5" /> {c.imageMissing}
                      </span>
                    ) : null}
                    <span className="sr-only">{navCountText(it.format, c)}</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </TabStrip>
      <Link href={withMonth('/redes/buscar', monthId)} aria-current={active === 'search' ? 'page' : undefined} className={cn(pill(active === 'search'), 'shrink-0 self-start')}>
        <Search className="h-4 w-4" aria-hidden /> Buscar en Redes
      </Link>
    </nav>
  );
}
