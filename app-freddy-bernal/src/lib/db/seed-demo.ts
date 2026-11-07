import { DateTime } from 'luxon';
import type { Sql } from './core';
import type { SeedCtx } from './seed-parts/context';
import { seedChat } from './seed-parts/chat';
import { seedCore } from './seed-parts/core';
import { seedFichaPhotos, seedFichas } from './seed-parts/fichas';
import { seedHandoff } from './seed-parts/handoff';
import { seedOffice } from './seed-parts/office';
import { seedRedes } from './seed-parts/redes';
import { seedThumbs } from './seed-parts/thumbs';
import { seedWebContent, seedWebPeople } from './seed-parts/web';
import { WEB_DEMO_USERS } from './seed-parts/web-people';

// INVENTED demonstration data. No real people, phones, addresses or cases.
// Emails use the reserved `.test` domain, so nothing can ever be delivered to them.
// Never run against production. The six team roles plus Administración (27/10/2026); the parts of the seed
// are in ./seed-parts.

const TEAM_DEMO_USERS = [
  { id: '00000000-0000-4000-8000-000000000001', key: 'admin', email: 'admin@demo.test', name: 'Carla Méndez', roles: ['admin'], label: 'Administración' },
  { id: '00000000-0000-4000-8000-000000000002', key: 'boss', email: 'jefe@demo.test', name: 'Jefe (demo)', roles: ['boss'], label: 'El jefe' },
  { id: '00000000-0000-4000-8000-000000000003', key: 'dispatch', email: 'despacho@demo.test', name: 'Rubén Contreras', roles: ['dispatch'], label: 'Director de despacho' },
  { id: '00000000-0000-4000-8000-000000000010', key: 'politics', email: 'politica@demo.test', name: 'Elio Rondón', roles: ['politics'], label: 'Director de política' },
  { id: '00000000-0000-4000-8000-000000000011', key: 'ivt', email: 'ivt@demo.test', name: 'Fabián Useche', roles: ['ivt'], label: 'Director del IVT' },
  { id: '00000000-0000-4000-8000-000000000004', key: 'social', email: 'redes@demo.test', name: 'Daniela Pernía', roles: ['social'], label: 'Redes' },
  { id: '00000000-0000-4000-8000-000000000005', key: 'social2', email: 'redes2@demo.test', name: 'Yorman Chacón', roles: ['social'], label: 'Redes' },
  { id: '00000000-0000-4000-8000-000000000007', key: 'camera', email: 'grabacion@demo.test', name: 'Kevin Sánchez', roles: ['camera'], label: 'Grabación' },
  { id: '00000000-0000-4000-8000-000000000008', key: 'camera2', email: 'grabacion2@demo.test', name: 'Mariela Ostos', roles: ['camera'], label: 'Grabación' },
] as const;

// «Entrar como…» lists them all: the team first.
export const DEMO_USERS = [...TEAM_DEMO_USERS, ...WEB_DEMO_USERS] as const;

export type DemoUserKey = (typeof DEMO_USERS)[number]['key'];
export { WEB_DEMO_USERS };

/**
 * The demo's invented data. `webContent`: also the public website's content and the ~60 citizen requests
 * (seed-parts/web.ts), what the demo server shows; the RLS tests start without them. With the official site's real
 * content (src/lib/web/real-site.ts, seeded afterwards by seed-parts/web-real.ts) the demo server passes
 * `inventedWebItems: false` (no invented news, projects, episodes…) and `publicAttended: false` (no invented case on
 * the public pages); the invented citizen requests stay for the attention desk.
 */
export async function seedDemo(
  sql: Sql,
  tz = 'America/Caracas',
  opts: { webContent?: boolean; inventedWebItems?: boolean; publicAttended?: boolean } = {},
): Promise<Record<DemoUserKey, string>> {
  const ids = {} as Record<DemoUserKey, string>;
  for (const u of TEAM_DEMO_USERS) {
    await sql.query(`insert into public.invitations (email, full_name, roles) values ($1, $2, $3::public.app_role[])`, [
      u.email,
      u.name,
      `{${u.roles.join(',')}}`,
    ]);
    // Fixed ids so a demo session stays valid across server instances.
    const r = await sql.one<{ id: string }>(`insert into auth.users (id, email) values ($1, $2) returning id`, [u.id, u.email]);
    ids[u.key] = r!.id;
  }
  await sql.query(`update public.invitations set invited_by = $1`, [ids.admin]);

  const cat = async (name: string) =>
    (await sql.one<{ id: string }>(`select id from public.categories where name = $1 and parent_id is not null limit 1`, [name]))?.id ?? null;

  const today = DateTime.now().setZone(tz).startOf('day');
  const at = (dayOffset: number, hour: number, minute = 0) =>
    today.plus({ days: dayOffset }).set({ hour, minute }).toUTC().toISO();

  const ctx: SeedCtx = { sql, tz, ids, today, at, cat, eventIds: [], pieceIds: {} };
  // In this order, always: a new part goes at the end (stable demo ids, src/lib/db/stable-ids.ts).
  await seedCore(ctx);
  await seedFichas(ctx);
  await seedHandoff(ctx);
  await seedThumbs(ctx);
  await seedFichaPhotos(ctx);
  await seedChat(ctx);
  await seedRedes(ctx);
  await seedOffice(ctx);
  await seedWebPeople(ctx);
  if (opts.webContent) await seedWebContent(ctx, { inventedWebItems: opts.inventedWebItems, publicAttended: opts.publicAttended });

  return ids;
}
