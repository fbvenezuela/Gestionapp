import type { Sql } from '../db/core';
import { fmtAt, dt } from '../time';
import {
  DEFAULT_QUOTA, FEED_FORMATS, FEED_SIZE, FORMAT, FORMATS, MONTH_COOKIE, QUOTA_FORMATS, cellToNumber, chipFor, designHold, displayState,
  isFormat, pieceThumbIds, sectionHref,
  type DisplayState, type Format, type Month, type NavCount, type QuotaFormat, type SlideRole,
} from '../domain/redes';
import { reviewBlockers, reviewWarnings, type Dims, type PieceFacts } from '../domain/format-rules';
import { navCounts, receptivityAverage, type ActivityKind, type DashRow } from '../domain/redes-dashboard';

// The reads of Redes por formato (R4, D-60 to D-78). Every function takes `sql` already inside db(session, …): it
// runs AS THE PERSON (RLS). None of them reads the agenda (an event's date, time or address), and of an event only
// its id and title: Redes never sees when or where the boss goes (D-75). The day a card shows is the day the PIECE
// was made, never an hour. A piece with no month (an old database before seed-client) is shown in the first month.
// The number of queries of each read is fixed: it does not grow with the number of cards.

// ---------------------------------------------------------------------------------------------------------------
// Months and settings
// ---------------------------------------------------------------------------------------------------------------

/** The live months, in order. */
export async function getMonths(sql: Sql): Promise<Month[]> {
  return sql.query<Month>(`select id, label, ordinal from public.content_months where deleted_at is null order by ordinal, id`);
}

/** The open month: the address (?mes=) first, then the person's last choice (cookie), then the first month. */
export function pickMonth(months: Month[], param: string | null | undefined, cookie: string | null | undefined): Month | null {
  return months.find((m) => m.id === param) ?? months.find((m) => m.id === cookie) ?? months[0] ?? null;
}

