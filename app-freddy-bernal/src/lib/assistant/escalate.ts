import 'server-only';
import { withSystem } from '../db';
import { notify, usersWithRole } from '../notify';
import { redactPlaceAfterA } from './events';
import { redactForTeam } from './redact';
import { Placeholders, peopleWords, stripTokens, type TitleSet } from './titles';

// «Aviso al equipo» for real (manual §11): an in-app notice (and the email copy, which stays
// in the outbox unless EMAIL_MODE=send) to administration only — approvals included: since 27/10/2026
// the boss approves, and the governor gets no assistant noise — with a link to the conversation in the
// panel. Not repeated within 6 hours for the same conversation. The texts never carry dates, times or
// places: the reason (a model may write it, with the real titles back in it) loses any placeholder left
// and any event place by its name («ese lugar»), then gets every rule, a place said by its name too
// (also «a Táriba», when Táriba is no one of the team), and the phone's guard. Uses withSystem only;
// never call it from inside db(session, …).

export const ESCALATION_KIND = 'assistant_escalation';
const REPEAT_HOURS = 6;

// Every event title and place (to check and to hide: nothing of it is shown or sent), and the team's
// names («a Kevin» is someone; «a Táriba», a place).
async function allTitles(): Promise<TitleSet> {
  return withSystem(async (sql) => {
    const rows = await sql.query<{ title: string; place_name: string }>(`select title, place_name from public.events where deleted_at is null order by created_at desc limit 3000`);
    const people = await sql.query<{ full_name: string }>(`select full_name from public.profiles where deleted_at is null limit 3000`);
    return { events: rows.map((r) => r.title), pieces: [], places: rows.map((r) => r.place_name), people: peopleWords(people.map((r) => r.full_name)) };
  });
}

export function panelLink(conversationId: string) {
  return `/ajustes/asistente?conversacion=${conversationId}`;
}

export async function escalate(conversationId: string, reason: string): Promise<{ alreadyNotified: boolean; to: string[] }> {
  const titles = await allTitles();
  const said = stripTokens(String(reason ?? '').trim());
  // An event's place by its name («la pieza de Alto Verde») is «ese lugar» for administración too.
  const motivo = redactForTeam(redactPlaceAfterA(stripTokens(new Placeholders({ events: [], pieces: [], places: titles.places }).mask(said)), titles)).slice(0, 300) || 'Pidió hablar con alguien del equipo.';
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
  const to = ['administración'];
  if (conv.repeated) return { alreadyNotified: true, to };

  const admins = await usersWithRole('admin');
  if (!admins.length) throw new Error('No hay nadie en administración a quien avisar.');
  const key = `assistant-esc:${conversationId}:${Date.now()}`;
  const title = 'El asistente pide una persona';
  const body = `${conv.name} necesita ayuda: ${motivo}`;
  await notify({ userIds: admins, kind: ESCALATION_KIND, title, body, link: panelLink(conversationId), key, email: true });
  // Marked only after the notice went out: a failed notice must not silence the next one.
  await withSystem((sql) =>
    sql.query(`update public.assistant_conversations set escalated_at = now(), escalated_reason = $2 where id = $1`, [conversationId, motivo]),
  );
  return { alreadyNotified: false, to };
}
