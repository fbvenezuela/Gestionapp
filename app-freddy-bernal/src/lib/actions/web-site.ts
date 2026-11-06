'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { refreshRedirects } from './web-core';
import type { Sql } from '../db';
import { revalidateWebSettings } from '../web/revalidate';
import { normalizeOldPath, safeTarget, REDIRECT_STATUSES } from '../web/redirects';
import { SITE_SETTING_SCHEMAS } from '../web/site-settings';
import { redirectableFrom } from '../web/cms/paths';
import { spanishIssue } from '../web/cms/drafts';

// The library's words, the site's settings and the redirects of old addresses (design §3, §6): AS THE PERSON, with RLS
// deciding (the library: editors, the publisher and the boss; settings and redirects: Administración, the publisher
// and the boss). A setting is live when saved (it is configuration, not an article): the public pages that show it are
// refreshed at once. Every change is in the audit log (the tables' audit triggers).

const uuid = z.string().uuid();

// --- The media library ---------------------------------------------------------------------------------------------
const ALT_TEXT = 'Falta el texto alternativo: describe en pocas palabras lo que se ve (lo leen los lectores de pantalla).';

const mediaInput = z.object({
  id: uuid,
  alt: z.string().trim().max(300, 'El texto alternativo va hasta 300 letras.'),
  caption: z.string().trim().max(500, 'El pie de foto va hasta 500 letras.'),
  credit: z.string().trim().max(200, 'El crédito va hasta 200 letras.'),
  title: z.string().trim().max(200, 'El título va hasta 200 letras.'),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
});

async function canEdit(sql: Sql) {
  const r = await sql.one<{ ok: boolean }>(`select public.can_edit_web() as ok`);
  if (!r?.ok) throw new UserError('La biblioteca la cambian quienes editan la web, con doble factor.');
}

/** The words around a file (alternative text, caption, credit, title) and its focal point; the file itself never changes. */
export async function updateWebMedia(raw: unknown): Promise<Result> {
  return act(mediaInput, raw, async (sql, i) => {
    await canEdit(sql);
    const m = await sql.one<{ kind: string }>(`select kind from public.web_media where id = $1`, [i.id]);
    if (!m) throw new UserError('No encontramos ese archivo.');
    if (m.kind === 'image' && i.alt.length < 3) throw new UserError(ALT_TEXT);
    if (m.kind === 'document' && i.title.length < 3) throw new UserError('Escribe el título del documento.');
    await sql.query(
      `update public.web_media set alt = $2, caption = $3, credit = $4, title = $5, focal_x = round($6::numeric, 3), focal_y = round($7::numeric, 3) where id = $1`,
      [i.id, i.alt, i.caption, i.credit, i.title, i.focalX, i.focalY],
    );
  });
}

/** «Archivar» a file: it leaves the picker; pages already published keep their frozen copy. */
export async function archiveWebMedia(raw: unknown): Promise<Result> {
  return act(z.object({ id: uuid, archived: z.boolean() }), raw, async (sql, i) => {
    await canEdit(sql);
    const r = await sql.one(`update public.web_media set archived_at = case when $2 then coalesce(archived_at, now()) else null end where id = $1 returning id`, [i.id, i.archived]);
    if (!r) throw new UserError('No encontramos ese archivo.');
  });
}

// --- The site's settings -----------------------------------------------------------------------------------------
// The keys the settings screen edits. The channels keep their internal note (who verified what) next to the address.
const note = { note: z.string().trim().max(300).optional() };
const channelWithNote = (SITE_SETTING_SCHEMAS['site.whatsapp_channel'].unwrap() as z.ZodObject).extend(note).nullable();
const SETTINGS = {
  ...SITE_SETTING_SCHEMAS,
  'site.whatsapp_channel': channelWithNote,
  'site.institutional_portal': channelWithNote,
  'site.youtube_channel': channelWithNote,
} as const;
const SETTING_KEYS = Object.keys(SETTINGS) as [keyof typeof SETTINGS, ...(keyof typeof SETTINGS)[]];

