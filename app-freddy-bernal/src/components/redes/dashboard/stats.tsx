import Link from 'next/link';
import { CalendarClock, CheckCircle2, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { fmtAverage } from '@/lib/domain/redes-dashboard';
import { receptivityLabel } from '@/lib/domain/redes';

// The numbers on top of the board (R4, D-71): the average receptivity of the period (only the rated posts, reels and
// carousels: never an unrated one as 0, D-65), what is approved and not published yet, and what is scheduled. The last
// two open Publicar, where the same numbers are (the hub's rule: a tap never lands on a different count).
export type BoardStats = { receptivity: { avg: number | null; count: number }; ready: number; scheduled: number; periodLabel: string };

function StatTile({ icon: Icon, label, value, hint, href }: { icon: LucideIcon; label: string; value: string; hint: string; href?: string }) {
  const body = (
    <>
      <Icon className="h-5 w-5 text-accent-ink" aria-hidden />
      <span className="mt-1 block text-sm font-semibold text-text-2">{label}</span>
      <span className="block text-3xl font-bold tabular leading-tight">{value}</span>
      <span className="block text-sm text-text-2">{hint}</span>
    </>
  );
  return (
    <li className="min-w-0">
      <Card className="h-full p-1">
        {href ? (
          <Link href={href} className="block min-h-full rounded-[var(--radius-control)] p-3 hover:bg-surface-2">
            {body}
          </Link>
        ) : (
          <div className="p-3">{body}</div>
        )}
      </Card>
    </li>
  );
}

export function Stats({ receptivity, ready, scheduled, periodLabel }: BoardStats) {
  const r = receptivity;
  return (
    <ul aria-label="Cifras de Redes" className="mb-5 grid gap-3 sm:grid-cols-3">
      <StatTile
        icon={Star}
        label="Receptividad media"
        value={r.avg === null ? 'Sin evaluar' : `${fmtAverage(r.avg)} de 10`}
        hint={r.count ? `${receptivityLabel(Math.round(r.avg ?? 0))} · ${r.count} ${r.count === 1 ? 'pieza puntuada' : 'piezas puntuadas'} en ${periodLabel}` : `Nadie la puntuó todavía en ${periodLabel}`}
      />
      <StatTile icon={CheckCircle2} label="Listas para publicar" value={String(ready)} hint="Aprobadas y sin publicar, en Publicar" href="/publicar" />
      <StatTile icon={CalendarClock} label="Programadas" value={String(scheduled)} hint="Publicaciones que esperan su turno, en Publicar" href="/publicar" />
    </ul>
  );
}
