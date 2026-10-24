'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { NavItem } from '@/lib/roles';
import { NAV_ICONS } from './nav-icons';
import { MenuDetails } from './menu-details';

function isActive(pathname: string, href: string) {
  if (href === '/jefe') return pathname === '/jefe' || pathname.startsWith('/jefe/politica');
  return pathname === href || pathname.startsWith(href + '/');
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-1">
      {items.map((it) => {
        const Icon = NAV_ICONS[it.icon];
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] font-medium',
              active ? 'bg-accent text-on-accent' : 'text-text-2 hover:bg-surface-2 hover:text-text',
            )}
          >
            {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : null}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items, more = [] }: { items: NavItem[]; more?: NavItem[] }) {
  const pathname = usePathname();
  if (items.length === 0 && more.length === 0) return null;
  const cols = items.length + (more.length ? 1 : 0);
  const moreActive = more.some((it) => isActive(pathname, it.href));
  // Five columns leave 72 px each on a 360 px phone. A fixed 11 px fits «Por aprobar» and
  // «Resultados» there, also in «Modo sol» (it enlarges rem-based text), so labels never overlap.
  const text = cols >= 5 ? 'text-[11px] tracking-tight' : 'text-xs';
  return (
    <nav
      aria-label="Menú"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const Icon = NAV_ICONS[it.icon];
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-16 flex-col items-center justify-center gap-0.5 font-semibold', text, active ? 'text-accent-ink' : 'text-text-2')}
              >
                {Icon ? <Icon className="h-6 w-6" aria-hidden /> : null}
                {/* As wide as the cell: in a centered column the label would grow past it. */}
                <span className="block w-full truncate px-0.5 text-center">{it.label}</span>
              </Link>
            </li>
          );
        })}
        {more.length ? (
          <li>
            {/* key on the path: the panel closes after choosing a page */}
            <MenuDetails key={pathname} className="group relative h-full">
              <summary
                className={cn(
                  'flex min-h-16 cursor-pointer list-none flex-col items-center justify-center gap-0.5 font-semibold [&::-webkit-details-marker]:hidden',
                  text,
                  moreActive ? 'text-accent-ink' : 'text-text-2',
                )}
              >
                <MoreHorizontal className="h-6 w-6" aria-hidden />
                <span>Más</span>
              </summary>
              <div className="absolute bottom-full right-1 mb-2 w-56 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-lg">
                {more.map((it) => {
                  const Icon = NAV_ICONS[it.icon];
                  const active = isActive(pathname, it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn('flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px]', active ? 'bg-accent text-on-accent' : 'hover:bg-surface-2')}
                    >
                      {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : null}
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            </MenuDetails>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
