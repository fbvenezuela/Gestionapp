import type { Sql } from '../db/core';

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

export async function peopleWithRole(sql: Sql, role: string) {
  return sql.query<{ id: string; full_name: string }>(
    `select p.id, coalesce(nullif(p.full_name, ''), p.email) as full_name from public.profiles p
      where p.active and p.deleted_at is null and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = $1::public.app_role)
      order by 2`,
    [role],
  );
}
