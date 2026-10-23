import type { Sql } from './core';
import { getClientConfig, networkSpecsSeed, type CategorySeed } from '../client-config';

// Upserts the client configuration (categories, formulas, settings, network rules).
// Safe to run on production: it is configuration, not test data. Idempotent.
export async function seedClient(sql: Sql, brandKey?: string) {
  const cfg = getClientConfig(brandKey);

  const settings: Record<string, unknown> = {
    'app.timezone': cfg.timezone,
    'brand': cfg.brand,
    'municipalities': cfg.municipalities,
    'tweets.slots': cfg.tweetSlots,
    'tweets.per_day': cfg.tweetsPerDay,
    'tweets.low_stock_days': cfg.tweetLowStockDays,
    'security.mfa_roles': cfg.mfaRoles,
    'publishing.enabled': false,
    'upload.max_mb': cfg.uploadMaxMb,
    'publishing.default_collaborators': cfg.defaultCollaborators,
  };
  for (const [key, value] of Object.entries(settings)) {
    await sql.query(
      `insert into public.app_settings (key, value) values ($1, $2::text::jsonb) on conflict (key) do nothing`,
      [key, JSON.stringify(value)],
    );
  }

  const kinds = cfg.categories as Record<string, CategorySeed[]>;
  for (const [kind, groups] of Object.entries(kinds)) {
    for (const [i, g] of groups.entries()) {
      const parent = await upsertCategory(sql, kind, null, g.name, g.emoji, i);
      for (const [j, c] of g.children.entries()) {
        await upsertCategory(sql, kind, parent, c.name, c.emoji, j);
      }
    }
  }

  for (const [i, f] of cfg.copyFormulas.entries()) {
    await sql.query(
      `insert into public.copy_formulas (code, name, description, steps, sort)
       values ($1, $2, $3, $4::text::jsonb, $5) on conflict (code) do nothing`,
      [f.code, f.name, f.description, JSON.stringify(f.steps), i],
    );
  }

  for (const s of networkSpecsSeed) {
    await sql.query(
      `insert into public.network_specs (network, label, formats, copy_max_chars, length_group, notes, source_url)
       values ($1, $2, $3::text::jsonb, $4, $5, $6, $7) on conflict (network) do nothing`,
      [s.network, s.label, JSON.stringify(s.formats), s.copy_max_chars, s.length_group, s.notes, s.source_url],
    );
  }
}

async function upsertCategory(sql: Sql, kind: string, parent: string | null, name: string, emoji: string | null, sort: number) {
  const existing = await sql.one<{ id: string }>(
    `select id from public.categories where kind = $1 and parent_id is not distinct from $2 and name = $3`,
    [kind, parent, name],
  );
  if (existing) return existing.id;
  const row = await sql.one<{ id: string }>(
    `insert into public.categories (kind, parent_id, name, emoji, sort) values ($1, $2, $3, $4, $5) returning id`,
    [kind, parent, name, emoji, sort],
  );
  return row!.id;
}
