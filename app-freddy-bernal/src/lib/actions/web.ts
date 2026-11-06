'use server';

import { z } from 'zod';
import { act, UserError, type Result } from './run';
import { CONFLICT_TEXT, NOT_FOUND_TEXT, noticeDecision, noticeSubmitted, refreshPublic, refreshRedirects } from './web-core';
import { mediaList, type MediaInfo } from '../data/web-admin';
import type { Sql } from '../db';
import { TZ } from '../time';
import { itemPath } from '../web/routes';
import { SNAPSHOT, WEB_KINDS, slug as slugSchema, slugFromTitle, type WebKind } from '../web/schema';
import { draftProblems, emptyDraft, issueText, mediaIdsIn } from '../web/cms/drafts';
import { ALT_PLACEHOLDER_PREFIX } from '../web/import-marks';
import { localToUtc } from '../web/cms/schedule';

// The website's content (design §3, D-90, D-93): every write AS THE PERSON (act → withUser, RLS on) and the database
// decides who may do what — editors write drafts and send them to approval; only the web's publisher or the boss
// publish, schedule, return, archive and unarchive (publish_web_item & co., guard_web_item). The checks here only say
// it first and in plain words. After a change the public sees, its pages are refreshed (web-core.ts).

const uuid = z.string().uuid('Ese contenido no existe.');
const CREATABLE = WEB_KINDS.filter((k) => k !== 'page') as [Exclude<WebKind, 'page'>, ...Exclude<WebKind, 'page'>[]];
const MAX_DRAFT_CHARS = 500_000;

type ItemRow = {
  id: string; kind: WebKind; slug: string; status: string; rev: number; draft: Record<string, unknown>; draft_version: number;
  has_published: boolean; archived_at: Date | null; submitted_by: string | null;
};
const ITEM = `id, kind, slug, status, rev, draft, draft_version, published is not null as has_published, archived_at, submitted_by`;
type Ref = { id: string; kind: WebKind; slug: string; title: string; draftVersion: number };

/** The database's own gate for drafts (can_edit_web: the editor, the publisher and the boss, with 2FA), said in words
 * before RLS would quietly match nothing. */
async function mayEdit(sql: Sql): Promise<void> {
  const r = await sql.one<{ ok: boolean }>(`select public.can_edit_web() as ok`);
  if (!r?.ok) throw new UserError('Escriben la web el editor, quien aprueba la web y el jefe, con doble factor.');
}

async function load(sql: Sql, id: string, lock = false): Promise<ItemRow> {
  const it = await sql.one<ItemRow>(`select ${ITEM} from public.web_items where id = $1${lock ? ' for update' : ''}`, [id]);
  if (!it) throw new UserError(NOT_FOUND_TEXT);
  return it;
}

const refOf = (it: ItemRow): Ref => ({
  id: it.id,
  kind: it.kind,
  slug: it.slug,
  title: typeof it.draft.title === 'string' && it.draft.title.trim() ? it.draft.title.trim() : 'Sin título',
  draftVersion: it.draft_version,
});

// --- Create, save, send ------------------------------------------------------------------------------------------
const createInput = z.object({
  kind: z.enum(CREATABLE, { error: 'Elige qué quieres crear.' }),
  title: z.string().trim().min(1, 'Escribe el título.').max(160, 'El título va hasta 160 letras.'),
});

