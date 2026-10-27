import Link from 'next/link';
import { CalendarClock, CalendarDays, CalendarPlus, HardHat, ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

// The boss's own agenda (§3: «debemos crearle todos los botones para sumar»): big tiles for the iPad (four in a row)
// and the phone (two). Also for despacho, who shares the agenda.
const ICONS = { new: CalendarPlus, obra: HardHat, toSchedule: CalendarClock, calendar: CalendarDays, decide: ListChecks } as const;
export type BigAction = { href: string; label: string; hint?: string; icon: keyof typeof ICONS; count?: number; tone?: 'accent' | 'warn' };

export function BigActions({ items, className }: { items: BigAction[]; className?: string }) {
  return (
    <nav aria-label="Acciones de la agenda" className={cn('mb-5', className)}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((a) => {
          const Icon = ICONS[a.icon];
          return (
            <li key={a.href}>
              <Card className="h-full">
                <Link
                  href={a.href}
                  className="flex h-full min-h-24 flex-col justify-between gap-2 rounded-[var(--radius-card)] p-4 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-start justify-between gap-2">
                    <Icon className={cn('h-7 w-7 shrink-0', a.tone === 'warn' ? 'text-warn' : 'text-accent-ink')} aria-hidden />
                    {a.count !== undefined ? (
                      <span aria-hidden className={cn('grid min-w-8 place-items-center rounded-full px-2 py-0.5 text-sm font-bold', a.count ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-text-2')}>{a.count}</span>
                    ) : null}
                  </span>
                  <span>
                    <span className="block text-lg font-bold leading-tight">
                      {a.label}
                      {a.count !== undefined ? <span className="sr-only">: {a.count}</span> : null}
                    </span>
                    {a.hint ? <span className="mt-0.5 block text-sm text-text-2">{a.hint}</span> : null}
                  </span>
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
