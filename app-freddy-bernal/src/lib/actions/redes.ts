'use server';

import { z } from 'zod';
import { act, actOutside, UserError, type Result } from './run';
import { notify, usersWithRole } from '../notify';
import { notifyReviewers } from './review-notify';
import { env } from '../env';
import type { Sql } from '../db/core';
import type { Level } from '../domain/review';
import type { Session } from '../auth/session';
import { phonesIn } from '../domain/phones';
import { hasConcreteDateTime, knowsAgenda } from '../domain/chat';
import { FORMAT, FORMATS, MONTH_COOKIE, NOTICE_KINDS, STICKERS, nextMonthLabel, sectionHref, type Format } from '../domain/redes';
import { getCard, getRedesSettings } from '../data/redes';

// Redes por formato (R4, D-60 to D-78): the actions of the sections, the cards, the months and the feed. Every one
// runs AS THE PERSON (act: zod + RLS + Spanish messages); the database decides who may (redes_formatos.sql) and this
// only says it first and in plain words. Month, feed place and order are set by people, never from an event's date
// (D-75). What goes out of an approved piece (copies, a reel's or YouTube's title, a story's on-screen text and
// sticker, a new notice) sends it back to the boss in the database; here the boss is told.

const uuid = z.string().uuid();
const REDES = ['/redes', '/piezas'];
const REVIEW = ['/redes', '/piezas', '/aprobar', '/jefe', '/hoy'];

const withMessage = <T extends { message?: string }>(r: Result<T>): Result<T> => (r.ok ? { ...r, message: r.data?.message } : r);

// ---------------------------------------------------------------------------------------------------------------
// Texts Redes reads (D-75): never a phone; from someone who knows the agenda, never a concrete date or time. The
// database refuses the same; this answers first, with the same words.
// ---------------------------------------------------------------------------------------------------------------
const PHONE = 'No se guardó: tiene algo que parece un teléfono, y Redes lo lee. Si es una cifra, escríbela con puntos: 1.500.000.';
const AGENDA = {
  title: 'Redes lee el título: escríbelo sin fecha ni hora.',
  month: 'Todo Redes lee el nombre del mes: sin fecha ni hora («Mes 2», «Cierre de año»).',
  card: 'Redes lee esta tarjeta: escríbela sin fecha ni hora.',
  notice: 'Redes lee este aviso: escríbelo sin fecha ni hora.',
  note: 'Redes lee la nota: escríbela sin fecha ni hora.',
} as const;

function guardText(s: Session, texts: (string | null | undefined)[], which: keyof typeof AGENDA) {
  const all = texts.filter(Boolean).join(' ');
  if (!all) return;
  if (phonesIn(all).length) throw new UserError(PHONE);
  if (knowsAgenda(s.roles) && hasConcreteDateTime(all)) throw new UserError(AGENDA[which]);
}

/** The open month, per person (180 days). A page cannot write cookies while it opens (Next 16): the actions do. */
async function rememberMonth(monthId: string) {
  try {
    const { cookies } = await import('next/headers');
    (await cookies()).set(MONTH_COOKIE, monthId, {
      maxAge: 180 * 86400,
      sameSite: 'lax',
      path: '/',
      httpOnly: true,
      secure: env.appUrl.startsWith('https://'),
    });
  } catch {
    // Outside a request (a test): the address (?mes=) keeps the month anyway.
  }
}

async function firstMonthId(sql: Sql): Promise<string | null> {
  return (await sql.one<{ id: string }>(`select id from public.content_months where deleted_at is null order by ordinal limit 1`))?.id ?? null;
}

async function monthLabel(sql: Sql, id: string | null): Promise<string> {
  if (!id) return '';
  return (await sql.one<{ label: string }>(`select label from public.content_months where id = $1`, [id]))?.label ?? '';
}

type Reopen = { id: string; title: string; level: Level } | null;

/** The piece went back to the boss in this transaction (it was approved, now it is in review). */
async function reopenedSince(sql: Sql, pieceId: string, before: string | undefined): Promise<Reopen> {
  if (before !== 'approved') return null;
  const p = await sql.one<{ id: string; title: string; status: string; review_level: Level }>(`select id, title, status, review_level from public.pieces where id = $1`, [pieceId]);
  return p?.status === 'in_review' ? { id: p.id, title: p.title, level: p.review_level } : null;
}

