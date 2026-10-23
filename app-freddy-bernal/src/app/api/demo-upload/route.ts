import { NextResponse, type NextRequest } from 'next/server';
import { demoCreate, demoOffset } from '@/lib/storage/demo-store';
import { TUS_HEADERS, ownUpload, parseMetadata } from './shared';

// Minimal tus (resumable upload) server for the demo. Real projects upload straight
// to Supabase Storage, which speaks the same protocol.
export async function POST(req: NextRequest) {
  const meta = parseMetadata(req.headers.get('upload-metadata'));
  const length = Number(req.headers.get('upload-length'));
  const up = meta.mediaId ? await ownUpload(meta.mediaId) : null;
  if (!up || !Number.isFinite(length)) return new NextResponse('No autorizado', { status: 403, headers: TUS_HEADERS });
  if (demoOffset(up.storage_path) < 0) demoCreate(up.storage_path, length);
  return new NextResponse(null, { status: 201, headers: { ...TUS_HEADERS, Location: `/api/demo-upload/${meta.mediaId}` } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...TUS_HEADERS, 'Tus-Version': '1.0.0', 'Tus-Extension': 'creation' } });
}
