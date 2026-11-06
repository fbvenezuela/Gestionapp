import type { Sql } from './core';
import { getClientConfig, networkSpecsSeed, type CategorySeed, type ClientConfig } from '../client-config';
import { seedAssistant } from '../assistant/seed';

// Upserts the client configuration (categories, formulas, settings, network rules, the first content month, and the
// public website's territories, attention catalogues, site settings and skeleton pages).
// Safe to run on production: it is configuration, not test data. Idempotent.
export async function seedClient(sql: Sql, brandKey?: string) {
  const cfg = getClientConfig(brandKey);
  // The assistant's automatic fichas refresh on every change to settings, categories,
  // formulas and network rules; while loading, hold that and refresh once at the end.
  await sql.query(`select set_config('app.assistant_skip_refresh', 'on', true)`);

  const settings: Record<string, unknown> = {
    'app.timezone': cfg.timezone,
    'brand': cfg.brand,
    'municipalities': cfg.municipalities,
    'parishes': parishesSetting(cfg.parishes),
    'tweets.slots': cfg.tweetSlots,
    'tweets.per_day': cfg.tweetsPerDay,
    'tweets.low_stock_days': cfg.tweetLowStockDays,
    'review.deadlines_min': cfg.reviewDeadlinesMin,
    'security.mfa_roles': cfg.mfaRoles,
    'publishing.enabled': false,
    'upload.max_mb': cfg.uploadMaxMb,
    'publishing.default_collaborators': cfg.defaultCollaborators,
    'publishing.windows': cfg.publishingWindows,
    // Redes por formato (D-68): the monthly quota and the content pillars, changed in Ajustes → Cupo y pilares.
    'redes.quotas': cfg.redes.quotas,
    'redes.pillars': cfg.redes.pillars,
    // Citizen participation (D-92): the public functions' limits and the due date by priority.
    'participation.rate_limits': cfg.participation.rateLimits,
    'participation.due_days_by_priority': cfg.participation.dueDaysByPriority,
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
    // A network that was already there gets the formats added since (stories and carousels, D-73), and only those it
    // lacks: what administración edited in Ajustes → Reglas por red stays as it is.
    await sql.query(
      `update public.network_specs n
          set formats = (select jsonb_object_agg(e.key, e.value) from jsonb_each($2::text::jsonb) e
                          where e.key = any ($3::text[]) and not n.formats ? e.key) || n.formats
        where n.network = $1
          and exists (select 1 from jsonb_each($2::text::jsonb) e where e.key = any ($3::text[]) and not n.formats ? e.key)`,
      [s.network, JSON.stringify(s.formats), [...ADDED_FORMATS]],
    );
  }

  // Redes por formato (D-67, D-76): one live content month at least («Mes 1» on a database that has none), and every
  // live piece in a live month (the pieces made before the months existed go to the first one). As the system.
  await sql.query(
    `insert into public.content_months (label, ordinal)
     select 'Mes 1', coalesce((select max(ordinal) from public.content_months), 0) + 1
      where not exists (select 1 from public.content_months where deleted_at is null)`,
  );
  await sql.query(
    `update public.pieces set content_month_id = (select id from public.content_months where deleted_at is null order by ordinal limit 1)
      where content_month_id is null and deleted_at is null`,
  );

  await seedWebPublica(sql, cfg);

  // Assistant: guide fichas and factory scripts (config/assistant), «no pisar».
  await seedAssistant(sql);
  await sql.query(`select set_config('app.assistant_skip_refresh', '', true)`);
  // Own error handler, like the triggers: the assistant failing to catch up never blocks the seed.
  await sql.query(`do $$ begin perform public.assistant_refresh(); exception when others then raise warning 'El asistente no pudo ponerse al día: %', sqlerrm; end $$`);
}

// Formats added to the network rules after the first seed (R4, 29/10/2026): seedClient adds them to a network that
// lacks them, without touching the rest of its rules.
export const ADDED_FORMATS = ['story', 'carousel'] as const;

