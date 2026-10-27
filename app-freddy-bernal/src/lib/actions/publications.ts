'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { loadPublishContext, validateFor } from '../data/publish';
import type { Sql } from '../db';

const uuid = z.string().uuid();
const NETWORKS = ['instagram', 'facebook', 'tiktok', 'threads', 'x', 'youtube'] as const;
// Links are shown as clickable evidence: only http(s).
const postUrl = z.string().trim().url('Pega el link de la publicación.').max(500).refine((u) => /^https?:\/\//i.test(u), 'El link tiene que empezar con https://');

export async function createPublications(raw: unknown) {
  return act(
    z.object({
      pieceId: uuid,
      items: z.array(z.object({ network: z.enum(NETWORKS), format: z.string().max(30) })).min(1, 'Elige al menos una red.'),
      scheduledAt: z.string().datetime({ offset: true }).nullable(),
      collaborators: z.array(z.string().trim().max(80)).max(20).default([]),
      republishOf: uuid.nullable().default(null),
      ignoreWarnings: z.boolean().default(false),
    }),
    raw,
    async (sql, i) => {
      const ctx = await loadPublishContext(sql, i.pieceId);
      if (!ctx) throw new UserError('Pieza no encontrada.');
      if (ctx.piece.status !== 'approved') throw new UserError('La pieza no está aprobada por el jefe.');
      const ids: string[] = [];
      for (const it of i.items) {
        const check = await validateFor(ctx, it.network, it.format);
        if (check.issues.some((x) => x.level === 'error')) throw new UserError(check.issues.filter((x) => x.level === 'error').map((x) => x.text).join(' '));
        const r = await sql.one<{ id: string }>(
          `insert into public.publications (piece_id, network, format, copy_body, cover_asset_id, collaborators, scheduled_at, republish_of, status, mode, validation)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', $10::text::jsonb) returning id`,
          [i.pieceId, it.network, check.format, check.copy, ctx.version?.cover_asset_id ?? null, i.collaborators.filter(Boolean), i.scheduledAt,
            i.republishOf, i.scheduledAt ? 'scheduled' : 'draft', JSON.stringify(check.issues)],
        );
        ids.push(r!.id);
      }
      return { ids };
    },
    { revalidate: ['/publicar', '/piezas', '/hoy'] },
  );
}

export async function markPublished(raw: unknown) {
  return act(
    z.object({ id: uuid, url: postUrl, evidenceId: uuid.nullable().default(null), publishedAt: z.string().datetime({ offset: true }).nullable().default(null) }),
    raw,
    async (sql, i) => {
      if (i.evidenceId) await checkEvidence(sql, i.evidenceId);
      const r = await sql.one<{ piece_id: string; event_id: string | null }>(
        `update public.publications p set status = 'published', url = $2, evidence_asset_id = $3, published_at = coalesce($4::timestamptz, now()), failure_reason = null
          where id = $1 returning piece_id, (select event_id from public.pieces x where x.id = p.piece_id)`,
        [i.id, i.url, i.evidenceId, i.publishedAt],
      );
      if (!r) throw new UserError('No se encontró la publicación.');
      if (r.event_id) await sql.query(`update public.events set work_status = 'published' where id = $1`, [r.event_id]);
    },
    { revalidate: ['/publicar', '/piezas', '/resultados', '/hoy'] },
  );
}

export async function markFailed(raw: unknown) {
  return act(z.object({ id: uuid, reason: z.string().trim().min(3, 'Escribe qué pasó.').max(500) }), raw, async (sql, i) => {
    await sql.query(`update public.publications set status = 'failed', failure_reason = $2 where id = $1`, [i.id, i.reason]);
  }, { revalidate: ['/publicar', '/hoy'] });
}

export async function reschedule(raw: unknown) {
  return act(z.object({ id: uuid, scheduledAt: z.string().datetime({ offset: true }) }), raw, async (sql, i) => {
    await sql.query(`update public.publications set scheduled_at = $2, status = 'scheduled', failure_reason = null where id = $1 and status <> 'published'`, [i.id, i.scheduledAt]);
  }, { revalidate: ['/publicar'] });
}

// The boss published something himself (a spontaneous video, a story). The team records
// it afterwards with its link so it counts in results. Nothing is sent from here.
// Optional: a screenshot of the post (kind 'evidence'), which becomes its picture in Resultados.
export async function registerSpontaneous(raw: unknown) {
  return act(
    z.object({
      network: z.enum(NETWORKS),
      title: z.string().trim().min(3, 'Escribe de qué se trató.').max(140),
      url: postUrl,
      publishedAt: z.string().datetime({ offset: true }).nullable().default(null),
      evidenceId: uuid.nullable().default(null),
    }),
    raw,
    async (sql, i) => {
      if (i.publishedAt && new Date(i.publishedAt).getTime() > Date.now() + 5 * 60_000) throw new UserError('La fecha no puede ser futura: se registra lo que ya salió.');
      if (i.evidenceId) await checkEvidence(sql, i.evidenceId);
      const r = await sql.one<{ id: string }>(
        `insert into public.publications (origin, title, network, format, status, mode, url, published_at, evidence_asset_id)
         values ('boss_spontaneous', $1, $2, 'post', 'published', 'manual', $3, coalesce($4::timestamptz, now()), $5) returning id`,
        [i.title, i.network, i.url, i.publishedAt, i.evidenceId],
      );
      return { id: r!.id };
    },
    { revalidate: ['/publicar', '/resultados', '/jefe'] },
  );
}

// «Agregar captura» on a published post that has none (an old one, or the boss's own post registered without it).
// Only once: a screenshot already there is never swapped (it is the picture everyone sees in Resultados).
export async function attachEvidence(raw: unknown) {
  return act(z.object({ id: uuid, evidenceId: uuid }), raw, async (sql, i) => {
    await checkEvidence(sql, i.evidenceId);
    const r = await sql.one<{ id: string }>(
      `update public.publications set evidence_asset_id = $2
        where id = $1 and status = 'published' and deleted_at is null and evidence_asset_id is null returning id`,
      [i.id, i.evidenceId],
    );
    if (!r) throw new UserError('Esta publicación ya tiene su captura, o todavía no está publicada.');
  }, { revalidate: ['/publicar', '/resultados', '/jefe'] });
}

// A screenshot is a finished picture uploaded as 'evidence', with no event or ficha, that the person can read
// (RLS: the content team) and that no other publication uses yet.
async function checkEvidence(sql: Sql, id: string) {
  const ok = await sql.one<{ used: boolean }>(
    `select exists (select 1 from public.publications x where x.evidence_asset_id = m.id) as used
       from public.media_assets m
      where m.id = $1 and m.kind = 'evidence' and m.mime like 'image/%' and m.status = 'ready' and m.deleted_at is null
        and m.event_id is null and m.obra_ficha_id is null and m.community_report_id is null`,
    [id],
  );
  if (!ok) throw new UserError('No se encontró la captura: súbela otra vez.');
  if (ok.used) throw new UserError('Esa captura ya es de otra publicación.');
}
