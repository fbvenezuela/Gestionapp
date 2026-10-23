import { NextResponse, type NextRequest } from 'next/server';
import { demoAppend, demoMeta, demoOffset } from '@/lib/storage/demo-store';
import { TUS_HEADERS, ownUpload } from '../shared';

type Ctx = { params: Promise<{ id: string }> };

export async function HEAD(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const up = await ownUpload(id);
  const meta = up ? demoMeta(up.storage_path) : null;
  if (!up || !meta) return new NextResponse(null, { status: 404, headers: TUS_HEADERS });
  return new NextResponse(null, { status: 200, headers: { ...TUS_HEADERS, 'Upload-Offset': String(demoOffset(up.storage_path)), 'Upload-Length': String(meta.length) } });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const up = await ownUpload(id);
  if (!up) return new NextResponse(null, { status: 404, headers: TUS_HEADERS });
  const offset = Number(req.headers.get('upload-offset'));
  const current = demoOffset(up.storage_path);
  if (offset !== current) return new NextResponse(null, { status: 409, headers: { ...TUS_HEADERS, 'Upload-Offset': String(current) } });
  const body = Buffer.from(await req.arrayBuffer());
  demoAppend(up.storage_path, body);
  return new NextResponse(null, { status: 204, headers: { ...TUS_HEADERS, 'Upload-Offset': String(current + body.length) } });
}
