import { scriptDraft } from '../../domain/office';
import type { SeedCtx } from './context';

// «La oficina» (06/11/2026) in the demo: the coffee growers' meeting (the 4th demo event, accepted, one storyboard
// shot, nothing recorded yet) has its script drafted by Redes and waiting for the boss, so the «Guionistas» room is not
// empty and the boss has a script to approve. Invented, like everything in the demo. No new event: the counts of the
// other tests stay as they are. The rest of the demo events are placed by what they already have.
export const DEMO_SCRIPT_EVENT = 3;

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
  await sql.query(`insert into public.event_office (event_id, script, script_status, updated_by) values ($1, $2, 'draft', $3)`, [eventId, script, ids.social]);
}
