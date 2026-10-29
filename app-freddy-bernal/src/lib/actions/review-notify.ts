import 'server-only';
import { notify, usersWithRole } from '../notify';
import { LEVELS, type Level } from '../domain/review';

// Who has to look at a piece in review: the boss, at every level (public.can_approve()). Red rings as critical;
// green is not emailed (he approves the greens all at once). Shared by the piece actions and Redes' card actions
// (a plain module: a 'use server' file may only export actions).
export async function notifyReviewers(pieceId: string, title: string, lvl: Level, why: string) {
  const red = lvl === 'rojo';
  await notify({
    userIds: await usersWithRole('boss'),
    kind: red ? 'review_red' : 'review_pending',
    title: red ? 'Pieza en rojo por aprobar' : `Pieza por aprobar (${LEVELS[lvl].label.toLowerCase()})`,
    body: `${title}${why ? ` · ${why}` : ''}`,
    link: `/aprobar/${pieceId}`,
    key: `review:${pieceId}:${Date.now()}`,
    email: lvl !== 'verde',
  });
}
