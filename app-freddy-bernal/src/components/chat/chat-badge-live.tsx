'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { CHAT_BADGE_MS, CHAT_FETCH_TIMEOUT_MS, createPoller, getJson } from './chat-feed-core';

// When a conversation is read, the envelope asks again at once (the thread sends this).
export const CHAT_READ_EVENT = 'fb:chat:read';

/** «Mensajes: 2 sin leer» / «Mensajes». The same ghost button and number as the bell (layout.tsx). */
export function chatBadgeLabel(n: number): string {
  return n > 0 ? `Mensajes: ${n} sin leer` : 'Mensajes';
}

// The envelope at the top, before the bell (R3, D-49, design §5.2). The server gives the number on every page; here
// it is asked again every 30 s while the screen is in view and there is signal (D-56), on coming back to the screen,
// and when a conversation is read.
export function ChatBadgeLive({ initial }: { initial: number }) {
  const [n, setN] = useState(initial);
  const [fromServer, setFromServer] = useState(initial);
  // A new page brought a new number from the server.
  if (initial !== fromServer) {
    setFromServer(initial);
    setN(initial);
  }
  useEffect(() => {
    const poller = createPoller({
      run: async (signal) => {
        const r = await getJson<{ n: number }>('/api/mensajes/sin-leer', signal);
        if (r && Number.isInteger(r.n)) setN(r.n);
      },
      everyMs: CHAT_BADGE_MS,
      timeoutMs: CHAT_FETCH_TIMEOUT_MS,
      visible: () => document.visibilityState === 'visible',
      online: () => navigator.onLine,
    });
    poller.start();
    const now = () => void poller.tick();
    document.addEventListener('visibilitychange', now);
    window.addEventListener('online', now);
    window.addEventListener(CHAT_READ_EVENT, now);
    return () => {
      poller.stop();
      document.removeEventListener('visibilitychange', now);
      window.removeEventListener('online', now);
      window.removeEventListener(CHAT_READ_EVENT, now);
    };
  }, []);
  return (
    <Link href="/mensajes" className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative' })} aria-label={chatBadgeLabel(n)} data-tour="messages">
      <MessagesSquare className="h-5 w-5" aria-hidden />
      {/* Soft red with red text, as the bell: AA in light, dark and sun mode. */}
      {n > 0 ? <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full border border-danger/40 bg-danger-soft px-1 text-[11px] font-bold text-danger">{n}</span> : null}
    </Link>
  );
}
