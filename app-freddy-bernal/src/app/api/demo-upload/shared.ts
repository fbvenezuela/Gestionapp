import 'server-only';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { isDemo } from '@/lib/env';

export const TUS_HEADERS = { 'Tus-Resumable': '1.0.0', 'Cache-Control': 'no-store' };

// The upload must belong to the signed-in person and still be in progress.
export async function ownUpload(id: string): Promise<{ storage_path: string } | null> {
  if (!isDemo()) return null;
  const s = await getSession();
  if (!s) return null;
  return withUser(s.claims, (sql) =>
    sql.one<{ storage_path: string }>(`select storage_path from public.media_assets where id = $1 and uploaded_by = auth.uid() and status = 'uploading'`, [id]),
  );
}

export function parseMetadata(h: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (h ?? '').split(',')) {
    const [k, v] = pair.trim().split(' ');
    if (k) out[k] = v ? Buffer.from(v, 'base64').toString('utf8') : '';
  }
  return out;
}
