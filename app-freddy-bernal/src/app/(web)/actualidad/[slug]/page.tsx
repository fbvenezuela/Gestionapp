import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { municipalityNames } from '@/components/web/blocks/data';
import { NewsArticle } from '@/components/web/item-views';
import { getItem, listItems } from '@/lib/web/cache';
import { ogImageFrom } from '@/lib/web/meta';
import { findRedirectOrNull } from '@/lib/web/redirect-map';
import { NEWS_CATEGORIES } from '@/lib/web/schema';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// A news item (design §2): its date in the Táchira's time zone, who signs it, its sources, its photos, related notes and
// «Comentar esta noticia» (a request linked to it, ?sobre=news:<slug>). NewsArticle structured data. Generated on its
// first visit and cached (ISR); an old address that the importer redirected answers with its redirect.
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [site, item] = await Promise.all([getSite(), getItem('news', slug)]);
  if (!item) return { title: { absolute: 'Esta página no existe' }, robots: { index: false, follow: false } };
  const d = item.data;
  return pageMetadata(
    {
      title: d.seo?.title || d.title,
      description: d.seo?.description || d.excerpt,
      path: `/actualidad/${item.slug}`,
      image: ogImageFrom(item.media, d.seo?.imageId, d.coverId),
      type: 'article',
      // The news item's own date (an imported old note keeps its day), else the moment it went live.
      publishedTime: item.date ?? item.liveSince,
      modifiedTime: item.publishedAt,
      section: NEWS_CATEGORIES[d.category],
      noindex: d.seo?.noindex,
    },
    site,
  );
}

export default async function NewsItemPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItem('news', slug);
  if (!item) {
    const moved = await findRedirectOrNull(`/actualidad/${slug}`);
    if (moved) permanentRedirect(moved.to);
    notFound();
  }
  const d = item.data;
  const [site, munis, related] = await Promise.all([
    getSite(),
    municipalityNames(),
    listItems({ kind: 'news', category: d.category, limit: 4 }).then((r) => r.items.filter((n) => n.id !== item.id).slice(0, 3)),
  ]);
  return <NewsArticle item={item} site={site} munis={munis} related={related} />;
}
