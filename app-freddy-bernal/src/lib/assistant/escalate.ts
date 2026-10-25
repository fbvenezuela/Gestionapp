import 'server-only';
import { withSystem } from '../db';
import { notify, usersWithRole } from '../notify';
import { aboutEvent } from './events';
import { redactForTeam } from './redact';
import { Placeholders, stripTokens, type TitleSet } from './titles';

// «Aviso al equipo» for real (manual §11): an in-app notice (and the email copy, which stays
// in the outbox unless EMAIL_MODE=send) to administration — and to supervision when it is
// about approvals — with a link to the conversation in the panel. Not repeated within 6
// hours for the same conversation. The texts never carry dates, times or places: the reason
// (a model may write it, with the real titles back in it) loses any placeholder left and any event
// place by its name («ese lugar»), then gets every rule, a place said by its name too, and the phone's
// guard. If the reason is about an event (the
// shared detector, against every event title and place), Supervisión only reads «Necesita ayuda con un
// evento»; administración gets the scrubbed reason. Uses withSystem only; never call it from inside
// db(session, …).

export const ESCALATION_KIND = 'assistant_escalation';
const REPEAT_HOURS = 6;
const ABOUT_APPROVALS = /aprob|revisi|sem[aá]foro|\brojo\b|amarill|cambios pedidos|pieza/i;
export const EVENT_MOTIVO = 'necesita ayuda con un evento.';

// Every event title and place (to check and to hide: nothing of it is shown or sent).
async function allTitles(): Promise<TitleSet> {
  const rows = await withSystem((sql) =>
    sql.query<{ title: string; place_name: string }>(`select title, place_name from public.events where deleted_at is null order by created_at desc limit 3000`),
  );
  return { events: rows.map((r) => r.title), pieces: [], places: rows.map((r) => r.place_name) };
}

export function panelLink(conversationId: string) {
  return `/ajustes/asistente?conversacion=${conversationId}`;
}

export async function escalate(conversationId: string, reason: string): Promise<{ alreadyNotified: boolean; to: string[] }> {
  const titles = await allTitles();
  const said = stripTokens(String(reason ?? '').trim());
  // An event's place by its name («la pieza de Alto Verde») is «ese lugar» for administración too.
  const motivo = redactForTeam(stripTokens(new Placeholders({ events: [], pieces: [], places: titles.places }).mask(said))).slice(0, 300) || 'Pidió hablar con alguien del equipo.';
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
    const forSup = aboutEvent(said, titles) || aboutEvent(motivo, titles) ? `${conv.name} ${EVENT_MOTIVO}` : body;
    if (sup.length) await notify({ userIds: sup, kind: ESCALATION_KIND, title, body: forSup, link: '/aprobar', key: `${key}:sup` });
  }
  // Marked only after the notice went out: a failed notice must not silence the next one.
  await withSystem((sql) =>
    sql.query(`update public.assistant_conversations set escalated_at = now(), escalated_reason = $2 where id = $1`, [conversationId, motivo]),
  );
  return { alreadyNotified: false, to };
}
