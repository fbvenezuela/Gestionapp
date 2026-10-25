// Range requests for Drive playback and downloads (pure, so it can be tested without a server).
// Each answer carries at most RANGE_CAP bytes: a video element asks again for the rest, and a
// slow phone never needs one function call longer than Vercel's limit.

export const RANGE_CAP = 4 * 1024 * 1024;
// When Drive ignores the Range and sends the whole file, bytes up to this offset are read and
// dropped; past it the request is refused rather than pulling megabytes for nothing.
export const SKIP_LIMIT = 8 * 1024 * 1024;
// A request with no Range gets the whole file in one answer only up to this size. Bigger files go
// by pieces (the platform's «Descargar» and the video player both ask for them): one long answer
// would be cut at Vercel's 300 s on a slow line (32 MiB in 300 s already needs about 0,9 Mbps).
export const FULL_MAX = 32 * 1024 * 1024;

export type RangeAsk =
  | { kind: 'none' }
  | { kind: 'from'; start: number; end: number | null }
  | { kind: 'suffix'; length: number }
  | { kind: 'bad' };

/** One «bytes=a-b», «bytes=a-» or «bytes=-n». Several ranges or anything else → bad. */
export function parseRange(h: string | null): RangeAsk {
  if (h == null || h.trim() === '') return { kind: 'none' };
  const m = /^\s*bytes\s*=\s*(\d{0,15})\s*-\s*(\d{0,15})\s*$/i.exec(h);
  if (!m || (m[1] === '' && m[2] === '')) return { kind: 'bad' };
  if (m[1] === '') return { kind: 'suffix', length: Number(m[2]) };
  const start = Number(m[1]);
  const end = m[2] === '' ? null : Number(m[2]);
  if (end != null && end < start) return { kind: 'bad' };
  return { kind: 'from', start, end };
}

export type RangePlan = { kind: 'full' } | { kind: 'part'; start: number; end: number } | { kind: 'unsatisfiable' };

/** The bytes to serve for a file of `size` bytes, capped at RANGE_CAP. */
export function planRange(ask: RangeAsk, size: number): RangePlan {
  if (ask.kind === 'none') return { kind: 'full' };
  if (ask.kind === 'bad' || size <= 0) return { kind: 'unsatisfiable' };
  let start: number;
  let end: number;
  if (ask.kind === 'suffix') {
    if (ask.length === 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - ask.length);
    end = size - 1;
  } else {
    if (ask.start >= size) return { kind: 'unsatisfiable' };
    start = ask.start;
    end = Math.min(ask.end ?? size - 1, size - 1);
  }
  return { kind: 'part', start, end: Math.min(end, start + RANGE_CAP - 1) };
}

/** «bytes 0-1023/4096» → its numbers, or null. */
export function parseContentRange(h: string | null): { start: number; end: number; size: number } | null {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(h ?? '');
  if (!m) return null;
  const [start, end, size] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return end >= start && size > end ? { start, end, size } : null;
}

/**
 * Passes a byte stream through, dropping the first `skip` bytes and stopping after `take`.
 * `onEnd(sent)` runs exactly once with the bytes actually handed on, whether the stream ends,
 * fails or the reader (the browser) goes away; stopping early cancels the source (Google).
 */
export function sliceStream(
  src: ReadableStream<Uint8Array>,
  o: { skip?: number; take?: number; onEnd: (sent: number) => void },
): ReadableStream<Uint8Array> {
  const reader = src.getReader();
  let skip = o.skip ?? 0;
  let left = o.take ?? Number.POSITIVE_INFINITY;
  let sent = 0;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    o.onEnd(sent);
  };
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      for (;;) {
        if (left <= 0) {
          end();
          ctrl.close();
          await reader.cancel().catch(() => {});
          return;
        }
        let r: ReadableStreamReadResult<Uint8Array>;
        try {
          r = await reader.read();
        } catch (e) {
          end();
          ctrl.error(e);
          return;
        }
        if (r.done) {
          end();
          ctrl.close();
          return;
        }
        let chunk = r.value;
        if (skip > 0) {
          if (chunk.length <= skip) {
            skip -= chunk.length;
            continue;
          }
          chunk = chunk.subarray(skip);
          skip = 0;
        }
        if (chunk.length > left) chunk = chunk.subarray(0, left);
        left -= chunk.length;
        sent += chunk.length;
        ctrl.enqueue(chunk);
        return;
      }
    },
    async cancel(reason) {
      end();
      await reader.cancel(reason).catch(() => {});
    },
  });
}