/** «Nuevo»: a draft with the kind's starting fields and a free address made from the title. */
export async function createWebItem(raw: unknown): Promise<Result<{ id: string }>> {
  return act(createInput, raw, async (sql, i) => {
    await mayEdit(sql);
    const base = slugFromTitle(i.title);
    const taken = new Set(
      (await sql.query<{ slug: string }>(`select slug from public.web_items where kind = $1 and (slug = $2 or slug like $2 || '-%')`, [i.kind, base])).map((r) => r.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 110)}-${n}`;
    const row = await sql.one<{ id: string }>(
      `insert into public.web_items (kind, slug, draft) values ($1, $2, $3::text::jsonb) returning id`,
      [i.kind, slug, JSON.stringify(emptyDraft(i.kind, i.title, { tz: TZ }))],
    );
    return { id: row!.id };
  });
}

const saveInput = z.object({
  id: uuid,
  rev: z.number().int().min(1),
  slug: slugSchema,
  draft: z.record(z.string(), z.unknown()),
  note: z.string().trim().max(300, 'La nota de la versión va hasta 300 letras.').optional(),
});

export type SaveResult = { rev: number; draftVersion: number; status: string; problems: string[]; redirected: string | null };

/** «Guardar borrador»: a new version of the draft (a half-done draft is saved too; it goes to approval only whole). The
 * address of something already published changes only with the publisher (and leaves a 301 from the old one). */
export async function saveWebDraft(raw: unknown): Promise<Result<SaveResult>> {
  const after: { moved?: { kind: WebKind; from: string; to: string } } = {};
  const r = await act(saveInput, raw, async (sql, i) => {
    await mayEdit(sql);
    const it = await load(sql, i.id, true);
    if (it.archived_at) throw new UserError('Está archivado: quien aprueba lo desarchiva antes de cambiarlo.');
    if (it.rev !== i.rev) throw new UserError(CONFLICT_TEXT);
    if (it.kind === 'page' && i.slug !== it.slug) throw new UserError('La dirección de una página de la web no se cambia.');
    if (JSON.stringify(i.draft).length > MAX_DRAFT_CHARS) throw new UserError('El borrador es demasiado grande: divide el texto o quita bloques.');
    const parsed = SNAPSHOT[it.kind].safeParse(i.draft);
    const draft = parsed.success ? (parsed.data as Record<string, unknown>) : i.draft;
    let redirect: { from: string; to: string } | null = null;
    if (i.slug !== it.slug) {
      const other = await sql.one(`select 1 from public.web_items where kind = $1 and slug = $2 and id <> $3`, [it.kind, i.slug, it.id]);
      if (other) throw new UserError('Ya hay otro contenido con esa dirección: cambia alguna palabra.');
      if (it.has_published) {
        const from = itemPath(it.kind, it.slug);
        const to = itemPath(it.kind, i.slug);
        if (from && to) redirect = { from, to };
      }
    }
    if (i.note) await sql.query(`select set_config('app.version_note', $1, true)`, [i.note]);
    const row = await sql.one<{ rev: number; draft_version: number; status: string }>(
      `update public.web_items set draft = $2::text::jsonb, slug = $3 where id = $1 and rev = $4 returning rev, draft_version, status`,
      [it.id, JSON.stringify(draft), i.slug, i.rev],
    );
    if (!row) throw new UserError(CONFLICT_TEXT);
    if (redirect) {
      // The old address answers 301 to the new one, and older addresses that pointed at it go straight there (no chains).
      await sql.query(`update public.web_redirects set to_path = $2 where to_path = $1`, [redirect.from, redirect.to]);
      await sql.query(
        `insert into public.web_redirects (from_path, to_path, status_code) values ($1, $2, 301)
         on conflict (from_path) do update set to_path = excluded.to_path, status_code = 301`,
        [redirect.from, redirect.to],
      );
      after.moved = { kind: it.kind, ...redirect };
    }
    return {
      rev: row.rev,
      draftVersion: row.draft_version,
      status: row.status,
      problems: draftProblems(it.kind, draft).map(issueText),
      redirected: redirect ? redirect.from : null,
    };
  });
  if (r.ok && after.moved) {
    const { kind, from, to } = after.moved;
    refreshPublic(kind, from.split('/').pop(), to.split('/').pop());
    refreshRedirects();
  }
  return r;
}

async function archivedMediaIn(sql: Sql, draft: unknown): Promise<number> {
  const ids = mediaIdsIn(draft);
  if (!ids.length) return 0;
  return (await sql.one<{ n: number }>(`select count(*)::int as n from public.web_media where id = any ($1::uuid[]) and archived_at is not null`, [ids]))!.n;
}

/** Photos the importer of the old site brought without alternative text (it wrote «[Por escribir] …»): the database
 * refuses to publish them (guard_web_item_ready); here it is said first, in words. */
async function placeholderAltIn(sql: Sql, draft: unknown): Promise<number> {
  const ids = mediaIdsIn(draft);
  if (!ids.length) return 0;
  return (await sql.one<{ n: number }>(
    `select count(*)::int as n from public.web_media where id = any ($1::uuid[]) and kind = 'image' and left(btrim(alt), $2) = $3`,
    [ids, ALT_PLACEHOLDER_PREFIX.length, ALT_PLACEHOLDER_PREFIX],
  ))!.n;
}
const placeholderText = (n: number, verb: string) =>
  `${n === 1 ? 'Una foto de este contenido no tiene' : `${n} fotos de este contenido no tienen`} su texto alternativo todavía (dice «${ALT_PLACEHOLDER_PREFIX}»): escríbelo en la biblioteca antes de ${verb}.`;

/** «Enviar a aprobación»: only a whole draft (the kind's schema and the site's rules), never with an archived photo. */
export async function submitWebItem(raw: unknown): Promise<Result<{ rev: number }>> {
  const after: { sent?: Ref; actor?: string } = {};
  const r = await act(z.object({ id: uuid }), raw, async (sql, i, s) => {
    await mayEdit(sql);
    const it = await load(sql, i.id, true);
    if (it.archived_at) throw new UserError('Está archivado: quien aprueba lo desarchiva antes de mandarlo.');
    if (it.status === 'in_review') return { rev: it.rev };
    const problems = draftProblems(it.kind, it.draft);
    if (problems.length) {
      throw new UserError(`Antes de enviarlo falta esto: ${issueText(problems[0])}${problems.length > 1 ? ` (y ${problems.length - 1} más)` : ''}`);
    }
    if (await archivedMediaIn(sql, it.draft)) throw new UserError('Una foto o un archivo de este contenido está archivado en la biblioteca: cámbialo antes de enviarlo.');
    const noAlt = await placeholderAltIn(sql, it.draft);
    if (noAlt) throw new UserError(placeholderText(noAlt, 'enviarlo'));
    const row = await sql.one<{ rev: number }>(`update public.web_items set status = 'in_review' where id = $1 returning rev`, [it.id]);
    after.sent = refOf(it);
    after.actor = s.userId;
    return { rev: row!.rev };
  });
  if (r.ok && after.sent) await noticeSubmitted(after.sent, after.actor!);
  return r;
}

/** «Retirar de revisión»: back to the draft, to keep working on it before the publisher looks. */
export async function withdrawWebItem(raw: unknown): Promise<Result<{ rev: number }>> {
  return act(z.object({ id: uuid }), raw, async (sql, i) => {
    await mayEdit(sql);
    const it = await load(sql, i.id, true);
    if (it.status !== 'in_review') throw new UserError('Ese contenido no está esperando aprobación.');
    const row = await sql.one<{ rev: number }>(`update public.web_items set status = 'draft' where id = $1 returning rev`, [it.id]);
    return { rev: row!.rev };
  });
}

// --- The publisher's decisions -------------------------------------------------------------------------------------
const publishInput = z.object({
  id: uuid,
  rev: z.number().int().min(1),
  at: z.object({ date: z.string().max(10), time: z.string().max(5) }).nullable().default(null),
});

export type PublishResult = { at: string; scheduled: boolean; path: string | null };

/** «Publicar ahora» or «Programar» (a day and an hour in the Táchira): exactly the draft that was reviewed (its rev). */
export async function publishWebItem(raw: unknown): Promise<Result<PublishResult>> {
  const after: { item?: Ref; to?: string | null; actor?: string; scheduled?: boolean } = {};
  const r = await act(publishInput, raw, async (sql, i, s) => {
    const it = await load(sql, i.id);
    if (it.rev !== i.rev) throw new UserError('El contenido cambió mientras lo revisabas. Ábrelo de nuevo para ver lo último.');
    const problems = draftProblems(it.kind, it.draft);
    if (problems.length) throw new UserError(`Todavía no se puede publicar: ${issueText(problems[0])}`);
    const noAlt = await placeholderAltIn(sql, it.draft);
    if (noAlt) throw new UserError(placeholderText(noAlt, 'publicarlo'));
    let at: string | null = null;
    if (i.at) {
      at = localToUtc(i.at, TZ);
      if (!at) throw new UserError('Esa fecha u hora no existe: revísala.');
      if (Date.parse(at) <= Date.now() + 60_000) throw new UserError('Elige una hora que todavía no haya pasado, o publica ahora.');
    }
    const row = await sql.one<{ at: Date }>(`select public.publish_web_item($1, $2, $3::timestamptz) as at`, [it.id, i.rev, at]);
    Object.assign(after, { item: refOf(it), to: it.submitted_by, actor: s.userId, scheduled: !!at });
    return { at: new Date(row!.at).toISOString(), scheduled: !!at, path: itemPath(it.kind, it.slug) };
  });
  if (r.ok && after.item) {
    refreshPublic(after.item.kind, after.item.slug);
    await noticeDecision(after.item, after.to ?? null, after.actor!, after.scheduled ? 'scheduled' : 'published');
  }
  return r;
}

/** «Devolver con comentario»: back to the editors with what to change. */
export async function returnWebItem(raw: unknown): Promise<Result> {
  const after: { item?: Ref; to?: string | null; actor?: string; note?: string } = {};
  const r = await act(
    z.object({ id: uuid, note: z.string().trim().min(3, 'Escribe qué hay que cambiar.').max(1000, 'El comentario va hasta 1000 letras.') }),
    raw,
    async (sql, i, s) => {
      const it = await load(sql, i.id);
      await sql.query(`select public.return_web_item($1, $2)`, [it.id, i.note]);
      Object.assign(after, { item: refOf(it), to: it.submitted_by, actor: s.userId, note: i.note });
    },
  );
  if (r.ok && after.item) await noticeDecision(after.item, after.to ?? null, after.actor!, 'returned', after.note);
  return r;
}

async function decide(fn: 'cancel_web_schedule' | 'archive_web_item' | 'unarchive_web_item', raw: unknown): Promise<Result> {
  const after: { item?: Ref } = {};
  const r = await act(z.object({ id: uuid }), raw, async (sql, i) => {
    const it = await load(sql, i.id);
    await sql.query(`select public.${fn}($1)`, [it.id]);
    after.item = refOf(it);
  });
  if (r.ok && after.item) refreshPublic(after.item.kind, after.item.slug);
  return r;
}

/** «Quitar la programación»: nothing reaches the public; the item goes back to its draft. */
export async function cancelWebSchedule(raw: unknown): Promise<Result> {
  return decide('cancel_web_schedule', raw);
}

/** «Archivar»: out of the public site at once (its pages are refreshed now); the history stays. */
export async function archiveWebItem(raw: unknown): Promise<Result> {
  return decide('archive_web_item', raw);
}

/** «Desarchivar»: the approved snapshot it had comes back as it was. */
export async function unarchiveWebItem(raw: unknown): Promise<Result> {
  return decide('unarchive_web_item', raw);
}

/** «Volver a esta versión»: copied into the draft (a new version); publishing it again needs approval. */
export async function restoreWebVersion(raw: unknown): Promise<Result<{ draftVersion: number }>> {
  return act(z.object({ id: uuid, version: z.number().int().min(1) }), raw, async (sql, i) => {
    const row = await sql.one<{ v: number }>(`select public.restore_web_version($1, $2) as v`, [i.id, i.version]);
    return { draftVersion: row!.v };
  });
}

// --- The library's picker ----------------------------------------------------------------------------------------
/** The photos (or PDFs) a form may choose, newest first, by words of their texts. Read as the person. */
export async function pickWebMedia(raw: unknown): Promise<Result<MediaInfo[]>> {
  return act(
    z.object({ kind: z.enum(['image', 'document']), q: z.string().trim().max(80).optional() }),
    raw,
    async (sql, i) => (await mediaList(sql, { kind: i.kind, q: i.q, limit: 60 })).rows,
  );
}
