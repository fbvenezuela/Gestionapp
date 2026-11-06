import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { safeHref } from '@/lib/web/blocks';
import { cn } from '@/lib/cn';

// The public website's small pieces (design §1): editorial, big readable type, generous space, elegant cards with a
// discreet border and a soft shadow, buttons of 48 px. Colors only from tokens (bg-action for the citizen actions,
// ivory and charcoal for the pages, olive for accents). Server components: no JavaScript reaches the phone for them.

/** A link inside the site with no prefetching: a page with forty links does not download forty pages on a slow
 * connection (the next one loads when tapped). */
export function WebLink({ prefetch, ...props }: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch ?? false} {...props} />;
}

/** A link from content: only https, http, mailto or a path of this site (safeHref); anything else is plain text. */
export function SafeLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const ok = safeHref.safeParse(href);
  if (!ok.success) return <span className={className}>{children}</span>;
  const to = ok.data;
  if (to.startsWith('/')) return <WebLink href={to} className={className}>{children}</WebLink>;
  return (
    <a href={to} className={className} rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink', className)}>{children}</p>;
}

export const cardClass = 'rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--glass-shadow)]';

/** Underlined text link in the content's color, with room to tap. */
export const textLinkClass = 'font-semibold text-accent-ink underline decoration-2 underline-offset-4 hover:decoration-accent';

const BUTTON = {
  action: 'bg-action text-on-action hover:bg-action-hover',
  olive: 'bg-accent text-on-accent hover:bg-accent-hover',
  outline: 'border-2 border-accent bg-surface text-text hover:bg-accent-soft',
  ghost: 'text-text underline decoration-2 underline-offset-4 hover:bg-surface',
  light: 'bg-on-charcoal text-charcoal hover:bg-ivory',
} as const;

export type ButtonVariant = keyof typeof BUTTON;

export function buttonClass(variant: ButtonVariant = 'olive', size: 'md' | 'lg' | 'sm' = 'md') {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full text-center font-semibold leading-tight transition-colors',
    size === 'lg' ? 'min-h-14 px-7 text-lg' : size === 'sm' ? 'min-h-11 px-4 text-[15px]' : 'min-h-12 px-5 text-base',
    BUTTON[variant],
  );
}

export function ButtonLink({
  href,
  variant = 'olive',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  className?: string;
  children: ReactNode;
}) {
  return (
    <WebLink href={href} className={cn(buttonClass(variant, size), className)}>
      {children}
    </WebLink>
  );
}

const BADGE = {
  neutral: 'bg-surface-2 text-text',
  olive: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  action: 'bg-action text-on-action',
} as const;

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof BADGE; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold', BADGE[tone], className)}>{children}</span>;
}

/** A section's heading row: the title (h2 by default) and, on the right, a «see everything» link. */
export function SectionHeading({
  title,
  as: Tag = 'h2',
  id,
  more,
  intro,
  className,
}: {
  title: string;
  as?: 'h1' | 'h2';
  id?: string;
  more?: { href: string; label: string };
  intro?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="max-w-2xl">
        <Tag id={id} className={cn('font-bold tracking-tight text-text', Tag === 'h1' ? 'text-4xl sm:text-5xl' : 'text-[1.75rem] leading-tight sm:text-4xl')}>
          {title}
        </Tag>
        {intro ? <p className="mt-3 text-lg leading-relaxed text-text-2">{intro}</p> : null}
      </div>
      {more ? (
        <WebLink href={more.href} className={cn(textLinkClass, 'inline-flex min-h-11 items-center')}>
          {more.label}
        </WebLink>
      ) : null}
    </div>
  );
}

/** A page's opening: optional eyebrow, the h1 and an introduction. */
export function PageIntro({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string | null; children?: ReactNode }) {
  return (
    <Container className="pb-8 pt-10 sm:pb-12 sm:pt-16">
      {eyebrow ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : null}
      <h1 className="max-w-4xl text-[2.375rem] font-bold leading-[1.08] tracking-tight text-text sm:text-6xl">{title}</h1>
      {intro ? <p className="mt-5 max-w-3xl text-lg leading-relaxed text-text-2 sm:text-xl">{intro}</p> : null}
      {children}
    </Container>
  );
}

/** «Por confirmar» next to an account the team has not verified yet (only the test version shows them). No margin of
 * its own: the row that holds it sets the gap, so it lines up the same whether it fits beside the name or wraps. */
export function UnverifiedMark({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
        dark ? 'border border-on-charcoal text-on-charcoal' : 'bg-warn-soft text-warn',
        className,
      )}
    >
      por confirmar
    </span>
  );
}
