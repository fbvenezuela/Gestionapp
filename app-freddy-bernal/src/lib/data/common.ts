import type { Sql } from '../db/core';
import type { ParishMap } from '../domain/territory';

export type CategoryOption = { id: string; name: string; emoji: string | null; group: string };

export async function contentCategories(sql: Sql): Promise<CategoryOption[]> {
  return sql.query<CategoryOption>(
    `select c.id, c.name, c.emoji, p.name as "group" from public.categories c join public.categories p on p.id = c.parent_id
      where c.kind = 'content' and c.active and c.deleted_at is null order by p.sort, c.sort`,
  );
}

export async function municipalities(sql: Sql): Promise<string[]> {
  return (await sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'municipalities'`))?.value ?? [];
}

// {"<municipality>": ["<parish>", …]}: empty until the official list arrives (then the parish is free text).
export async function parishes(sql: Sql): Promise<ParishMap> {
  const v = (await sql.one<{ value: unknown }>(`select value from public.app_settings where key = 'parishes'`))?.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter((e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every((x) => typeof x === 'string')),
  );
}

export async function peopleWithRole(sql: Sql, role: string) {
  // Grabación: the boss, despacho and Redes assign it, and they cannot read user_roles (only admin can).
  if (role === 'camera') return sql.query<{ id: string; full_name: string }>(`select id, full_name from public.camera_people()`);
  return sql.query<{ id: string; full_name: string }>(
    `select p.id, coalesce(nullif(p.full_name, ''), p.email) as full_name from public.profiles p
      where p.active and p.deleted_at is null and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = $1::public.app_role)
      order by 2`,
    [role],
  );
}
