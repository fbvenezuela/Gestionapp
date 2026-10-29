'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { acceptNotice } from '@/lib/actions/chat';
import { useAction } from '@/lib/hooks/use-action';
import { CHAT_ACK_TEXT, CHAT_DEMO_NOTICE } from '@/lib/domain/chat';
import { Button } from '@/components/ui/button';
import { dialogPanelClass } from '@/components/ui/confirm-dialog';
import { CHAT_NEEDS_ACK } from './chat-core';

// «Ver el aviso» (the line in place of the box) opens it again.
export const CHAT_ACK_EVENT = 'fb:chat:ack';

// «Lo lee el jefe», accepted once before writing (D-59): the first time on a screen of Mensajes, a native dialog with
// «Entendido». Escape closes it without accepting: the person reads, but there is no box until they accept (the
// database refuses too, chat_may_post).
export function ChatAckDialog({ accepted, demo }: { accepted: boolean; demo: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { run, pending } = useAction();
  // Until the person closes it once, it tells the tutorials' engine to wait (data-blocks-tour): it opens by itself.
  const [closedOnce, setClosedOnce] = useState(false);
  useEffect(() => {
    if (accepted) return;
    const open = () => {
      const d = ref.current;
      if (d && !d.open) d.showModal();
    };
    open();
    window.addEventListener(CHAT_ACK_EVENT, open);
    return () => window.removeEventListener(CHAT_ACK_EVENT, open);
  }, [accepted]);
  if (accepted) return null;
  return (
    <dialog ref={ref} aria-labelledby={titleId} className={dialogPanelClass} data-blocks-tour={closedOnce ? undefined : ''} onClose={() => setClosedOnce(true)}>
      <h2 id={titleId} className="text-lg font-semibold">Antes de escribir en Mensajes</h2>
      <p className="mt-2 text-[15px] text-text-2">{CHAT_ACK_TEXT}</p>
      {demo ? <p className="mt-2 text-sm text-text-2">{CHAT_DEMO_NOTICE}</p> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" autoFocus disabled={pending} onClick={() => run(() => acceptNotice(), { onOk: () => ref.current?.close() })}>
          Entendido
        </Button>
      </div>
    </dialog>
  );
}

/** The line in place of the box while the notice is not accepted, with «Ver el aviso». */
export function AckNeeded() {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{CHAT_NEEDS_ACK}</span>
      <Button type="button" variant="secondary" onClick={() => window.dispatchEvent(new Event(CHAT_ACK_EVENT))}>
        Ver el aviso
      </Button>
    </span>
  );
}
