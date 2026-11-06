import type { NextRequest } from 'next/server';
import { servePublicFile } from '@/lib/storage/serve-files';

// The public media library (bucket web-public) in the demo and local work: a key is a file that never changes, so it is
// cached for a year (src/lib/storage/serve-files.ts). With DATABASE_URL it sends to the Supabase public address.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return servePublicFile(key);
}
