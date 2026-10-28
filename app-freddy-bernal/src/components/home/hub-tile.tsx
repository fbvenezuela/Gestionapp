import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';

// A big tile of the boss's Inicio and of the Redes hub (§3), made for the iPad (1024×768) and the phone (360 px): the
// whole head opens the screen, and each live counter opens the screen where those things are. Every target is at
// least 56 px high. The tiles are not list items, so they keep the glass (globals.css).
export type HubCounter = { href: string; value: number | string; label: string; tone?: 'warn' | 'danger' | 'ok' };
export type HubIconTone = 'slate' | 'warn' | 'accent' | 'solid';
// A few things to open one by one, under the counters (on the boss's Redes tile, the events with Grabación's new notes):
// a line with what they are and how many, then each one's title, which opens it. `more` when there are more than shown.
// Titles only: no dates, times or places here.
export type HubList = {
  key: string;
  label: string;
  icon: LucideIcon;
  total: number;
  items: { href: string; label: string }[];
  // Read by screen readers after each title («Jornada de salud…: ver las notas»).
  itemHint?: string;
  more?: { href: string; label: string };
};

const ICON_TONE: Record<HubIconTone, string> = {
  slate: 'bg-slate text-on-slate',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent-ink',
  solid: 'bg-accent text-on-accent',
};
const VALUE_TONE = { warn: 'text-warn', danger: 'text-danger', ok: 'text-ok' } as const;

export function HubTile({
  id,
  href,
  title,
  subtitle,
  icon: Icon,
  tone = 'accent',
  counters = [],
  grid = [],
  list,
  children,
}: {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone?: HubIconTone;
  counters?: HubCounter[];
  // Short counters, two per row (the obra stages).
  grid?: HubCounter[];
  // Shown only when it has something (total > 0).
  list?: HubList | null;
  children?: React.ReactNode;
}) {
  const listId = list ? `${id}-${list.key}` : '';
  return (
    <Card role="region" aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col p-2">
      <Link
        href={href}
        className="flex min-h-20 items-center gap-4 rounded-[var(--radius-control)] p-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-control)]', ICON_TONE[tone])}>
          <Icon className="h-8 w-8" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span id={`${id}-title`} className="block text-2xl font-bold leading-tight">{title}</span>
          <span className="mt-0.5 block text-base text-text-2">{subtitle}</span>
        </span>
        <ChevronRight className="h-6 w-6 shrink-0 text-muted" aria-hidden />
      </Link>
      {grid.length ? (
        <div className="mt-1 grid grid-cols-2 gap-1 border-t border-border pt-2">
          {grid.map((c) => (
            <Link
              key={`${c.href}:${c.label}`}
              href={c.href}
              className="flex min-h-16 min-w-0 flex-col justify-center rounded-[var(--radius-control)] px-3 py-2 hover:bg-surface-2"
            >
              <span className={cn('text-2xl font-bold leading-tight tabular', c.tone && Number(c.value) ? VALUE_TONE[c.tone] : 'text-text')}>{c.value}</span>
              <span className="text-base leading-snug text-text-2 [overflow-wrap:anywhere]">{c.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {counters.length ? (
        <ul className={cn('flex flex-col gap-1', grid.length ? 'mt-1' : 'mt-1 border-t border-border pt-2')}>
          {counters.map((c) => (
            <li key={`${c.href}:${c.label}`}>
              <Link href={c.href} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 hover:bg-surface-2">
                <span className={cn('min-w-12 shrink-0 text-right text-3xl font-bold leading-none tabular', c.tone && Number(c.value) ? VALUE_TONE[c.tone] : 'text-text')}>
                  {c.value}
                </span>
                <span className="min-w-0 flex-1 text-lg leading-snug text-text-2 [overflow-wrap:anywhere]">{c.label}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {list && list.total > 0 ? (
        // The only list a tile carries today is Grabación's new notes in the boss's Redes tile (a tutorial points at it).
        <div className="mt-1 border-t border-border pt-2" data-tour="grabacion-notes">
          <p id={listId} className="flex min-w-0 items-center gap-2 px-3 py-1 text-base font-semibold">
            <list.icon className="h-5 w-5 shrink-0 text-info" aria-hidden />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{list.label}</span>
            <Chip tone="info">
              <span className="tabular">{list.total}</span>
            </Chip>
          </p>
          <ul aria-labelledby={listId} className="flex flex-col gap-1">
            {list.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 hover:bg-surface-2">
                  <span className="min-w-0 flex-1 text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
                    {it.label}
                    {list.itemHint ? <span className="sr-only">: {list.itemHint}</span> : null}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {list.more ? (
            <Link href={list.more.href} className="mt-1 flex min-h-14 items-center gap-2 rounded-[var(--radius-control)] px-3 text-base font-semibold text-accent-ink hover:bg-surface-2">
              <span className="flex-1">{list.more.label}</span>
              <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </Card>
  );
}
