import 'server-only';
import { withAnon } from '@/lib/db';
import type { Sql } from '@/lib/db/core';
import { failureOf, lookupGrant, rateKeys } from '@/lib/actions/participation-core';
import { linkedItemPath, parseSobre, type LinkedKind } from '@/lib/actions/participation-types';
import { lookupRequest, type CitizenView } from '@/lib/web/participation';
import { publicRequestCategories, publicSettings, publicTerritories, publishedBySlug, publishedList, type PublicCategory, type PublishedItem, type Territory } from '@/lib/web/public';
import { verifiedContacts, type VerifiedContact } from '@/components/participation/contacts';

// What the participation pages read (design §4), always as anon (withAnon, D-96): the form's catalogues, the published
// item a request is about, the attention desk's FAQs and verified contacts, «lo atendido» and the person's own
// consultation (through citizen.lookup_request with the receipt inside the consultation cookie). Never withSystem.

export type FormCatalog = { municipalities: Territory[]; categories: PublicCategory[] };

/** The 29 municipalities (with their parishes when the official list is loaded) and the active categories. */
export function loadFormCatalog(): Promise<FormCatalog> {
  return withAnon(async (sql) => ({ municipalities: await publicTerritories(sql), categories: await publicRequestCategories(sql) }));
}

export type LinkedItem = { id: string; kind: LinkedKind; kindLabel: string; title: string; href: string };

/** «?sobre=news:<slug>» / «project:<slug>»: the published item (only what anon sees live), or null. */
export async function loadLinkedItem(raw: unknown): Promise<LinkedItem | null> {
  const s = parseSobre(raw);
  if (!s) return null;
  const item = await withAnon((sql) => publishedBySlug(sql, s.kind, s.slug));
  if (!item) return null;
  return { id: item.id, kind: s.kind, kindLabel: s.kind === 'news' ? 'Noticia' : 'Obra o acción', title: item.data.title, href: linkedItemPath(s.kind, item.slug) };
}

/** The FAQs of the group «atencion», in the team's order. */
export async function loadAttentionFaqs(): Promise<PublishedItem<'faq'>[]> {
  const { items } = await withAnon((sql) => publishedList(sql, { kind: 'faq', category: 'atencion', limit: 50, order: 'title' }));
  return [...items].sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999) || a.data.title.localeCompare(b.data.title, 'es'));
}

/** The desk's contacts the team marked verified (none in the demo: D-95). */
export async function loadVerifiedContacts(): Promise<VerifiedContact[]> {
  const settings = await withAnon((sql) => publicSettings(sql));
  return verifiedContacts(settings['site.contacts']);
}

export type AttendedItem = {
  id: string; type: string; categoryId: string | null; municipalityId: string | null; summary: string; displayName: string | null;
  resolvedOn: string | null; publishedAt: Date;
};
export type AttendedPage = { items: AttendedItem[]; total: number; page: number; pages: number };

/** «Lo atendido», newest first, by municipality and category (published rows only: the policy for anon says so). */
export async function attendedPage(sql: Sql, f: { municipalityId: string | null; categoryId: string | null; page: number; perPage: number }): Promise<AttendedPage> {
  const perPage = Math.min(Math.max(f.perPage, 1), 50);
  const page = Math.max(1, Math.floor(f.page));
  const rows = await sql.query<{
    id: string; type: string; category_id: string | null; municipality_id: string | null; public_summary: string; display_name: string | null;
    resolved_on: string | null; published_at: Date; total: number;
  }>(
    `select id, type, category_id, municipality_id, public_summary, display_name, resolved_on::text as resolved_on, published_at,
            count(*) over ()::int as total
       from public.attended_publications
      where ($1::uuid is null or municipality_id = $1::uuid) and ($2::uuid is null or category_id = $2::uuid)
      order by published_at desc, id
      limit ${perPage} offset ${(page - 1) * perPage}`,
    [f.municipalityId, f.categoryId],
  );
  const total = rows[0]?.total ?? 0;
  return {
    items: rows.map((r) => ({
      id: r.id, type: r.type, categoryId: r.category_id, municipalityId: r.municipality_id, summary: r.public_summary,
      displayName: r.display_name, resolvedOn: r.resolved_on, publishedAt: r.published_at,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function loadAttended(f: { municipalityId: string | null; categoryId: string | null; page: number; perPage: number }): Promise<AttendedPage> {
  return withAnon((sql) => attendedPage(sql, f));
}

export type Consultation =
  | { status: 'none' }
  | { status: 'ok'; view: CitizenView }
  | { status: 'gone' }
  | { status: 'error'; error: string; rate: boolean };

/**
 * The consultation this browser opened (the sealed cookie under /atencion/consultar), read again with its receipt: the
 * safe summary, the shared timeline and the person's own files. Each read counts against the lookup limit like a
 * lookup (the database decides); a tampered or expired cookie is simply no consultation.
 */
export async function loadConsultation(): Promise<Consultation> {
  const grant = await lookupGrant();
  if (!grant) return { status: 'none' };
  try {
    const keys = await rateKeys({ canSet: false });
    const view = await withAnon((sql) => lookupRequest(sql, grant, keys));
    return view.status === 'ok' ? { status: 'ok', view } : { status: 'gone' };
  } catch (e) {
    const f = failureOf(e, 'consulta');
    return { status: 'error', error: f.error, rate: f.code === 'rate' };
  }
}

/** A municipality or category of the catalogues by its slug (the filters of «lo atendido» use slugs in the address). */
export function bySlug<T extends { slug: string }>(list: T[], slug: unknown): T | null {
  return typeof slug === 'string' ? (list.find((x) => x.slug === slug) ?? null) : null;
}
