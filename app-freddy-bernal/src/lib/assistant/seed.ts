import type { Sql } from '../db/core';
import { FACTORY_KNOWLEDGE, FACTORY_SCRIPTS } from './config';

// Loads the guide fichas and the factory scripts from config/assistant with «no pisar»:
//  - an untouched factory row is updated to the latest text in config;
//  - a row the team edited (origin 'equipo') is never touched, nor is `active` (the team's
//    on/off decision) or `times_used`;
//  - a factory row that no longer exists in config is switched off, never deleted.
// Called by seedClient. Idempotent.
export async function seedAssistant(sql: Sql) {
  const kKeys: string[] = [];
  for (const k of FACTORY_KNOWLEDGE) {
    const key = `guia:${k.key}`;
    kKeys.push(key);
    await sql.query(
      `insert into public.assistant_knowledge as a (key, roles, title, body, tags, origin)
       values ($1, $2::public.app_role[], $3, $4, $5::text[], 'plataforma')
       on conflict (key) do update set roles = excluded.roles, title = excluded.title, body = excluded.body, tags = excluded.tags
        where a.origin = 'plataforma'
          and (a.roles, a.title, a.body, a.tags) is distinct from (excluded.roles, excluded.title, excluded.body, excluded.tags)`,
      [key, k.roles ? `{${k.roles.join(',')}}` : null, k.title, k.body, `{${k.tags.map(arrayItem).join(',')}}`],
    );
  }
  await sql.query(
    `update public.assistant_knowledge set active = false where origin = 'plataforma' and key like 'guia:%' and active and not (key = any ($1::text[]))`,
    [`{${kKeys.map(arrayItem).join(',')}}`],
  );

  const sKeys: string[] = [];
  for (const s of FACTORY_SCRIPTS) {
    const key = `fabrica:${s.key}`;
    sKeys.push(key);
    await sql.query(
      `insert into public.assistant_scripts as a (key, roles, topic, triggers, script, notes, always, origin)
       values ($1, $2::public.app_role[], $3, $4::text[], $5, $6, $7, 'fabrica')
       on conflict (key) do update set roles = excluded.roles, topic = excluded.topic, triggers = excluded.triggers,
              script = excluded.script, notes = excluded.notes, always = excluded.always
        where a.origin = 'fabrica'
          and (a.roles, a.topic, a.triggers, a.script, a.notes, a.always)
              is distinct from (excluded.roles, excluded.topic, excluded.triggers, excluded.script, excluded.notes, excluded.always)`,
      [key, s.roles ? `{${s.roles.join(',')}}` : null, s.topic, `{${s.triggers.map(arrayItem).join(',')}}`, s.script, s.notes, s.always],
    );
  }
  await sql.query(
    `update public.assistant_scripts set active = false where origin = 'fabrica' and key like 'fabrica:%' and active and not (key = any ($1::text[]))`,
    [`{${sKeys.map(arrayItem).join(',')}}`],
  );
}

// One element of a Postgres array literal, quoted.
function arrayItem(s: string) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
