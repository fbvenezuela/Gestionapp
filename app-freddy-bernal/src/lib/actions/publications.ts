'use server';

import { z } from 'zod';
import { act, UserError } from './run';
import { loadPublishContext, validateFor } from '../data/publish';

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
export async function registerSpontaneous(raw: unknown) {
  return act(
    z.object({
      network: z.enum(NETWORKS),
      title: z.string().trim().min(3, 'Escribe de qué se trató.').max(140),
      url: postUrl,
      publishedAt: z.string().datetime({ offset: true }).nullable().default(null),
    }),
    raw,
    async (sql, i) => {
      if (i.publishedAt && new Date(i.publishedAt).getTime() > Date.now() + 5 * 60_000) throw new UserError('La fecha no puede ser futura: se registra lo que ya salió.');
      const r = await sql.one<{ id: string }>(
        `insert into public.publications (origin, title, network, format, status, mode, url, published_at)
         values ('boss_spontaneous', $1, $2, 'post', 'published', 'manual', $3, coalesce($4::timestamptz, now())) returning id`,
        [i.title, i.network, i.url, i.publishedAt],
      );
      return { id: r!.id };
    },
    { revalidate: ['/publicar', '/resultados', '/jefe'] },
  );
}
