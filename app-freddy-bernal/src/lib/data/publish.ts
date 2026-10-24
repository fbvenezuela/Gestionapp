import type { Sql } from '../db/core';
import { checkVideo, copyIssue, type FormatRule, type Issue } from '../domain/video-rules';
import { copyLength } from '../domain/copies';
import type { PublishingWindows } from '../domain/publishing-windows';

type Spec = { network: string; label: string; formats: Record<string, FormatRule>; copy_max_chars: number; length_group: 'long' | 'medium' | 'short' };

export async function loadPublishContext(sql: Sql, pieceId: string) {
  const piece = await sql.one<{ id: string; title: string; status: string; kind: string; current_version: number }>(
    `select id, title, status, kind, current_version from public.pieces where id = $1 and deleted_at is null`,
    [pieceId],
  );
  if (!piece) return null;
  const version = await sql.one<{ media_asset_id: string | null; cover_asset_id: string | null }>(
    `select media_asset_id, cover_asset_id from public.piece_versions where piece_id = $1 and version = $2`,
    [pieceId, piece.current_version],
  );
  const media = version?.media_asset_id
    ? await sql.one<{ mime: string; duration_s: number | null; width: number | null; height: number | null; fps: number | null; video_codec: string | null; audio_codec: string | null; size_bytes: number }>(
        `select mime, duration_s, width, height, fps, video_codec, audio_codec, size_bytes from public.media_assets where id = $1`,
        [version.media_asset_id],
      )
    : null;
  const copies = await sql.query<{ length_group: 'long' | 'medium' | 'short'; body: string }>(`select length_group, body from public.copies where piece_id = $1`, [pieceId]);
  const specs = await sql.query<Spec>(`select network, label, formats, copy_max_chars, length_group from public.network_specs order by network`);
  const collaborators = (await sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'publishing.default_collaborators'`))?.value ?? [];
  const windows = (await sql.one<{ value: PublishingWindows }>(`select value from public.app_settings where key = 'publishing.windows'`))?.value ?? {};
  return { piece, version, media, copies, specs, collaborators, windows };
}

export type NetworkCheck = { network: string; label: string; format: string; formats: string[]; issues: Issue[]; copy: string };

export function validateFor(ctx: NonNullable<Awaited<ReturnType<typeof loadPublishContext>>>, network: string, format?: string): NetworkCheck {
  const spec = ctx.specs.find((s) => s.network === network)!;
  const formats = Object.keys(spec.formats);
  const isImage = ctx.media?.mime.startsWith('image/') ?? ctx.piece.kind !== 'video';
  const fmt = format && formats.includes(format) ? format : isImage ? formats.find((f) => f === 'photo') ?? formats[0] : formats.find((f) => f === 'reel' || f === 'video' || f === 'short') ?? formats[0];
  const issues: Issue[] = [];
  if (!ctx.media) issues.push({ level: 'error', text: `${spec.label}: la pieza no tiene archivo final.` });
  else {
    issues.push(
      ...checkVideo(spec.label, fmt, spec.formats[fmt], {
        durationS: ctx.media.duration_s != null ? Number(ctx.media.duration_s) : null,
        width: ctx.media.width, height: ctx.media.height,
        fps: ctx.media.fps != null ? Number(ctx.media.fps) : null,
        videoCodec: ctx.media.video_codec, audioCodec: ctx.media.audio_codec,
        sizeBytes: Number(ctx.media.size_bytes), isImage,
      }),
    );
  }
  const copy = ctx.copies.find((c) => c.length_group === spec.length_group)?.body ?? '';
  if (!copy) issues.push({ level: 'warn', text: `${spec.label}: falta el copy ${spec.length_group === 'short' ? 'corto' : spec.length_group === 'medium' ? 'medio' : 'largo'}.` });
  const ci = copyIssue(spec.label, copyLength(spec.length_group, copy), spec.copy_max_chars);
  if (ci) issues.push(ci);
  return { network, label: spec.label, format: fmt, formats, issues, copy };
}

