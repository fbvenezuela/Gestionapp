import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text-2 hover:text-text">
            <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
          </Link>
        ) : null}
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.01em] sm:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-text-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ title, action, icon }: { title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 glass-card rounded-[var(--radius-card)] border-dashed border-border px-4 py-10 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="max-w-sm text-[15px] text-text-2">{title}</p>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'accent' | 'danger' | 'ok' }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : tone === 'accent' ? 'text-accent-ink' : 'text-text';
  return (
    <div className="glass-card rounded-[var(--radius-card)] p-4 sm:p-5">
      <p className="label-caps">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-sm text-text-2">{hint}</p> : null}
    </div>
  );
}
