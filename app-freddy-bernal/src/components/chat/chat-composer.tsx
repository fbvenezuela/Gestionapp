'use client';

import { useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/roles';
import { useDraft } from '@/lib/hooks/use-draft';
import { buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { menuPanelClass } from '@/components/ui/menu-panel';
import {
  CHAT_AGENDA_NOTE, CHAT_BODY_MAX, CHAT_PHONE_LINK_TEXT, CHAT_PHONE_TEXT, CHAT_RELATIVE_ASK, CHAT_TIMECODE_ASK,
  CHAT_WHEN_WARN, chatTextProblem, fillWord, type ChatTextProblem,
} from '@/lib/domain/chat';
import { CHAT_COUNTER_FROM, enterSends, newClientId } from './chat-core';

// The box to write (R3, design §5.3): at the very bottom of the channel, with no fixed line under it (R5, D-79: who
// reads is the channel's member list). On a phone Enter is a new line and only the button sends (U12). What is
// typed is kept in the phone per person (useDraft) until it is sent. Each message carries its own id from the first
// letter (clientId): a send repeated after a lost answer is the same message.
// The agenda (D-52 with E1), only for who knows it where Redes or política read: a concrete date, time or map is said
// while writing («“a las 3” no puede ir aquí»), and «Enviar» stays (the database decides); a relative word («mañana»)
// or Grabación's bare time code («2:15») is asked before sending, «Enviar igual» / «Sí, es del video» or «Corregir».

export type SendJob = { clientId: string; body: string; timecodeOk: boolean; relativeOk: boolean };
export type ComposerApi = {
  /** The database (or the server's check) refused it: the text back in the box, with why under it. `ask`: the server
   * asked a question the phone did not (it asks it now). */
  restore: (job: SendJob, error: string | null, ask?: { kind: 'timecode' | 'relative'; word: string }) => void;
};

/** What the box says while writing (only what is refused anyway: a phone, a concrete date, time or map). */
export function liveWarning(p: ChatTextProblem | null): string | null {
  if (!p) return null;
  if (p.kind === 'phone') return p.inLink ? CHAT_PHONE_LINK_TEXT : CHAT_PHONE_TEXT;
  if (p.kind === 'when') return fillWord(CHAT_WHEN_WARN, p.word);
  return null;
}

const coarseQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null);
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = coarseQuery();
      q?.addEventListener('change', cb);
      return () => q?.removeEventListener('change', cb);
    },
    () => coarseQuery()?.matches ?? true,
    // On the server: as on a phone (Enter is a new line), the safe side.
    () => true,
  );
}

const WARN_DELAY_MS = 500;

export function ChatComposer({
  api, conversationId, hidesAgenda, agendaNote, authorRoles, onSend,
}: {
  api: Ref<ComposerApi>;
  conversationId: string;
  hidesAgenda: boolean;
  agendaNote: boolean;
  authorRoles: Role[];
  onSend: (job: SendJob) => void;
}) {
  const { value, setValue, reset } = useDraft(`chat:${conversationId}`, { text: '' });
  const text = value.text;
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const coarse = useCoarsePointer();
  const { confirm, dialog } = useConfirm();
  const ids = useId();
  const ctx = { hidesAgenda, authorRoles };

  const check = (t: string) => setWarning(liveWarning(chatTextProblem(t, { ...ctx, timecodeOk: true, relativeOk: true })));

  // The questions before sending, one after the other; false = «Corregir».
  const ask = async (kind: 'timecode' | 'relative', word: string) =>
    kind === 'timecode'
      ? confirm({ title: fillWord(CHAT_TIMECODE_ASK, word), confirmLabel: 'Sí, es del video', cancelLabel: 'Corregir' })
      : confirm({ title: fillWord(CHAT_RELATIVE_ASK, word), confirmLabel: 'Enviar igual', cancelLabel: 'Corregir' });

  const submit = async (job?: SendJob) => {
    const body = (job?.body ?? text).trim();
    if (!body) return;
    const flags = { timecodeOk: job?.timecodeOk ?? false, relativeOk: job?.relativeOk ?? false };
    for (;;) {
      const p = chatTextProblem(body, { ...ctx, ...flags });
      if (p?.kind !== 'timecode' && p?.kind !== 'relative') break;
      if (!(await ask(p.kind, p.word))) {
        box.current?.focus();
        return;
      }
      if (p.kind === 'timecode') flags.timecodeOk = true;
      else flags.relativeOk = true;
    }
    const id = job?.clientId ?? clientId.current ?? newClientId();
    clientId.current = null;
    if (timer.current) clearTimeout(timer.current);
    setWarning(null);
    setError(null);
    reset({ text: '' });
    onSend({ clientId: id, body, ...flags });
  };

  useImperativeHandle(api, () => ({
    restore(job, why, question) {
      setValue((v) => ({ text: v.text.trim() ? `${job.body}\n${v.text}` : job.body }));
      clientId.current = job.clientId;
      setError(why);
      box.current?.focus();
      if (question) {
        void ask(question.kind, question.word).then((ok) => {
          if (ok) void submit({ ...job, timecodeOk: job.timecodeOk || question.kind === 'timecode', relativeOk: job.relativeOk || question.kind === 'relative' });
        });
      }
    },
  }));

  const counter = text.length >= CHAT_COUNTER_FROM;
  const described = [agendaNote ? `${ids}-agenda` : null, `${ids}-warn`, error ? `${ids}-error` : null, counter ? `${ids}-count` : null].filter(Boolean).join(' ');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-tour="chat-composer"
      className={cn(menuPanelClass, 'p-3')}
    >
      {dialog}
      <label htmlFor={`${ids}-box`} className="sr-only">Tu mensaje</label>
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          id={`${ids}-box`}
          value={text}
          rows={1}
          maxLength={CHAT_BODY_MAX}
          enterKeyHint={coarse ? 'enter' : 'send'}
          placeholder="Escribe tu mensaje"
          aria-describedby={described}
          onChange={(e) => {
            const t = e.target.value.slice(0, CHAT_BODY_MAX);
            setValue({ text: t });
            setError(null);
            if (!clientId.current && t.trim()) clientId.current = newClientId();
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => check(t), WARN_DELAY_MS);
          }}
          onKeyDown={(e) => {
            if (enterSends({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              void submit();
            }
          }}
          className="min-h-11 max-h-36 min-w-0 flex-1 resize-none rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2.5 text-base text-text placeholder:text-muted focus:border-accent [field-sizing:content]"
        />
        <button type="submit" disabled={!text.trim()} aria-label="Enviar" className={buttonVariants({ size: 'icon', className: 'shrink-0' })}>
          <Send className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 flex flex-col gap-1 text-xs text-text-2">
        {error ? (
          <p id={`${ids}-error`} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <p id={`${ids}-warn`} aria-live="polite" className={cn('text-sm font-medium text-danger', !warning && 'sr-only')}>
          {warning ?? ''}
        </p>
        {agendaNote ? <p id={`${ids}-agenda`}>{CHAT_AGENDA_NOTE}</p> : null}
        {counter ? (
          <span id={`${ids}-count`} aria-live="polite" className="self-end tabular">
            {text.length}/{CHAT_BODY_MAX}
          </span>
        ) : null}
      </div>
    </form>
  );
}
