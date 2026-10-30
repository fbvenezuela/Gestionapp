// The cards of Redes (R4, WP-C1, D-61 to D-70): what they say and decide, pure (no React, no server), so the card, the
// section and the tests read the same words. The database decides who may do what; this only paints it first.

import {
  FEED_FORMATS, FORMAT, NOT_SCHEDULED, OUTGOING, SLIDE_ROLES, suggestedRole, withMonth,
  type Format, type Month, type OutgoingPart, type SlideRole,
} from '@/lib/domain/redes';

// What a card needs to know about the section it lives in and the person looking at it.
export type Perms = {
  boss: boolean; // approves («Revisar»), deletes (with 2FA) and his design mark is his alone
  admin: boolean; // administración: edits, moves, never deletes nor marks the design
  mark: boolean; // design marks, receptivity and compliance notices: Redes and the boss (D-64, D-65, D-66)
};

export type PillarOption = { key: string; name: string; tone: 'neutral' | 'info' | 'accent' | 'ok' };

export type SectionCtx = {
  format: Format;
  monthId: string | null; // the open month
  monthLabel: string;
  months: Month[];
  pillars: PillarOption[];
  perms: Perms;
  demo: boolean;
  userId: string;
  manualOrder: boolean; // «Subir» / «Bajar» only make sense in the order «A mano»
};

/** The number chip of the header (D-69): «Reel #7» / «Reel · Sin programar» for what goes in the feed; the format's
 * name for the rest (stories, YouTube and Fin de mes never take a feed place). */
export function numberChip(format: Format, feed: { num: number } | null): string {
  const label = FORMAT[format].label;
  if (!(FEED_FORMATS as readonly Format[]).includes(format)) return label;
  return feed ? `${label} #${feed.num}` : `${label} · ${NOT_SCHEDULED}`;
}

/** The feed cell of a placed piece (the chip «En Feed · Mes 1 #7» jumps there): the feed of its month, at #espacio-N. */
export const feedCellId = (num: number) => `espacio-${num}`;
export const feedCellHref = (monthId: string, num: number) => `${withMonth('/redes/feed', monthId)}#${feedCellId(num)}`;

/** Whether this part of the piece is read-only with «Editar (vuelve al jefe)» (F7): an approved piece, and the part goes
 * out (the copies, a reel's or YouTube's title, the files, the slides, a story's on-screen text and sticker). */
export function isLocked(status: string, format: Format, part: OutgoingPart): boolean {
  return status === 'approved' && OUTGOING[format].includes(part);
}

export const LOCK_BUTTON = 'Editar (vuelve al jefe)';
export const LOCK_CONFIRM = 'Si lo cambias, la pieza vuelve al jefe para aprobar.';

/** «hace 5 min», «hace 2 h», «hace 3 días»: the marks and the activity never say an hour (D-75). */
export function agoText(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  const mo = Math.round(d / 30);
  return mo === 1 ? 'hace 1 mes' : `hace ${mo} meses`;
}

// Where a piece of each format usually goes out, for «Ya lo publiqué» (the networks the reference plans for; the
// network rules check the rest, D-73).
export const PUBLISH_NETWORKS: Record<Format, readonly ('instagram' | 'facebook' | 'tiktok' | 'threads' | 'x' | 'youtube')[]> = {
  reel: ['instagram', 'facebook', 'tiktok', 'youtube'],
  post: ['instagram', 'facebook', 'threads', 'x'],
  carousel: ['instagram', 'facebook'],
  story: ['instagram', 'facebook'],
  youtube: ['youtube'],
  month_end: ['instagram', 'facebook'],
};

// ---------------------------------------------------------------------------------------------------------------
// Slides (carousel and Fin de mes): the images live in the version (frozen with it), the texts in piece_details. Both
// lists go by position; a slide exists when either has it.
// ---------------------------------------------------------------------------------------------------------------
export type SlideText = { role: SlideRole; title: string; text: string };

export function slideCount(images: readonly (string | null)[], texts: readonly SlideText[]): number {
  return Math.max(images.length, texts.length, 1);
}

export function padImages(images: readonly (string | null)[], n: number): (string | null)[] {
  return Array.from({ length: n }, (_, i) => images[i] ?? null);
}

export function padTexts(texts: readonly SlideText[], n: number): SlideText[] {
  return Array.from({ length: n }, (_, i) => texts[i] ?? { role: suggestedRole(i, n), title: '', text: '' });
}

/** The two lists after moving slide i one place (dir -1 before, +1 after); null when it cannot move. */
export function moveSlide<T>(list: readonly T[], i: number, dir: -1 | 1): T[] | null {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return null;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** The suggested role of each slide, said in Spanish: «Portada», «Desarrollo», «Resumen», «CTA». */
export const roleLabel = (i: number, n: number) => SLIDE_ROLES[suggestedRole(i, n)];

/** «Poner en el copy» (D-61): the CTA and the hashtags at the end of the long copy, each once. */
export function withCtaAndHashtags(copy: string, cta: string, hashtags: string): string {
  const parts = [copy.trimEnd()];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !copy.includes(t)) parts.push(t);
  };
  add(cta);
  add(hashtags);
  return parts.filter(Boolean).join('\n\n');
}

// The copy limits of the three lengths (the same as LIMITS in src/lib/domain/copies.ts, checked by
// tests/unit/redes-card-render.test.ts). Kept here so a card does not load that module: it brings twitter-text, which the
// short copy's exact count needs only once «Threads y X» is opened.
export const COPY_LIMITS = { long: 2200, medium: 500, short: 280 } as const;
/** The length of a copy before twitter-text arrives: letters as the person sees them. */
export const plainLength = (s: string) => [...s].length;

// A new or deleted month's address is built on the client from the tab's address with this slot where the id goes
// (month-tabs.tsx renders `hrefFor(MONTH_SLOT)` on the server; a plain module, so both sides read the same string).
export const MONTH_SLOT = '__MES__';

// The fold of a card, remembered per person on this phone (D-70): '1' folded, '0' open.
export const foldKey = (userId: string, pieceId: string) => `fb:redes:fold:${userId}:${pieceId}`;
// Where the phone layout starts (design §5.3: 360–599 px).
export const PHONE_QUERY = '(max-width: 599px)';
