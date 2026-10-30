// Redes por formato (R4, D-60 to D-78): the formats, the months, the feed numbers, the computed states, what goes out
// and the texts, one source for the pages, the actions, the guides and the tests. Pure: no React, no database. The
// database decides (supabase/migrations/20261029000100_redes_formatos.sql); what is here only says it first, in
// Spanish, and paints the screens. Written whole in Paso 0 (tests/unit/redes-domain.test.ts); then WP-B's.

// ---------------------------------------------------------------------------------------------------------------
// Formats (D-61): one piece, one format. The list is pieces_format_check's.
// ---------------------------------------------------------------------------------------------------------------
export const FORMATS = ['reel', 'post', 'carousel', 'story', 'youtube', 'month_end'] as const;
export type Format = (typeof FORMATS)[number];
// What goes in the feed (D-69): the 8/12/4 is the quota, not a mould.
export const FEED_FORMATS = ['post', 'reel', 'carousel'] as const satisfies readonly Format[];
// Fin de mes has no quota (D-72).
export const QUOTA_FORMATS = ['reel', 'post', 'carousel', 'story', 'youtube'] as const satisfies readonly Format[];
export type QuotaFormat = (typeof QUOTA_FORMATS)[number];

export type FormatInfo = {
  label: string; // one piece: 'Reel'
  plural: string; // the section: 'Reels'
  slug: string; // /redes/<slug>
  newLabel: string; // «+ Nuevo reel»
  defaultTitle: string; // the title of a new draft
  hint: string; // its help in «¿Qué quieres crear?»
  ratio: '9:16' | '4:5' | '16:9';
  kind: 'video' | 'photo' | 'carousel' | 'short'; // pieces.kind (the old column, still filled)
  defaultLevel: 'verde' | 'amarillo'; // a story goes green (A10): the boss approves them together
};

export const FORMAT: Record<Format, FormatInfo> = {
  reel: { label: 'Reel', plural: 'Reels', slug: 'reels', newLabel: 'Nuevo reel', defaultTitle: 'Reel nuevo', hint: 'Video vertical 9:16 con tomas', ratio: '9:16', kind: 'video', defaultLevel: 'amarillo' },
  post: { label: 'Post', plural: 'Posts', slug: 'posts', newLabel: 'Nuevo post', defaultTitle: 'Post nuevo', hint: 'Una imagen con su texto del arte', ratio: '4:5', kind: 'photo', defaultLevel: 'amarillo' },
  carousel: { label: 'Carrusel', plural: 'Carruseles', slug: 'carruseles', newLabel: 'Nuevo carrusel', defaultTitle: 'Carrusel nuevo', hint: 'Varias láminas en orden', ratio: '4:5', kind: 'carousel', defaultLevel: 'amarillo' },
  story: { label: 'Historia', plural: 'Historias', slug: 'historias', newLabel: 'Nueva historia', defaultTitle: 'Historia nueva', hint: 'Foto o clip 9:16 con sticker', ratio: '9:16', kind: 'short', defaultLevel: 'verde' },
  youtube: { label: 'Video de YouTube', plural: 'YouTube', slug: 'youtube', newLabel: 'Nuevo video de YouTube', defaultTitle: 'Video nuevo', hint: 'Video horizontal 16:9', ratio: '16:9', kind: 'video', defaultLevel: 'amarillo' },
  month_end: { label: 'Pieza de fin de mes', plural: 'Fin de mes', slug: 'fin-de-mes', newLabel: 'Nueva pieza de fin de mes', defaultTitle: 'Cierre del mes', hint: 'Imágenes del cierre y su copy', ratio: '4:5', kind: 'carousel', defaultLevel: 'amarillo' },
};

export function isFormat(v: unknown): v is Format {
  return typeof v === 'string' && (FORMATS as readonly string[]).includes(v);
}

/** The format of a section's address (/redes/reels → 'reel'), or null: the page answers notFound(). */
export function formatFromSlug(slug: string): Format | null {
  return FORMATS.find((f) => FORMAT[f].slug === slug) ?? null;
}

// The quota of the reference (A1), until Ajustes → Cupo y pilares says otherwise (config/clients/fb.json redes.quotas).
export const DEFAULT_QUOTA: Record<QuotaFormat, number> = { reel: 12, post: 8, carousel: 4, story: 30, youtube: 4 };

