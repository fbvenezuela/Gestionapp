'use client';

import type { Ref } from 'react';
import { X } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Box } from './tour-core';

// The tutorial on screen (R3, D-45, design §6.1, U1, U5): a native <dialog> opened with showModal() (the top layer:
// over the reading mode, the sheets and 360; Escape leaves; the rest of the page cannot be touched). The dialog is a
// TRANSPARENT full-screen box with no glass class and no backdrop: what the tutorial points at looks the same as
// always (a backdrop-filter on it would also make it the reference of what is fixed inside, and move the ring). Inside,
// as siblings, the card (glass-sheet) and the ring (drawn after it, so on top; aria-hidden; it lets taps through).

export const CHAIN_LINE = 'Ahora tu pantalla de inicio.';
export const CHANGED_TEXT = 'Esta pantalla cambió un poco. Mira la guía de tu rol.';

const PRIMARY = { next: 'Siguiente', finish: 'Terminar', continue: 'Seguir' } as const;

export type TourCardView =
  // One step: «Paso 2 de 5 · {title}». `continue` on the last step of `bienvenida`: it goes on to the home's tutorial.
  | { kind: 'step'; index: number; total: number; title: string; body: string; primary: keyof typeof PRIMARY }
  // Fewer than 2 steps were on screen when it started.
  | { kind: 'changed'; title: string; guideHref: string };

export type TourCardProps = {
  view: TourCardView;
  // Where the card goes; null until it has been measured (then it is drawn see-through, to measure it); 'center' for
  // the card that has no step to point at.
  spot: { top: number; left: number } | 'center' | null;
  ring: Box | null;
  ids: { title: string; body: string };
  dialogRef?: Ref<HTMLDialogElement>;
  cardRef?: Ref<HTMLDivElement>;
  // A callback: the main button is a <button> on a step and a link («Abrir la guía») when the screen changed.
  primaryRef?: (el: HTMLElement | null) => void;
  onBack?: () => void;
  onPrimary?: () => void;
  onClose: () => void;
};

export function TourCard({ view, spot, ring, ids, dialogRef, cardRef, primaryRef, onBack, onPrimary, onClose }: TourCardProps) {
  return (
    <dialog
      ref={dialogRef}
      data-tour-dialog=""
      aria-labelledby={ids.title}
      aria-describedby={ids.body}
      onCancel={(e) => {
        // Escape: leave the tutorial (the engine closes it and puts the focus back).
        e.preventDefault();
        onClose();
      }}
      // The browser may also close it by itself (a second Escape without a tap in between does not ask first): the
      // engine then ends the tutorial too. After the engine's own close this does nothing.
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-text backdrop:bg-transparent"
    >
      <div
        ref={cardRef}
        role="document"
        className={cn(
          'glass-sheet fixed w-[min(22rem,calc(100vw-24px))] rounded-[var(--radius-card)] p-4',
          spot === 'center' && 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          // Not yet measured: drawn see-through (not `invisible`, which would leave its buttons unable to take the focus).
          !spot && 'opacity-0',
        )}
        style={spot === 'center' ? undefined : { top: spot?.top ?? 0, left: spot?.left ?? 0 }}
      >
        <div className="flex items-start gap-2">
          <h2 id={ids.title} className="min-w-0 flex-1 pt-1">
            {view.kind === 'step' ? (
              <span className="block text-sm font-semibold text-text-2">
                Paso {view.index + 1} de {view.total}
                <span className="sr-only"> · </span>
              </span>
            ) : null}
            <span className="block text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{view.title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Salir del tutorial"
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-text-2 hover:bg-surface-2"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p id={ids.body} className="mt-1 text-[15px] leading-relaxed [overflow-wrap:anywhere]">
          {view.kind === 'step' ? view.body : CHANGED_TEXT}
          {view.kind === 'step' && view.primary === 'continue' ? ` ${CHAIN_LINE}` : null}
        </p>
        <div className="mt-4 flex items-center gap-2">
          {view.kind === 'step' ? (
            <>
              {view.index > 0 ? (
                <Button type="button" variant="secondary" onClick={onBack}>
                  Atrás
                </Button>
              ) : null}
              <Button ref={primaryRef} type="button" className="ml-auto" autoFocus onClick={onPrimary}>
                {PRIMARY[view.primary]}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
              <LinkButton ref={primaryRef} href={view.guideHref} className="ml-auto" onClick={onClose}>
                Abrir la guía
              </LinkButton>
            </>
          )}
        </div>
      </div>
      {/* Over the card in the z-order: when there is no room anywhere the card sits in the center and the ring stays
          visible on top of it. A border, so it shows with forced colors too (a box-shadow would vanish there). */}
      {ring ? (
        <div
          aria-hidden
          data-tour-ring=""
          className="pointer-events-none fixed rounded-[var(--radius-control)] border-[3px] border-focus shadow-[0_0_0_2px_var(--c-surface)]"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      ) : null}
    </dialog>
  );
}
