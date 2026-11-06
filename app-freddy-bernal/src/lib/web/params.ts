// Reading the public pages' filters from the address (GET forms: the filters work with no JavaScript, and a filtered
// list can be shared as a link). Pure.

/** A page number from the address: 1 when missing or nonsense, never past `max`. */
export function pageParam(v: string | string[] | undefined, max = 500): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : 1;
}

/** One text value from the address (the first, trimmed, at most `max` characters). */
export function textParam(v: string | string[] | undefined, max = 120): string {
  return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, max) ?? '';
}

/** An address with its query: empty values (and page 1) left out. */
export function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '' && !(k === 'pagina' && Number(v) === 1)) q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** A day from the address («2026-11-04»), only if it is a real day; else ''. */
export function dayParam(v: string | string[] | undefined): string {
  const s = textParam(v, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s) ? s : '';
}

/** A value from the address only if it is one of the allowed keys; else ''. */
export function choiceParam<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | '' {
  const s = textParam(v, 80);
  return (allowed as readonly string[]).includes(s) ? (s as T) : '';
}