/** The person's last open month (chooseMonth's cookie), for pages. Never throws outside a request. */
export async function monthCookie(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers');
    return (await cookies()).get(MONTH_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export type MonthContext = { months: Month[]; active: Month | null; firstId: string | null };

/** Months + the open one, as every page of Redes needs them. `param` = monthParam(searchParams.mes). */
export async function monthContext(sql: Sql, param: string | null | undefined): Promise<MonthContext> {
  const months = await getMonths(sql);
  return { months, active: pickMonth(months, param, await monthCookie()), firstId: months[0]?.id ?? null };
}

export const PILLAR_TONES = ['neutral', 'info', 'accent', 'ok'] as const;
export type PillarTone = (typeof PILLAR_TONES)[number];
export type Pillar = { key: string; name: string; tone: PillarTone };
export type RedesSettings = { quotas: Record<QuotaFormat, number>; pillars: Pillar[] };

/** Cupo y pilares (D-68): app_settings redes.quotas and redes.pillars, with the reference's quota where missing. */
export async function getRedesSettings(sql: Sql): Promise<RedesSettings> {
  const rows = await sql.query<{ key: string; value: unknown }>(`select key, value from public.app_settings where key in ('redes.quotas', 'redes.pillars')`);
  const raw = (k: string) => rows.find((r) => r.key === k)?.value;
  const q = raw('redes.quotas');
  const quotas = { ...DEFAULT_QUOTA };
  if (q && typeof q === 'object' && !Array.isArray(q)) {
    for (const f of QUOTA_FORMATS) {
      const v = (q as Record<string, unknown>)[f];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 200) quotas[f] = v;
    }
  }
  const p = raw('redes.pillars');
  const pillars: Pillar[] = Array.isArray(p)
    ? p.flatMap((x) => {
        const o = x as Record<string, unknown>;
        if (typeof o?.key !== 'string' || typeof o.name !== 'string') return [];
        const tone = (PILLAR_TONES as readonly string[]).includes(o.tone as string) ? (o.tone as PillarTone) : 'neutral';
        return [{ key: o.key, name: o.name, tone }];
      })
    : [];
  return { quotas, pillars };
}

const quotaOf = (f: Format, quotas: Partial<Record<Format, number>>): number | null =>
  (QUOTA_FORMATS as readonly Format[]).includes(f) ? (quotas[f] ?? null) : null;

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

export type Shot = { says: string; action: string; on_screen: string };
export type SlideText = { role: SlideRole; title: string; text: string };

// piece_details as the card edits it: the database's column names (saveDetails takes the same keys). rev 0 = no row
// yet (the first save inserts it).
export type CardDetails = {
  rev: number;
  art_overline: string; art_headline: string; art_seals: string; art_fine_print: string;
  visual_concept: string; hook: string; cta: string; hashtags: string; publication_notes: string;
  sticker: string | null; sticker_text: string; sticker_url: string; on_screen: string; follow_up: string;
  idea: string; links: string; post_ratio: '4:5' | '1:1'; reference_asset_id: string | null;
  shots: Shot[]; slides: SlideText[];
};

export const EMPTY_DETAILS: CardDetails = {
  rev: 0, art_overline: '', art_headline: '', art_seals: '', art_fine_print: '', visual_concept: '', hook: '', cta: '', hashtags: '',
  publication_notes: '', sticker: null, sticker_text: '', sticker_url: '', on_screen: '', follow_up: '', idea: '', links: '',
  post_ratio: '4:5', reference_asset_id: null, shots: [], slides: [],
};

export type CardNotice = { id: string; kind: string; body: string; by: string | null; at: string };
export type CardPub = { id: string; network: string; status: string; url: string | null; evidenceId: string | null };

export type CardData = {
  id: string;
  format: Format;
  title: string;
  status: string;
  displayState: DisplayState;
  ready: boolean; // approved by the boss
  changes: boolean; // changes requested
  chip: { label: string; tone: 'neutral' | 'info' | 'ok' | 'warn' };
  reviewLevel: 'verde' | 'amarillo' | 'rojo';
  revision: number; // what review_piece is told the boss saw
  approvedVersion: number | null;
  createdDay: string; // «26 oct 2026»: the day the piece was made, never an hour (D-75)
  pillar: string | null;
  sortOrder: number;
  rating: number | null;
  design: { status: 'approved' | 'disapproved' | null; note: string; by: string | null; byBoss: boolean; at: string | null };
  designHold: boolean; // disapproved after the approval: nothing goes out (D-64)
  monthId: string | null;
  event: { id: string; title: string } | null;
  details: CardDetails;
  version: { n: number; mediaId: string | null; mediaMime: string | null; w: number | null; h: number | null; coverId: string | null; slideIds: (string | null)[]; slideDims: (Dims | null)[] } | null;
  thumbIds: string[];
  copies: { long: string; medium: string; short: string };
  notices: CardNotice[]; // open ones, oldest first
  pubs: CardPub[];
  feed: { monthId: string; month: string; num: number } | null;
  blockers: string[]; // what stops «Enviar a aprobación»
  warnings: string[];
};

export type SectionSort = 'manual' | 'feed' | 'newest' | 'oldest';

const ORDER: Record<SectionSort, string> = {
  manual: 'p.sort_order, p.created_at desc, p.id',
  feed: '(select s.num from public.feed_slots s where s.piece_id = p.id) nulls last, p.sort_order, p.created_at desc, p.id',
  newest: 'p.created_at desc, p.id',
  oldest: 'p.created_at, p.id',
};

type PieceRow = {
  id: string; format: string; title: string; status: string; review_level: CardData['reviewLevel']; revision: number; created_at: Date | string;
  pillar: string | null; sort_order: number; rating: number | null; design_status: CardData['design']['status']; design_note: string;
  design_at: Date | string | null; approved_at: Date | string | null; approved_version: number | null; current_version: number;
  content_month_id: string | null; event_id: string | null; event_title: string | null; design_by_name: string | null; design_by_boss: boolean;
};

const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function asShots(v: unknown): Shot[] {
  return Array.isArray(v) ? v.map((e) => ({ says: str(e?.says), action: str(e?.action), on_screen: str(e?.on_screen) })) : [];
}

function asSlides(v: unknown): SlideText[] {
  const roles = new Set(['cover', 'body', 'summary', 'cta']);
  return Array.isArray(v)
    ? v.map((e) => ({ role: (roles.has(e?.role) ? e.role : 'body') as SlideRole, title: str(e?.title), text: str(e?.text) }))
    : [];
}

// The piece's own columns, its event's title only, who marked the design and whether that was the boss. «The boss»:
// the database's rule where the person may read the roles (administración, the boss himself), otherwise whoever has
// decided reviews (since 27/10 only the boss approves). The database decides who may lift his mark anyway.
const PIECE_SELECT = `
  select p.id, p.format, p.title, p.status, p.review_level, p.revision, p.created_at, p.pillar, p.sort_order, p.rating,
         p.design_status, p.design_note, p.design_at, p.approved_at, p.approved_version, p.current_version, p.content_month_id,
         p.event_id, e.title as event_title,
         coalesce(nullif(btrim(du.full_name), ''), du.email) as design_by_name,
         (p.design_by is not null and (exists (select 1 from public.user_roles r where r.user_id = p.design_by and r.role = 'boss')
                                       or exists (select 1 from public.reviews rv where rv.reviewer_id = p.design_by))) as design_by_boss
    from public.pieces p
    left join public.events e on e.id = p.event_id
    left join public.profiles du on du.id = p.design_by`;

async function loadCards(sql: Sql, where: string, params: unknown[], order: string): Promise<CardData[]> {
  const pieces = await sql.query<PieceRow>(`${PIECE_SELECT} where p.deleted_at is null and ${where} order by ${order}`, params);
  if (!pieces.length) return [];
  const ids = pieces.map((p) => p.id);
  const details = await sql.query<Omit<CardDetails, 'shots' | 'slides'> & { piece_id: string; shots: unknown; slides: unknown }>(
    `select piece_id, rev, art_overline, art_headline, art_seals, art_fine_print, visual_concept, hook, cta, hashtags, publication_notes,
            sticker, sticker_text, sticker_url, on_screen, follow_up, idea, links, post_ratio, reference_asset_id, shots, slides
       from public.piece_details where piece_id = any($1::uuid[])`,
    [ids],
  );
  // slide_asset_ids always through to_jsonb: postgres.js reads a NULL element of a uuid[] as the text 'NULL' (PGlite as null).
  const versions = await sql.query<{
    piece_id: string; version: number; media_asset_id: string | null; cover_asset_id: string | null; slide_asset_ids: (string | null)[] | null;
    media_mime: string | null; media_w: number | null; media_h: number | null; slide_dims: (Dims | null)[] | null;
  }>(
    `select v.piece_id, v.version, v.media_asset_id, v.cover_asset_id, to_jsonb(v.slide_asset_ids) as slide_asset_ids, m.mime as media_mime, m.width as media_w, m.height as media_h,
            (select coalesce(jsonb_agg(jsonb_build_object('w', s.width, 'h', s.height) order by a.ord), '[]'::jsonb)
               from unnest(v.slide_asset_ids) with ordinality a(id, ord) left join public.media_assets s on s.id = a.id) as slide_dims
       from public.piece_versions v
       join public.pieces p on p.id = v.piece_id and v.version = p.current_version
       left join public.media_assets m on m.id = v.media_asset_id
      where v.piece_id = any($1::uuid[])`,
    [ids],
  );
  const copies = await sql.query<{ piece_id: string; length_group: 'long' | 'medium' | 'short'; body: string }>(
    `select piece_id, length_group, body from public.copies where piece_id = any($1::uuid[])`,
    [ids],
  );
  const notices = await sql.query<{ id: string; piece_id: string; kind: string; body: string; created_at: Date | string; by_name: string | null }>(
    `select n.id, n.piece_id, n.kind, n.body, n.created_at, coalesce(nullif(btrim(u.full_name), ''), u.email) as by_name
       from public.piece_notices n left join public.profiles u on u.id = n.created_by
      where n.piece_id = any($1::uuid[]) and n.resolved_at is null
      order by n.created_at, n.id`,
    [ids],
  );
  const pubs = await sql.query<{ id: string; piece_id: string; network: string; status: string; url: string | null; evidence_asset_id: string | null }>(
    `select id, piece_id, network, status, url, evidence_asset_id from public.publications
      where piece_id = any($1::uuid[]) and deleted_at is null order by created_at, id`,
    [ids],
  );
  const slots = await sql.query<{ piece_id: string; num: number; month_id: string; label: string }>(
    `select s.piece_id, s.num, s.month_id, m.label from public.feed_slots s join public.content_months m on m.id = s.month_id
      where s.piece_id = any($1::uuid[])`,
    [ids],
  );

  const by = <T extends { piece_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.piece_id, [...(m.get(r.piece_id) ?? []), r]);
    return m;
  };
  const dMap = new Map(details.map((d) => [d.piece_id, d]));
  const vMap = new Map(versions.map((v) => [v.piece_id, v]));
  const cMap = by(copies);
  const nMap = by(notices);
  const pMap = by(pubs);
  const sMap = new Map(slots.map((s) => [s.piece_id, s]));

  return pieces.flatMap((p) => {
    if (!isFormat(p.format)) return [];
    const d = dMap.get(p.id);
    const det: CardDetails = d
      ? {
          rev: d.rev, art_overline: d.art_overline, art_headline: d.art_headline, art_seals: d.art_seals, art_fine_print: d.art_fine_print,
          visual_concept: d.visual_concept, hook: d.hook, cta: d.cta, hashtags: d.hashtags, publication_notes: d.publication_notes,
          sticker: d.sticker, sticker_text: d.sticker_text, sticker_url: d.sticker_url, on_screen: d.on_screen, follow_up: d.follow_up,
          idea: d.idea, links: d.links, post_ratio: d.post_ratio === '1:1' ? '1:1' : '4:5', reference_asset_id: d.reference_asset_id,
          shots: asShots(d.shots), slides: asSlides(d.slides),
        }
      : { ...EMPTY_DETAILS };
    const v = p.current_version > 0 ? vMap.get(p.id) : undefined;
    const version = v
      ? {
          n: v.version, mediaId: v.media_asset_id, mediaMime: v.media_mime, w: v.media_w, h: v.media_h, coverId: v.cover_asset_id,
          slideIds: v.slide_asset_ids ?? [], slideDims: (v.slide_dims ?? []).map((x) => (x && (x.w || x.h) ? { w: x.w, h: x.h } : null)),
        }
      : null;
    const c = cMap.get(p.id) ?? [];
    const copy = (g: 'long' | 'medium' | 'short') => c.find((x) => x.length_group === g)?.body ?? '';
    const myPubs = (pMap.get(p.id) ?? []).map((x) => ({ id: x.id, network: x.network, status: x.status, url: x.url, evidenceId: x.evidence_asset_id }));
    const ds = displayState({ status: p.status, pubs: myPubs });
    const facts: PieceFacts = {
      format: p.format, currentVersion: p.current_version, mediaMime: version?.mediaMime ?? null, mediaW: version?.w, mediaH: version?.h,
      coverId: version?.coverId ?? null, slides: version?.slideIds ?? [], slideDims: version?.slideDims, longCopy: copy('long'),
      onScreen: det.on_screen, postRatio: det.post_ratio,
    };
    const slot = sMap.get(p.id);
    const card: CardData = {
      id: p.id,
      format: p.format,
      title: p.title,
      status: p.status,
      displayState: ds.state,
      ready: ds.ready,
      changes: ds.changes,
      chip: chipFor(ds),
      reviewLevel: p.review_level,
      revision: p.revision,
      approvedVersion: p.approved_version,
      createdDay: fmtAt(dt(p.created_at), 'd LLL yyyy'),
      pillar: p.pillar,
      sortOrder: p.sort_order,
      rating: p.rating,
      design: { status: p.design_status, note: p.design_note ?? '', by: p.design_by_name, byBoss: !!p.design_by_boss, at: iso(p.design_at) },
      designHold: designHold({ designStatus: p.design_status, designAt: p.design_at, approvedAt: p.approved_at }),
      monthId: p.content_month_id,
      event: p.event_id ? { id: p.event_id, title: p.event_title ?? 'Evento' } : null,
      details: det,
      version,
      thumbIds: pieceThumbIds(version ? { coverId: version.coverId, mediaId: version.mediaId, mediaMime: version.mediaMime, slideIds: version.slideIds } : null),
      copies: { long: copy('long'), medium: copy('medium'), short: copy('short') },
      notices: (nMap.get(p.id) ?? []).map((n) => ({ id: n.id, kind: n.kind, body: n.body, by: n.by_name, at: iso(n.created_at)! })),
      pubs: myPubs,
      feed: slot ? { monthId: slot.month_id, month: slot.label, num: slot.num } : null,
      blockers: reviewBlockers(facts),
      warnings: reviewWarnings(facts),
    };
    return [card];
  });
}

