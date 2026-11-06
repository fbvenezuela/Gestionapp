import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { WebLink } from './ui';

// The fields of the website's filter and search forms (GET: they work without JavaScript and the result is a link that
// can be shared). Each field has its visible label tied to it; inputs are 16 px (iOS does not zoom) and 48 px tall.

// The field's edge is dark enough to be seen (3:1 or more against the page, WCAG 1.4.11).
const control = 'mt-1.5 block min-h-12 w-full rounded-xl border-2 border-text-2 bg-surface px-3 text-base text-text focus:border-accent';

export function SelectField({
  id,
  name,
  label,
  value,
  options,
  allLabel,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-semibold text-text">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={control}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function InputField({
  id,
  name,
  label,
  value,
  type = 'text',
  hint,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  type?: 'text' | 'search' | 'date';
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-semibold text-text">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-ayuda` : undefined}
        className={control}
      />
      {hint ? (
        <p id={`${id}-ayuda`} className="mt-1 text-sm text-text-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FilterForm({
  action,
  label,
  search = false,
  className,
  children,
}: {
  action: string;
  label: string;
  search?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form method="get" action={action} role={search ? 'search' : undefined} aria-label={label} className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6', className)}>
      {children}
    </form>
  );
}

/** Tabs that are links (each view has its own address): the current one says so with aria-current. */
export function ViewTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="mb-8">
      <ul className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <li key={t.href}>
            <WebLink
              href={t.href}
              aria-current={t.current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-12 items-center rounded-full border-2 px-5 text-base font-semibold',
                t.current ? 'border-text bg-text text-surface' : 'border-border bg-surface text-text hover:border-accent',
              )}
            >
              {t.label}
            </WebLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
