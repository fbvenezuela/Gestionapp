import fs from 'node:fs';
import path from 'node:path';
import type { SeedCtx } from './context';

// Pictures for Resultados, the boss's Digital and Biblioteca (§6 «Resultados con miniaturas»). The demo files have
// no bytes behind them, so their small pictures are kept here the way a phone keeps one at upload: in media_thumbs,
// written by the system user (no API role can read or write that table). The pictures are INVENTED and abstract
// (shapes in the brand's colors: no people, places, faces or text), JPEG files of 180×320 in
// src/lib/db/demo-assets, shipped with the app by next.config.ts (outputFileTracingIncludes).
// Plus a screenshot for the boss's own post, so it shows a picture too (his posts have no piece).
const ASSETS = path.join(process.cwd(), 'src', 'lib', 'db', 'demo-assets');

export const DEMO_THUMBS = { cover: 'cover.jpg', frame1: 'frame-1.jpg', frame2: 'frame-2.jpg', capture: 'capture.jpg' } as const;

export function demoThumbBytes(name: string): Buffer {
  return fs.readFileSync(path.join(ASSETS, name));
}

export async function seedThumbs(ctx: SeedCtx): Promise<void> {
  const { sql, ids, pieceIds } = ctx;
  const keep = (mediaId: string | null | undefined, file: string) =>
    mediaId
      ? sql.query(`insert into public.media_thumbs (media_id, mime, bytes) values ($1, 'image/jpeg', $2) on conflict (media_id) do nothing`, [
          mediaId,
          demoThumbBytes(file),
        ])
      : Promise.resolve();
  const version = (pieceId: string | undefined) =>
    sql.one<{ media_asset_id: string | null; cover_asset_id: string | null }>(
      `select media_asset_id, cover_asset_id from public.piece_versions where piece_id = $1 and version = 1`,
      [pieceId ?? null],
    );

  // The approved piece (its cover and its video's frame) and the bridge video (used by several pieces).
  const p1 = await version(pieceIds.p1);
  const p2 = await version(pieceIds.p2);
  await keep(p1?.cover_asset_id, DEMO_THUMBS.cover);
  await keep(p1?.media_asset_id, DEMO_THUMBS.frame1);
  await keep(p2?.media_asset_id, DEMO_THUMBS.frame2);

  // The boss's own post, recorded by Redes with a screenshot of it (kind 'evidence', no event: the content team's).
  const own = await sql.one<{ id: string }>(
    `select id from public.publications where origin = 'boss_spontaneous' and deleted_at is null and evidence_asset_id is null order by published_at limit 1`,
  );
  if (!own) return;
  const capture = demoThumbBytes(DEMO_THUMBS.capture);
  const ev = await sql.one<{ id: string }>(
    `insert into public.media_assets (kind, storage_path, label, mime, size_bytes, width, height, status, uploaded_by)
     values ('evidence', 'evidence/demo-captura-1.jpg', 'Captura de la publicación (demo)', 'image/jpeg', $1, 180, 320, 'ready', $2) returning id`,
    [capture.length, ids.social],
  );
  await sql.query(`update public.publications set evidence_asset_id = $1 where id = $2`, [ev!.id, own.id]);
  await keep(ev!.id, DEMO_THUMBS.capture);
}
