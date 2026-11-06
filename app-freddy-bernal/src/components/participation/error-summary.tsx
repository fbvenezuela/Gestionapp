'use client';

import { forwardRef } from 'react';
import type { FieldErrors } from '@/lib/actions/participation-types';
import { fieldId } from './form-core';

/** Moves the focus to a field (the first control of a group) and brings it into view. */
export function focusField(field: string) {
  const el = document.getElementById(fieldId(field));
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/**
 * The clear summary at the top of a step (design §4): how many things to check and a link to each field, in the
 * order they appear. It takes the focus when it shows, so a screen reader reads it and the keyboard starts there.
 */
export const ErrorSummary = forwardRef<HTMLDivElement, { errors: FieldErrors; order?: string[]; extra?: string | null }>(function ErrorSummary({ errors, order = [], extra }, ref) {
  const entries = Object.entries(errors).sort(([a], [b]) => rank(order, a) - rank(order, b));
  if (!entries.length && !extra) return null;
  const n = entries.length;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="resumen-errores" className="rounded-2xl border-2 border-danger bg-danger-soft p-4 text-text outline-none sm:p-5">
      <h2 id="resumen-errores" className="text-lg font-bold text-danger">
        {n === 0 ? 'No se pudo enviar' : n === 1 ? 'Revisa este dato' : `Revisa estos ${n} datos`}
      </h2>
      {extra ? <p className="mt-1 text-[15px]">{extra}</p> : null}
      {n ? (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[15px]">
          {entries.map(([field, message]) => (
            <li key={field}>
              <a
                href={`#${fieldId(field)}`}
                className="font-medium text-danger underline underline-offset-2"
                onClick={(e) => {
                  e.preventDefault();
                  focusField(field);
                }}
              >
                {message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

function rank(order: string[], field: string) {
  const i = order.indexOf(field);
  return i === -1 ? order.length : i;
}
