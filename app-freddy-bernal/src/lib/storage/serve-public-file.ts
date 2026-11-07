import 'server-only';
import path from 'node:path';
import { env } from '../env';
import { bucketStore, KEY_PATTERN, mimeOfKey, publicFileUrl } from './buckets';
import { insideFolder, readIfExists } from './local-files';

// The public media library's files (design §6), in a module of their own: only the public files' route
// (src/app/api/archivos/web/[key]/route.ts) imports it. The bundler's file tracing follows what a module reads, so the
// official site's photos and PDFs of the demo (.real-site/media, written by the build) ship with that one function and
// not with the private files' routes (serve-files.ts), which never read them.

/** A file of the official site's content shipped with the deployment (.real-site/media, written by the build:
 * src/lib/web/real-site.ts), read-only; null when there is none. The key was checked: it never leaves that folder. */
async function realSiteFile(key: string): Promise<Uint8Array | null> {
  // Spelled out for the bundler's file tracing (next.config.ts also ships the folder with the public files' route).
  const file = insideFolder(path.join(process.cwd(), '.real-site', 'media'), key);
  return file ? readIfExists(file) : null;
}

/** The public library's file from this machine's folder: it never changes, so browsers and the CDN keep it a year. The
 * official site's photos and PDFs of the demo come from the deployment's own folder, so a server whose database has not
 * started yet serves them too. */
export async function servePublicFile(key: string): Promise<Response> {
  if (!KEY_PATTERN['web-public'].test(key)) return new Response('No encontrado', { status: 404 });
  if (env.dataMode === 'supabase') return Response.redirect(publicFileUrl(key), 308);
  const bytes = (await bucketStore('web-public').read(key)) ?? (await realSiteFile(key));
  if (!bytes) return new Response('No encontrado', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  const mime = mimeOfKey(key);
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  // Pictures cannot run anything; a published PDF opens in the browser's reader (a sandbox would block the reader).
  if (mime.startsWith('image/')) headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  else headers['Content-Disposition'] = `inline; filename="${key}"`;
  return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers });
}