/** One section of one month (D-60): the cards in its order, how many and its quota. Pieces with no month belong to
 * the first month. `quotas`: from getRedesSettings when the page already has them (one query less). */
export async function getSection(
  sql: Sql,
  format: Format,
  monthId: string | null,
  firstMonthId: string | null,
  sort: SectionSort = 'manual',
  quotas?: Partial<Record<Format, number>>,
): Promise<{ cards: CardData[]; count: number; quota: number | null }> {
  const cards = await loadCards(
    sql,
    `p.format = $1 and (p.content_month_id = $2::uuid or (p.content_month_id is null and ($2::uuid is null or $2::uuid = $3::uuid)))`,
    [format, monthId, firstMonthId],
    ORDER[sort] ?? ORDER.manual,
  );
  const q = quotas ?? (await getRedesSettings(sql)).quotas;
  return { cards, count: cards.length, quota: quotaOf(format, q) };
}

/** One card (the piece in big at /piezas/[id], the review room, an action's answer). Null: gone, or another server's
 * piece in the demo. */
export async function getCard(sql: Sql, pieceId: string): Promise<CardData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(pieceId)) return null;
  return (await loadCards(sql, `p.id = $1::uuid`, [pieceId], ORDER.manual))[0] ?? null;
}

/** Where a card lives: its section with the month and the anchor (sectionHref). */
export function cardHref(c: Pick<CardData, 'id' | 'format' | 'monthId'>, fallbackMonthId: string | null = null): string {
  return sectionHref(FORMAT[c.format].slug, c.monthId ?? fallbackMonthId, c.id);
}

