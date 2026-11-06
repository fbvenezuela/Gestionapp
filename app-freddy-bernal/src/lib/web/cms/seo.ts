import { itemPath } from '../routes';
import type { WebKind } from '../schema';

// The card a search engine or a social network shows for an item (the SEO panel's live preview, design §3), with the
// same choices the public pages make (src/lib/web/seo.ts, meta.ts): the SEO title or the title, the SEO description or
// the summary, the image for networks or the cover (on a page, its hero's photo), the canonical address or the item's own.
// Pure: the editor draws it in the browser as the person types.

export const SEO_LIMITS = { title: 70, description: 170, idealTitle: 60, idealDescription: 155 } as const;

export type SocialCard = { title: string; description: string; imageId: string | null; url: string; path: string | null };

type Obj = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function socialCard(kind: WebKind, slug: string, draft: Obj, baseUrl: string): SocialCard {
  const seo = (draft.seo ?? {}) as Obj;
  const hero = Array.isArray(draft.blocks) ? (draft.blocks as Obj[]).find((b) => b?.type === 'hero' && b.visible !== false) : undefined;
  const heroMedia = hero ? s((hero.data as Obj | undefined)?.mediaId) : '';
  const path = itemPath(kind, slug);
  const canonical = s(seo.canonical);
  const base = baseUrl.replace(/\/+$/, '');
  const url = canonical ? (canonical.startsWith('/') ? `${base}${canonical}` : canonical) : path ? `${base}${path}` : base;
  return {
    title: s(seo.title) || s(draft.title) || 'Sin título',
    description: s(seo.description) || s(draft.excerpt),
    imageId: s(seo.imageId) || s(draft.coverId) || heroMedia || null,
    url,
    path,
  };
}
