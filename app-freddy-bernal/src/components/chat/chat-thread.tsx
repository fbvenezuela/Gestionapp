'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import type { Role } from '@/lib/roles';
import { markRead, sendMessage, type SendData } from '@/lib/actions/chat';
import { Card } from '@/components/ui/card';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { cn } from '@/lib/cn';
import { readOnlyText, withDays, type ChatItem, type ReadOnly } from './chat-core';
import {
  CHAT_FETCH_TIMEOUT_MS, CHAT_POLL_MS, CHAT_SEND_TIMEOUT_MS, createPoller, createSendQueue, cursorOf, getJson, mergeItems,
  newFromOthers, sinceUrl, withTimeout, type FeedItem, type SendOutcome, type SendQueue,
} from './chat-feed-core';
import { ChatBubble, DaySeparator, NEW_MESSAGES_ID, NewSeparator } from './chat-bubble';
import { ChatComposer, type ComposerApi, type SendJob } from './chat-composer';
import { AckNeeded } from './chat-ack-dialog';
import { CHAT_READ_EVENT } from './chat-badge-live';

// One open conversation (R3, design §5.3): the log, the box and the loop. It opens on «Mensajes nuevos» if there are,
// otherwise at the end; what arrives while at the end keeps it at the end, otherwise «Hay mensajes nuevos ↓». What is
// sent shows at once with «Enviando…» and goes in a queue in order (never with useAction: no page refresh, D-56); a send
// stopped by the signal says «No se envió · Reintentar» with the same id; one the database refuses goes back to the box
// with why. Reading here marks as read only for members (the boss reading someone else's marks nothing).

const atEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
const toEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight });

