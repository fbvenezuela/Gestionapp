'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from './button';

// The app's own confirmation (instead of the browser's confirm/alert, which look bad on a
// phone and are easy to tap by mistake). Native <dialog>: Escape closes, focus stays inside.
//   const { confirm, dialog } = useConfirm();
//   if (!(await confirm({ title: '¿Rechazar el evento?', confirmLabel: 'Rechazar', tone: 'danger' }))) return;
//   return <>{dialog}…</>;
export type ConfirmOptions = { title: string; body?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: 'primary' | 'danger' };

export function useConfirm() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (state && ref.current && !ref.current.open) ref.current.showModal();
  }, [state]);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })), []);

  const close = (value: boolean) => {
    state?.resolve(value);
    ref.current?.close();
    setState(null);
  };

  const dialog = state ? (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close(false);
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-[var(--radius-card)] border border-border bg-surface p-5 text-text shadow-lg backdrop:bg-slate/60"
    >
      <h2 id={titleId} className="text-lg font-semibold">{state.opts.title}</h2>
      {state.opts.body ? <div className="mt-2 text-[15px] text-text-2">{state.opts.body}</div> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => close(false)}>{state.opts.cancelLabel ?? 'Cancelar'}</Button>
        <Button type="button" variant={state.opts.tone === 'danger' ? 'danger' : 'primary'} autoFocus onClick={() => close(true)}>
          {state.opts.confirmLabel ?? 'Seguir'}
        </Button>
      </div>
    </dialog>
  ) : null;

  return { confirm, dialog };
}