// {"<municipality>": ["<parish>", …]} without the notes for people ("$source"…), which stay in the config file.
// Empty until the official list arrives; meanwhile the parish is free text (check_territory, 20261027001700_fichas.sql).
export function parishesSetting(map: Record<string, unknown>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(map).filter((e): e is [string, string[]] => !e[0].startsWith('$') && Array.isArray(e[1]) && e[1].every((x) => typeof x === 'string')),
  );
}

// Web pública (D-90 to D-96): the territories (the config's municipalities; parishes only when the official list is
// there, D-35), the attention desk's areas and categories, the site's settings and the skeleton pages. The pages go in
// as DRAFTS: they reach the public only when the publisher (or the boss) publishes them. «No pisar»: what the team
// changed stays as it is.
async function seedWebPublica(sql: Sql, cfg: ClientConfig) {
  for (const [i, name] of cfg.municipalities.entries()) {
    await sql.query(`insert into public.territories (kind, name, slug, sort) values ('municipality', $1, $2, $3) on conflict do nothing`, [
      name,
      slugify(name),
      i,
    ]);
  }
  for (const [municipality, parishes] of Object.entries(parishesSetting(cfg.parishes))) {
    const parent = await sql.one<{ id: string }>(`select id from public.territories where kind = 'municipality' and name = $1`, [municipality]);
    if (!parent) continue;
    for (const [i, name] of parishes.entries()) {
      await sql.query(
        `insert into public.territories (kind, parent_id, name, slug, sort) values ('parish', $1, $2, $3, $4) on conflict do nothing`,
        [parent.id, name, slugify(name), i],
      );
    }
  }

  for (const a of cfg.participation.areas) {
    await sql.query(`insert into public.areas (slug, name, description) values ($1, $2, $3) on conflict do nothing`, [a.slug, a.name, a.description]);
  }
  for (const [i, c] of cfg.participation.categories.entries()) {
    await sql.query(
      `insert into public.request_categories (slug, name, description, default_area_id, default_due_days, sort)
       values ($1, $2, $3, (select id from public.areas where slug = $4), $5, $6) on conflict do nothing`,
      [c.slug, c.name, c.description, c.area, c.dueDays, i],
    );
  }

  const b = cfg.brand;
  const settings: Record<string, unknown> = {
    ...cfg.web.settings,
    'site.identity': { name: b.clientName, title: b.clientTitle, region: b.region, greeting: b.greeting, wordmark: `${b.clientName} · ${b.clientTitle}` },
    // JSON-LD Person / GovernmentOrganization: sameAs comes from the verified accounts; the job title and the organization's
    // name start from the config (web.structuredData) and the team confirms them in the administrator.
    'site.structured_data': { personName: b.clientName, jobTitle: cfg.web.structuredData.jobTitle, organizationName: cfg.web.structuredData.organizationName },
  };
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('$')) continue;
    await sql.query(`insert into public.web_settings (key, value) values ($1, $2::text::jsonb) on conflict (key) do nothing`, [key, JSON.stringify(value)]);
  }

  for (const page of cfg.web.pages) {
    await sql.query(`insert into public.web_items (kind, slug, draft) values ('page', $1, $2::text::jsonb) on conflict (kind, slug) do nothing`, [
      page.slug,
      JSON.stringify(page.draft),
    ]);
  }

  // The old site's addresses whose destination the diagnosis already decided (docs/diagnostico.md §5); the importer adds
  // the rest. Never over what the team changed by hand.
  for (const r of cfg.web.redirects.items) {
    await sql.query(`insert into public.web_redirects (from_path, to_path, source) values ($1, $2, 'manual') on conflict (from_path) do nothing`, [r.from, r.to]);
  }
}

// «San Cristóbal» → «san-cristobal» (territories' slugs, used in the public site's addresses and filters).
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
