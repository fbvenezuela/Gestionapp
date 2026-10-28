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

// ---------------------------------------------------------------------------
// The shared agenda (§3, §4). Every text is the title (scrubbed) and, for an overwrite or a change, the NAMES of the
// fields, never their values: no date, time, address, contact or reason. `stamp` (the row's rev after the save, or
// the event's rev after a cancel) makes each real change its own notice; a retry of the same save is one.
// ---------------------------------------------------------------------------
export type EventRef = { id: string; title: string };

// A ficha got its date. The IVT opens the visit and sees the date there (2FA); política gets «Ya tiene fecha» on its
// report, without the date (link to the report). Despacho or the boss, whoever did not put it, also learns.
export function scheduledNotice(ev: EventRef, link: string, stamp: string): AgendaNotice {
  return {
    kind: 'agenda_scheduled',
    title: withTitle('Ya tiene fecha', 'Una ficha ya tiene fecha', ev.title),
    body: '',
    link,
    key: `agenda_scheduled:${ev.id}:${stamp}`,
  };
}

// The date, time or duration changed (Grabación and the IVT have to be there: critical).
export function movedNotice(ev: EventRef, stamp: string): AgendaNotice {
  return {
    kind: 'event_moved',
    title: withTitle('Cambió la fecha u hora', 'Cambió la fecha u hora de un evento', ev.title),
    body: 'Ábrelo para ver la nueva.',
    link: `/eventos/${ev.id}`,
    key: `event_moved:${ev.id}:${stamp}`,
  };
}

// Cancelled (critical), or back on the agenda after a cancel. Never the reason (free text).
export function cancelledNotice(ev: EventRef, stamp: string, restored = false): AgendaNotice {
  return restored
    ? {
        kind: 'event_cancelled',
        title: withTitle('Volvió a la agenda', 'Un evento volvió a la agenda', ev.title),
        body: 'Ya no está cancelado.',
        link: `/eventos/${ev.id}`,
        key: `event_cancelled:${ev.id}:restored:${stamp}`,
      }
    : {
        kind: 'event_cancelled',
        title: withTitle('Se canceló', 'Se canceló un evento', ev.title),
        body: '',
        link: `/eventos/${ev.id}`,
        key: `event_cancelled:${ev.id}:${stamp}`,
      };
}

// The boss rejected a visit (or activity) born from a ficha. Whoever loaded the ficha got «Ya tiene fecha»: now it has
// none, and the ficha is back in «Por ponerle fecha» (critical, like a cancel). Never a date or a reason. `link`: the
// ficha (the IVT's obra, política's report).
export function rejectedNotice(ev: EventRef, link: string, stamp: string): AgendaNotice {
  return {
    kind: 'event_cancelled',
    title: withTitle('El jefe rechazó la fecha', 'El jefe rechazó una fecha', ev.title),
    body: 'Ya no tiene fecha: vuelve a «Por ponerle fecha».',
    link,
    key: `event_cancelled:${ev.id}:rejected:${stamp}`,
  };
}

// Someone saved over what this person had written in the same fields (last one wins). Labels only; what was there
// stays in the event's history.
export function overwrittenNotice(ev: EventRef, byName: string, labels: string, stamp: string): AgendaNotice {
  const who = noticeEventTitle(byName) || 'Otra persona';
  const t = noticeEventTitle(ev.title);
  return {
    kind: 'agenda_overwritten',
    title: t ? `${who} cambió lo mismo que tú en ${t}` : `${who} cambió lo mismo que tú en un evento`,
    body: labels ? `${labels}. Lo tuyo quedó en el historial del evento.` : 'Lo tuyo quedó en el historial del evento.',
    link: `/eventos/${ev.id}`,
    key: `agenda_overwritten:${ev.id}:${stamp}`,
  };
}

// The other manager changed something of an event (optional notice, off by default in Mi perfil).
export function changedNotice(ev: EventRef, byName: string, labels: string, stamp: string): AgendaNotice {
  const who = noticeEventTitle(byName) || 'Alguien';
  const t = noticeEventTitle(ev.title);
  return {
    kind: 'agenda_changed',
    title: t ? `${who} cambió ${t}` : `${who} cambió un evento`,
    body: labels,
    link: `/eventos/${ev.id}`,
    key: `agenda_changed:${ev.id}:${stamp}`,
  };
}

// The boss put something on the agenda himself (accepted at once): despacho learns (optional, like a change).
export function bossAddedNotice(ev: EventRef): AgendaNotice {
  return {
    kind: 'agenda_changed',
    title: withTitle('El jefe agregó a la agenda', 'El jefe agregó algo a la agenda', ev.title),
    body: '',
    link: `/eventos/${ev.id}`,
    key: `agenda_changed:${ev.id}:created`,
  };
}

// Unique recipients, without the person who did the action.
export function noticeRecipients(ids: (string | null | undefined)[], actorId?: string | null): string[] {
  return [...new Set(ids.filter((x): x is string => !!x && x !== actorId))];
}
