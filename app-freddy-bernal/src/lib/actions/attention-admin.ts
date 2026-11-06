'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import type { Sql } from '../db';
import { DEFAULT_STALE_DAYS, deskAccess } from '../domain/attention';

// What keeps the attention desk running (D-93, /admin/atencion/areas and /admin/atencion/plantillas): the areas and who
// is in each (Administración), the categories' default area and due days (Administración), the due days by priority
// and the days without movement before a notice (Administración, app_settings), and the reply templates (the
// coordinator). Every write runs as the person; the database's policies decide (can_manage_catalogs(): Administración
// with the second factor; the templates, the coordinator with it). An update that RLS lets through on no row is a «no».

const PATHS = { revalidate: ['/admin/atencion'] };
const uuid = (message = 'Dato inválido.') => z.string().uuid(message);

/**
 * act() for what keeps the desk running: the app checks first the role it takes (Administración for the areas, the
 * categories and the settings; the coordinator for the saved replies) with the second factor, then the database's
 * policies decide again. Hiding a form is never the control.
 */
function keep<I, T>(need: 'catalogs' | 'coordinator', schema: z.ZodType<I>, raw: unknown, fn: (sql: Sql, input: I) => Promise<T>, opts: { revalidate?: string[] } = PATHS) {
  return act(schema, raw, async (sql, input, s) => {
    if (!s.mfaOk || !deskAccess(s.roles)[need]) throw new UserError('No tienes permiso para hacer esto.');
    return fn(sql, input);
  }, opts);
}
const slugOf = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'area';

// --- Areas and their people -------------------------------------------------------------------------------------------------

const areaSchema = z.object({
  id: uuid('Área inválida.').optional(),
  name: z.string().trim().min(2, 'El nombre va de 2 a 80 letras.').max(80, 'El nombre va de 2 a 80 letras.'),
  description: z.string().trim().max(500, 'La descripción va hasta 500 letras.').default(''),
  active: z.boolean().default(true),
});

export async function saveArea(raw: unknown) {
  return keep('catalogs', areaSchema, raw, async (sql, i) => {
    if (i.id) {
      const r = await sql.query(`update public.areas set name = $2, description = $3, active = $4 where id = $1 returning id`, [i.id, i.name, i.description, i.active]);
      if (!r.length) throw new UserError('No tienes permiso para cambiar las áreas.');
      return { id: i.id };
    }
    const r = await sql.one<{ id: string }>(`insert into public.areas (slug, name, description, active) values ($1, $2, $3, $4) returning id`, [
      slugOf(i.name),
      i.name,
      i.description,
      i.active,
    ]);
    return { id: r!.id };
  }, PATHS);
}

/** A responsible joins an area (or leaves it). Only people with «Responsable de área» are offered. */
export async function setAreaMember(raw: unknown) {
  return keep('catalogs', z.object({ areaId: uuid('Área inválida.'), userId: uuid('Persona inválida.'), on: z.boolean() }), raw, async (sql, i) => {
    if (i.on) {
      await sql.query(`insert into public.area_members (area_id, user_id) values ($1, $2) on conflict (area_id, user_id) do nothing`, [i.areaId, i.userId]);
    } else {
      const r = await sql.query(`delete from public.area_members where area_id = $1 and user_id = $2 returning id`, [i.areaId, i.userId]);
      if (!r.length) throw new UserError('Esa persona ya no estaba en el área, o no tienes permiso.');
    }
  }, { revalidate: ['/admin/atencion', '/ajustes/equipo'] });
}

// --- Categories -----------------------------------------------------------------------------------------------------------

const categorySchema = z.object({
  id: uuid('Categoría inválida.'),
  defaultAreaId: uuid('Área inválida.').nullable(),
  defaultDueDays: z.number().int('Días enteros.').min(1, 'De 1 a 365 días.').max(365, 'De 1 a 365 días.').nullable(),
  active: z.boolean(),
});

/** The area a new request of this category goes to, and how many days the team commits to. */
export async function saveCategoryDefaults(raw: unknown) {
  return keep('catalogs', categorySchema, raw, async (sql, i) => {
    const r = await sql.query(`update public.request_categories set default_area_id = $2, default_due_days = $3, active = $4 where id = $1 returning id`, [
      i.id,
      i.defaultAreaId,
      i.defaultDueDays,
      i.active,
    ]);
    if (!r.length) throw new UserError('No tienes permiso para cambiar las categorías.');
  }, PATHS);
}

// --- The desk's settings --------------------------------------------------------------------------------------------------

const days = (label: string) => z.number().int(`${label}: días enteros.`).min(1, `${label}: de 1 a 365 días.`).max(365, `${label}: de 1 a 365 días.`).nullable();
const settingsSchema = z.object({
  urgente: days('Urgente'),
  alta: days('Alta'),
  normal: days('Normal'),
  baja: days('Baja'),
  staleDays: z.number().int('Días enteros.').min(1, 'Sin movimiento: de 1 a 60 días.').max(60, 'Sin movimiento: de 1 a 60 días.'),
});

/** Due days by priority (the shorter of these and the category's wins) and the days without movement before a notice. */
export async function saveDeskSettings(raw: unknown) {
  return keep('catalogs', settingsSchema, raw, async (sql, i) => {
    const byPriority = Object.fromEntries((['urgente', 'alta', 'normal', 'baja'] as const).filter((k) => i[k] !== null).map((k) => [k, i[k]]));
    for (const [key, value] of [
      ['participation.due_days_by_priority', byPriority],
      ['participation.alerts', { staleDays: i.staleDays ?? DEFAULT_STALE_DAYS }],
    ] as const) {
      const r = await sql.query(
        `insert into public.app_settings (key, value, updated_by) values ($1, $2::text::jsonb, auth.uid())
         on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now() returning key`,
        [key, JSON.stringify(value)],
      );
      if (!r.length) throw new UserError('No tienes permiso para cambiar estos ajustes.');
    }
  }, PATHS);
}

// --- Reply templates ------------------------------------------------------------------------------------------------------

const templateSchema = z.object({
  id: uuid('Respuesta inválida.').optional(),
  kind: z.enum(['public_reply', 'info_request'], 'Elige el tipo.'),
  title: z.string().trim().min(2, 'El nombre va de 2 a 80 letras.').max(80, 'El nombre va de 2 a 80 letras.'),
  body: z.string().trim().min(10, 'El texto va de 10 a 2000 letras.').max(2000, 'El texto va de 10 a 2000 letras.'),
  sort: z.number().int().min(0).max(1000).default(100),
  active: z.boolean().default(true),
});

/** The coordinator writes the replies the team uses most (they go to the person: plain words, no data of anyone). */
export async function saveReplyTemplate(raw: unknown) {
  return keep('coordinator', templateSchema, raw, async (sql, i) => {
    if (i.id) {
      const r = await sql.query(`update public.request_reply_templates set kind = $2, title = $3, body = $4, sort = $5, active = $6 where id = $1 returning id`, [
        i.id,
        i.kind,
        i.title,
        i.body,
        i.sort,
        i.active,
      ]);
      if (!r.length) throw new UserError('Las respuestas guardadas las cambia la coordinación.');
      return;
    }
    await sql.query(`insert into public.request_reply_templates (kind, title, body, sort, active) values ($1, $2, $3, $4, $5)`, [i.kind, i.title, i.body, i.sort, i.active]);
  }, PATHS);
}