const SETTING_PROBLEM: Partial<Record<string, string>> = {
  'site.navigation': 'Revisa la navegación: cada enlace lleva su nombre y una dirección de esta web que empieza con /.',
  'site.footer': 'Revisa el pie de página.',
  'site.contacts': 'Revisa los contactos: cada uno lleva su nombre y su dato.',
  'site.social_accounts': 'Revisa las cuentas: cada una lleva su red, su usuario y un enlace que empieza con https://.',
};

/** One setting of the site, checked with its shape and live at once (the public pages that show it are refreshed). */
export async function saveSiteSetting(raw: unknown): Promise<Result> {
  const r = await act(z.object({ key: z.enum(SETTING_KEYS), value: z.unknown() }), raw, async (sql, i) => {
    const ok = await sql.one<{ ok: boolean }>(`select public.can_manage_site() as ok`);
    if (!ok?.ok) throw new UserError('Los ajustes del sitio los cambian administración, quien aprueba la web o el jefe, con doble factor.');
    const v = (SETTINGS[i.key] as z.ZodType).safeParse(i.value, { error: spanishIssue });
    if (!v.success) throw new UserError(SETTING_PROBLEM[i.key] ?? v.error.issues[0]?.message ?? 'Revisa los datos.');
    await sql.query(
      `insert into public.web_settings (key, value, is_public) values ($1, $2::text::jsonb, true)
       on conflict (key) do update set value = excluded.value`,
      [i.key, JSON.stringify(v.data)],
    );
  });
  if (r.ok) revalidateWebSettings();
  return r;
}

// --- Redirects of old addresses ------------------------------------------------------------------------------------
const redirectInput = z.object({
  id: uuid.optional(),
  from: z.string().trim().max(500),
  to: z.string().trim().max(500),
  status: z.number().int().refine((n) => (REDIRECT_STATUSES as readonly number[]).includes(n), 'El tipo de redirección es 301, 302, 307 o 308.').default(301),
});

/** A redirect (old address → address of this site): new, or a new destination for one that exists. */
export async function saveRedirect(raw: unknown): Promise<Result> {
  const r = await act(redirectInput, raw, async (sql, i) => {
    const to = safeTarget(i.to);
    if (!to) throw new UserError('El destino es una dirección de esta web: empieza con / y no lleva espacios.');
    if (i.id) {
      const row = await sql.one<{ from_path: string }>(`select from_path from public.web_redirects where id = $1`, [i.id]);
      if (!row) throw new UserError('No encontramos esa redirección.');
      if (row.from_path === to) throw new UserError('El destino es la misma dirección vieja.');
      const upd = await sql.one(`update public.web_redirects set to_path = $2, status_code = $3 where id = $1 returning id`, [i.id, to, i.status]);
      if (!upd) throw new UserError('No tienes permiso para cambiar redirecciones.');
      return;
    }
    const from = normalizeOldPath(i.from);
    if (!from) throw new UserError('La dirección vieja empieza con / y no lleva espacios (por ejemplo /2024/05/una-nota).');
    if (from === to) throw new UserError('El destino es la misma dirección vieja.');
    if (!redirectableFrom(from)) throw new UserError('Esa dirección es de una página que existe en la web: la redirección nunca se usaría.');
    const dup = await sql.one(`select 1 from public.web_redirects where from_path = $1`, [from]);
    if (dup) throw new UserError('Ya hay una redirección desde esa dirección: cambia su destino en la lista.');
    await sql.query(`insert into public.web_redirects (from_path, to_path, status_code) values ($1, $2, $3)`, [from, to, i.status]);
  });
  if (r.ok) refreshRedirects();
  return r;
}

export async function deleteRedirect(raw: unknown): Promise<Result> {
  const r = await act(z.object({ id: uuid }), raw, async (sql, i) => {
    const row = await sql.one(`delete from public.web_redirects where id = $1 returning id`, [i.id]);
    if (!row) throw new UserError('No encontramos esa redirección, o no tienes permiso para quitarla.');
  });
  if (r.ok) refreshRedirects();
  return r;
}
