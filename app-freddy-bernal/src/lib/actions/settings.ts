'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { phonesIn } from '../domain/phones';

const uuid = z.string().uuid();
const KEYS = [
  'tweets.slots', 'tweets.per_day', 'tweets.low_stock_days', 'brand', 'publishing.default_collaborators', 'upload.max_mb', 'municipalities', 'parishes',
  'redes.quotas', 'redes.pillars',
] as const;

// Cupo y pilares (R4, D-68): the same rules as guard_redes_settings() in the database. The quota is informative
// (going over blocks nothing); a pillar's key never changes, so renaming it keeps it on the pieces.
const QUOTA_TEXT = 'El cupo es un número entero de 0 a 200 por formato.';
const PILLAR_TEXT = 'Cada pilar lleva una clave única y un nombre de 1 a 40 letras.';
const quota = z.number({ error: QUOTA_TEXT }).int(QUOTA_TEXT).min(0, QUOTA_TEXT).max(200, QUOTA_TEXT);
const pillar = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, PILLAR_TEXT),
  name: z.string().trim().min(1, PILLAR_TEXT).max(40, PILLAR_TEXT).refine((v) => !phonesIn(v).length, 'El nombre del pilar no lleva teléfonos.'),
  tone: z
    .enum(['neutral', 'info', 'accent', 'ok'], { error: 'El color del pilar es uno de la lista.' })
    .nullish()
    .transform((v) => v ?? 'neutral'),
});

const valueSchemas: Record<(typeof KEYS)[number], z.ZodType> = {
  'tweets.slots': z.array(z.object({ from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) })).min(1).max(12),
  'tweets.per_day': z.object({ min: z.number().int().min(1).max(12), max: z.number().int().min(1).max(12) }).refine((v) => v.max >= v.min, 'El máximo no puede ser menor que el mínimo.'),
  'tweets.low_stock_days': z.number().int().min(1).max(30),
  brand: z.object({ appName: z.string().min(2).max(60), shortName: z.string().min(2).max(30), greeting: z.string().max(80), closings: z.array(z.string().max(80)).max(5), hashtags: z.array(z.string().max(40)).max(6) }).passthrough(),
  'publishing.default_collaborators': z.array(z.string().max(80)).max(20),
  'upload.max_mb': z.number().int().min(50).max(51200),
  municipalities: z.array(z.string().min(2).max(80)).max(200),
  // The official parishes per municipality (empty until the list arrives; check_territory enforces it once loaded).
  parishes: z
    .record(z.string().min(2).max(80), z.array(z.string().trim().min(2).max(100)).max(80))
    .refine((m) => Object.values(m).every((l) => new Set(l).size === l.length), 'Hay una parroquia repetida.'),
  'redes.quotas': z.strictObject(
    { reel: quota.optional(), post: quota.optional(), carousel: quota.optional(), story: quota.optional(), youtube: quota.optional() },
    { error: QUOTA_TEXT },
  ),
  'redes.pillars': z
    .array(pillar)
    .max(12, 'Hasta 12 pilares.')
    .refine((l) => new Set(l.map((p) => p.key)).size === l.length, PILLAR_TEXT),
};

export async function saveSetting(raw: unknown) {
  return act(z.object({ key: z.enum(KEYS), value: z.unknown() }), raw, async (sql, i) => {
    const v = valueSchemas[i.key].safeParse(i.value);
    if (!v.success) throw new UserError(v.error.issues[0]?.message ?? 'Valor no válido.');
    await sql.query(
      `insert into public.app_settings (key, value, updated_by) values ($1, $2::text::jsonb, auth.uid())
       on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now()`,
      [i.key, JSON.stringify(v.data)],
    );
  }, { revalidate: ['/ajustes', '/redes'] });
}

export async function saveCategory(raw: unknown) {
  return act(
    z.object({ id: uuid.optional(), parentId: uuid.nullable(), name: z.string().trim().min(2).max(80), emoji: z.string().max(8).nullable().default(null), active: z.boolean().default(true) }),
    raw,
    async (sql, i) => {
      if (i.id) await sql.query(`update public.categories set name = $2, emoji = $3, active = $4 where id = $1`, [i.id, i.name, i.emoji, i.active]);
      else await sql.query(`insert into public.categories (kind, parent_id, name, emoji, sort) values ('content', $1, $2, $3, 999)`, [i.parentId, i.name, i.emoji]);
    },
    { revalidate: ['/ajustes/categorias'] },
  );
}

export async function saveFormula(raw: unknown) {
  return act(
    z.object({
      id: uuid.optional(),
      code: z.string().trim().min(2).max(12).regex(/^[A-Z0-9_]+$/, 'Código en mayúsculas, sin espacios.'),
      name: z.string().trim().min(3).max(120),
      description: z.string().max(500).default(''),
      steps: z.array(z.object({ key: z.string().regex(/^[a-z_]+$/), label: z.string().min(1).max(60), hint: z.string().max(200).default('') })).min(1).max(8),
      active: z.boolean().default(true),
    }),
    raw,
    async (sql, i) => {
      if (i.id) await sql.query(`update public.copy_formulas set code = $2, name = $3, description = $4, steps = $5::text::jsonb, active = $6 where id = $1`, [i.id, i.code, i.name, i.description, JSON.stringify(i.steps), i.active]);
      else await sql.query(`insert into public.copy_formulas (code, name, description, steps, sort) values ($1, $2, $3, $4::text::jsonb, 99)`, [i.code, i.name, i.description, JSON.stringify(i.steps)]);
    },
    { revalidate: ['/ajustes/formulas'] },
  );
}

export async function saveNetworkSpec(raw: unknown) {
  return act(
    z.object({ network: z.string(), formats: z.record(z.string(), z.record(z.string(), z.unknown())), copyMaxChars: z.number().int().min(50).max(100000), notes: z.string().max(1000).default(''), verified: z.boolean().default(false) }),
    raw,
    async (sql, i) => {
      await sql.query(
        `update public.network_specs set formats = $2::text::jsonb, copy_max_chars = $3, notes = $4, verified_on = case when $5 then current_date else verified_on end where network = $1`,
        [i.network, JSON.stringify(i.formats), i.copyMaxChars, i.notes, i.verified],
      );
    },
    { revalidate: ['/ajustes/redes'] },
  );
}