/** The month tabs' numbers: per month, the format's pieces («Mes 1 · 3 de 8») or the feed's filled places
 * («Mes 1 · 21 de 24»). Pieces with no month count in the first month. */
export async function getMonthCounts(sql: Sql, of: Format | 'feed'): Promise<Record<string, number>> {
  const rows =
    of === 'feed'
      ? await sql.query<{ month_id: string; n: number }>(
          `select s.month_id, count(*)::int as n from public.feed_slots s join public.content_months m on m.id = s.month_id
            where s.piece_id is not null and m.deleted_at is null group by s.month_id`,
        )
      : await sql.query<{ month_id: string | null; n: number }>(
          `select coalesce(p.content_month_id, (select id from public.content_months where deleted_at is null order by ordinal limit 1)) as month_id,
                  count(*)::int as n
             from public.pieces p where p.deleted_at is null and p.format = $1 group by 1`,
          [of],
        );
  const out: Record<string, number> = {};
  for (const r of rows) if (r.month_id) out[r.month_id] = (out[r.month_id] ?? 0) + r.n;
  return out;
}

/** «Borrar este mes» (D-67), said before asking: per live month, its live pieces of every format (the number
 * delete_content_month checks) and its filled feed places (they become «Sin programar»). */
export async function getMonthTotals(sql: Sql): Promise<Record<string, { pieces: number; placed: number }>> {
  const rows = await sql.query<{ id: string; pieces: number; placed: number }>(
    `select m.id,
            (select count(*)::int from public.pieces p where p.content_month_id = m.id and p.deleted_at is null) as pieces,
            (select count(*)::int from public.feed_slots s where s.month_id = m.id and s.piece_id is not null) as placed
       from public.content_months m where m.deleted_at is null`,
  );
  return Object.fromEntries(rows.map((r) => [r.id, { pieces: r.pieces, placed: r.placed }]));
}

