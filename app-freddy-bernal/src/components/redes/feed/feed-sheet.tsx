'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// The feed's two sheets (R4, D-69, F11): the picker of an empty place and the menu of a filled one. The same panel as
// the app's Sheet (from below on the phone, on the right on a computer, almost opaque glass), with two things the feed
// needs: the menu can stay open without covering the page (`modal={false}`), so after «Publicar antes» the focus goes
// to the cell the piece moved to while the menu keeps working on it; and on closing, the focus goes where the feed
// says (`onClosed`), not back to a cell that may not be there any more.
export function FeedSheet({
  open, onOpenChange, title, description, children, modal = true, onClosed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  modal?: boolean;
  onClosed?: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Dialog.Portal>
        {modal ? <Dialog.Overlay className="fixed inset-0 z-40 bg-slate/50 glass-overlay" /> : null}
        <Dialog.Content
          onCloseAutoFocus={(e) => {
            if (!onClosed) return;
            e.preventDefault();
            onClosed();
          }}
          // Moving the focus to the grid (after a move) keeps the menu open; a tap outside still closes it.
          onFocusOutside={modal ? undefined : (e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[var(--radius-card)] glass-sheet p-5 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-[var(--radius-card)]"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold [overflow-wrap:anywhere]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-text-2">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] hover:bg-surface-2" aria-label="Cerrar">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