/** The format of a piece made with only the old `kind` (as the migration filled the pieces that existed, D-76). */
export function formatOfKind(kind: string): Format {
  if (kind === 'carousel') return 'carousel';
  if (kind === 'photo' || kind === 'cover') return 'post';
  return 'reel';
}

// The network format each piece format goes out as (D-73), in order of preference: the publication's `format` and
// the network rule it is checked against (config/network-specs.json). Fin de mes goes out as a carousel.
export const NETWORK_FORMATS: Record<Format, readonly string[]> = {
  reel: ['reel', 'short', 'video'],
  post: ['photo'],
  carousel: ['carousel'],
  story: ['story'],
  youtube: ['video'],
  month_end: ['carousel'],
};
// «Esta red no recibe historias» (D-73).
const RECEIVED_NOUN: Record<Format, string> = { reel: 'reels', post: 'posts', carousel: 'carruseles', story: 'historias', youtube: 'videos de YouTube', month_end: 'carruseles' };
export const notReceived = (network: string, f: Format) => `${network}: esta red no recibe ${RECEIVED_NOUN[f]}.`;

// Why «Ya lo publiqué» and Publicar are off (D-63, D-64): the same words on the card and in the actions.
export const NO_APPROVAL = 'Falta la aprobación del jefe';
export const DESIGN_HELD = 'El diseño quedó desaprobado: el jefe tiene que volver a verla';
/** A card's save made on an old rev (someone saved after it was read): refused, and the card does not send it again. */
export const STALE_CARD = 'Otra persona cambió esta tarjeta. Recarga para ver lo último.';

// ---------------------------------------------------------------------------------------------------------------
// Months (D-67): one list for the sections and the feed.
// ---------------------------------------------------------------------------------------------------------------
export type Month = { id: string; label: string; ordinal: number };
// The open month, per person (chooseMonth): a page cannot write cookies while it opens (Next 16), so ?mes= rules.
export const MONTH_COOKIE = 'fb-redes-mes';

/** The name of a new month: after the highest number so far (pass the highest ordinal, so a deleted month's name is
 * never given again). nextMonthLabel(3) → 'Mes 4'. */
export function nextMonthLabel(count: number): string {
  return `Mes ${Math.max(0, Math.floor(count)) + 1}`;
}

/** «Borrar este mes»: what happens to its pieces (they are never deleted), said before asking. */
export function deleteMonthText(label: string, pieces: number, placed: number, target: string): string {
  const ask = `¿Borrar «${label}»?`;
  if (pieces <= 0) return `${ask} No tiene piezas.`;
  if (pieces === 1) {
    return `${ask} Tiene 1 pieza${placed ? ' (en el feed)' : ''}. No se borra: pasa a «${target}»${placed ? ` y queda «${NOT_SCHEDULED}»` : ''}.`;
  }
  const feed = placed ? ` y ${placed === 1 ? 'la del feed queda' : 'las del feed quedan'} «${NOT_SCHEDULED}»` : '';
  return `${ask} Tiene ${pieces} piezas${placed ? ` (${placed} en el feed)` : ''}. No se borra ninguna: pasan a «${target}»${feed}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Feed (D-69): the number is the real order of publication. #1 bottom right, #24 top left, 3 columns × 8 rows.
// cellToNumber is the only switch (question 11): the cell, the picker, the card's chip, the notices and Drive use it.
// ---------------------------------------------------------------------------------------------------------------
export const FEED_SIZE = 24;
export const FEED_COLS = 3;
// Cell 0 = top left, row by row: cell 0 → #24, cell 23 (bottom right) → #1.
export const cellToNumber = (cell: number) => FEED_SIZE - cell;
export const numberToCell = (n: number) => FEED_SIZE - n;
export const spaceLabel = (n: number) => `Espacio #${String(n).padStart(2, '0')}`;
export const feedChip = (month: string, n: number) => `En Feed · ${month} #${n}`;
export const alreadyIn = (month: string, n: number) => `Ya en ${month} · #${n}`;
export const NOT_SCHEDULED = 'Sin programar';

// ---------------------------------------------------------------------------------------------------------------
// States (D-62): computed from the review and the publications, never set by hand. pieces.status keeps its 5 values.
// ---------------------------------------------------------------------------------------------------------------
export type DisplayState = 'draft' | 'in_review' | 'scheduled' | 'published';
export const STATE_LABEL: Record<DisplayState, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  scheduled: 'Programado',
  published: 'Publicado',
};
// Approved and not published yet: still «En revisión» (the four states of the request), marked ready (tone ok).
export const READY_CHIP = 'En revisión · ✓ Lista';

