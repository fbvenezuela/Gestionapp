// Why a file can never be removed (pure, so it can be tested). `ref` is the SQL expression of
// the media id (a column like `m.id`, or a parameter like `$1::uuid`). Runs as the user: RLS
// applies to pieces, versions, publications and voice lines (admin, who removes, sees them all).
//   published  — a scheduled or published post uses it: its cover, its evidence, or any
//                version of its piece (we do not know which version went out, so all of them).
//   approved   — the approved version of a piece (or the current one of an approved piece).
//   in_review  — the version a reviewer is looking at right now.
//   voice_line — the boss's recorded line, already received for a piece.
export type MediaLock = 'published' | 'approved' | 'in_review' | 'voice_line';

export const MEDIA_LOCK: Record<MediaLock, { chip: string; error: string }> = {
  published: { chip: 'En publicación', error: 'No se puede quitar: lo usa una publicación programada o publicada.' },
  approved: { chip: 'En pieza aprobada', error: 'No se puede quitar: es parte de una pieza aprobada.' },
  in_review: { chip: 'En revisión', error: 'No se puede quitar: es parte de una pieza en revisión.' },
  voice_line: { chip: 'Audio en uso', error: 'No se puede quitar: es el audio que grabó el jefe para una pieza.' },
};

// SQL expression: the lock reason as text, or null when the file can be removed.
export function mediaLockSql(ref: string): string {
  return `(case
    when exists (select 1 from public.publications x
                  where x.deleted_at is null and x.status in ('scheduled', 'published')
                    and (x.cover_asset_id = ${ref} or x.evidence_asset_id = ${ref}))
      or exists (select 1 from public.publications x join public.piece_versions v on v.piece_id = x.piece_id
                  where x.deleted_at is null and x.status in ('scheduled', 'published')
                    and (v.media_asset_id = ${ref} or v.cover_asset_id = ${ref})) then 'published'
    when exists (select 1 from public.piece_versions v join public.pieces p on p.id = v.piece_id
                  where p.deleted_at is null
                    and (v.version = p.approved_version or (p.status = 'approved' and v.version = p.current_version))
                    and (v.media_asset_id = ${ref} or v.cover_asset_id = ${ref})) then 'approved'
    when exists (select 1 from public.piece_versions v join public.pieces p on p.id = v.piece_id
                  where p.deleted_at is null and p.status = 'in_review' and v.version = p.current_version
                    and (v.media_asset_id = ${ref} or v.cover_asset_id = ${ref})) then 'in_review'
    when exists (select 1 from public.voice_line_requests r join public.pieces p on p.id = r.piece_id
                  where p.deleted_at is null and r.status = 'received' and r.audio_asset_id = ${ref}) then 'voice_line'
  end)`;
}

export function mediaLockChip(lock: string | null | undefined): string | null {
  return lock && lock in MEDIA_LOCK ? MEDIA_LOCK[lock as MediaLock].chip : null;
}
