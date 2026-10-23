import type { Sql } from '../db/core';

export type PieceFull = {
  id: string; title: string; kind: string; status: string; current_version: number; approved_version: number | null;
  event_id: string | null; event_title: string | null; category_name: string | null; approved_by_name: string | null; approved_at: string | null;
  versions: { version: number; media_asset_id: string | null; cover_asset_id: string | null; notes: string; created_at: string; mime: string | null; duration_s: number | null; width: number | null; height: number | null; fps: number | null; video_codec: string | null; audio_codec: string | null; size_bytes: number | null }[];
  copies: { length_group: 'long' | 'medium' | 'short'; body: string; char_count: number; generated_by: string; formula_id: string | null }[];
  reviews: { decision: string; comment: string; version: number; created_at: string; reviewer: string }[];
  comments: { id: string; body: string; at_second: number | null; version: number; created_at: string; author: string }[];
  voice: { id: string; phrase: string; at_second: number | null; status: string; audio_asset_id: string | null }[];
  publications: { id: string; network: string; status: string; url: string | null; published_at: string | null; scheduled_at: string | null }[];
};

export async function getPiece(sql: Sql, id: string): Promise<PieceFull | null> {
  const p = await sql.one<Omit<PieceFull, 'versions' | 'copies' | 'reviews' | 'comments' | 'voice' | 'publications'>>(
    `select p.id, p.title, p.kind, p.status, p.current_version, p.approved_version, p.event_id, e.title as event_title, c.name as category_name,
            coalesce(nullif(ap.full_name, ''), ap.email) as approved_by_name, p.approved_at
       from public.pieces p left join public.events e on e.id = p.event_id left join public.categories c on c.id = p.category_id
       left join public.profiles ap on ap.id = p.approved_by
      where p.id = $1 and p.deleted_at is null`,
    [id],
  );
  if (!p) return null;
  const versions = await sql.query<PieceFull['versions'][number]>(
    `select v.version, v.media_asset_id, v.cover_asset_id, v.notes, v.created_at, m.mime, m.duration_s, m.width, m.height, m.fps, m.video_codec, m.audio_codec, m.size_bytes
       from public.piece_versions v left join public.media_assets m on m.id = v.media_asset_id where v.piece_id = $1 order by v.version desc`,
    [id],
  );
  const copies = await sql.query<PieceFull['copies'][number]>(`select length_group, body, char_count, generated_by, formula_id from public.copies where piece_id = $1`, [id]);
  const reviews = await sql.query<PieceFull['reviews'][number]>(
    `select r.decision, r.comment, r.version, r.created_at, coalesce(nullif(u.full_name, ''), u.email) as reviewer
       from public.reviews r join public.profiles u on u.id = r.reviewer_id where r.piece_id = $1 order by r.created_at desc`,
    [id],
  );
  const comments = await sql.query<PieceFull['comments'][number]>(
    `select c.id, c.body, c.at_second, c.version, c.created_at, coalesce(nullif(u.full_name, ''), u.email) as author
       from public.review_comments c join public.profiles u on u.id = c.author_id where c.piece_id = $1 order by c.created_at desc`,
    [id],
  );
  const voice = await sql.query<PieceFull['voice'][number]>(
    `select id, phrase, at_second, status, audio_asset_id from public.voice_line_requests where piece_id = $1 and status <> 'cancelled' order by created_at desc`,
    [id],
  );
  const publications = await sql.query<PieceFull['publications'][number]>(
    `select id, network, status, url, published_at, scheduled_at from public.publications where piece_id = $1 and deleted_at is null order by coalesce(published_at, scheduled_at, created_at) desc`,
    [id],
  );
  return { ...p, versions, copies, reviews, comments, voice, publications };
}

export function fmtSecond(s: number | null) {
  if (s === null || s === undefined) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
