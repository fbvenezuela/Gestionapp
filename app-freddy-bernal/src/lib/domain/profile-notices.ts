// Mi perfil → «Qué avisos quiero» (R04): the notices that cannot be turned off (src/lib/notify.ts, CRITICAL), said for
// the person's own roles, never one that never reaches them («cuando se acaban los tweets» is for Redes). Who gets
// each one follows the code that sends it: Grabación hears about an event it is given (actions/agenda.ts, events.ts);
// Grabación and the IVT about one that moves (agenda-shared.ts); who works on an event, the boss and despacho about
// one that is cancelled or whose date the boss rejected (agenda.ts, events.ts); Redes and who made the piece about the
// changes the boss asks for (pieces.ts); the boss about a red piece and one past its deadline, Administración about
// the late ones that are not red (review-notify.ts, cron/tick); Redes about a publication that failed and the tweets
// running out (cron/tick); Administración about 360 and Google Drive. A unit test fails when a new kind comes without
// its line (tests/unit/profile-notices.test.ts). Plain module: the profile form is a client component.
import type { Role } from '../roles';

export const ALWAYS_NOTICES: { kind: string; label: string; roles: readonly Role[] }[] = [
  { kind: 'event_assigned', label: 'un evento que te asignan', roles: ['camera'] },
  { kind: 'event_moved', label: 'un evento que cambia de fecha u hora', roles: ['camera', 'ivt'] },
  { kind: 'event_cancelled', label: 'un evento que se cancela', roles: ['camera', 'social', 'ivt', 'politics', 'boss', 'dispatch'] },
  { kind: 'changes_requested', label: 'los cambios que el jefe pide en una pieza', roles: ['social', 'admin'] },
  { kind: 'review_red', label: 'una pieza roja por aprobar', roles: ['boss'] },
  { kind: 'review_overdue', label: 'una pieza que se pasó de su plazo', roles: ['boss', 'admin'] },
  { kind: 'publish_failed', label: 'una publicación que falló', roles: ['social'] },
  { kind: 'tweets_low_stock', label: 'cuando se acaban los tweets', roles: ['social'] },
  { kind: 'assistant_escalation', label: 'los avisos de 360', roles: ['admin'] },
  { kind: 'assistant_health', label: 'los avisos de 360', roles: ['admin'] },
  { kind: 'drive_down', label: 'los de Google Drive', roles: ['admin'] },
  { kind: 'drive_quota', label: 'los de Google Drive', roles: ['admin'] },
];

const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''));

/** «Aparte de estos, siempre te llegan (no se pueden apagar): …», with the person's own; null when none reaches them. */
export function alwaysNoticesLine(roles: readonly string[]): string | null {
  const labels = [...new Set(ALWAYS_NOTICES.filter((n) => n.roles.some((r) => roles.includes(r))).map((n) => n.label))];
  return labels.length ? `Aparte de estos, siempre te llegan (no se pueden apagar): ${and(labels)}.` : null;
}

/** The agenda's two switches are for whoever edits it (the boss and despacho): the other one named. */
export function agendaChangedLabel(roles: readonly string[]): string | null {
  const boss = roles.includes('boss');
  const dispatch = roles.includes('dispatch');
  if (boss && dispatch) return 'Cada cambio que hacen el jefe o el despacho en la agenda (viene apagado)';
  if (boss) return 'Cada cambio que hace el despacho en la agenda (viene apagado)';
  if (dispatch) return 'Cada cambio que hace el jefe en la agenda (viene apagado)';
  return null;
}

export const editsAgenda = (roles: readonly string[]) => roles.includes('boss') || roles.includes('dispatch');

/** Whether a switch of «Qué avisos quiero» is for this person: the agenda's two only for whoever can get them.
 * «Cada cambio que hace… en la agenda» goes to the other manager alone (agenda-shared.ts, managers()); «Alguien cambió
 * lo mismo que yo en la agenda» to whoever wrote what a save replaced: the boss and despacho in the event, its
 * schedule and its ficha técnica (can_manage_agenda()), and also Redes and Administración in its storyboard
 * (events.ts; the storyboards' policies). Grabación, política and the IVT never get either. */
export function showsSwitch(kind: string, roles: readonly string[]): boolean {
  if (kind === 'agenda_changed') return editsAgenda(roles);
  if (kind === 'agenda_overwritten') return editsAgenda(roles) || roles.includes('social') || roles.includes('admin');
  return true;
}

/** Phone notices still off in this installation (R08): Administración tells whoever installed the app; everyone else,
 * Administración (as 360 says: «quien te invitó (administración)»). */
export function pushOffText(admin: boolean): string {
  return admin
    ? 'Los avisos al teléfono todavía no están encendidos en la app: avísale a quien la instaló.'
    : 'Los avisos al teléfono todavía no están encendidos en la app. Avísale a Administración.';
}
