import { stripDateTime } from '@/lib/push/text';

// Texts of the agenda notices (pure, so they can be tested). Rule 4: the boss's agenda is
// security information, so these texts carry ONLY the event title: never its date, time,
// place, address or contacts. The title is also scrubbed of anything that looks like a date
// or a time, in case someone typed one into it.

export type AgendaNotice = { kind: string; title: string; body: string; link: string; key: string };
export type BossDecision = 'accepted' | 'rejected';

const MAX_TITLE = 120;

export function noticeEventTitle(title: string): string {
  const t = stripDateTime(title ?? '');
  return t.length <= MAX_TITLE ? t : `${t.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

const withTitle = (prefix: string, fallback: string, title: string) => {
  const t = noticeEventTitle(title);
  return t ? `${prefix}: ${t}` : fallback;
};

// A secretary proposed an event, or dispatch/admin created one: the boss has to decide.
export function newEventNotice(ev: { id: string; title: string }): AgendaNotice {
  return {
    kind: 'event_new',
    title: withTitle('Hay un evento nuevo por decidir', 'Hay un evento nuevo por decidir', ev.title),
    body: '',
    link: `/eventos/${ev.id}`,
    key: `event_new:${ev.id}`,
  };
}

// Secretaría corrected the title of her proposal before the boss decided: the boss and
// despacho get the notice again with the new title. `stamp` makes it a new notice (the first
// one keeps its own key); the same correction sent twice in the same second is one notice.
export function correctedEventNotice(ev: { id: string; title: string }, stamp: string): AgendaNotice {
  return { ...newEventNotice(ev), key: `event_new:${ev.id}:${stamp}` };
}

// Only a change the boss would notice in the notice text (the title, as it goes out) is worth
// a new notice.
export function noticeTitleChanged(before: string, after: string): boolean {
  return noticeEventTitle(before) !== noticeEventTitle(after);
}

// The boss accepted or rejected. `stamp` keeps a later change of mind from being swallowed
// by the idempotency key (same decision twice in the same minute = one notice).
export function decisionNotice(ev: { id: string; title: string }, decision: BossDecision, stamp: string): AgendaNotice {
  const verb = decision === 'accepted' ? 'aceptó' : 'rechazó';
  return {
    kind: 'event_decided',
    title: withTitle(`El jefe ${verb}`, `El jefe ${verb} un evento`, ev.title),
    body: '',
    link: `/eventos/${ev.id}`,
    key: `event_decided:${ev.id}:${decision}:${stamp}`,
  };
}

// Unique recipients, without the person who did the action.
export function noticeRecipients(ids: (string | null | undefined)[], actorId?: string | null): string[] {
  return [...new Set(ids.filter((x): x is string => !!x && x !== actorId))];
}