async function pieceBefore(sql: Sql, pieceId: string) {
  const p = await sql.one<{ status: string; title: string; format: string; content_month_id: string | null }>(
    `select status, title, format, content_month_id from public.pieces where id = $1 and deleted_at is null`,
    [pieceId],
  );
  if (!p) throw new UserError('Pieza no encontrada.');
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Months (D-67)
// ---------------------------------------------------------------------------------------------------------------

/** «+ Nuevo mes»: after the last one, named «Mes N»; the database gives it its 24 feed places. It stays open. */
export async function createMonth(raw: unknown = {}) {
  return act(z.object({}).passthrough(), raw, async (sql) => {
    const max = (await sql.one<{ n: number }>(`select coalesce(max(ordinal), 0)::int as n from public.content_months where deleted_at is null`))!.n;
    const m = (await sql.one<{ id: string; label: string; ordinal: number }>(
      `insert into public.content_months (label, ordinal) values ($1, $2) returning id, label, ordinal`,
      [nextMonthLabel(max), max + 1],
    ))!;
    // The first month of an old database (before seed-client): the pieces with no month come to it.
    let moved = 0;
    if (max === 0) {
      moved = (await sql.query(`update public.pieces set content_month_id = $1 where content_month_id is null and deleted_at is null returning id`, [m.id])).length;
    }
    await rememberMonth(m.id);
    return { month: m, moved, message: 'Mes creado' };
  }, { revalidate: REDES }).then(withMessage);
}

export async function renameMonth(raw: unknown) {
  return act(z.object({ monthId: uuid, label: z.string().trim().min(1, 'Escribe el nombre del mes.').max(40, 'El nombre va hasta 40 letras.') }), raw, async (sql, i, s) => {
    guardText(s, [i.label], 'month');
    const r = await sql.one<{ id: string }>(`update public.content_months set label = $2 where id = $1 and deleted_at is null returning id`, [i.monthId, i.label]);
    if (!r) throw new UserError('Ese mes ya no está: recarga la página.');
    return { message: 'Nombre guardado' };
  }, { revalidate: REDES }).then(withMessage);
}

/** «Borrar este mes»: its pieces are never deleted; they go to the first month left and leave the feed. `expected`:
 * the number of pieces the person was told (the database refuses if it changed). */
export async function deleteMonth(raw: unknown) {
  return act(z.object({ monthId: uuid, expected: z.number().int().min(0) }), raw, async (sql, i) => {
    const n = (await sql.one<{ n: number }>(`select public.delete_content_month($1, $2) as n`, [i.monthId, i.expected]))!.n;
    const target = await firstMonthId(sql);
    const label = await monthLabel(sql, target);
    return { n, targetId: target, message: n ? `Mes borrado: ${n === 1 ? '1 pieza pasó' : `${n} piezas pasaron`} a «${label}»` : 'Mes borrado' };
  }, { revalidate: REDES }).then(withMessage);
}

/** A month tab was tapped: remember it for this person (the address already carries it). */
export async function chooseMonth(raw: unknown) {
  return actOutside(z.object({ monthId: uuid }), raw, async (i) => {
    await rememberMonth(i.monthId);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Cards: create, title, fields (D-61, D-70)
// ---------------------------------------------------------------------------------------------------------------

/** «+ Nuevo reel» (and «¿Qué quieres crear?»): a draft in the open month, on top of its section, with the format's
 * title, kind and level (a story goes green, A10). Answers with the card itself, so the section opens it without
 * going anywhere (the demo keeps it on this server, F3), and where it lives (`href`). */
export async function quickCreate(raw: unknown) {
  return act(
    z.object({ format: z.enum(FORMATS), monthId: uuid.nullable().default(null), title: z.string().trim().min(3, 'Escribe un título.').max(140).optional() }),
    raw,
    async (sql, i, s) => {
      const f = FORMAT[i.format];
      const title = i.title || f.defaultTitle;
      guardText(s, [title], 'title');
      const month = i.monthId ?? (await firstMonthId(sql));
      const r = (await sql.one<{ id: string }>(
        `insert into public.pieces (kind, format, title, review_level, content_month_id, sort_order)
         values ($1, $2, $3, $4, $5::uuid,
                 (select coalesce(min(sort_order), 0) - 1 from public.pieces
                   where format = $2 and deleted_at is null and content_month_id is not distinct from $5::uuid))
         returning id`,
        [f.kind, i.format, title, f.defaultLevel, month],
      ))!;
      const card = await getCard(sql, r.id);
      if (!card) throw new UserError('No se pudo crear la pieza.');
      return { card, href: sectionHref(f.slug, card.monthId, card.id), message: createdText(i.format) };
    },
    { revalidate: REDES },
  ).then(withMessage);
}

// «Reel creado», «Historia creada», «Pieza de fin de mes creada».
const createdText = (f: Format) => (f === 'story' ? 'Historia creada' : f === 'month_end' ? 'Pieza de fin de mes creada' : `${FORMAT[f].label} creado`);

export async function saveTitle(raw: unknown) {
  return act(z.object({ pieceId: uuid, title: z.string().trim().min(3, 'El título va de 3 a 140 letras.').max(140, 'El título va de 3 a 140 letras.') }), raw, async (sql, i, s) => {
    guardText(s, [i.title], 'title');
    const before = await pieceBefore(sql, i.pieceId);
    await sql.query(`update public.pieces set title = $2 where id = $1`, [i.pieceId, i.title]);
    // A reel's or a YouTube video's title goes out: changed after the approval, the database sent it back.
    const back = await reopenedSince(sql, i.pieceId, before.status);
    return { reopened: back, message: back ? 'Volvió al jefe' : undefined };
  }, { revalidate: REDES }).then(async (r) => {
    if (r.ok && r.data!.reopened) await notifyReviewers(r.data!.reopened.id, r.data!.reopened.title, r.data!.reopened.level, 'Cambió el título');
    return withMessage(r);
  });
}

const text = (max: number) => z.string().max(max, `Ese campo va hasta ${max} letras.`);
// The card's free fields (piece_details), with the database's limits. A story's on-screen text and sticker are what
// goes out (I1): changing them on an approved story sends it back to the boss (story_details_reopen_review).
const detailsPatch = z
  .object({
    art_overline: text(200), art_headline: text(200), art_seals: text(300), art_fine_print: text(600), visual_concept: text(2000),
    hook: text(300), cta: text(300), hashtags: text(500), publication_notes: text(2000), on_screen: text(500), follow_up: text(1000),
    sticker_text: text(300), idea: text(2000), links: text(2000),
    sticker_url: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'El enlace del sticker empieza con https://'),
    sticker: z.enum(Object.keys(STICKERS) as [string, ...string[]]).nullable(),
    post_ratio: z.enum(['4:5', '1:1']),
    reference_asset_id: uuid.nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'No hay nada que guardar.');

const shot = z.object({ says: text(1000).default(''), action: text(1000).default(''), on_screen: text(300).default('') }).strict();
const slide = z.object({ role: z.enum(['cover', 'body', 'summary', 'cta']).default('body'), title: text(120).default(''), text: text(1000).default('') }).strict();

const STALE = 'Otra persona cambió esta tarjeta. Recarga para ver lo último.';

/** Inserts the row (rev 0 = none yet) or updates it only if nobody changed it since (rev). JSON columns as text. */
async function writeDetails(sql: Sql, pieceId: string, rev: number, cols: Record<string, unknown>): Promise<number> {
  const keys = Object.keys(cols);
  const json = new Set(['shots', 'slides']);
  const val = (k: string) => (json.has(k) ? JSON.stringify(cols[k]) : cols[k]);
  const cast = (k: string, n: number) => (json.has(k) ? `$${n}::text::jsonb` : `$${n}`);
  if (rev === 0) {
    const r = await sql.one<{ rev: number }>(
      `insert into public.piece_details (piece_id${keys.map((k) => `, ${k}`).join('')})
       values ($1${keys.map((k, n) => `, ${cast(k, n + 2)}`).join('')})
       on conflict (piece_id) do nothing returning rev`,
      [pieceId, ...keys.map(val)],
    );
    if (!r) throw new UserError(STALE);
    return r.rev;
  }
  const r = await sql.one<{ rev: number }>(
    `update public.piece_details set ${keys.map((k, n) => `${k} = ${cast(k, n + 3)}`).join(', ')}
      where piece_id = $1 and rev = $2 returning rev`,
    [pieceId, rev, ...keys.map(val)],
  );
  if (!r) throw new UserError(STALE);
  return r.rev;
}

function detailsTexts(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && k !== 'sticker' && k !== 'post_ratio' && k !== 'reference_asset_id') out.push(v);
    if (Array.isArray(v)) for (const e of v) out.push(...Object.values(e as Record<string, string>));
  }
  return out;
}

async function saveDetailCols(sql: Sql, s: Session, pieceId: string, rev: number, cols: Record<string, unknown>) {
  guardText(s, detailsTexts(cols), 'card');
  const before = await pieceBefore(sql, pieceId);
  const next = await writeDetails(sql, pieceId, rev, cols);
  const back = await reopenedSince(sql, pieceId, before.status);
  return { rev: next, reopened: back, message: back ? 'Volvió al jefe' : undefined };
}

const afterDetails = async <T extends { reopened: Reopen; message?: string }>(r: Result<T>, why: string) => {
  if (r.ok && r.data!.reopened) await notifyReviewers(r.data!.reopened.id, r.data!.reopened.title, r.data!.reopened.level, why);
  return withMessage(r);
};

/** The card's fields, saved on their own (1,2 s after typing). Answers the new rev; a stale rev is refused. */
export async function saveDetails(raw: unknown) {
  return act(z.object({ pieceId: uuid, rev: z.number().int().min(0), patch: detailsPatch }), raw, (sql, i, s) => saveDetailCols(sql, s, i.pieceId, i.rev, i.patch), {
    revalidate: REDES,
  }).then((r) => afterDetails(r, 'Cambió el texto en pantalla o el sticker'));
}

export async function saveShots(raw: unknown) {
  return act(z.object({ pieceId: uuid, rev: z.number().int().min(0), shots: z.array(shot).max(60, 'Hasta 60 tomas.') }), raw, (sql, i, s) =>
    saveDetailCols(sql, s, i.pieceId, i.rev, { shots: i.shots }), { revalidate: REDES }).then((r) => afterDetails(r, ''));
}

export async function saveSlideTexts(raw: unknown) {
  return act(z.object({ pieceId: uuid, rev: z.number().int().min(0), slides: z.array(slide).max(20, 'Hasta 20 láminas.') }), raw, (sql, i, s) =>
    saveDetailCols(sql, s, i.pieceId, i.rev, { slides: i.slides }), { revalidate: REDES }).then((r) => afterDetails(r, ''));
}

/** «Traer del storyboard»: the event's blocks become shots after the ones there (copied: nothing is shared). */
export async function shotsFromStoryboard(raw: unknown) {
  return act(z.object({ pieceId: uuid }), raw, async (sql, i, s) => {
    const p = await sql.one<{ event_id: string | null }>(`select event_id from public.pieces where id = $1 and deleted_at is null`, [i.pieceId]);
    if (!p) throw new UserError('Pieza no encontrada.');
    if (!p.event_id) throw new UserError('Esta pieza no nació de un evento: no tiene storyboard.');
    const blocks = await sql.query<{ shot: string; angle: string; boss_line: string; broll: string }>(
      `select x.shot, x.angle, x.boss_line, x.broll from public.storyboard_blocks x join public.storyboards sb on sb.id = x.storyboard_id
        where sb.event_id = $1 and x.deleted_at is null order by x.position, x.created_at`,
      [p.event_id],
    );
    const brought = blocks
      .map((b) => ({ says: b.boss_line.slice(0, 1000), action: [b.shot, b.angle, b.broll].filter((x) => x.trim()).join(' · ').slice(0, 1000), on_screen: '' }))
      .filter((x) => x.says || x.action);
    if (!brought.length) throw new UserError('El storyboard del evento todavía no tiene tomas.');
    const d = await sql.one<{ rev: number; shots: unknown }>(`select rev, shots from public.piece_details where piece_id = $1`, [i.pieceId]);
    const had = Array.isArray(d?.shots) ? (d!.shots as unknown[]) : [];
    const shots = [...had, ...brought].slice(0, 60);
    const r = await saveDetailCols(sql, s, i.pieceId, d?.rev ?? 0, { shots });
    return { ...r, n: brought.length, message: 'Tomas traídas del storyboard' };
  }, { revalidate: REDES }).then((r) => afterDetails(r, ''));
}

// ---------------------------------------------------------------------------------------------------------------
// Marks that never approve anything: pillar, receptivity, design (D-64, D-65, D-68)
// ---------------------------------------------------------------------------------------------------------------

export async function setPillar(raw: unknown) {
  return act(z.object({ pieceId: uuid, pillar: z.string().max(40).nullable() }), raw, async (sql, i) => {
    if (i.pillar) {
      const { pillars } = await getRedesSettings(sql);
      if (!pillars.some((p) => p.key === i.pillar)) throw new UserError('Ese pilar ya no está: recarga la página.');
    }
    const r = await sql.one<{ id: string }>(`update public.pieces set pillar = $2 where id = $1 and deleted_at is null returning id`, [i.pieceId, i.pillar]);
    if (!r) throw new UserError('Pieza no encontrada.');
  }, { revalidate: REDES });
}

export async function setRating(raw: unknown) {
  return act(z.object({ pieceId: uuid, rating: z.number().int().min(1, 'De 1 a 10.').max(10, 'De 1 a 10.').nullable() }), raw, async (sql, i) => {
    const r = await sql.one<{ id: string }>(`update public.pieces set rating = $2 where id = $1 and deleted_at is null returning id`, [i.pieceId, i.rating]);
    if (!r) throw new UserError('Pieza no encontrada.');
  }, { revalidate: REDES });
}

/** «Diseño aprobado» / «Diseño desaprobado» (tapping the active one clears it) and its note. Redes and the boss.
 * Disapproving tells Redes (not whoever marked it). `askChanges`: the boss disapproved a piece he had approved; the
 * screen asks «¿Pedir cambios también?» and calls reviewPiece with the note. */
export async function setDesign(raw: unknown) {
  return act(
    z.object({ pieceId: uuid, status: z.enum(['approved', 'disapproved']).nullable(), note: z.string().trim().max(1000, 'La nota va hasta 1000 letras.').default('') }),
    raw,
    async (sql, i, s) => {
      guardText(s, [i.note], 'note');
      const before = await pieceBefore(sql, i.pieceId);
      await sql.query(`update public.pieces set design_status = $2, design_note = $3 where id = $1`, [i.pieceId, i.status, i.note]);
      const boss = !!(await sql.one<{ ok: boolean }>(`select public.can_approve() as ok`))?.ok;
      const askChanges = boss && i.status === 'disapproved' && before.status === 'approved';
      const message = i.status === 'disapproved' ? 'Diseño marcado como desaprobado' : i.status === 'approved' ? 'Diseño marcado como aprobado' : 'Marca de diseño quitada';
      return { askChanges, title: before.title, actor: s.userId, note: i.note, disapproved: i.status === 'disapproved', message };
    },
    { revalidate: REDES },
  ).then(async (r) => {
    if (r.ok && r.data!.disapproved) {
      const d = r.data!;
      await notify({
        userIds: (await usersWithRole('social')).filter((u) => u !== d.actor),
        kind: 'design_disapproved',
        title: 'Diseño desaprobado',
        body: `«${d.title}»${d.note ? `: ${d.note}` : ''}`,
        link: `/piezas/${(raw as { pieceId: string }).pieceId}`,
        key: `design:${(raw as { pieceId: string }).pieceId}:${Date.now()}`,
      });
    }
    return withMessage(r);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Compliance notices («Antes de publicar», D-66): Redes and the boss; resolved, never deleted
// ---------------------------------------------------------------------------------------------------------------

const noticeBody = z.string().trim().min(3, 'Escribe el aviso (de 3 a 500 letras).').max(500, 'El aviso va hasta 500 letras.');

async function tellBossNotice(pieceId: string, title: string, kind: string, actor: string) {
  await notify({
    userIds: (await usersWithRole('boss')).filter((u) => u !== actor),
    kind: 'compliance_notice',
    title: 'Aviso antes de publicar',
    body: `«${title}»: ${NOTICE_KINDS[kind] ?? 'Aviso'}`,
    link: `/piezas/${pieceId}`,
    key: `notice:${pieceId}:${Date.now()}`,
  });
}

export async function addNotice(raw: unknown) {
  return act(z.object({ pieceId: uuid, kind: z.enum(Object.keys(NOTICE_KINDS) as [string, ...string[]]), body: noticeBody }), raw, async (sql, i, s) => {
    guardText(s, [i.body], 'notice');
    const before = await pieceBefore(sql, i.pieceId);
    const n = (await sql.one<{ id: string }>(`insert into public.piece_notices (piece_id, kind, body) values ($1, $2, $3) returning id`, [i.pieceId, i.kind, i.body]))!;
    return { id: n.id, pieceId: i.pieceId, kind: i.kind, title: before.title, actor: s.userId, reopened: await reopenedSince(sql, i.pieceId, before.status), message: 'Aviso guardado' };
  }, { revalidate: REVIEW }).then(async (r) => {
    if (r.ok) {
      const d = r.data!;
      await tellBossNotice(d.pieceId, d.title, d.kind, d.actor);
      if (d.reopened) await notifyReviewers(d.reopened.id, d.reopened.title, d.reopened.level, 'Tiene un aviso nuevo');
    }
    return withMessage(r);
  });
}

export async function editNotice(raw: unknown) {
  return act(z.object({ noticeId: uuid, body: noticeBody }), raw, async (sql, i, s) => {
    guardText(s, [i.body], 'notice');
    const n = await sql.one<{ piece_id: string; kind: string; resolved_at: Date | null }>(`select piece_id, kind, resolved_at from public.piece_notices where id = $1`, [i.noticeId]);
    if (!n) throw new UserError('Ese aviso ya no está.');
    if (n.resolved_at) throw new UserError('Ese aviso ya está resuelto: pon otro si hace falta.');
    const before = await pieceBefore(sql, n.piece_id);
    await sql.query(`update public.piece_notices set body = $2 where id = $1`, [i.noticeId, i.body]);
    return { pieceId: n.piece_id, kind: n.kind, title: before.title, actor: s.userId, reopened: await reopenedSince(sql, n.piece_id, before.status), message: 'Aviso guardado' };
  }, { revalidate: REVIEW }).then(async (r) => {
    if (r.ok) {
      const d = r.data!;
      await tellBossNotice(d.pieceId, d.title, d.kind, d.actor);
      if (d.reopened) await notifyReviewers(d.reopened.id, d.reopened.title, d.reopened.level, 'Cambió un aviso');
    }
    return withMessage(r);
  });
}

/** «Resuelto»: a separate step from editing (the database never lets both happen at once). */
export async function resolveNotice(raw: unknown) {
  return act(z.object({ noticeId: uuid }), raw, async (sql, i) => {
    const r = await sql.one<{ id: string }>(`update public.piece_notices set resolved_at = now() where id = $1 and resolved_at is null returning id`, [i.noticeId]);
    if (!r) throw new UserError('Ese aviso ya estaba resuelto.');
    return { message: 'Resuelto' };
  }, { revalidate: REVIEW }).then(withMessage);
}

// ---------------------------------------------------------------------------------------------------------------
// Month, order, copy, delete, restore (D-67, D-70)
// ---------------------------------------------------------------------------------------------------------------

/** «Mover a otro mes»: its feed place goes with it to the first free number of that month, or it stays «Sin
 * programar» when that month's feed is full. */
export async function movePieceToMonth(raw: unknown) {
  return act(z.object({ pieceId: uuid, monthId: uuid }), raw, async (sql, i) => {
    const before = await pieceBefore(sql, i.pieceId);
    const label = await monthLabel(sql, i.monthId);
    const r = (await sql.one<{ r: { num: number | null; released: boolean } }>(`select public.move_piece_to_month($1, $2) as r`, [i.pieceId, i.monthId]))!.r;
    const first = await firstMonthId(sql);
    const already = (before.content_month_id ?? first) === i.monthId;
    const message = already
      ? `Ya está en ${label}`
      : r.released
        ? `Movida a ${label} · quedó sin espacio en el feed`
        : r.num
          ? `Movida a ${label} · en el feed pasó al #${r.num}`
          : `Movida a ${label}`;
    return { num: r.num, released: r.released, message };
  }, { revalidate: REDES }).then(withMessage);
}

/** «Subir» / «Bajar» in the card's menu: swaps places with its neighbour of the same month and format (the order «A
 * mano»). The section's order is written again from 0 so equal numbers never block a move. */
export async function reorderPiece(raw: unknown) {
  return act(z.object({ pieceId: uuid, dir: z.enum(['up', 'down']) }), raw, async (sql, i) => {
    const p = await pieceBefore(sql, i.pieceId);
    const first = await firstMonthId(sql);
    const month = p.content_month_id ?? first;
    const list = await sql.query<{ id: string; sort_order: number }>(
      `select id, sort_order from public.pieces
        where deleted_at is null and format = $1 and coalesce(content_month_id, $3::uuid) is not distinct from $2::uuid
        order by sort_order, created_at desc, id`,
      [p.format, month, first],
    );
    const at = list.findIndex((x) => x.id === i.pieceId);
    const to = i.dir === 'up' ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= list.length) return { moved: false, position: at + 1 };
    const ids = list.map((x) => x.id);
    [ids[at], ids[to]] = [ids[to], ids[at]];
    for (let n = 0; n < ids.length; n++) {
      if (list.find((x) => x.id === ids[n])!.sort_order !== n) await sql.query(`update public.pieces set sort_order = $2 where id = $1`, [ids[n], n]);
    }
    return { moved: true, position: to + 1 };
  }, { revalidate: REDES });
}

/** «Duplicar»: title « (copia)», month, pillar, fields, copies, the current files and slides (as version 1) and the
 * open notices; never the feed place, the design marks, the receptivity or the approval. Answers the copy's card. */
export async function duplicatePiece(raw: unknown) {
  return act(z.object({ pieceId: uuid }), raw, async (sql, i, s) => {
    const p = await sql.one<{
      kind: string; format: Format; title: string; event_id: string | null; category_id: string | null; content_month_id: string | null; pillar: string | null;
      review_level: Level; copy_voice: string; copy_closing: unknown; sort_order: number; current_version: number;
    }>(
      `select kind, format, title, event_id, category_id, content_month_id, pillar, review_level, copy_voice, copy_closing, sort_order, current_version
         from public.pieces where id = $1 and deleted_at is null`,
      [i.pieceId],
    );
    if (!p) throw new UserError('Pieza no encontrada.');
    const suffix = ' (copia)';
    const title = `${p.title.slice(0, 140 - suffix.length)}${suffix}`;
    const id = (await sql.one<{ id: string }>(
      `insert into public.pieces (kind, format, title, event_id, category_id, content_month_id, pillar, review_level, copy_voice, copy_closing, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb, $11) returning id`,
      [p.kind, p.format, title, p.event_id, p.category_id, p.content_month_id, p.pillar, p.review_level, p.copy_voice, p.copy_closing == null ? null : JSON.stringify(p.copy_closing), p.sort_order],
    ))!.id;
    await sql.query(
      `insert into public.piece_details (piece_id, art_overline, art_headline, art_seals, art_fine_print, visual_concept, hook, cta, hashtags,
                                         publication_notes, sticker, sticker_text, sticker_url, on_screen, follow_up, idea, links, post_ratio,
                                         reference_asset_id, shots, slides)
       select $2, art_overline, art_headline, art_seals, art_fine_print, visual_concept, hook, cta, hashtags, publication_notes, sticker,
              sticker_text, sticker_url, on_screen, follow_up, idea, links, post_ratio, reference_asset_id, shots, slides
         from public.piece_details where piece_id = $1`,
      [i.pieceId, id],
    );
    await sql.query(
      `insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by)
       select $2, formula_id, length_group, body, char_count, generated_by, auth.uid() from public.copies where piece_id = $1`,
      [i.pieceId, id],
    );
    if (p.current_version > 0) {
      await sql.query(
        `insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids, notes)
         select $2, 1, media_asset_id, cover_asset_id, slide_asset_ids, 'Copia de otra pieza'
           from public.piece_versions where piece_id = $1 and version = $3`,
        [i.pieceId, id, p.current_version],
      );
      await sql.query(`update public.pieces set current_version = 1 where id = $1`, [id]);
    }
    // Notices are Redes' and the boss's (administración copies the rest).
    if (s.roles.some((r) => r === 'social' || r === 'boss')) {
      await sql.query(
        `insert into public.piece_notices (piece_id, kind, body) select $2, kind, body from public.piece_notices
          where piece_id = $1 and resolved_at is null order by created_at`,
        [i.pieceId, id],
      );
    }
    const card = await getCard(sql, id);
    if (!card) throw new UserError('No se pudo duplicar la pieza.');
    return { card, href: sectionHref(FORMAT[card.format].slug, card.monthId, card.id), message: 'Duplicada' };
  }, { revalidate: REDES }).then(withMessage);
}

/** «Eliminar»: only the boss, with 2FA (remove_piece). It leaves its section and the feed; what was scheduled goes
 * back to draft. Administración can bring it back. */
export async function removePiece(raw: unknown) {
  return act(z.object({ pieceId: uuid }), raw, async (sql, i) => {
    const title = (await sql.one<{ t: string }>(`select public.remove_piece($1) as t`, [i.pieceId]))!.t;
    return { title, message: 'Pieza eliminada' };
  }, { revalidate: REVIEW }).then(withMessage);
}

/** «Recuperar» (Ajustes → Cupo y pilares → «Piezas eliminadas»): administración only. It goes back to its month (the
 * first one if its month is gone), without a feed place. */
export async function restorePiece(raw: unknown) {
  return act(z.object({ pieceId: uuid }), raw, async (sql, i, s) => {
    if (!s.roles.includes('admin')) throw new UserError('Recuperar una pieza es de administración.');
    const r = await sql.one<{ content_month_id: string | null }>(
      `update public.pieces set deleted_at = null where id = $1 and deleted_at is not null returning content_month_id`,
      [i.pieceId],
    );
    if (!r) throw new UserError('Esa pieza no está entre las eliminadas.');
    const label = await monthLabel(sql, r.content_month_id);
    return { monthId: r.content_month_id, message: label ? `Pieza recuperada en ${label}` : 'Pieza recuperada' };
  }, { revalidate: [...REVIEW, '/ajustes'] }).then(withMessage);
}

// ---------------------------------------------------------------------------------------------------------------
// Feed (D-69): the number is the real order of publication; one piece, one place
// ---------------------------------------------------------------------------------------------------------------

const place = z.number().int().min(1, 'El feed tiene 24 espacios.').max(24, 'El feed tiene 24 espacios.');

/** Puts a piece in place #num. The database locks the place before reading who was there, so the answer is the
 * truth even when someone filled it a moment before («· el #7 anterior quedó sin programar»). */
export async function feedPlace(raw: unknown) {
  return act(z.object({ monthId: uuid, num: place, pieceId: uuid, allowMove: z.boolean().default(false) }), raw, async (sql, i) => {
    const r = (await sql.one<{ r: { was: string | null; replaced: string | null; moved_from: string | null } }>(
      `select public.feed_place($1, $2::smallint, $3, $4) as r`,
      [i.monthId, i.num, i.pieceId, i.allowMove],
    ))!.r;
    const parts = [`Colocada en el #${i.num}`];
    if (r.moved_from) parts.push(`venía de ${r.moved_from}`);
    else if (r.was) parts.push(`antes en el ${r.was.replace(/^.* · /, '')}`);
    if (r.replaced) parts.push(`el #${i.num} anterior quedó sin programar`);
    return { num: i.num, replaced: r.replaced, movedFrom: r.moved_from, message: parts.join(' · ') };
  }, { revalidate: REDES }).then(withMessage);
}

/** «Publicar antes / después», «Cambiar de espacio», dragging: the piece goes to #num of its month, the one there
 * (if any) takes its old place. */
export async function feedSwap(raw: unknown) {
  return act(z.object({ pieceId: uuid, num: place }), raw, async (sql, i) => {
    const n = (await sql.one<{ n: number }>(`select public.feed_swap($1, $2::smallint) as n`, [i.pieceId, i.num]))!.n;
    return { num: n, message: `Movida al #${n}` };
  }, { revalidate: REDES }).then(withMessage);
}

/** «Quitar del feed» (one place) or «Vaciar este mes» (all): pieces are never deleted. */
export async function feedClear(raw: unknown) {
  return act(z.object({ monthId: uuid, num: place.nullable().default(null) }), raw, async (sql, i) => {
    const n = (await sql.one<{ n: number }>(`select public.feed_clear($1, $2::smallint) as n`, [i.monthId, i.num]))!.n;
    const message = i.num ? 'Espacio vaciado' : `Mes vaciado: ${n === 1 ? '1 pieza quedó' : `${n} piezas quedaron`} sin programar`;
    return { n, message };
  }, { revalidate: REDES }).then(withMessage);
}
