import 'server-only';
import path from 'node:path';
import { env } from '../env';
import { SANDBOX_HEADERS } from './thumbs';
import { bucketStore, KEY_PATTERN, mimeOfKey, privateSignedUrl, publicFileUrl } from './buckets';
import { insideFolder, readIfExists } from './local-files';
import { downloadGate, type ScanStatus } from './scanner';

// Serving the website's files (design §6). Private ones only after the caller decided who may see them (the staff's
// route asks RLS with the person's session; the citizen's asks citizen.request_attachment with the receipt): then the
// scan rule (scanner.ts), and the bytes from this machine's folder or a 60-second signed link to Supabase. Always with
// the sandbox headers, never cached, never indexed; a PDF is always downloaded, never shown inside a page.

const PRIVATE_HEADERS = { ...SANDBOX_HEADERS, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });

/** A name for the downloaded file: letters, numbers and dashes only, with the key's extension. */
export function downloadName(base: string, key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1);
  const clean = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${clean || 'archivo'}.${ext}`;
}

export async function servePrivateFile(f: { storageKey: string; scanStatus: ScanStatus; name: string; inline?: boolean }): Promise<Response> {
  if (!KEY_PATTERN['participacion-privado'].test(f.storageKey)) return text(404, 'No encontrado');
  const gate = downloadGate(f.scanStatus);
  if (!gate.ok) return text(423, gate.reason);
  const mime = mimeOfKey(f.storageKey);
  const name = downloadName(f.name, f.storageKey);
  const inline = !!f.inline && mime.startsWith('image/');
  if (env.dataMode === 'supabase') {
    const url = await privateSignedUrl(f.storageKey, { seconds: 60, downloadAs: inline ? undefined : name });
    if (!url) return text(502, 'No se pudo preparar el archivo. Vuelve a intentarlo.');
    return new Response(null, { status: 302, headers: { ...PRIVATE_HEADERS, Location: url } });
  }
  const bytes = await bucketStore('participacion-privado').read(f.storageKey);
  if (!bytes) return text(404, 'Archivo de demostración: no hay un archivo real detrás.');
  const headers: Record<string, string> = {
    ...PRIVATE_HEADERS,
    'Content-Type': mime,
    'Content-Length': String(bytes.length),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
  };
  if (gate.warning) headers['X-Archivo-Aviso'] = 'sin-analizar';
  return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers });
}

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
