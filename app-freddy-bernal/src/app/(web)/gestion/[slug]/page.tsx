import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { municipalityNames } from '@/components/web/blocks/data';
import { ProjectFicha } from '@/components/web/item-views';
import { getItem, listItems } from '@/lib/web/cache';
import { ogImageFrom } from '@/lib/web/meta';
import { findRedirectOrNull } from '@/lib/web/redirect-map';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// The ficha of a project (design §2): where, what, for whom, who is responsible, the investment and the progress only
// with their documented source, the dates, the state, the evidence, the last update, and «Hacer una observación sobre
// esta obra» (a request linked to it, ?sobre=project:<slug>). Generated on its first visit and cached (ISR); an old
// address that the importer redirected answers with its redirect instead of a 404.
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [site, item] = await Promise.all([getSite(), getItem('project', slug)]);
  if (!item) return { title: { absolute: 'Esta página no existe' }, robots: { index: false, follow: false } };
  const d = item.data;
  return pageMetadata(
    {
      title: d.seo?.title || d.title,
      description: d.seo?.description || d.excerpt,
      path: `/gestion/${item.slug}`,
      image: ogImageFrom(item.media, d.seo?.imageId, d.coverId),
      noindex: d.seo?.noindex,
    },
    site,
  );
}

export default async function ProjectPage({ params }: { params: Params }) {
  const { slug } = await params;
  const item = await getItem('project', slug);
  if (!item) {
    const moved = await findRedirectOrNull(`/gestion/${slug}`);
    if (moved) permanentRedirect(moved.to);
    notFound();
  }
  const d = item.data;
  const munis = await municipalityNames();
  const related = d.municipalityId
    ? (await listItems({ kind: 'project', municipalityId: d.municipalityId, limit: 4 })).items.filter((p) => p.id !== item.id).slice(0, 3)
    : [];
  return <ProjectFicha item={item} munis={munis} related={related} />;
}
