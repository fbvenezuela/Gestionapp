import Link from 'next/link';
import { Lock, Link2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CHAT_HIDDEN } from '@/lib/domain/chat';
import { fmtTime } from '@/lib/time';
import { LINK_LOCKED, firstName, type ChatLink } from './chat-core';
import type { FeedItem } from './chat-feed-core';

// One message in the log (the bubbles of the 360 window, assistant-widget.tsx): mine on the right, the others' on the
// left with the first name and role on top in a group; a message with a date of the agenda that the reader cannot
// read is a grey bubble that says so (D-52), never its text; links to the platform are little cards with the title
// the reader sees (D-54). Pure: no hooks, the thread passes what to do on «Reintentar».

export function LinkCard({ link }: { link: ChatLink }) {
  const base = 'mt-1.5 flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm';
  if (!link.title) {
    return (
      <span className={cn(base, 'text-text-2')}>
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        {LINK_LOCKED}
      </span>
    );
  }
  return (
    <Link href={link.href} className={cn(base, 'bg-surface font-medium text-text hover:bg-surface-2')}>
      <Link2 className="h-4 w-4 shrink-0 text-text-2" aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-text-2">{link.kind}</span>
        <span className="block truncate">{link.title}</span>
      </span>
    </Link>
  );
}

export function ChatBubble({ item, own, showName, onRetry }: { item: FeedItem; own: boolean; showName: boolean; onRetry?: () => void }) {
  const hidden = item.body === null;
  return (
    <li className={cn('flex flex-col', own ? 'items-end' : 'items-start')} data-message={item.id}>
      {showName && !own ? (
        <span className="mb-0.5 px-1 text-xs font-semibold text-text-2">
          {firstName(item.author)}
          {item.role ? ` · ${item.role}` : ''}
        </span>
      ) : null}
      <div
        data-who={own ? 'yo' : 'otro'}
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3 py-2 text-[15px] leading-snug text-text [overflow-wrap:anywhere]',
          own ? 'rounded-br-sm bg-accent-soft' : 'rounded-bl-sm bg-surface-2',
          hidden && 'italic text-text-2',
        )}
      >
        {own ? <span className="sr-only">Tú: </span> : !showName ? <span className="sr-only">{firstName(item.author)}: </span> : null}
        {hidden ? CHAT_HIDDEN : item.body}
        {item.links.map((l) => (
          <LinkCard key={l.href} link={l} />
        ))}
      </div>
      <span className="mt-0.5 px-1 text-xs text-text-2">
        {item.state === 'sending' ? (
          'Enviando…'
        ) : item.state === 'failed' ? (
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center font-semibold text-danger underline underline-offset-2">
            No se envió · Reintentar
          </button>
        ) : (
          fmtTime(item.createdAt)
        )}
      </span>
    </li>
  );
}

export function DaySeparator({ label }: { label: string }) {
  return (
    <li className="my-1 flex items-center gap-2 text-xs font-semibold text-text-2">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </li>
  );
}

export const NEW_MESSAGES_ID = 'mensajes-nuevos';

export function NewSeparator() {
  return (
    <li id={NEW_MESSAGES_ID} className="my-1 flex scroll-mt-24 items-center gap-2 text-xs font-bold text-accent-ink">
      <span className="h-px flex-1 bg-accent" aria-hidden />
      <span>Mensajes nuevos</span>
      <span className="h-px flex-1 bg-accent" aria-hidden />
    </li>
  );
}
