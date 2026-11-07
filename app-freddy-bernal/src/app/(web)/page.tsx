import type { Metadata } from 'next';
import type { Block } from '@/lib/web/blocks';
import { Blocks, opensWithHero } from '@/components/web/blocks';
import { JsonLd } from '@/components/web/json-ld';
import { getItem } from '@/lib/web/cache';
import { ogImageFrom } from '@/lib/web/meta';
import { organizationJsonLd, pageMetadata, personJsonLd, siteTitle, websiteJsonLd } from '@/lib/web/seo';
import { getSite, type Site } from '@/lib/web/site';
import { navLabel } from '@/lib/web/site-settings';

// Inicio (design §2): built from the blocks of the page «inicio» that the publisher approved (hero, the participation
// accesses, indicators, the attended cases, the work, the latest Reporte Bernal, news, notices, channels). Static and
// cached; read again every minute (WEB_REVALIDATE, src/lib/web/tags.ts) and at once when something is published.
export const revalidate = 60;

/** While «inicio» is not published: the site's name and title (never the brand's greeting, which belongs to the
 * social media copies) and the live sections, nothing invented. */
function startingBlocks(site: Site): Block[] {
  return [
    { id: 'portada', type: 'hero', visible: true, data: { title: site.name, text: site.title, mediaId: null } },
    { id: 'participa', type: 'participation', visible: true, data: { title: 'Atención ciudadana' } },
    { id: 'actualidad', type: 'news', visible: true, data: { title: 'Últimas publicaciones', limit: 4 } },
    { id: 'reporte', type: 'video', visible: true, data: { title: navLabel(site, '/reporte-bernal', site.programName), latestEpisode: true } },
    { id: 'gestion', type: 'projects', visible: true, data: { title: 'Gestión y obras', limit: 3 } },
    { id: 'avisos', type: 'notices', visible: true, data: { title: 'Avisos de servicio' } },
    { id: 'atendido', type: 'attended', visible: true, data: { title: 'Casos atendidos', limit: 3 } },
    { id: 'canales', type: 'channels', visible: true, data: { title: 'Canales oficiales' } },
  ];
}

export async function generateMetadata(): Promise<Metadata> {
  const [site, page] = await Promise.all([getSite(), getItem('page', 'inicio')]);
  const hero = page?.data.blocks.find((b) => b.type === 'hero');
  return pageMetadata(
    {
      title: page?.data.seo?.title || siteTitle(site),
      absolute: true,
      description: page?.data.seo?.description || page?.data.excerpt,
      path: '/',
      image: page ? ogImageFrom(page.media, page.data.seo?.imageId, hero?.type === 'hero' ? hero.data.mediaId : null) : null,
    },
    site,
  );
}

export default async function Home() {
  const [site, page] = await Promise.all([getSite(), getItem('page', 'inicio')]);
  const blocks = page?.data.blocks ?? startingBlocks(site);
  return (
    <>
      {opensWithHero(blocks) ? null : <h1 className="sr-only">{siteTitle(site)}</h1>}
      <Blocks blocks={blocks} site={site} media={page?.media ?? {}} />
      <JsonLd data={[websiteJsonLd(site), personJsonLd(site), organizationJsonLd(site)]} />
    </>
  );
}