// ---------------------------------------------------------------------------------------------------------------
// Feed (D-69)
// ---------------------------------------------------------------------------------------------------------------

export type FeedPiece = {
  pieceId: string; num: number; format: Format; title: string; thumbIds: string[]; state: DisplayState; ready: boolean; published: boolean; rating: number | null;
};
// In grid order: cell 0 = top left. The number comes from cellToNumber only (question 11).
export type FeedCell = { cell: number; num: number; piece: FeedPiece | null };

export async function getFeed(sql: Sql, monthId: string | null): Promise<{ cells: FeedCell[]; filled: number; receptivity: { avg: number | null; count: number } }> {
  const rows = monthId
    ? await sql.query<{
        num: number; piece_id: string | null; format: string | null; title: string | null; status: string | null; rating: number | null;
        cover_asset_id: string | null; media_asset_id: string | null; media_mime: string | null; slide_asset_ids: (string | null)[] | null;
      }>(
        `select s.num, p.id as piece_id, p.format, p.title, p.status, p.rating, v.cover_asset_id, v.media_asset_id, m.mime as media_mime, to_jsonb(v.slide_asset_ids) as slide_asset_ids
           from public.feed_slots s
           left join public.pieces p on p.id = s.piece_id and p.deleted_at is null
           left join public.piece_versions v on v.piece_id = p.id and v.version = p.current_version
           left join public.media_assets m on m.id = v.media_asset_id
          where s.month_id = $1
          order by s.num`,
        [monthId],
      )
    : [];
  const placed = rows.filter((r) => r.piece_id && r.format && isFormat(r.format));
  const pubs = placed.length
    ? await sql.query<{ piece_id: string; status: string }>(
        `select piece_id, status from public.publications where piece_id = any($1::uuid[]) and deleted_at is null`,
        [placed.map((r) => r.piece_id)],
      )
    : [];
  const byNum = new Map<number, FeedPiece>();
  for (const r of placed) {
    const mine = pubs.filter((x) => x.piece_id === r.piece_id);
    const ds = displayState({ status: r.status ?? 'draft', pubs: mine });
    byNum.set(r.num, {
      pieceId: r.piece_id!, num: r.num, format: r.format as Format, title: r.title ?? '',
      thumbIds: pieceThumbIds({ coverId: r.cover_asset_id, mediaId: r.media_asset_id, mediaMime: r.media_mime, slideIds: r.slide_asset_ids }),
      state: ds.state, ready: ds.ready, published: ds.state === 'published', rating: r.rating,
    });
  }
  const cells: FeedCell[] = Array.from({ length: FEED_SIZE }, (_, cell) => {
    const num = cellToNumber(cell);
    return { cell, num, piece: byNum.get(num) ?? null };
  });
  return { cells, filled: byNum.size, receptivity: receptivityAverage([...byNum.values()]) };
}

export type PickerItem = {
  id: string; title: string; thumbIds: string[]; hasMedia: boolean; monthId: string | null; monthLabel: string; otherMonth: boolean;
  place: { month: string; num: number } | null;
};

/** The feed's picker (D-69, A11): the posts, reels and carousels of every month, this month's first; where each one
 * already is («Ya en Mes 1 · #4») and which month it belongs to («De Mes 2»). */
