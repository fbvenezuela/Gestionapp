import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { AlertTriangle, Info, LifeBuoy, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';

// The participation pages' own pieces (public website, design §1): editorial and calm, big readable type, the brand's
// orange only for the citizen's actions (with charcoal text), olive for the rest, discreet borders and soft shadows.
// Colors come only from tokens (tokens.css); targets are at least 44 px; focus is the global ring (globals.css). These
// pages sit inside the public site's header and footer (the (web) layout); they never render <main> themselves.

export const buttonStyle = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] text-center font-semibold leading-tight transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      tone: {
        action: 'bg-action text-on-action hover:bg-action-hover',
        olive: 'bg-accent text-on-accent hover:bg-accent-hover',
        outline: 'border-2 border-text bg-transparent text-text hover:bg-surface-2',
        soft: 'border border-border bg-surface text-text hover:bg-surface-2',
        ghost: 'text-text underline-offset-4 hover:bg-surface-2 hover:underline',
      },
      size: {
        lg: 'min-h-14 px-6 py-3 text-lg',
        md: 'min-h-12 px-5 py-2.5 text-base',
        sm: 'min-h-11 px-4 py-2 text-[15px]',
      },
    },
    defaultVariants: { tone: 'olive', size: 'md' },
  },
);
type ButtonVariants = VariantProps<typeof buttonStyle>;

export function Btn({ className, tone, size, type = 'button', ...props }: ComponentProps<'button'> & ButtonVariants) {
  return <button type={type} className={cn(buttonStyle({ tone, size }), className)} {...props} />;
}

export function BtnLink({ className, tone, size, ...props }: ComponentProps<typeof Link> & ButtonVariants) {
  return <Link className={cn(buttonStyle({ tone, size }), className)} {...props} />;
}

/** A band of the page: full width, its content in the reading column. */
export function Band({ className, inner, children, ...props }: ComponentProps<'section'> & { inner?: string }) {
  return (
    <section className={cn('w-full px-4 py-10 sm:px-6 sm:py-14', className)} {...props}>
      <div className={cn('mx-auto w-full max-w-5xl', inner)}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink', className)}>{children}</p>;
}

/** The page's title block: what this is, in one big line and a short lead. */
export function PageIntro({ eyebrow, title, lead, children, id }: { eyebrow: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <header className="flex max-w-3xl flex-col gap-4">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 id={id} tabIndex={id ? -1 : undefined} className="text-[2rem] font-bold leading-[1.1] tracking-tight text-text outline-none sm:text-5xl">
        {title}
      </h1>
      {lead ? <p className="text-lg leading-relaxed text-text-2 sm:text-xl">{lead}</p> : null}
      {children}
    </header>
  );
}

const NOTICE = {
  emergency: { icon: LifeBuoy, box: 'border-warn/40 bg-warn-soft', mark: 'text-warn' },
  private: { icon: Lock, box: 'border-border bg-surface-2', mark: 'text-accent-ink' },
  info: { icon: Info, box: 'border-border bg-surface', mark: 'text-accent-ink' },
  danger: { icon: AlertTriangle, box: 'border-danger/40 bg-danger-soft', mark: 'text-danger' },
} as const;

/** A short notice with its icon (not an emergency service, a denuncia is private, a warning). */
export function Notice({ tone = 'info', title, children, className, role }: { tone?: keyof typeof NOTICE; title?: ReactNode; children: ReactNode; className?: string; role?: string }) {
  const n = NOTICE[tone];
  const Icon = n.icon;
  return (
    <div role={role} className={cn('flex gap-3 rounded-2xl border p-4 text-[15px] leading-relaxed text-text', n.box, className)}>
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', n.mark)} aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title ? 'mt-0.5' : '')}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The public site's card surface (design §1: a discreet border on white, over the ivory page), drawn only here. The
 * panel's cards are glass (src/components/ui/card.tsx); the website's are these, with no blur.
 */
export const webCard = 'rounded-[var(--radius-card)] border border-border bg-surface';

/** An elegant card: discreet border, soft shadow, generous padding. */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(webCard, 'p-5 shadow-[var(--glass-shadow)] sm:p-8', className)} {...props} />;
}

export const inputStyle =
  'w-full min-h-12 rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus:border-accent aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40';

/** A labelled field: the label, a hint and the error, tied to the control by id (aria-describedby is the caller's). */
export function FieldBox({
  id, label, hint, error, optional, children, className,
}: { id: string; label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-base font-semibold text-text">
        {label}
        {optional ? <span className="font-normal text-text-2"> (opcional)</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 text-[15px] leading-snug text-text-2">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[15px] font-medium text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** The ids a control describes itself with: its hint and its error, when they exist. */
export function describedBy(id: string, opts: { hint?: unknown; error?: unknown; extra?: string }) {
  return [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null, opts.extra ?? null].filter(Boolean).join(' ') || undefined;
}

/** The emergency line that goes on every form (D-92). */
export function EmergencyNote({ className }: { className?: string }) {
  return (
    <Notice tone="emergency" className={className}>
      <strong className="font-semibold">Esto no es un servicio de emergencias.</strong> En una emergencia, llama a los servicios de emergencia locales.
    </Notice>
  );
}
