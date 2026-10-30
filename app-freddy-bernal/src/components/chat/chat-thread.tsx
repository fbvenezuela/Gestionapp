'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import type { Role } from '@/lib/roles';
import { markRead, sendMessage, type SendData } from '@/lib/actions/chat';
import { Card } from '@/components/ui/card';
import { menuPanelClass } from '@/components/ui/menu-panel';
import { cn } from '@/lib/cn';
import { CHAT_REMOVED } from '@/lib/domain/chat';
import { LinkButton } from '@/components/ui/button';
import { readOnlyText, withDays, type ChatItem, type ReadOnly } from './chat-core';
import {
  CHAT_FETCH_TIMEOUT_MS, CHAT_POLL_MS, CHAT_SEND_TIMEOUT_MS, FEED_GONE, createPoller, createSendQueue, cursorOf, getFeed, mergeItems,
  newFromOthers, sinceUrl, withTimeout, type FeedItem, type Poller, type SendOutcome, type SendQueue,
} from './chat-feed-core';
import { ChatBubble, DaySeparator, NEW_MESSAGES_ID, NewSeparator } from './chat-bubble';
import { ChatComposer, type ComposerApi, type SendJob } from './chat-composer';
import { CHAT_READ_EVENT } from './chat-badge-live';

// One open channel (R3 design §5.3, R5): the log, the box and the loop. It opens on «Mensajes nuevos» if there are,
// otherwise at the end; what arrives while at the end keeps it at the end, otherwise «Hay mensajes nuevos ↓». What is
// sent shows at once with «Enviando…» and goes in a queue in order (never with useAction: no page refresh, D-56); a send
// stopped by the signal says «No se envió · Reintentar» with the same id; one the database refuses goes back to the box
// with why. If the boss takes the person out of the channel meanwhile (the loop gets a 410, or a send answers «gone»:
// both only when the database says so, chat_was_removed), the whole thread gives way to «Ya no estás en este canal.»
// and the loop stops: nothing of it stays on the screen. A 404 is only «nothing this time» (the demo, D-88).

const atEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
const toEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight });

export function ChatThread({
  header, conversationId, me, myName, myRole, initial, more, moreHref, firstUnreadId, readOnly, hidesAgenda, agendaNote, authorRoles,
}: {
  // The channel's header (name, who is in it): it goes away with the rest when the person is taken out.
  header?: ReactNode;
  conversationId: string;
  me: string;
  myName: string;
  myRole: string;
  initial: ChatItem[];
  more: boolean;
  moreHref: string;
  firstUnreadId: string | null;
  readOnly: ReadOnly | null;
  hidesAgenda: boolean;
  agendaNote: boolean;
  authorRoles: Role[];
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
  const [gone, setGone] = useState(false);
  const poll = useRef<Poller | null>(null);
  const leave = () => {
    poll.current?.stop();
    setGone(true);
  };

  useEffect(() => {
    latest.current = items;
  }, [items]);

  const read = (list: readonly FeedItem[]) => {
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
        const r = await getFeed<{ items: ChatItem[] }>(sinceUrl(conversationId, cursorOf(latest.current)), signal);
        if (r === FEED_GONE) {
          leave();
          return;
        }
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
    poll.current = poller;
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
        if (outcome.kind === 'sent' && outcome.result.kind === 'gone') {
          leave();
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
        if (sent.kind !== 'sent') return;
        jobs.current.delete(job.clientId);
        setItems((cur) => {
          const mine = cur.find((it) => it.id === job.clientId);
          const rest = cur.filter((it) => it.id !== job.clientId);
          // Saved: in its place by the server's time, but `local` until the loop brings the server's copy (cursorOf).
          if (!mine) return cur;
          const confirmed: FeedItem = { ...mine, createdAt: sent.createdAt, state: undefined, local: true };
          return mergeItems(rest, [confirmed]);
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

  if (gone) {
    return (
      <Card className="mx-auto mt-4 max-w-md p-6 text-center">
        <p role="status" className="text-[15px] font-semibold">{CHAT_REMOVED}</p>
        <LinkButton href="/mensajes" className="mt-4">
          Ir a Mensajes
        </LinkButton>
      </Card>
    );
  }

  return (
    <>
      {header}
      {/* Tall enough that the box below reaches the bottom of a tall screen (an iPad) even with few messages: the page
          header and the box take about 16rem; more than that only scrolls a little, and the box stays stuck below. */}
      <Card solid className="flex min-h-[max(50dvh,calc(100dvh_-_16rem))] flex-col">
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
                <ChatBubble item={it} own={it.authorId === me} showName onRetry={retry} />
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
            {readOnlyText(readOnly)}
          </div>
        ) : (
          <ChatComposer api={composer} conversationId={conversationId} hidesAgenda={hidesAgenda} agendaNote={agendaNote} authorRoles={authorRoles} onSend={send} />
        )}
      </div>
    </>
  );
}
