'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The website's navigation (from web_settings «site.navigation»), marking the section the person is in with
// aria-current (the header stays mounted between pages, so it asks the address here). Links never prefetch. No class
// helper here (clsx + tailwind-merge would add 9 KB to every public page): plain strings.

export type NavItem = { label: string; path: string };

export function isCurrent(pathname: string, path: string): boolean {
  const target = path.split('?')[0];
  if (target === '/') return pathname === '/';
  return pathname === target || pathname.startsWith(`${target}/`);
}

// `idle` and `current` never set the same property as `link`, so no class has to win over another.
const STYLE = {
  bar: {
    list: 'flex flex-wrap items-center gap-x-1',
    link: 'inline-flex min-h-12 items-center border-b-[3px] px-3 text-[15px] font-semibold text-text',
    idle: 'border-transparent hover:border-accent',
    current: 'border-action',
  },
  menu: {
    list: 'flex flex-col',
    link: 'flex min-h-12 items-center border-b border-border px-1 text-lg font-semibold',
    idle: 'text-text hover:text-accent-ink',
    current: 'text-action-ink',
  },
  footer: {
    list: 'flex flex-col gap-1',
    link: 'inline-flex min-h-11 items-center text-[15px] text-on-charcoal underline-offset-4 focus-visible:outline-on-charcoal',
    idle: 'hover:underline',
    current: 'font-semibold underline',
  },
} as const;

export function NavList({ items, variant }: { items: NavItem[]; variant: keyof typeof STYLE }) {
  const pathname = usePathname() ?? '/';
  const s = STYLE[variant];
  return (
    <ul className={s.list}>
      {items.map((it) => {
        const current = isCurrent(pathname, it.path);
        return (
          <li key={`${it.path}-${it.label}`}>
            <Link href={it.path} prefetch={false} aria-current={current ? 'page' : undefined} className={`${s.link} ${current ? s.current : s.idle}`}>
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
