import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';

// A list of links like Ajustes' (src/app/(panel)/ajustes/page.tsx): icon, label, one line of detail, a chevron.
export type HelpItem = { href: string; label: string; detail: string; icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> };

/** One link of a help list: icon, label, one line of detail and a chevron, at least 64 px high. */
export function HelpRow({ href, label, detail, icon: Icon }: HelpItem) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <Icon className="h-5 w-5 shrink-0 text-text-2" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold [overflow-wrap:anywhere]">{label}</span>
        <span className="block text-sm text-text-2">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

// `data-tour` goes on the card (the tutorial of /ayuda points at it), written as an attribute where it is used.
export function HelpList({ title, subtitle, items, footer, ...rest }: { title: string; subtitle?: string; items: HelpItem[]; footer?: ReactNode; 'data-tour'?: string }) {
  return (
    <Card solid {...rest}>
      <CardHeader title={title} subtitle={subtitle} />
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.href}>
            <HelpRow {...item} />
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
    </Card>
  );
}