export type DisplayInfo = { state: DisplayState; ready: boolean; changes: boolean };

/**
 * The card's state: «Publicado» with at least one publication done (whatever came after); «Programado» approved with
 * one scheduled; «En revisión» waiting for the boss, or approved and ready; «Borrador» for a draft, changes requested
 * (with «Pidieron cambios») and anything else. `ready` = approved; `changes` = changes requested.
 */
export function displayState(p: { status: string; pubs: { status: string }[] }): DisplayInfo {
  const ready = p.status === 'approved';
  const changes = p.status === 'changes_requested';
  if (p.pubs.some((x) => x.status === 'published')) return { state: 'published', ready, changes };
  if (ready && p.pubs.some((x) => x.status === 'scheduled')) return { state: 'scheduled', ready, changes };
  if (ready || p.status === 'in_review') return { state: 'in_review', ready, changes };
  return { state: 'draft', ready, changes };
}

export type ChipTone = 'neutral' | 'info' | 'ok' | 'warn';

export function chipFor(d: DisplayInfo): { label: string; tone: ChipTone } {
  if (d.state === 'published') return { label: STATE_LABEL.published, tone: 'ok' };
  if (d.state === 'scheduled') return { label: STATE_LABEL.scheduled, tone: 'info' };
  if (d.state === 'in_review') return d.ready ? { label: READY_CHIP, tone: 'ok' } : { label: STATE_LABEL.in_review, tone: 'info' };
  return { label: STATE_LABEL.draft, tone: d.changes ? 'warn' : 'neutral' };
}

// ---------------------------------------------------------------------------------------------------------------
// What goes out (D-61, F7): frozen in the version or back to the boss. In an approved piece these are read-only with
// «Editar (vuelve al jefe)»; everything else (script, planning, month, slot, order, pillar, marks) is saved freely.
// ---------------------------------------------------------------------------------------------------------------
export type OutgoingPart = 'title' | 'copies' | 'media' | 'slides' | 'on_screen' | 'sticker';
export const OUTGOING: Record<Format, readonly OutgoingPart[]> = {
  reel: ['title', 'copies', 'media'], // the title goes out as the Short's
  post: ['copies', 'media'],
  carousel: ['copies', 'slides'],
  story: ['media', 'on_screen', 'sticker'], // a story has no copy: its on-screen text and sticker are what goes out
  youtube: ['title', 'copies', 'media'],
  month_end: ['copies', 'slides'],
};

const time = (v: string | Date | null | undefined) => (v ? new Date(v).getTime() : NaN);

/**
 * Held back by the design (D-64, guard_publication_design): disapproved after the boss's last approval (or with no
 * approval at all). Then neither «Ya lo publiqué» nor Publicar go, until the boss approves again. Same rule as the
 * database's trigger; true = held.
 */
export function designHold(p: { designStatus: string | null; designAt: string | Date | null; approvedAt: string | Date | null }): boolean {
  if (p.designStatus !== 'disapproved' || !p.designAt) return false;
  const at = time(p.designAt);
  const approved = time(p.approvedAt);
  return Number.isNaN(approved) || at > approved;
}

// ---------------------------------------------------------------------------------------------------------------
// Addresses: every link of Redes carries the open month (?mes=), and a card is reached by #pieza-<id> (F2, F10).
// ---------------------------------------------------------------------------------------------------------------
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SLUGS = FORMATS.map((f) => FORMAT[f].slug).join('|');
const RETURN_RE = new RegExp(`^/redes(?:/(?:${SLUGS}))?(?:\\?mes=${UUID})?(?:#pieza-${UUID})?$`, 'i');

export const pieceAnchor = (id: string) => `pieza-${id}`;

/** The month of the address (?mes=), only when it is an id; anything else is no month (never carried in links). */
export function monthParam(raw: unknown): string | null {
  return typeof raw === 'string' && new RegExp(`^${UUID}$`, 'i').test(raw) ? raw.toLowerCase() : null;
}

/** A Redes path with the open month: withMonth('/redes/feed', id) → '/redes/feed?mes=<id>'. */
export function withMonth(path: string, monthId: string | null | undefined): string {
  return monthId ? `${path}?mes=${encodeURIComponent(monthId)}` : path;
}

