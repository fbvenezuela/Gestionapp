import type { ReactNode } from 'react';
import { InboxIcon } from './icons';
import { cn } from '@/lib/cn';
import { Container, WebLink } from './ui';

// Empty states, breadcrumbs and pagination of the public pages: an empty section says so plainly (and what to do), never
// a blank space or invented content.

export function EmptyState({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border-2 border-dashed border-border bg-surface px-6 py-10 text-center', className)}>
      <InboxIcon className="mx-auto h-8 w-8 text-accent-ink" />
      <p className="mt-3 text-lg font-semibold text-text">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-xl text-base leading-relaxed text-text-2">{children}</div> : null}
    </div>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <Container className="pt-6">
      <nav aria-label="Ruta">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-text-2">
          {items.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {c.href ? (
                <WebLink href={c.href} className="inline-flex min-h-11 items-center font-medium text-text underline-offset-4 hover:underline">
                  {c.label}
                </WebLink>
              ) : (
                <span aria-current="page" className="line-clamp-1">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </Container>
  );
}

/** «Anterior · Página 2 de 5 · Siguiente», keeping the filters in the address (no JavaScript needed). */
export function Pagination({ page, pages, hrefFor, label = 'Páginas' }: { page: number; pages: number; hrefFor: (p: number) => string; label?: string }) {
  if (pages <= 1) return null;
  const link = 'inline-flex min-h-12 items-center rounded-full border-2 border-accent bg-surface px-5 font-semibold text-text hover:bg-accent-soft';
  return (
    <nav aria-label={label} className="mt-12 flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? (
        <WebLink href={hrefFor(page - 1)} className={link} rel="prev">
          ← Anterior
        </WebLink>
      ) : (
        <span />
      )}
      <p className="text-base text-text-2" aria-live="polite">
        Página {page} de {pages}
      </p>
      {page < pages ? (
        <WebLink href={hrefFor(page + 1)} className={link} rel="next">
          Siguiente →
        </WebLink>
      ) : (
        <span />
      )}
    </nav>
  );
}