export function ChatThread({
  conversationId, me, myName, myRole, initial, more, moreHref, firstUnreadId, isMember, readOnly, hidesAgenda, agendaNote, authorRoles, showNames,
}: {
  conversationId: string;
  me: string;
  myName: string;
  myRole: string;
  initial: ChatItem[];
  more: boolean;
  moreHref: string;
  firstUnreadId: string | null;
  isMember: boolean;
  readOnly: ReadOnly | null;
  hidesAgenda: boolean;
  agendaNote: boolean;
  authorRoles: Role[];
  showNames: boolean;
}) {
  const [items, setItems] = useState<FeedItem[]>(initial);
  const [fromServer, setFromServer] = useState(initial);
  // The page came again from the server (a refresh, «Ver anteriores»): merged, never replacing what arrived meanwhile.
  if (initial !== fromServer) {
    setFromServer(initial);
    setItems((cur) => mergeItems(cur, initial));
  }
  const [newBelow, setNewBelow] = useState(false);
  const [unreadMark] = useState(firstUnreadId);
  const latest = useRef(items);
  const jobs = useRef(new Map<string, SendJob>());
  const composer = useRef<ComposerApi>(null);

  useEffect(() => {
    latest.current = items;
  }, [items]);

  const read = (list: readonly FeedItem[]) => {
    if (!isMember) return;
    const upTo = cursorOf(list)?.at;
    void markRead({ conversationId, upTo })
      .then(() => window.dispatchEvent(new Event(CHAT_READ_EVENT)))
      .catch(() => {});
  };

  // Open on «Mensajes nuevos» or at the end; mark as read.
  useEffect(() => {
    const sep = document.getElementById(NEW_MESSAGES_ID);
    if (sep) sep.scrollIntoView({ block: 'start' });
    else toEnd();
    read(latest.current);
    // Only when the conversation opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // The loop: what is new, every 5 s while in view and with signal; never two at once, never waiting for a send.
  useEffect(() => {
    const poller = createPoller({
      run: async (signal) => {
        const r = await getJson<{ items: ChatItem[] }>(sinceUrl(conversationId, cursorOf(latest.current)), signal);
        if (!r?.items?.length) return;
        const fresh = newFromOthers(latest.current, r.items, me);
        const wasAtEnd = atEnd();
        setItems((cur) => mergeItems(cur, r.items));
        if (!fresh) return;
        if (wasAtEnd) {
          requestAnimationFrame(toEnd);
          read(mergeItems(latest.current, r.items));
        } else setNewBelow(true);
      },
      everyMs: CHAT_POLL_MS,
      timeoutMs: CHAT_FETCH_TIMEOUT_MS,
      visible: () => document.visibilityState === 'visible',
      online: () => navigator.onLine,
    });
    poller.start();
    const now = () => void poller.tick();
    const scrolled = () => {
      if (atEnd()) setNewBelow(false);
    };
    document.addEventListener('visibilitychange', now);
    window.addEventListener('online', now);
    window.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      poller.stop();
      document.removeEventListener('visibilitychange', now);
      window.removeEventListener('online', now);
      window.removeEventListener('scroll', scrolled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, me]);

  // Sending, in order (made once the screen is up: its outcomes reach the bubbles and the box).
  const queue = useRef<SendQueue<SendJob> | null>(null);
  useEffect(() => {
    queue.current = createSendQueue<SendJob, SendData>({
      send: async (job): Promise<SendOutcome<SendData>> => {
        const r = await withTimeout(sendMessage({ conversationId, ...job }), CHAT_SEND_TIMEOUT_MS);
        if (r === 'timeout') return { kind: 'failed' };
        if (!r.ok) return { kind: 'refused', error: r.error };
        return { kind: 'sent', result: r.data! };
      },
      onOutcome: (job, outcome) => {
        if (outcome.kind === 'failed') {
          setItems((cur) => cur.map((it) => (it.id === job.clientId ? { ...it, state: 'failed' } : it)));
          return;
        }
        if (outcome.kind === 'refused' || outcome.result.kind === 'confirm') {
          jobs.current.delete(job.clientId);
          setItems((cur) => cur.filter((it) => it.id !== job.clientId));
          if (outcome.kind === 'refused') composer.current?.restore(job, outcome.error);
          else if (outcome.result.kind === 'confirm') composer.current?.restore(job, null, { kind: outcome.result.confirm, word: outcome.result.word });
          return;
        }
        const sent = outcome.result;
        jobs.current.delete(job.clientId);
        setItems((cur) => {
          const mine = cur.find((it) => it.id === job.clientId);
          const rest = cur.filter((it) => it.id !== job.clientId);
          return mine ? mergeItems(rest, [{ ...mine, createdAt: sent.createdAt, state: undefined } as ChatItem]) : cur;
        });
        window.dispatchEvent(new Event(CHAT_READ_EVENT));
      },
    });
  }, [conversationId]);

  const send = (job: SendJob) => {
    jobs.current.set(job.clientId, job);
    const bubble: FeedItem = { id: job.clientId, authorId: me, author: myName, role: myRole, body: job.body, createdAt: new Date().toISOString(), links: [], state: 'sending' };
    setItems((cur) => [...cur.filter((it) => it.id !== job.clientId), bubble]);
    requestAnimationFrame(toEnd);
    queue.current?.push(job);
  };

  const retry = () => {
    const failed = latest.current.filter((it) => it.state === 'failed').map((it) => jobs.current.get(it.id)).filter((j): j is SendJob => !!j);
    const ids = new Set(failed.map((j) => j.clientId));
    setItems((cur) => cur.map((it) => (ids.has(it.id) ? { ...it, state: 'sending' } : it)));
    queue.current?.retry(failed);
  };

  return (
    <>
      <Card solid className="flex min-h-[50dvh] flex-col">
        {more ? (
          <div className="border-b border-border p-2 text-center">
            <Link href={moreHref} scroll={false} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-accent-ink underline underline-offset-2">
              Ver anteriores
            </Link>
          </div>
        ) : null}
        {/* The log is the region; the list inside keeps its meaning for a screen reader (an <ol role="log"> would not). */}
        <div role="log" aria-live="polite" aria-label="Mensajes" className="mt-auto">
          <ol className="flex flex-col gap-2 p-3 sm:p-4">
            {items.length === 0 ? <li className="py-6 text-center text-[15px] text-text-2">Todavía no hay mensajes. Escribe el primero.</li> : null}
            {withDays(items).map(({ item: it, day }) => (
              <Fragment key={it.id}>
                {day ? <DaySeparator label={day} /> : null}
                {it.id === unreadMark ? <NewSeparator /> : null}
                <ChatBubble item={it} own={it.authorId === me} showName={showNames} onRetry={retry} />
              </Fragment>
            ))}
          </ol>
        </div>
      </Card>
      {/* At the very bottom: no bottom bar here (nav.tsx). The negative margin takes back main's room for that bar. */}
      <div className="sticky bottom-0 z-10 -mb-[calc(env(safe-area-inset-bottom)_+_72px)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:-mb-8">
        {newBelow ? (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setNewBelow(false);
                toEnd();
                read(latest.current);
              }}
              className={cn(menuPanelClass, 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold')}
            >
              Hay mensajes nuevos <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        {readOnly ? (
          <div role="status" className={cn(menuPanelClass, 'p-3 text-[15px] text-text')}>
            {readOnly.reason === 'needs-ack' ? <AckNeeded /> : readOnlyText(readOnly)}
          </div>
        ) : (
          <ChatComposer api={composer} conversationId={conversationId} hidesAgenda={hidesAgenda} agendaNote={agendaNote} authorRoles={authorRoles} onSend={send} />
        )}
      </div>
    </>
  );
}