/** A section with the open month and, optionally, the card to open there: /redes/posts?mes=<id>#pieza-<id>. */
export function sectionHref(slug: string, monthId: string | null, pieceId?: string): string {
  return `${withMonth(`/redes/${slug}`, monthId)}${pieceId ? `#${pieceAnchor(pieceId)}` : ''}`;
}

/**
 * Where «Revisar» comes back to (F5, ?volver=): only /redes or a section, with ?mes=<uuid> and #pieza-<uuid> when they
 * come. Anything else (another site, another screen, a way out with «..») is null: the review room goes to /aprobar.
 */
export function safeReturn(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 200) return null;
  return RETURN_RE.test(raw) ? raw : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Fields and labels (D-61, D-65, D-66): the keys are the database's CHECKs (piece_details, piece_notices).
// ---------------------------------------------------------------------------------------------------------------
export const STICKERS: Record<string, string> = {
  poll: 'Encuesta',
  quiz: 'Quiz',
  question: 'Pregunta',
  slider: 'Deslizador',
  repost: 'Repost',
  tip: 'Tip',
  countdown: 'Cuenta regresiva',
  link: 'Enlace',
  behind_scenes: 'Detrás de cámaras',
  other: 'Otro',
};

export const NOTICE_KINDS: Record<string, string> = {
  written_consent: 'Necesita autorización escrita',
  verify_source: 'Verificar la fuente y la fecha del dato',
  refer_professional: 'Remitir a un profesional',
  testimonial: 'Tono de testimonio',
  other: 'Otro aviso',
};

export const SLIDE_ROLES = { cover: 'Portada', body: 'Desarrollo', summary: 'Resumen', cta: 'CTA' } as const;
export type SlideRole = keyof typeof SLIDE_ROLES;

/** The suggested role of slide i of n: the first is the cover, the last the CTA, the one before it (with 4 or more) the
 * summary; the rest, development. */
export function suggestedRole(i: number, n: number): SlideRole {
  if (i === 0) return 'cover';
  if (i === n - 1) return 'cta';
  if (n >= 4 && i === n - 2) return 'summary';
  return 'body';
}

/** The pictures to try for a piece's thumbnail, in order (the feed cell, the card's header, the picker): its cover,
 * its own file (a picture, or a video's frame kept at upload), then its first slide. Each once. */
export function pieceThumbIds(v: { coverId?: string | null; mediaId?: string | null; mediaMime?: string | null; slideIds?: readonly (string | null)[] | null } | null): string[] {
  if (!v) return [];
  const media = v.mediaId && (!v.mediaMime || v.mediaMime.startsWith('image/') || v.mediaMime.startsWith('video/')) ? v.mediaId : null;
  const first = (v.slideIds ?? []).find((s): s is string => !!s) ?? null;
  return [...new Set([v.coverId, media, first].filter((x): x is string => !!x))];
}

/** How the public received it (1 to 10); null: not rated (it never counts as 0, D-65). */
export function receptivityLabel(r: number | null): string {
  if (r === null || r < 1) return 'Sin evaluar';
  if (r >= 8) return 'Alta receptividad';
  if (r >= 5) return 'Receptividad media';
  return 'Baja receptividad';
}

// ---------------------------------------------------------------------------------------------------------------
// The section bar's numbers (F1): reviewed of its quota, without copy, without image. redes-dashboard.ts navCounts()
// fills them from the same matrix as the board.
// ---------------------------------------------------------------------------------------------------------------
export type NavCount = { reviewed: number; quota: number | null; copyMissing: number; imageMissing: number };

// ---------------------------------------------------------------------------------------------------------------
// The demo (D-39, D-76, F3): each server keeps its own database, so what one creates or moves may not show on
// another. Said once per person, honestly.
// ---------------------------------------------------------------------------------------------------------------
export const REDES_DEMO_NOTICE = 'En la demostración, cada servidor guarda lo suyo: lo que creas o mueves puede no verse al recargar, con otra cuenta o en otro teléfono. Lo sembrado siempre está.';
export const DEMO_OTHER_SERVER_PIECE = 'Esta pieza se creó en otro servidor de la demostración: aquí no está. Créala de nuevo con «+ Nuevo …».';
export const DEMO_OTHER_SERVER_THUMB = 'La miniatura está en otro servidor de la demostración.';
// localStorage, read and written with try/catch (src/components/ui/device-store.ts).
export const DEMO_NOTICE_KEY = (userId: string) => `fb:redes:demo-notice:${userId}`;
