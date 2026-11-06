'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import type { Sql } from '../db/core';
import { SCRIPT_MAX, scriptDraft } from '../domain/office';

// «La oficina» (06/11/2026): the three steps that live in event_office. The database decides who writes (the boss and
// Redes, on an event they see), that only the boss approves the script, that changing an approved script sends it
// back to draft, and that the final edit waits for the clean one (20261106000100_office.sql).

const revalidate = ['/oficina'];
const eventId = z.string().uuid();

// The row is born empty the first time a room touches the activity, then the step changes it.
async function setStep(sql: Sql, id: string, set: string, params: unknown[]) {
  await sql.query(`insert into public.event_office (event_id) values ($1) on conflict (event_id) do nothing`, [id]);
  const row = await sql.one<{ event_id: string }>(`update public.event_office set ${set} where event_id = $1 returning event_id`, [id, ...params]);
  if (!row) throw new UserError('No puedes trabajar en esta actividad.');
}

/** The first draft of the script, from the event's ficha (§4.7: only what the ficha says; what is missing, said). */
export async function draftScript(raw: unknown) {
  return act(z.object({ eventId }), raw, async (sql, i) => {
    const b = await sql.one<{ title: string; work: string | null; led_by: string | null; achievements: string | null; key_facts: string | null }>(
      `select e.title, b.work_description as work, b.led_by, b.achievements, b.key_facts
         from public.events e left join public.event_brief b on b.event_id = e.id where e.id = $1`,
      [i.eventId],
    );
    if (!b) throw new UserError('No encontramos esa actividad.');
    return scriptDraft({ title: b.title, work: b.work ?? '', ledBy: b.led_by ?? '', achievements: b.achievements ?? '', keyFacts: b.key_facts ?? '' });
  });
}

/** Saves the script as a draft (an approved one goes back to the boss when its text changes). */
export async function saveScript(raw: unknown) {
  const schema = z.object({ eventId, script: z.string().trim().min(10, 'Escribe el guion.').max(SCRIPT_MAX, `El guion llega hasta ${SCRIPT_MAX} letras.`) });
  const res = await act(schema, raw, async (sql, i) => {
    const cur = await sql.one<{ script: string; script_status: string }>(`select script, script_status from public.event_office where event_id = $1`, [i.eventId]);
    if (cur && cur.script === i.script) return cur.script_status;
    await sql.query(
      `insert into public.event_office (event_id, script, script_status) values ($1, $2, 'draft')
       on conflict (event_id) do update set script = excluded.script, script_status = 'draft'`,
      [i.eventId, i.script],
    );
    return 'draft';
  }, { revalidate });
  if (!res.ok) return res;
  return { ...res, message: res.data === 'approved' ? 'No cambió nada: sigue aprobado.' : 'Guion guardado. Ahora lo ve el jefe.' };
}

/** The boss approves the script (the database refuses anyone else). */
export async function approveScript(raw: unknown) {
  const res = await act(z.object({ eventId }), raw, async (sql, i) => {
    const cur = await sql.one<{ script_status: string }>(`select script_status from public.event_office where event_id = $1`, [i.eventId]);
    if (!cur || cur.script_status === 'none') throw new UserError('Todavía no hay guion.');
    await sql.query(`update public.event_office set script_status = 'approved' where event_id = $1`, [i.eventId]);
  }, { revalidate });
  return res.ok ? { ...res, message: 'Guion aprobado. Sigue su camino.' } : res;
}

/** «Editor en línea» or «Editor brutal» says its part is done (or undoes it). */
export async function markEdit(raw: unknown) {
  const schema = z.object({ eventId, step: z.enum(['clean', 'brutal']), done: z.boolean() });
  const res = await act(schema, raw, async (sql, i) => {
    const col = i.step === 'clean' ? 'clean_done' : 'brutal_done';
    // Undoing the clean video undoes the final edit too: the final one is made over the clean one.
    const set = i.step === 'clean' && !i.done ? 'clean_done = false, brutal_done = false' : `${col} = $2`;
    await setStep(sql, i.eventId, set, i.step === 'clean' && !i.done ? [] : [i.done]);
  }, { revalidate });
  if (!res.ok) return res;
  const i = schema.parse(raw);
  const message = !i.done ? 'Listo, vuelve a esta sala.' : i.step === 'clean' ? 'Video limpio. Pasa al editor brutal.' : 'Edición lista. Súbela como pieza para que el jefe la apruebe.';
  return { ...res, message };
}