export async function getFeedPicker(sql: Sql, monthId: string | null): Promise<Record<(typeof FEED_FORMATS)[number], PickerItem[]>> {
  const rows = await sql.query<{
    id: string; title: string; format: string; month_id: string | null; month_label: string | null; is_here: boolean;
    cover_asset_id: string | null; media_asset_id: string | null; media_mime: string | null; slide_asset_ids: (string | null)[] | null;
    place_num: number | null; place_month: string | null;
  }>(
    `with first as (select id, label from public.content_months where deleted_at is null order by ordinal limit 1)
     select p.id, p.title, p.format, coalesce(p.content_month_id, (select id from first)) as month_id,
            coalesce(m.label, (select label from first)) as month_label,
            coalesce(p.content_month_id, (select id from first)) is not distinct from $1::uuid as is_here,
            v.cover_asset_id, v.media_asset_id, mm.mime as media_mime, to_jsonb(v.slide_asset_ids) as slide_asset_ids,
            s.num as place_num, sm.label as place_month
       from public.pieces p
       left join public.content_months m on m.id = p.content_month_id
       left join public.piece_versions v on v.piece_id = p.id and v.version = p.current_version
       left join public.media_assets mm on mm.id = v.media_asset_id
       left join public.feed_slots s on s.piece_id = p.id
       left join public.content_months sm on sm.id = s.month_id
      where p.deleted_at is null and p.format in ('post', 'reel', 'carousel')
      order by is_here desc, m.ordinal nulls first, p.sort_order, p.created_at desc, p.id`,
    [monthId],
  );
  const out = { post: [] as PickerItem[], reel: [] as PickerItem[], carousel: [] as PickerItem[] };
  for (const r of rows) {
    const thumbIds = pieceThumbIds({ coverId: r.cover_asset_id, mediaId: r.media_asset_id, mediaMime: r.media_mime, slideIds: r.slide_asset_ids });
    out[r.format as keyof typeof out]?.push({
      id: r.id, title: r.title, thumbIds, hasMedia: thumbIds.length > 0, monthId: r.month_id, monthLabel: r.month_label ?? '', otherMonth: !r.is_here,
      place: r.place_num ? { month: r.place_month ?? '', num: r.place_num } : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Board (D-71), the section bar (F1) and the month's summary (D-72)
// ---------------------------------------------------------------------------------------------------------------

type DashSql = {
  id: string; format: string; title: string; status: string; design_status: string | null; design_note: string; rating: number | null;
  current_version: number; month_id: string | null; media_mime: string | null; media_w: number | null; media_h: number | null;
  cover_asset_id: string | null; slide_asset_ids: (string | null)[] | null; long_copy: string; on_screen: string; post_ratio: string; published: boolean;
};

export type DashPiece = DashRow & { title: string; designNote: string };

/** The live pieces of these months (with no month: the first month), with what the board counts. */
async function dashRows(sql: Sql, monthIds: string[]): Promise<DashPiece[]> {
  if (!monthIds.length) return [];
  const rows = await sql.query<DashSql>(
    `with first as (select id from public.content_months where deleted_at is null order by ordinal limit 1)
     select p.id, p.format, p.title, p.status, p.design_status, p.design_note, p.rating, p.current_version,
            coalesce(p.content_month_id, (select id from first)) as month_id,
            m.mime as media_mime, m.width as media_w, m.height as media_h, v.cover_asset_id, to_jsonb(v.slide_asset_ids) as slide_asset_ids,
            coalesce(c.body, '') as long_copy, coalesce(d.on_screen, '') as on_screen, coalesce(d.post_ratio, '4:5') as post_ratio,
            exists (select 1 from public.publications x where x.piece_id = p.id and x.deleted_at is null and x.status = 'published') as published
       from public.pieces p
       left join public.piece_versions v on v.piece_id = p.id and v.version = p.current_version
       left join public.media_assets m on m.id = v.media_asset_id
       left join public.copies c on c.piece_id = p.id and c.length_group = 'long'
       left join public.piece_details d on d.piece_id = p.id
      where p.deleted_at is null and coalesce(p.content_month_id, (select id from first)) = any($1::uuid[])
      order by p.sort_order, p.created_at desc, p.id`,
    [monthIds],
  );
  return rows.flatMap((r, i) => {
    if (!isFormat(r.format)) return [];
    const v = r.current_version > 0;
    return [{
      id: r.id, title: r.title, format: r.format, status: r.status, designStatus: r.design_status, designNote: r.design_note ?? '', published: r.published,
      rating: r.rating, monthId: r.month_id, sortKey: i, currentVersion: r.current_version,
      mediaMime: v ? r.media_mime : null, mediaW: v ? r.media_w : null, mediaH: v ? r.media_h : null, coverId: v ? r.cover_asset_id : null,
      slides: v ? (r.slide_asset_ids ?? []) : [], longCopy: r.long_copy, onScreen: r.on_screen, postRatio: r.post_ratio === '1:1' ? '1:1' : '4:5',
    }];
  });
}

export type Observation = {
  kind: 'design' | 'notice'; pieceId: string; title: string; format: Format; monthId: string | null; text: string; noticeKind?: string;
};

/** The board of the chosen months: the rows for matrix() and the observations (designs disapproved, open notices). */
export async function getDashboard(sql: Sql, monthIds: string[]): Promise<{ rows: DashPiece[]; observations: Observation[] }> {
  const rows = await dashRows(sql, monthIds);
  const notices = monthIds.length
    ? await sql.query<{ piece_id: string; kind: string; body: string }>(
        `with first as (select id from public.content_months where deleted_at is null order by ordinal limit 1)
         select n.piece_id, n.kind, n.body from public.piece_notices n join public.pieces p on p.id = n.piece_id
          where n.resolved_at is null and p.deleted_at is null and coalesce(p.content_month_id, (select id from first)) = any($1::uuid[])
          order by n.created_at, n.id`,
        [monthIds],
      )
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const observations: Observation[] = [
    ...rows
      .filter((r) => r.designStatus === 'disapproved')
      .map((r) => ({ kind: 'design' as const, pieceId: r.id, title: r.title, format: r.format, monthId: r.monthId, text: r.designNote || 'Diseño desaprobado' })),
    ...notices.flatMap((n) => {
      const r = byId.get(n.piece_id);
      return r ? [{ kind: 'notice' as const, pieceId: r.id, title: r.title, format: r.format, monthId: r.monthId, text: n.body, noticeKind: n.kind }] : [];
    }),
  ];
  return { rows, observations };
}

/** The section bar's numbers for the open month (F1). Every page of Redes calls it (a layout does not get ?mes=). */
export async function getNavCounts(sql: Sql, monthId: string | null, quotas: Partial<Record<Format, number>>): Promise<Record<Format, NavCount>> {
  return navCounts(monthId ? await dashRows(sql, [monthId]) : [], quotas);
}

export type Activity = { kind: ActivityKind; pieceId: string; title: string; format: Format; monthId: string | null; who: string | null; at: string };

/** The latest moves in Redes (D-71), from the tables each person already reads: never the audit log (only
 * administración reads it). Times are shown as «hace 5 min». */
export async function getActivity(sql: Sql, limit = 12): Promise<Activity[]> {
  const n = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await sql.query<{ kind: ActivityKind; piece_id: string; title: string; format: string; month_id: string | null; who: string | null; at: Date | string }>(
    `select a.kind, a.piece_id, p.title, p.format, p.content_month_id as month_id, coalesce(nullif(btrim(u.full_name), ''), u.email) as who, a.at
       from (
         (select 'created' as kind, p.id as piece_id, p.created_by as who_id, p.created_at as at from public.pieces p
           where p.deleted_at is null order by p.created_at desc limit $1)
         union all
         (select 'version', v.piece_id, v.created_by, v.created_at from public.piece_versions v order by v.created_at desc limit $1)
         union all
         (select r.decision, r.piece_id, r.reviewer_id, r.created_at from public.reviews r order by r.created_at desc limit $1)
         union all
         (select 'published', x.piece_id, x.created_by, x.published_at from public.publications x
           where x.status = 'published' and x.deleted_at is null and x.piece_id is not null and x.published_at is not null
           order by x.published_at desc limit $1)
         union all
         (select case p.design_status when 'approved' then 'design_ok' else 'design_bad' end, p.id, p.design_by, p.design_at from public.pieces p
           where p.design_status is not null and p.design_at is not null and p.deleted_at is null order by p.design_at desc limit $1)
         union all
         (select 'notice', n.piece_id, n.created_by, n.created_at from public.piece_notices n order by n.created_at desc limit $1)
       ) a
       join public.pieces p on p.id = a.piece_id and p.deleted_at is null
       left join public.profiles u on u.id = a.who_id
      order by a.at desc, a.kind
      limit $1`,
    [n],
  );
  return rows.flatMap((r) => (isFormat(r.format) ? [{ kind: r.kind, pieceId: r.piece_id, title: r.title, format: r.format, monthId: r.month_id, who: r.who, at: iso(r.at)! }] : []));
}

export type SearchHit = { id: string; title: string; href: string; where: string; snippet: string };
export type SearchGroup = { key: Format | 'tweet'; label: string; items: SearchHit[] };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A short piece of `text` around the first `q` (or its start). */
export function snippetOf(text: string, q: string, span = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const at = fold(t).indexOf(fold(q));
  if (at < 0) return t.length > span * 2 ? `${t.slice(0, span * 2)}…` : t;
  const from = Math.max(0, at - span);
  const to = Math.min(t.length, at + q.length + span);
  return `${from > 0 ? '…' : ''}${t.slice(from, to)}${to < t.length ? '…' : ''}`;
}

// The same folding in SQL (no unaccent extension needed): accented letters to their plain ones, both cases (lower()
// leaves them alone under the C collation). Anything else (an emoji) matches as itself.
const ACCENTED = 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç';
const PLAIN = 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc';
const folded = (col: string) => `translate(${col}, '${ACCENTED}', '${PLAIN}')`;

/** «Buscar en Redes» (D-71): titles, card fields, copies, notices and tweets, by format. At least 2 letters; % and _
 * are taken as letters; accents and case do not matter («como pedir» finds «Cómo pedir»); 50 of each kind at most. */
export async function searchRedes(sql: Sql, q: string): Promise<{ q: string; total: number; groups: SearchGroup[] }> {
  const term = (q ?? '').trim().slice(0, 100);
  if (term.length < 2) return { q: term, total: 0, groups: [] };
  const like = `%${fold(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const pieces = await sql.query<{ id: string; title: string; format: string; month_id: string | null; fields: string; copies: string | null; notices: string | null }>(
    `with first as (select id from public.content_months where deleted_at is null order by ordinal limit 1),
     hay as (
       select p.id, p.title, p.format, coalesce(p.content_month_id, (select id from first)) as month_id, p.created_at,
              concat_ws(' ', d.art_overline, d.art_headline, d.art_seals, d.art_fine_print, d.visual_concept, d.hook, d.cta, d.hashtags,
                        d.publication_notes, d.on_screen, d.follow_up, d.sticker_text, d.idea, d.links,
                        (select string_agg(concat_ws(' ', e ->> 'says', e ->> 'action', e ->> 'on_screen'), ' ') from jsonb_array_elements(d.shots) e),
                        (select string_agg(concat_ws(' ', e ->> 'title', e ->> 'text'), ' ') from jsonb_array_elements(d.slides) e)) as fields,
              (select string_agg(c.body, ' ') from public.copies c where c.piece_id = p.id) as copies,
              (select string_agg(n.body, ' ') from public.piece_notices n where n.piece_id = p.id) as notices
         from public.pieces p left join public.piece_details d on d.piece_id = p.id
        where p.deleted_at is null)
     select id, title, format, month_id, fields, copies, notices from hay
      where ${['title', 'fields', 'copies', 'notices'].map((c) => `${folded(c)} ilike $1 escape '\\'`).join(' or ')}
      order by created_at desc, id limit 50`,
    [like],
  );
  const tweets = await sql.query<{ id: string; batch_id: string; body: string }>(
    `select id, batch_id, body from public.tweets where deleted_at is null and ${folded('body')} ilike $1 escape '\\' order by created_at desc, id limit 50`,
    [like],
  );
  const groups: SearchGroup[] = [];
  for (const f of FORMATS) {
    const items = pieces
      .filter((p) => p.format === f)
      .map((p) => {
        const has = (s: string | null) => !!s && fold(s).includes(fold(term));
        const [where, text] = has(p.title)
          ? ['Título', p.title]
          : has(p.fields)
            ? ['En la tarjeta', p.fields]
            : has(p.copies)
              ? ['Copy', p.copies ?? '']
              : ['Aviso', p.notices ?? ''];
        return { id: p.id, title: p.title, href: sectionHref(FORMAT[f].slug, p.month_id, p.id), where, snippet: snippetOf(text, term) };
      });
    if (items.length) groups.push({ key: f, label: FORMAT[f].plural, items });
  }
  if (tweets.length) {
    groups.push({ key: 'tweet', label: 'Tweets', items: tweets.map((t) => ({ id: t.id, title: snippetOf(t.body, term, 40), href: `/tweets/${t.batch_id}`, where: 'Tweet', snippet: snippetOf(t.body, term) })) });
  }
  return { q: term, total: pieces.length + tweets.length, groups };
}

export type MonthSummary = {
  formats: { format: Format; made: number; quota: number | null; approved: number; published: number }[];
  receptivity: { avg: number | null; count: number };
  designBad: number;
  openNotices: number;
  published: { pieceId: string; title: string; format: Format; thumbIds: string[]; networks: string[] }[];
};

/** «Resumen del mes» (D-72): the accountability of the month, for the boss. */
export async function getMonthSummary(sql: Sql, monthId: string | null, quotas?: Partial<Record<Format, number>>): Promise<MonthSummary> {
  const rows = monthId ? await dashRows(sql, [monthId]) : [];
  const q = quotas ?? (await getRedesSettings(sql)).quotas;
  const ids = rows.map((r) => r.id);
  const open = ids.length
    ? (await sql.one<{ n: number }>(`select count(*)::int as n from public.piece_notices where resolved_at is null and piece_id = any($1::uuid[])`, [ids]))!.n
    : 0;
  const pubRows = ids.length
    ? await sql.query<{ id: string; title: string; format: string; cover_asset_id: string | null; media_asset_id: string | null; media_mime: string | null; slide_asset_ids: (string | null)[] | null; networks: string[] | null }>(
        `select p.id, p.title, p.format, v.cover_asset_id, v.media_asset_id, m.mime as media_mime, to_jsonb(v.slide_asset_ids) as slide_asset_ids,
                (select array_agg(distinct x.network order by x.network) from public.publications x
                  where x.piece_id = p.id and x.status = 'published' and x.deleted_at is null) as networks
           from public.pieces p
           left join public.piece_versions v on v.piece_id = p.id and v.version = coalesce(p.approved_version, p.current_version)
           left join public.media_assets m on m.id = v.media_asset_id
          where p.id = any($1::uuid[])
            and exists (select 1 from public.publications x where x.piece_id = p.id and x.status = 'published' and x.deleted_at is null)
          order by p.title, p.id`,
        [ids],
      )
    : [];
  const order = new Map(FORMATS.map((f, i) => [f, i]));
  return {
    formats: FORMATS.map((f) => {
      const mine = rows.filter((r) => r.format === f);
      return { format: f, made: mine.length, quota: quotaOf(f, q), approved: mine.filter((r) => r.status === 'approved').length, published: mine.filter((r) => r.published).length };
    }),
    receptivity: receptivityAverage(rows),
    designBad: rows.filter((r) => r.designStatus === 'disapproved').length,
    openNotices: open,
    published: pubRows
      .flatMap((r) =>
        isFormat(r.format)
          ? [{ pieceId: r.id, title: r.title, format: r.format, networks: r.networks ?? [],
              thumbIds: pieceThumbIds({ coverId: r.cover_asset_id, mediaId: r.media_asset_id, mediaMime: r.media_mime, slideIds: r.slide_asset_ids }) }]
          : [],
      )
      .sort((a, b) => order.get(a.format)! - order.get(b.format)!),
  };
}

export type DeletedPiece = { id: string; title: string; format: Format; monthLabel: string | null; deletedAt: string };

/** Administración: the latest pieces the boss deleted (Ajustes → Cupo y pilares → «Piezas eliminadas»). Anyone else
 * reads none (RLS). */
export async function getDeletedPieces(sql: Sql): Promise<DeletedPiece[]> {
  const rows = await sql.query<{ id: string; title: string; format: string; month_label: string | null; deleted_at: Date | string }>(
    `select p.id, p.title, p.format, m.label as month_label, p.deleted_at
       from public.pieces p left join public.content_months m on m.id = p.content_month_id and m.deleted_at is null
      where p.deleted_at is not null
      order by p.deleted_at desc, p.id limit 50`,
  );
  return rows.flatMap((r) => (isFormat(r.format) ? [{ id: r.id, title: r.title, format: r.format, monthLabel: r.month_label, deletedAt: iso(r.deleted_at)! }] : []));
}
