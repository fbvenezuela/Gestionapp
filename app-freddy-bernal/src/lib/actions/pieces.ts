'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { notify, usersWithRole } from '../notify';
import { brand } from '../client-config';
import { buildCopies, copyLength, type CopySet } from '../domain/copies';
import { aiAvailable, aiCopies, AiUnavailable } from '../ai';

const uuid = z.string().uuid();

export async function createPiece(raw: unknown) {
  return act(
    z.object({
      eventId: uuid.nullable().or(z.literal('')).transform((v) => v || null),
      kind: z.enum(['video', 'short', 'cover', 'carousel', 'photo']),
      title: z.string().trim().min(3, 'Escribe un título.').max(140),
      categoryId: uuid.nullable().or(z.literal('')).transform((v) => v || null),
    }),
    raw,
    async (sql, i) => {
      const r = await sql.one<{ id: string }>(
        `insert into public.pieces (event_id, kind, title, category_id) values ($1, $2, $3, $4) returning id`,
        [i.eventId, i.kind, i.title, i.categoryId],
      );
      if (i.eventId) await sql.query(`update public.events set work_status = 'editing' where id = $1 and work_status in ('material', 'recording')`, [i.eventId]);
      return { id: r!.id };
    },
    { revalidate: ['/piezas', '/hoy'] },
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
      const prev = await sql.one<{ media_asset_id: string | null; cover_asset_id: string | null }>(
        `select media_asset_id, cover_asset_id from public.piece_versions where piece_id = $1 order by version desc limit 1`,
        [i.pieceId],
      );
      const v = p.current_version + 1;
      await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, notes) values ($1, $2, $3, $4, $5)`, [
        i.pieceId, v, i.mediaId ?? prev?.media_asset_id ?? null, i.coverId ?? prev?.cover_asset_id ?? null, i.notes,
      ]);
      await sql.query(`update public.pieces set current_version = $2 where id = $1`, [i.pieceId, v]);
      return { version: v };
    },
    { revalidate: ['/piezas', '/aprobar'] },
  );
}

export async function sendToReview(raw: unknown) {
  return act(z.object({ pieceId: uuid }), raw, async (sql, i) => {
    const p = await sql.one<{ title: string; current_version: number }>(`select title, current_version from public.pieces where id = $1`, [i.pieceId]);
    if (!p) throw new UserError('Pieza no encontrada.');
    if (p.current_version < 1) throw new UserError('Sube primero el video o la imagen final.');
    const copies = await sql.one<{ n: number }>(`select count(*)::int as n from public.copies where piece_id = $1 and body <> ''`, [i.pieceId]);
    if (!copies?.n) throw new UserError('Faltan los copies.');
    await sql.query(`update public.pieces set status = 'in_review' where id = $1`, [i.pieceId]);
    return { title: p.title };
  }, { revalidate: ['/piezas', '/aprobar', '/hoy'] }).then(async (r) => {
    if (r.ok) {
      const sup = await usersWithRole('supervisor');
      await notify({ userIds: sup, kind: 'review_pending', title: 'Hay una pieza por aprobar', body: r.data!.title, link: `/aprobar/${(raw as { pieceId: string }).pieceId}`, key: `review:${(raw as { pieceId: string }).pieceId}:${Date.now()}`, email: true });
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Copies
// ---------------------------------------------------------------------------
export async function generateCopies(raw: unknown) {
  const schema = z.object({ pieceId: uuid, formulaId: uuid, useAi: z.boolean().default(true) });
  // 1) Read what this person may read (RLS). 2) Write the copies OUTSIDE the
  // transaction (AI calls are slow and log usage separately). 3) Save as the user.
  const loaded = await act(schema, raw, async (sql, i, s) => {
    const ctx = await sql.one<{
      title: string; place_name: string | null; municipality: string | null; summary: string | null; work_description: string | null;
      led_by: string | null; achievements: string | null; key_facts: string | null; speech: string | null; category: string | null;
    }>(
      `select coalesce(e.title, p.title) as title, e.place_name, e.municipality, e.summary, b.work_description, b.led_by, b.achievements, b.key_facts,
              sb.speech, c.name as category
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
      workDescription: ctx.work_description ?? '', ledBy: ctx.led_by ?? '', achievements: ctx.achievements ?? '', keyFacts: ctx.key_facts ?? '',
      speech: ctx.speech ?? '', category: ctx.category,
    };
    const saved = (await sql.one<{ value: { greeting?: string; closings?: string[]; hashtags?: string[] } }>(`select value from public.app_settings where key = 'brand'`))?.value;
    const b = { greeting: saved?.greeting || brand.greeting, closings: saved?.closings?.length ? saved.closings : brand.closings, hashtags: saved?.hashtags?.length ? saved.hashtags : brand.hashtags };
    return { input, f, b, userId: s.userId, useAi: i.useAi };
  });
  if (!loaded.ok) return loaded;
  const { input, f, b, userId, useAi } = loaded.data!;
  let set: CopySet;
  let by: 'ai' | 'template' = 'template';
  let note = '';
  if (useAi && aiAvailable()) {
    try {
      set = await aiCopies(input, f, b, userId);
      by = 'ai';
    } catch (e) {
      set = buildCopies(input, f, b);
      note = e instanceof AiUnavailable ? e.message : 'La IA no respondió; se usó la plantilla.';
    }
  } else set = buildCopies(input, f, b);

  return act(schema, raw, async (sql, i) => {
    for (const g of ['long', 'medium', 'short'] as const) {
      await sql.query(
        `insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, auth.uid())
         on conflict (piece_id, length_group) do update set formula_id = excluded.formula_id, body = excluded.body, char_count = excluded.char_count,
           generated_by = excluded.generated_by, updated_by = auth.uid()`,
        [i.pieceId, f.id, g, set[g], copyLength(g, set[g]), by],
      );
    }
    return { missing: set.missing, by, note };
  }, { revalidate: ['/piezas'] });
}

