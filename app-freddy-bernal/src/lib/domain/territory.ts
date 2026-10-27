import { slug } from '../storage/drive/names';

// Municipalities and parishes (cambios del 27/10/2026, §4.2: «una pantalla por municipio con sus parroquias»).
// The 29 municipalities come from setting 'municipalities' (config/clients/fb.json). Setting 'parishes' maps a
// municipality to its parishes and stays EMPTY until the official list arrives: meanwhile a parish is free text
// (the database checks only its length) and the screens suggest the ones already in use. Same rules as
// check_territory() in supabase/migrations/20261027001700_fichas.sql.

export type ParishMap = Record<string, string[]>;

// «San Cristóbal» → «san-cristobal», for /municipios/[municipio].
export function municipalitySlug(name: string): string {
  return slug(name).toLowerCase();
}

// The configured name a slug stands for; null when it is none of them (the page answers «No encontramos esto»).
export function municipalityFromSlug(value: string, list: readonly string[]): string | null {
  let s: string;
  try {
    s = decodeURIComponent(value);
  } catch {
    return null;
  }
  const key = municipalitySlug(s);
  if (!key) return null;
  return list.find((m) => municipalitySlug(m) === key) ?? null;
}

// As the database stores it: no spaces at the ends, one space between words.
export function normalizeParish(s: string): string {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}

// One parish whatever its spelling («La  Concordia», «la concordia»): how the chips group them and how the lists
// filter by them (src/lib/data/fichas.ts PARISH_KEY does the same in SQL).
export function parishKey(s: string): string {
  return normalizeParish(s).toLocaleLowerCase('es');
}

// The official list of that municipality, [] while there is none.
export function parishesFor(map: ParishMap | null | undefined, municipality: string): string[] {
  const list = map?.[municipality];
  return Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p.trim()) : [];
}

// What the parish field offers: the official list when there is one; otherwise the parishes already written for
// that municipality (one per spelling, «La  Concordia» = «La Concordia»), in alphabetical order.
export function parishOptions(map: ParishMap | null | undefined, municipality: string, used: readonly string[] = []): { strict: boolean; options: string[] } {
  const official = parishesFor(map, municipality);
  if (official.length) return { strict: true, options: official };
  const seen = new Map<string, string>();
  for (const u of used) {
    const p = normalizeParish(u);
    if (p && !seen.has(parishKey(p))) seen.set(parishKey(p), p);
  }
  return { strict: false, options: [...seen.values()].sort((a, b) => a.localeCompare(b, 'es')) };
}

// The same answer check_territory() gives: '' is always fine; with an official list, only a parish on it.
export function parishAllowed(map: ParishMap | null | undefined, municipality: string, parish: string): boolean {
  const p = normalizeParish(parish);
  if (!p) return true;
  const official = parishesFor(map, municipality);
  return !official.length || official.includes(p);
}
