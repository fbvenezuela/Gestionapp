import { Info } from 'lucide-react';
import { CHAT_DEMO_NOTICE, CHAT_NOTICE, CHAT_NOTICE_LINE } from '@/lib/domain/chat';

// What everybody sees, always (D-50): on top of the list and of «Escribirle a alguien», the whole notice (it does not
// close); under the title of each conversation, one line. In the demo, also that nothing real goes here (D-57, S10).

export function ChatNotice({ demo }: { demo: boolean }) {
  return (
    <div
      role="note"
      data-tour="chat-notice"
      className="mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-info-soft px-3 py-2.5 text-[15px] text-text"
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
      <div className="min-w-0">
        <p>{CHAT_NOTICE}</p>
        {demo ? <p className="mt-1 text-sm">{CHAT_DEMO_NOTICE}</p> : null}
      </div>
    </div>
  );
}

export function ChatNoticeLine({ demo }: { demo: boolean }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-text-2">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {CHAT_NOTICE_LINE}
        {demo ? ' Demostración: no escribas nada real.' : ''}
      </span>
    </p>
  );
}