export async function saveCopy(raw: unknown) {
  return act(z.object({ pieceId: uuid, group: z.enum(['long', 'medium', 'short']), body: z.string().max(5000) }), raw, async (sql, i) => {
    await sql.query(
      `insert into public.copies (piece_id, length_group, body, char_count, generated_by, updated_by) values ($1, $2, $3, $4, 'manual', auth.uid())
       on conflict (piece_id, length_group) do update set body = excluded.body, char_count = excluded.char_count, generated_by = 'manual', updated_by = auth.uid()`,
      [i.pieceId, i.group, i.body, copyLength(i.group, i.body)],
    );
  }, { revalidate: ['/piezas'] });
}

// ---------------------------------------------------------------------------
// Review (supervisor)
// ---------------------------------------------------------------------------
export async function reviewPiece(raw: unknown) {
  return act(z.object({ pieceId: uuid, decision: z.enum(['approved', 'changes_requested']), comment: z.string().max(2000).default('') }), raw, async (sql, i) => {
    await sql.query(`select public.review_piece($1, $2, $3)`, [i.pieceId, i.decision, i.comment]);
    const p = await sql.one<{ title: string; created_by: string | null }>(`select title, created_by from public.pieces where id = $1`, [i.pieceId]);
    return p;
  }, { revalidate: ['/aprobar', '/piezas', '/hoy'] }).then(async (r) => {
    const i = raw as { pieceId: string; decision: string; comment?: string };
    if (r.ok && r.data) {
      const social = await usersWithRole('social');
      const changes = i.decision === 'changes_requested';
      await notify({
        userIds: [...new Set([...social, ...(r.data.created_by ? [r.data.created_by] : [])])],
        kind: changes ? 'changes_requested' : 'piece_approved',
        title: changes ? `Supervisión pidió cambios en «${r.data.title}»` : `Aprobada: «${r.data.title}»`,
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
