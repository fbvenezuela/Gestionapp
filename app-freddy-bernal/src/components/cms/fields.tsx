'use client';

import { useId, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';

// The small fields of the website's editor: a label above, a hint below, errors tied to the field, 44 px targets and
// nothing that needs a mouse. Controlled: the editor keeps the draft and each field changes one piece of it.

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function Counter({ value, max, ideal }: { value: string; max: number; ideal?: number }) {
  const n = value.length;
  const tone = n > max ? 'text-danger' : ideal && n > ideal ? 'text-warn' : 'text-text-2';
  return (
    <span className={cn('tabular text-xs', tone)} aria-hidden>
      {n}/{max}
    </span>
  );
}

type Base = { label: ReactNode; hint?: ReactNode; error?: string | null; disabled?: boolean; className?: string };

export function TextField({
  label, hint, error, disabled, className, value, onChange, max, multiline, rows = 3, placeholder, required, ideal, mono, inputMode,
}: Base & {
  value: unknown; onChange: (v: string) => void; max: number; multiline?: boolean; rows?: number; placeholder?: string; required?: boolean; ideal?: number; mono?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = useId();
  const v = str(value);
  const lbl = (
    <span className="flex w-full items-baseline justify-between gap-2">
      <span>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <Counter value={v} max={max} ideal={ideal} />
    </span>
  );
  return (
    <Field label={lbl} hint={hint} error={error} htmlFor={id} className={className}>
      {multiline ? (
        <Textarea id={id} value={v} rows={rows} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} disabled={disabled} aria-invalid={!!error || undefined} />
      ) : (
        <Input
          id={id}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          aria-invalid={!!error || undefined}
          className={mono ? 'font-mono text-[15px]' : undefined}
        />
      )}
    </Field>
  );
}

export function NumberField({ label, hint, error, disabled, className, value, onChange, min, max, step = 1 }: Base & { value: unknown; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number }) {
  const id = useId();
  const [text, setText] = useState(typeof value === 'number' ? String(value) : '');
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === '' ? undefined : Number(e.target.value);
          onChange(n === undefined || Number.isFinite(n) ? n : undefined);
        }}
      />
    </Field>
  );
}

export function DateField({ label, hint, error, disabled, className, value, onChange, type = 'date' }: Base & { value: unknown; onChange: (v: string) => void; type?: 'date' | 'datetime-local' }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <Input id={id} type={type} value={str(value)} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </Field>
  );
}

export function SelectField({
  label, hint, error, disabled, className, value, onChange, options, empty,
}: Base & { value: unknown; onChange: (v: string) => void; options: readonly (readonly [string, string])[]; empty?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <Select id={id} value={str(value)} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckField({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--c-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} aria-describedby={hint ? `${id}-h` : undefined} />
      <label htmlFor={id} className="text-[15px]">
        <span className="font-semibold">{label}</span>
        {hint ? (
          <span id={`${id}-h`} className="block text-sm text-text-2">
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}

/** Short words (topics): typed one by one, removable; Enter adds. */
export function TagsField({ label, hint, value, onChange, max = 12, maxLength = 40, disabled }: { label: string; hint?: ReactNode; value: unknown; onChange: (v: string[]) => void; max?: number; maxLength?: number; disabled?: boolean }) {
  const id = useId();
  const list = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().slice(0, maxLength);
    if (!t || list.includes(t) || list.length >= max) return;
    onChange([...list, t]);
    setDraft('');
  };
  return (
    <Field label={label} hint={hint ?? `Hasta ${max}. Escribe uno y toca «Agregar».`} htmlFor={id}>
      {list.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} elegidos`}>
          {list.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-3 pr-1 text-sm font-semibold text-accent-ink">
              {t}
              <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface" onClick={() => onChange(list.filter((x) => x !== t))} disabled={disabled} aria-label={`Quitar ${t}`}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          disabled={disabled || list.length >= max}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={disabled || !draft.trim() || list.length >= max}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar
        </Button>
      </div>
    </Field>
  );
}

type SourceRow = { label?: string; url?: string };

/** Where a statement or a figure comes from: a name and, when there is one, its address. */
export function SourcesField({ label, hint, value, onChange, max = 20, urlRequired = false, disabled }: { label: string; hint?: ReactNode; value: unknown; onChange: (v: SourceRow[]) => void; max?: number; urlRequired?: boolean; disabled?: boolean }) {
  const rows: SourceRow[] = Array.isArray(value) ? (value as SourceRow[]).map((r) => ({ label: str(r?.label), url: str(r?.url) })) : [];
  const set = (i: number, patch: SourceRow) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)).map(clean));
  const clean = (r: SourceRow): SourceRow => ({ label: r.label ?? '', ...(r.url?.trim() ? { url: r.url } : {}) });
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">{label}</legend>
      {hint ? <p className="-mt-1 text-sm text-text-2">{hint}</p> : null}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-[var(--radius-control)] border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField label={`Nombre ${i + 1}`} value={r.label} onChange={(v) => set(i, { label: v })} max={200} disabled={disabled} />
          <TextField label={urlRequired ? 'Enlace' : 'Enlace (si tiene)'} value={r.url} onChange={(v) => set(i, { url: v })} max={500} placeholder="https://…" disabled={disabled} inputMode="url" />
          <Button type="button" variant="ghost" onClick={() => onChange(rows.filter((_, j) => j !== i).map(clean))} disabled={disabled} aria-label={`Quitar ${label.toLowerCase()} ${i + 1}`}>
            <X className="h-4 w-4" aria-hidden /> Quitar
          </Button>
        </div>
      ))}
      {rows.length < max ? (
        <Button type="button" variant="secondary" className="self-start" onClick={() => onChange([...rows.map(clean), { label: '' }])} disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar {label.toLowerCase().replace(/s$/, '')}
        </Button>
      ) : null}
    </fieldset>
  );
}

/** A group of fields with its own title (and an optional switch to leave it empty). */
export function Group({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex flex-col gap-4 rounded-[var(--radius-control)] border border-border p-4', className)}>
      <legend className="px-1 text-sm font-bold">{title}</legend>
      {hint ? <p className="-mt-2 text-sm text-text-2">{hint}</p> : null}
      {children}
    </fieldset>
  );
}
