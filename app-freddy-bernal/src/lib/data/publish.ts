import type { Sql } from '../db/core';
import { checkCarousel, checkStory, checkVideo, copyIssue, type FormatRule, type Issue, type MediaFacts } from '../domain/video-rules';
import { copyLength } from '../domain/copies';
import type { PublishingWindows } from '../domain/publishing-windows';
import { NETWORK_FORMATS, formatOfKind, isFormat, notReceived, type Format } from '../domain/redes';

type Spec = { network: string; label: string; formats: Record<string, FormatRule>; copy_max_chars: number; length_group: 'long' | 'medium' | 'short' };

type MediaRow = { id?: string; mime: string; duration_s: number | null; width: number | null; height: number | null; fps: number | null; video_codec: string | null; audio_codec: string | null; size_bytes: number };

const MEDIA_COLUMNS = 'mime, duration_s, width, height, fps, video_codec, audio_codec, size_bytes';

export async function loadPublishContext(sql: Sql, pieceId: string) {
  const row = await sql.one<{
    id: string; title: string; status: string; kind: string; format: string | null; current_version: number; approved_version: number | null;
    design_status: string | null; design_at: Date | string | null; approved_at: Date | string | null;
  }>(
    `select id, title, status, kind, format, current_version, approved_version, design_status, design_at, approved_at
       from public.pieces where id = $1 and deleted_at is null`,
    [pieceId],
  );
  if (!row) return null;
  const format: Format = row.format && isFormat(row.format) ? row.format : formatOfKind(row.kind);
  const piece = { ...row, format };
  // What goes out is the approved version's file, cover and slides.
  const version = await sql.one<{ media_asset_id: string | null; cover_asset_id: string | null; slide_asset_ids: (string | null)[] | null }>(
    `select media_asset_id, cover_asset_id, slide_asset_ids from public.piece_versions where piece_id = $1 and version = $2`,
    [pieceId, piece.status === 'approved' && piece.approved_version ? piece.approved_version : piece.current_version],
  );
  const media = version?.media_asset_id
    ? await sql.one<MediaRow>(`select ${MEDIA_COLUMNS} from public.media_assets where id = $1`, [version.media_asset_id])
    : null;
  // A carousel (and Fin de mes) goes out slide by slide, in the version's order.
  const slideIds = version?.slide_asset_ids ?? [];
  const slideRows = slideIds.some(Boolean)
    ? await sql.query<MediaRow & { id: string }>(`select id, ${MEDIA_COLUMNS} from public.media_assets where id = any($1::uuid[])`, [slideIds.filter(Boolean)])
    : [];
  const slides: (MediaRow | null)[] = slideIds.map((id) => (id ? (slideRows.find((r) => r.id === id) ?? null) : null));
  const copies = await sql.query<{ length_group: 'long' | 'medium' | 'short'; body: string }>(`select length_group, body from public.copies where piece_id = $1`, [pieceId]);
  const specs = await sql.query<Spec>(`select network, label, formats, copy_max_chars, length_group from public.network_specs order by network`);
  const collaborators = (await sql.one<{ value: string[] }>(`select value from public.app_settings where key = 'publishing.default_collaborators'`))?.value ?? [];
  const windows = (await sql.one<{ value: PublishingWindows }>(`select value from public.app_settings where key = 'publishing.windows'`))?.value ?? {};
  // The compliance notices still open travel with the package (D-66): who publishes sees them too.
  const notices = await sql.query<{ id: string; kind: string; body: string }>(
    `select id, kind, body from public.piece_notices where piece_id = $1 and resolved_at is null order by created_at, id`,
    [pieceId],
  );
  return { piece, version, media, slides, copies, specs, collaborators, windows, notices };
}

export type PublishContext = NonNullable<Awaited<ReturnType<typeof loadPublishContext>>>;

export type NetworkCheck = { network: string; label: string; format: string; formats: string[]; issues: Issue[]; copy: string };

const facts = (m: MediaRow, isImage: boolean): MediaFacts => ({
  durationS: m.duration_s != null ? Number(m.duration_s) : null,
  width: m.width, height: m.height,
  fps: m.fps != null ? Number(m.fps) : null,
  videoCodec: m.video_codec, audioCodec: m.audio_codec,
  sizeBytes: Number(m.size_bytes), isImage,
});

/** The network formats this piece may go out as in this network (D-73): its format's, in order, that the network has. */
export function formatsFor(ctx: Pick<PublishContext, 'piece'>, spec: Pick<Spec, 'formats'>): string[] {
  const have = Object.keys(spec.formats ?? {});
  return NETWORK_FORMATS[ctx.piece.format].filter((f) => have.includes(f));
}

/**
 * Checks the piece for one network before scheduling or registering it. The network format comes from the piece's
 * format (Reel → reel/short/video, Post → photo, Carrusel and Fin de mes → carousel slide by slide, Historia → story,
 * YouTube → video); a network that does not take that format says so («Esta red no recibe historias»). `format`: the
 * one the person chose, when the network has more than one for this piece.
 */
export function validateFor(ctx: PublishContext, network: string, format?: string): NetworkCheck {
  const spec = ctx.specs.find((s) => s.network === network)!;
  const formats = formatsFor(ctx, spec);
  const pf = ctx.piece.format;
  const fmt = format && formats.includes(format) ? format : (formats[0] ?? NETWORK_FORMATS[pf][0]);
  const issues: Issue[] = [];
  if (!formats.length) issues.push({ level: 'error', text: notReceived(spec.label, pf) });
  else if (fmt === 'carousel') {
    issues.push(...checkCarousel(spec.label, spec.formats[fmt], ctx.slides.map((s) => (s ? facts(s, s.mime.startsWith('image/')) : null))));
  } else if (!ctx.media) issues.push({ level: 'error', text: `${spec.label}: la pieza no tiene archivo final.` });
  else {
    const isImage = ctx.media.mime.startsWith('image/');
    if (fmt === 'story') issues.push(...checkStory(spec.label, spec.formats[fmt], facts(ctx.media, isImage)));
    else issues.push(...checkVideo(spec.label, fmt, spec.formats[fmt], facts(ctx.media, isImage)));
  }
  // What goes out is the approved copy of the network's length (guard_publication compares it). A story usually has
  // none: its on-screen text and sticker are typed in the network's app (D-61), so a missing copy is not a warning.
  const copy = ctx.copies.find((c) => c.length_group === spec.length_group)?.body ?? '';
  if (pf !== 'story') {
    if (!copy) issues.push({ level: 'warn', text: `${spec.label}: falta el copy ${spec.length_group === 'short' ? 'corto' : spec.length_group === 'medium' ? 'medio' : 'largo'}.` });
    const ci = copyIssue(spec.label, copyLength(spec.length_group, copy), spec.copy_max_chars);
    if (ci) issues.push(ci);
  }
  return { network, label: spec.label, format: fmt, formats, issues, copy };
}
