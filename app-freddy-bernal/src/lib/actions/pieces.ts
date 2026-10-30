'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { notify, usersWithRole } from '../notify';
import { notifyReviewers } from './review-notify';
import { brand } from '../client-config';
import { buildCopies, copyLength, inventedNumbers, overLimits, type CopyOptions, type CopySet } from '../domain/copies';
import type { Level } from '../domain/review';
import { FORMAT, FORMATS, formatOfKind } from '../domain/redes';
import { getCard } from '../data/redes';
import type { Sql } from '../db/core';
import { aiAvailable, aiCopies, AiUnavailable } from '../ai';

const uuid = z.string().uuid();
const level = z.enum(['verde', 'amarillo', 'rojo']);

// «Crear pieza» from an event (/piezas/nueva?evento=) or from anywhere: the format (R4, D-61) and the month the person
// chose; with no month, the database puts it in the first one. Never from the event's date (D-75). `kind` alone
// (before R4) still works: the format comes from it as the migration did.
export async function createPiece(raw: unknown) {
  return act(
    z
      .object({
        eventId: uuid.nullable().or(z.literal('')).transform((v) => v || null),
        format: z.enum(FORMATS).optional(),
        kind: z.enum(['video', 'short', 'cover', 'carousel', 'photo']).optional(),
        monthId: uuid.nullable().or(z.literal('')).optional().transform((v) => v || null),
        title: z.string().trim().min(3, 'Escribe un título.').max(140),
        categoryId: uuid.nullable().or(z.literal('')).transform((v) => v || null),
      })
      .refine((v) => v.format || v.kind, 'Elige el formato.'),
    raw,
    async (sql, i, s) => {
      const format = i.format ?? formatOfKind(i.kind!);
      const kind = i.format ? FORMAT[i.format].kind : i.kind!;
      const r = await sql.one<{ id: string }>(
        `insert into public.pieces (event_id, kind, format, title, category_id, review_level, content_month_id)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [i.eventId, kind, format, i.title, i.categoryId, FORMAT[format].defaultLevel, i.monthId],
      );
      // The event moves on with its piece. Redes and the boss move an event's work (the column guard); administración,
      // a technical role, does not (its piece is saved all the same).
      if (i.eventId && s.roles.some((x) => x === 'social' || x === 'boss')) {
        await sql.query(`update public.events set work_status = 'editing' where id = $1 and work_status in ('material', 'recording')`, [i.eventId]);
      }
      return { id: r!.id, format };
    },
    { revalidate: ['/piezas', '/redes', '/hoy'] },
  );
}

// A new file (video/cover) becomes the next version; an approved piece goes back to review.
export async function addVersion(raw: unknown) {
  return act(
    z.object({ pieceId: uuid, mediaId: uuid.nullable(), coverId: uuid.nullable(), notes: z.string().max(1000).default('') }),
    raw,
    async (sql, i) => {
      const p = await sql.one<{ current_version: number; status: string }>(`select current_version, status from public.pieces where id = $1`, [i.pieceId]);
      if (!p) throw new UserError('Pieza no encontrada.');
      const prev = await sql.one<{ media_asset_id: string | null; cover_asset_id: string | null; slide_asset_ids: (string | null)[] | null }>(
        `select media_asset_id, cover_asset_id, to_jsonb(slide_asset_ids) as slide_asset_ids from public.piece_versions where piece_id = $1 order by version desc limit 1`,
        [i.pieceId],
      );
      const v = p.current_version + 1;
      // A carousel's slides stay with the new version (R4): only the file or the cover changed. (Read through to_jsonb:
      // postgres.js reads a NULL slide as the text 'NULL'.)
      await sql.query(
        `insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids, notes) values ($1, $2, $3, $4, $5::uuid[], $6)`,
        [i.pieceId, v, i.mediaId ?? prev?.media_asset_id ?? null, i.coverId ?? prev?.cover_asset_id ?? null, prev?.slide_asset_ids ?? [], i.notes],
      );
      const after = await sql.one<{ id: string; title: string; status: string; review_level: Level }>(
        `update public.pieces set current_version = $2 where id = $1 returning id, title, status, review_level`,
        [i.pieceId, v],
      );
      // A new version of a piece that was approved or had changes requested goes back to review.
      const back = after && after.status === 'in_review' && (p.status === 'approved' || p.status === 'changes_requested');
      return { version: v, reopened: back ? { id: after.id, title: after.title, level: after.review_level } : null };
    },
    { revalidate: ['/piezas', '/redes', '/aprobar', '/hoy', '/jefe'] },
  ).then(async (r) => {
    if (r.ok && r.data!.reopened) await notifyReviewers(r.data!.reopened.id, r.data!.reopened.title, r.data!.reopened.level, `Versión nueva (${r.data!.version})`);
    return r;
  });
}

// The images of a carousel or of Fin de mes, in order (R4, D-61): a new version with them (slide_asset_ids, frozen with
// the version like the file), its file and cover = the first slide with an image. Changing an image or the order of
// an approved piece sends it back to the boss (the new version does it). null = a planned slide without its image.
export async function setSlides(raw: unknown) {
  return act(
    z
      .object({
        pieceId: uuid,
        slides: z.array(uuid.nullable()).min(1, 'Deja al menos una lámina.').max(20, 'Hasta 20 láminas.').optional(),
        // One image just uploaded into place `index` (0-based) of a list of `count`: merged into the CURRENT version
        // under the piece's lock, so two uploads at once (or a move meanwhile) never undo each other.
        slot: z.object({ index: z.number().int().min(0).max(19), assetId: uuid, count: z.number().int().min(1).max(20) }).optional(),
        notes: z.string().max(1000).default(''),
      })
      .refine((x) => !!x.slides !== !!x.slot, 'Faltan las láminas.'),
    raw,
    async (sql, i) => {
      // Locked: saves of the same piece go one after the other, each on the version the one before left.
      const p = await sql.one<{ current_version: number; status: string; format: string }>(
        `select current_version, status, format from public.pieces where id = $1 and deleted_at is null for update`,
        [i.pieceId],
      );
      if (!p) throw new UserError('Pieza no encontrada.');
      if (p.format !== 'carousel' && p.format !== 'month_end') throw new UserError('Las láminas son de los carruseles y de fin de mes.');
      const v = p.current_version + 1;
      if (i.slot) {
        // Arrays are 1-based in SQL. The list keeps its length (or grows to the place), every other place as it is.
        await sql.query(
          `with cur as (select coalesce((select slide_asset_ids from public.piece_versions where piece_id = $1 and version = $3), '{}'::uuid[]) as ids),
                next as (select array(select case when g = $4 then $5::uuid else cur.ids[g] end
                                        from cur, generate_series(1, greatest($6, cardinality(cur.ids), $4)) g order by g) as ids from cur)
           insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids, notes)
           select $1, $2, f.id, f.id, next.ids, $7
             from next left join lateral (select x as id from unnest(next.ids) with ordinality u(x, o) where x is not null order by o limit 1) f on true`,
          [i.pieceId, v, p.current_version, i.slot.index + 1, i.slot.assetId, i.slot.count, i.notes],
        );
      } else {
        const slides = i.slides!;
        const first = slides.find((x): x is string => !!x) ?? null;
        await sql.query(
          `insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, slide_asset_ids, notes) values ($1, $2, $3, $3, $4::uuid[], $5)`,
          [i.pieceId, v, first, slides, i.notes],
        );
      }
      const after = await sql.one<{ id: string; title: string; status: string; review_level: Level }>(
        `update public.pieces set current_version = $2 where id = $1 returning id, title, status, review_level`,
        [i.pieceId, v],
      );
      const back = after && after.status === 'in_review' && (p.status === 'approved' || p.status === 'changes_requested');
      return { version: v, reopened: back ? { id: after.id, title: after.title, level: after.review_level } : null };
    },
    { revalidate: ['/piezas', '/redes', '/aprobar', '/hoy', '/jefe'] },
  ).then(async (r) => {
    if (r.ok && r.data!.reopened) await notifyReviewers(r.data!.reopened.id, r.data!.reopened.title, r.data!.reopened.level, 'Cambiaron las láminas');
    return r;
  });
}

// «Enviar a aprobación» (D-63): what the card lists as missing (reviewBlockers, per format) stops it here too. With
// no level, the piece keeps its own (a story is born green, A10).
export async function sendToReview(raw: unknown) {
  return act(z.object({ pieceId: uuid, level: level.optional() }), raw, async (sql, i) => {
    const card = await getCard(sql, i.pieceId);
    if (!card) throw new UserError('Pieza no encontrada.');
    if (card.blockers.length) throw new UserError(card.blockers[0]);
    const r = (await sql.one<{ review_level: Level }>(
      `update public.pieces set status = 'in_review', review_level = coalesce($2, review_level) where id = $1 returning review_level`,
      [i.pieceId, i.level ?? null],
    ))!;
    return { title: card.title, level: r.review_level, pieceId: i.pieceId };
  }, { revalidate: ['/piezas', '/redes', '/aprobar', '/hoy', '/jefe'] }).then(async (r) => {
    if (r.ok) await notifyReviewers(r.data!.pieceId, r.data!.title, r.data!.level, '');
    return r;
  });
}

// The boss or admin change the level (the database decides who may).
export async function setReviewLevel(raw: unknown) {
  return act(z.object({ pieceId: uuid, level }), raw, async (sql, i) => {
    const before = await sql.one<{ review_level: Level }>(`select review_level from public.pieces where id = $1`, [i.pieceId]);
    if (!before) throw new UserError('Pieza no encontrada.');
    await sql.query(`select public.set_review_level($1, $2)`, [i.pieceId, i.level]);
    const after = await sql.one<{ status: string; title: string }>(`select status, title from public.pieces where id = $1`, [i.pieceId]);
    return { pieceId: i.pieceId, title: after?.title ?? '', status: after?.status ?? '', before: before.review_level, level: i.level };
  }, { revalidate: ['/aprobar', '/piezas', '/hoy', '/jefe'] }).then(async (r) => {
    // Raised to red (even if it was approved): it goes back to review and waits for the boss.
    if (r.ok && r.data!.status === 'in_review' && r.data!.level === 'rojo' && r.data!.before !== 'rojo') {
      await notifyReviewers(r.data!.pieceId, r.data!.title, 'rojo', 'La pasaron a rojo');
    }
    return r;
  });
}

// Green pieces: the boss approves all of them in one tap (each one still goes through
// review_piece, so the database checks every one). A piece with an open compliance notice is never approved this way
// (D-66): it is left out and counted apart («2 tienen avisos: ábrelas»).
export async function approveGreen(raw: unknown) {
  return act(z.object({ pieces: z.array(z.object({ id: uuid, revision: z.number().int().min(0) })).min(1).max(50) }), raw, async (sql, i) => {
    const rows = await sql.query<{ id: string; revision: number; notices: number }>(
      `select p.id, p.revision, (select count(*)::int from public.piece_notices n where n.piece_id = p.id and n.resolved_at is null) as notices
         from public.pieces p
        where p.id = any($1::uuid[]) and p.status = 'in_review' and p.review_level = 'verde' and p.deleted_at is null`,
      [i.pieces.map((p) => p.id)],
    );
    // Only what the boss saw: a piece that changed since the list loaded is skipped.
    const seen = new Map(i.pieces.map((p) => [p.id, p.revision]));
    const withNotices = rows.filter((p) => p.notices > 0).length;
    const ok = rows.filter((p) => seen.get(p.id) === p.revision && p.notices === 0);
    for (const p of ok) await sql.query(`select public.review_piece($1, 'approved', '', $2)`, [p.id, p.revision]);
    const noticeText = withNotices ? (withNotices === 1 ? '1 tiene avisos: ábrela' : `${withNotices} tienen avisos: ábrelas`) : null;
    return { n: ok.length, skipped: i.pieces.length - ok.length - withNotices, withNotices, noticeText };
  }, { revalidate: ['/aprobar', '/piezas', '/redes', '/hoy', '/jefe'] }).then(async (r) => {
    if (r.ok && r.data!.n) {
      await notify({ userIds: await usersWithRole('social'), kind: 'piece_approved', title: `Aprobadas ${r.data!.n} piezas verdes`, body: 'Ya se pueden publicar.', link: '/publicar/nueva', key: `green:${Date.now()}` });
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Copies
// ---------------------------------------------------------------------------
const copyOptions = z.object({
  voice: z.enum(['boss', 'institutional']).default('boss'),
  closing: z.object({ kind: z.enum(['brand', 'question', 'destination', 'none']), text: z.string().trim().max(200).default('') }).default({ kind: 'brand', text: '' }),
});

export async function generateCopies(raw: unknown) {
  const schema = z.object({ pieceId: uuid, formulaId: uuid, useAi: z.boolean().default(true) }).merge(copyOptions);
  // 1) Read what this person may read (RLS). 2) Write the copies OUTSIDE the
  // transaction (AI calls are slow and log usage separately). 3) Save as the user.
  const loaded = await act(schema, raw, async (sql, i, s) => {
    const ctx = await sql.one<{
      title: string; place_name: string | null; municipality: string | null; summary: string | null; work_description: string | null;
      led_by: string | null; in_charge: string | null; achievements: string | null; key_facts: string | null; speech: string | null;
      boss_lines: string | null; category: string | null;
    }>(
      `select coalesce(e.title, p.title) as title, e.place_name, e.municipality, e.summary, b.work_description, b.led_by, b.in_charge, b.achievements, b.key_facts,
              sb.speech, (select string_agg(x.boss_line, E'\n' order by x.position) from public.storyboard_blocks x
                           where x.storyboard_id = sb.id and x.deleted_at is null and x.boss_line <> '') as boss_lines,
              c.name as category
         from public.pieces p left join public.events e on e.id = p.event_id left join public.event_brief b on b.event_id = e.id
         left join public.storyboards sb on sb.event_id = e.id left join public.categories c on c.id = p.category_id
        where p.id = $1`,
      [i.pieceId],
    );
    if (!ctx) throw new UserError('Pieza no encontrada.');
    const f = await sql.one<{ id: string; code: string; name: string; steps: { key: string; label: string; hint: string }[] }>(
      `select id, code, name, steps from public.copy_formulas where id = $1 and active`,
      [i.formulaId],
    );
    if (!f) throw new UserError('Elige una fórmula.');
    const input = {
      title: ctx.title, place: ctx.place_name ?? '', municipality: ctx.municipality ?? '', summary: ctx.summary ?? '',
      workDescription: ctx.work_description ?? '', ledBy: ctx.led_by ?? '', inCharge: ctx.in_charge ?? '', achievements: ctx.achievements ?? '',
      keyFacts: ctx.key_facts ?? '', speech: ctx.speech ?? '', bossLines: ctx.boss_lines ?? '', category: ctx.category,
    };
    const saved = (await sql.one<{ value: { greeting?: string; closings?: string[]; hashtags?: string[]; clientName?: string } }>(`select value from public.app_settings where key = 'brand'`))?.value;
    const b = {
      greeting: saved?.greeting || brand.greeting, closings: saved?.closings?.length ? saved.closings : brand.closings,
      hashtags: saved?.hashtags?.length ? saved.hashtags : brand.hashtags, name: saved?.clientName || brand.clientName,
    };
    // "Cierre de la marca" with no text = the first brand closing.
    const closing = i.closing.kind === 'brand' && !i.closing.text ? { kind: 'brand' as const, text: b.closings[0] ?? '' } : i.closing;
    const opts: CopyOptions = { voice: i.voice, closing };
    return { input, f, b, opts, userId: s.userId, useAi: i.useAi };
  });
  if (!loaded.ok) return loaded;
  const { input, f, b, opts, userId, useAi } = loaded.data!;
  let set: CopySet;
  let by: 'ai' | 'template' = 'template';
  let note = '';
  if (useAi && aiAvailable()) {
    try {
      set = await aiCopies(input, f, b, opts, userId);
      by = 'ai';
      // Rule 7 also for the AI: a figure that is not in the brief (the chosen closing,
      // e.g. a phone, counts as known), or a text over a network's limit, and the
      // template is used instead.
      const invented = inventedNumbers(set, input, opts.closing.text ?? '');
      const over = overLimits(set);
      if (invented.length || over.length) {
        set = buildCopies(input, f, b, opts);
        by = 'template';
        note = invented.length
          ? `La IA puso cifras que no están en la ficha (${invented.join(', ')}); se usó la plantilla.`
          : `La IA se pasó del largo (${over.join(', ')}); se usó la plantilla.`;
      }
    } catch (e) {
      set = buildCopies(input, f, b, opts);
      note = e instanceof AiUnavailable ? e.message : 'La IA no respondió; se usó la plantilla.';
    }
  } else set = buildCopies(input, f, b, opts);

  const saved = await act(schema, raw, async (sql, i) => {
    const before = await sql.one<{ status: string }>(`select status from public.pieces where id = $1`, [i.pieceId]);
    for (const g of ['long', 'medium', 'short'] as const) {
      await sql.query(
        `insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, auth.uid())
         on conflict (piece_id, length_group) do update set formula_id = excluded.formula_id, body = excluded.body, char_count = excluded.char_count,
           generated_by = excluded.generated_by, updated_by = auth.uid()`,
        [i.pieceId, f.id, g, set[g], copyLength(g, set[g]), by],
      );
    }
    await sql.query(`update public.pieces set copy_voice = $2, copy_closing = $3::text::jsonb where id = $1`, [i.pieceId, opts.voice, JSON.stringify(opts.closing)]);
    const after = await reopened(sql, i.pieceId, before?.status);
    return { missing: set.missing, by, note, copies: { long: set.long, medium: set.medium, short: set.short }, reopened: after };
  }, { revalidate: ['/piezas', '/aprobar'] });
  if (saved.ok && saved.data!.reopened) await notifyReviewers(saved.data!.reopened.id, saved.data!.reopened.title, saved.data!.reopened.level, 'Cambiaron los copies');
  return saved;
}

// Editing the copies of an approved piece sends it back to review (database trigger).
async function reopened(sql: Sql, pieceId: string, before: string | undefined) {
  if (before !== 'approved') return null;
  const p = await sql.one<{ id: string; title: string; status: string; review_level: Level }>(`select id, title, status, review_level from public.pieces where id = $1`, [pieceId]);
  return p?.status === 'in_review' ? { id: p.id, title: p.title, level: p.review_level } : null;
}

export async function saveCopy(raw: unknown) {
  return act(z.object({ pieceId: uuid, group: z.enum(['long', 'medium', 'short']), body: z.string().max(5000) }), raw, async (sql, i) => {
    const before = await sql.one<{ status: string }>(`select status from public.pieces where id = $1`, [i.pieceId]);
    await sql.query(
      `insert into public.copies (piece_id, length_group, body, char_count, generated_by, updated_by) values ($1, $2, $3, $4, 'manual', auth.uid())
       on conflict (piece_id, length_group) do update set body = excluded.body, char_count = excluded.char_count, generated_by = 'manual', updated_by = auth.uid()`,
      [i.pieceId, i.group, i.body, copyLength(i.group, i.body)],
    );
    return { reopened: await reopened(sql, i.pieceId, before?.status) };
  }, { revalidate: ['/piezas', '/aprobar'] }).then(async (r) => {
    if (r.ok && r.data!.reopened) await notifyReviewers(r.data!.reopened.id, r.data!.reopened.title, r.data!.reopened.level, 'Cambiaron los copies');
    return r;
  });
}

// ---------------------------------------------------------------------------
// Review (the boss)
// ---------------------------------------------------------------------------
export async function reviewPiece(raw: unknown) {
  const schema = z.object({ pieceId: uuid, decision: z.enum(['approved', 'changes_requested']), comment: z.string().max(2000).default(''), revision: z.number().int().min(0) });
  return act(schema, raw, async (sql, i) => {
    // The revision the person looked at: if the piece changed since, the database refuses.
    await sql.query(`select public.review_piece($1, $2, $3, $4)`, [i.pieceId, i.decision, i.comment, i.revision]);
    const p = await sql.one<{ title: string; created_by: string | null }>(`select title, created_by from public.pieces where id = $1`, [i.pieceId]);
    return p ? { ...p, who: 'El jefe' } : null;
  }, { revalidate: ['/aprobar', '/piezas', '/hoy', '/jefe'] }).then(async (r) => {
    const i = raw as { pieceId: string; decision: string; comment?: string };
    if (r.ok && r.data) {
      const social = await usersWithRole('social');
      const changes = i.decision === 'changes_requested';
      await notify({
        userIds: [...new Set([...social, ...(r.data.created_by ? [r.data.created_by] : [])])],
        kind: changes ? 'changes_requested' : 'piece_approved',
        title: changes ? `${r.data.who} pidió cambios en «${r.data.title}»` : `Aprobada: «${r.data.title}»`,
        body: changes ? (i.comment ?? '') : 'Ya se puede publicar.',
        link: `/piezas/${i.pieceId}`,
        key: `reviewed:${i.pieceId}:${Date.now()}`,
        email: changes,
      });
    }
    return r;
  });
}

export async function addComment(raw: unknown) {
  return act(z.object({ pieceId: uuid, body: z.string().trim().min(1).max(2000), atSecond: z.number().min(0).nullable().default(null) }), raw, async (sql, i) => {
    const p = await sql.one<{ current_version: number }>(`select current_version from public.pieces where id = $1`, [i.pieceId]);
    await sql.query(`insert into public.review_comments (piece_id, version, author_id, at_second, body) values ($1, $2, auth.uid(), $3, $4)`, [
      i.pieceId, p?.current_version ?? 0, i.atSecond, i.body,
    ]);
  }, { revalidate: ['/aprobar', '/piezas'] });
}

export async function requestVoiceLine(raw: unknown) {
  return act(z.object({ pieceId: uuid, phrase: z.string().trim().min(3, 'Escribe la frase.').max(1000), atSecond: z.number().min(0).nullable().default(null) }), raw, async (sql, i) => {
    await sql.query(`insert into public.voice_line_requests (piece_id, at_second, phrase) values ($1, $2, $3)`, [i.pieceId, i.atSecond, i.phrase]);
    return (await sql.one<{ title: string }>(`select title from public.pieces where id = $1`, [i.pieceId]))?.title ?? '';
  }, { revalidate: ['/aprobar', '/piezas', '/hoy'] }).then(async (r) => {
    if (r.ok) {
      const i = raw as { pieceId: string; phrase: string };
      const social = await usersWithRole('social');
      await notify({ userIds: social, kind: 'voice_line', title: 'Hay que pedirle una frase al jefe', body: `«${i.phrase}» para «${r.data}»`, link: `/piezas/${i.pieceId}`, key: `voice:${i.pieceId}:${Date.now()}`, email: true });
    }
    return r;
  });
}

export async function attachVoiceLine(raw: unknown) {
  return act(z.object({ requestId: uuid, mediaId: uuid }), raw, async (sql, i) => {
    await sql.query(`update public.voice_line_requests set audio_asset_id = $2, status = 'received' where id = $1`, [i.requestId, i.mediaId]);
  }, { revalidate: ['/piezas', '/aprobar', '/hoy'] });
}
