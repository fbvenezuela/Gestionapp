import { scriptDraft } from '../../domain/office';
import type { SeedCtx } from './context';

// «La oficina» (06/11/2026) in the demo: the coffee growers' meeting (the 4th demo event, accepted, one storyboard
// shot, nothing recorded yet) has its script drafted by Redes and waiting for the boss, so the «Guionistas» room is not
// empty and the boss has a script to approve. Invented, like everything in the demo. No new event: the counts of the
// other tests stay as they are. The rest of the demo events are placed by what they already have.
export const DEMO_SCRIPT_EVENT = 3;
// The school health day (the 3rd demo event): its reading approved, the team called to the meeting room (19/11).
export const DEMO_MEETING_EVENT = 2;

export async function seedOffice(ctx: SeedCtx): Promise<void> {
  const { sql, ids, eventIds } = ctx;
  const eventId = eventIds[DEMO_SCRIPT_EVENT];
  if (!eventId) return;
  const ev = await sql.one<{ title: string; work: string | null; led_by: string | null; achievements: string | null; key_facts: string | null }>(
    `select e.title, b.work_description as work, b.led_by, b.achievements, b.key_facts
       from public.events e left join public.event_brief b on b.event_id = e.id where e.id = $1`,
    [eventId],
  );
  if (!ev) return;
  const script = scriptDraft({ title: ev.title, work: ev.work ?? '', ledBy: ev.led_by ?? '', achievements: ev.achievements ?? '', keyFacts: ev.key_facts ?? '' });
  // Its reading, already approved by the boss (the script starts after it): invented answers and an invented search.
  await sql.query(
    `insert into public.event_office (event_id, rx_what, rx_beneficiaries, rx_responsible, rx_research, reception_status, reception_approved_by,
                                      kickoff_done, kickoff_by, script, script_status, updated_by)
     values ($1, $2, $3, $4, $5, 'approved', $6, true, $6, $7, 'draft', $8)`,
    [
      eventId,
      'Mesa de trabajo con los productores de café de la zona alta (demo).',
      'Las familias productoras del sector (demo; la cifra la confirma despacho).',
      'Secretaría de Economía (demo). Inversión y tiempo: no se saben todavía.',
      'Reseñas de Google del sector: se quejan de la vía de acceso en lluvia (demo, Google Maps).\nTikTok, «café zona alta Táchira»: videos de la cosecha y del precio (demo).',
      ids.boss,
      script,
      ids.social,
    ],
  );
}

export async function seedOfficeMeeting(ctx: SeedCtx): Promise<void> {
  const { sql, ids, eventIds } = ctx;
  const eventId = eventIds[DEMO_MEETING_EVENT];
  if (!eventId) return;
  await sql.query(
    `insert into public.event_office (event_id, rx_what, rx_beneficiaries, rx_responsible, rx_research, reception_status, reception_approved_by, updated_by)
     values ($1, $2, $3, $4, $5, 'approved', $6, $7)`,
    [
      eventId,
      'Jornada de salud en la escuela: consultas y vacunas para los niños (demo).',
      'Los alumnos de la escuela y sus familias (demo; la cifra la confirma la dirección de la escuela).',
      'Equipo de salud del municipio (demo). Inversión: no se sabe todavía.',
      'Reseñas de Google de la escuela: piden más jornadas como esta (demo).',
      ids.boss,
      ids.social,
    ],
  );
}
