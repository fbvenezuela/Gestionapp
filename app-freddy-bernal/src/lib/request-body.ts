// The body of a file upload (the citizen's files, the team's evidence, the website's media library), read with a cap.
// `req.formData()` reads the whole body before anyone can look at its size: with Content-Length the routes refused a
// big one first, but a body sent in chunks (no Content-Length) was read to the end, however big. Here the body is read
// piece by piece and dropped as soon as it passes the cap, and only then parsed. Vercel stops a function's body at
// 4.5 MB by itself; a server of our own (next start, LOCAL_DATA_DIR) has nothing else in front of it. Pure (Web streams).

export type CappedForm = { ok: true; form: FormData } | { ok: false; reason: 'too_big' | 'bad' };

/** The body's bytes, or null as soon as it passes `max` (the rest is never read). */
export async function readBodyCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** A multipart form of at most `max` bytes: «too_big» past the cap, «bad» when it is not a form. */
export async function readFormCapped(req: Request, max: number): Promise<CappedForm> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readBodyCapped(req, max);
  } catch {
    return { ok: false, reason: 'bad' };
  }
  if (!bytes) return { ok: false, reason: 'too_big' };
  try {
    const form = await new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, reason: 'bad' };
  }
}
