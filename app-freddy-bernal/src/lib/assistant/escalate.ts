import 'server-only';
import { withSystem } from '../db';
import { notify, usersWithRole } from '../notify';
import { redactForTeam } from './redact';

// «Aviso al equipo» for real (manual §11): an in-app notice (and the email copy, which stays
// in the outbox unless EMAIL_MODE=send) to administration — and to supervision when it is
// about approvals — with a link to the conversation in the panel. Not repeated within 6
// hours for the same conversation. The texts never carry dates, times or places: the reason
// (a model may write it, with the real titles back in it) gets every rule, a place said by its
// name too, and the phone's guard, before anyone sees it. Uses withSystem only; never call it from
// inside db(session, …).

export const ESCALATION_KIND = 'assistant_escalation';
const REPEAT_HOURS = 6;
const ABOUT_APPROVALS = /aprob|revisi|sem[aá]foro|\brojo\b|amarill|cambios pedidos|pieza/i;

export function panelLink(conversationId: string) {
  return `/ajustes/asistente?conversacion=${conversationId}`;
}

export async function escalate(conversationId: string, reason: string): Promise<{ alreadyNotified: boolean; to: string[] }> {
  const motivo = redactForTeam(String(reason ?? '').trim()).slice(0, 300) || 'Pidió hablar con alguien del equipo.';
  const conv = await withSystem((sql) =>
    sql.one<{ id: string; name: string; repeated: boolean }>(
      `select c.id, coalesce(nullif(p.full_name, ''), p.email, 'Alguien del equipo') as name,
              c.escalated_at is not null and c.escalated_at > now() - make_interval(hours => $2) as repeated
         from public.assistant_conversations c left join public.profiles p on p.id = c.user_id
        where c.id = $1`,
      [conversationId, REPEAT_HOURS],
    ),
  );
  if (!conv) throw new Error('Esa conversación no existe.');
  const approvals = ABOUT_APPROVALS.test(motivo);
  const to = approvals ? ['administración', 'supervisión'] : ['administración'];
  if (conv.repeated) return { alreadyNotified: true, to };

  const admins = await usersWithRole('admin');
  if (!admins.length) throw new Error('No hay nadie en administración a quien avisar.');
  const key = `assistant-esc:${conversationId}:${Date.now()}`;
  const title = 'El asistente pide una persona';
  const body = `${conv.name} necesita ayuda: ${motivo}`;
  await notify({ userIds: admins, kind: ESCALATION_KIND, title, body, link: panelLink(conversationId), key, email: true });
  if (approvals) {
    const sup = (await usersWithRole('supervisor')).filter((id) => !admins.includes(id));
    if (sup.length) await notify({ userIds: sup, kind: ESCALATION_KIND, title, body, link: '/aprobar', key: `${key}:sup` });
  }
  // Marked only after the notice went out: a failed notice must not silence the next one.
  await withSystem((sql) =>
    sql.query(`update public.assistant_conversations set escalated_at = now(), escalated_reason = $2 where id = $1`, [conversationId, motivo]),
  );
  return { alreadyNotified: false, to };
}
