import { thumbSources, type PubThumb } from '../domain/thumb-source';

// The candidate pictures of each publication, read in the same query as the list (Resultados, the boss's Digital).
// The query names the publication `x` and its piece `p` (a left join: the boss's own posts have none). Every file is
// read with the person's RLS: a file they cannot read, or that is not finished or was removed, comes back without a
// mime and is never tried. The order is decided by src/lib/domain/thumb-source.ts.

const live = (a: string) => `${a}.status = 'ready' and ${a}.deleted_at is null`;

export const PUB_THUMB_COLUMNS = `x.origin, x.network, x.format,
       x.cover_asset_id as thumb_cover_id, tc.mime as thumb_cover_mime,
       tv.cover_asset_id as thumb_vcover_id, tvc.mime as thumb_vcover_mime,
       tv.media_asset_id as thumb_vmedia_id, tvm.mime as thumb_vmedia_mime,
       x.evidence_asset_id as thumb_evidence_id, te.mime as thumb_evidence_mime`;

export const PUB_THUMB_JOINS = `
    left join public.piece_versions tv on tv.piece_id = x.piece_id and tv.version = coalesce(p.approved_version, p.current_version)
    left join public.media_assets tc on tc.id = x.cover_asset_id and ${live('tc')}
    left join public.media_assets tvc on tvc.id = tv.cover_asset_id and ${live('tvc')}
    left join public.media_assets tvm on tvm.id = tv.media_asset_id and ${live('tvm')}
    left join public.media_assets te on te.id = x.evidence_asset_id and ${live('te')}`;

export type PubThumbCols = {
  origin: string; network: string; format: string;
  thumb_cover_id: string | null; thumb_cover_mime: string | null;
  thumb_vcover_id: string | null; thumb_vcover_mime: string | null;
  thumb_vmedia_id: string | null; thumb_vmedia_mime: string | null;
  thumb_evidence_id: string | null; thumb_evidence_mime: string | null;
};

export function pubThumbOf(r: PubThumbCols): PubThumb {
  return thumbSources({
    origin: r.origin,
    network: r.network,
    format: r.format,
    cover: { id: r.thumb_cover_id, mime: r.thumb_cover_mime },
    versionCover: { id: r.thumb_vcover_id, mime: r.thumb_vcover_mime },
    versionMedia: { id: r.thumb_vmedia_id, mime: r.thumb_vmedia_mime },
    evidence: { id: r.thumb_evidence_id, mime: r.thumb_evidence_mime },
  });
}
