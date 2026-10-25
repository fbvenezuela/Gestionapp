import { NextResponse, type NextRequest } from 'next/server';
import { driveIsFake } from '@/lib/storage/provider';

// DEMO ONLY (demo database + DRIVE_FAKE=1): the browser's upload chunks for the in-memory fake
// Drive. It speaks Google's resumable protocol (308 + Range, 200 when done) so the real uploader
// runs unchanged. With a real database, or without DRIVE_FAKE, this route does not exist.
export async function PUT(req: NextRequest) {
  if (!driveIsFake()) return new NextResponse('No encontrado', { status: 404 });
  const id = req.nextUrl.searchParams.get('upload_id') ?? '';
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return new NextResponse('No encontrado', { status: 404 });
  const { fakeDrive } = await import('@/lib/storage/drive/fake');
  const { DRIVE_UPLOAD } = await import('@/lib/storage/drive/client');
  const body = new Uint8Array(await req.arrayBuffer());
  const res = await fakeDrive().fetch(`${DRIVE_UPLOAD}?uploadType=resumable&upload_id=${id}`, {
    method: 'PUT',
    headers: { 'Content-Range': req.headers.get('content-range') ?? '', Origin: req.headers.get('origin') ?? '' },
    body: body.length ? body : undefined,
  });
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const range = res.headers.get('range');
  if (range) headers.set('Range', range);
  if (res.status === 308) return new Response(null, { status: 308, headers });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(await res.arrayBuffer(), { status: res.status, headers });
}
