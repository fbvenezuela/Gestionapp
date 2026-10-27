import { stripDateTime } from '@/lib/push/text';

// Texts of the agenda notices (pure, so they can be tested). Rule 4: the boss's agenda is
// security information, so these texts carry ONLY the event title (plus the municipality in
// «Por ponerle fecha», which has no date yet): never its date, time, place, address or contacts.
// The title is also scrubbed of anything that looks like a date or a time, in case someone typed
// one into it.

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

// Despacho or admin created an event: the boss has to decide.
export function newEventNotice(ev: { id: string; title: string }): AgendaNotice {
  return {
    kind: 'event_new',
    title: withTitle('Hay un evento nuevo por decidir', 'Hay un evento nuevo por decidir', ev.title),
    body: '',
    link: `/eventos/${ev.id}`,
    key: `event_new:${ev.id}`,
  };
}

// Someone corrected the title of an event before the boss decided: the boss and despacho get a
// notice with the new title (no caller since Secretaría was retired, 27/10/2026; kept for the shared
// agenda). It says it is a correction, so Avisos does not read as two events to decide. Same kind as the first one (the same switch in Mi perfil turns
// both off). `stamp` makes it a new notice (the first one keeps its own key); the same
// correction sent twice in the same second is one notice.
export function correctedEventNotice(ev: { id: string; title: string }, stamp: string): AgendaNotice {
  return {
    ...newEventNotice(ev),
    title: withTitle('Corrigieron el evento por decidir', 'Corrigieron un evento por decidir', ev.title),
    key: `event_new:${ev.id}:${stamp}`,
  };
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

// «Por ponerle fecha» (the client's words, §4.1 and §4.2): the IVT saved an obra ficha as ready, or política a community
// report that goes to the boss's agenda. The boss and despacho put the date. The only agenda notice that carries the
// municipality, as asked: there is no date yet to leak, and it goes only to the boss and despacho. Never a date, a
// time, an address, a phone or a reporter's name (both texts are scrubbed). Once per send: `stamp` is the ficha's rev
// after the save that sent it, so a retry of that save is one notice and a real second send (an obra archived,
// brought back and sent again; a report whose «¿Va a la agenda?» was turned off and on) is another.
export type FichaRef = { kind: 'obra' | 'report'; id: string; title: string; municipality: string };

export function toScheduleNotice(f: FichaRef, stamp: string): AgendaNotice {
  const title = noticeEventTitle(f.title);
  const place = noticeEventTitle(f.municipality);
  const what = f.kind === 'obra' ? 'una obra' : 'un reporte';
  return {
    kind: 'to_schedule',
    title: title ? `Por ponerle fecha: ${title}${place ? ` (${place})` : ''}` : `Por ponerle fecha: ${what}${place ? ` en ${place}` : ''}`,
    body: '',
    link: f.kind === 'obra' ? `/obras/${f.id}` : `/reportes/${f.id}`,
    key: `to_schedule:${f.kind}:${f.id}:${stamp}`,
  };
}

// Unique recipients, without the person who did the action.
export function noticeRecipients(ids: (string | null | undefined)[], actorId?: string | null): string[] {
  return [...new Set(ids.filter((x): x is string => !!x && x !== actorId))];
}
