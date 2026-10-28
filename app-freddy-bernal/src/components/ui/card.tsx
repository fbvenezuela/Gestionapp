import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Glass card (globals.css .glass-card): frosted glass with a real blur, a light edge and a soft shadow.
// `solid` (.glass-solid) for a card that wraps a long list or table: solid and without blur, so there is
// no blur behind long lists (cards that are themselves list items are solid on their own, in globals.css).
// A color passed in className (bg-danger-soft, border-info…) still wins.
export function Card({ className, solid, ...props }: ComponentProps<'div'> & { solid?: boolean }) {
  return <div className={cn('glass-card rounded-[var(--radius-card)]', solid && 'glass-solid', className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-6">{title}</h2>
        {subtitle ? <p className="text-sm text-text-2">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}
