import type { Metadata } from 'next';
import { getItem } from '@/lib/web/cache';
import { fmtDay } from '@/lib/web/format';
import { ogImageFrom } from '@/lib/web/meta';
import { pagePath } from '@/lib/web/routes';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { Blocks, opensWithHero } from './blocks';
import { EmptyState } from './states';
import { Container, PageIntro } from './ui';

// A page of the website made of blocks (El gobernador, the legal pages): exactly what the publisher approved, with the
// date it was published. While it is not published, an honest «en preparación», never invented text.

export async function blockPageMetadata(slug: string, fallbackTitle: string): Promise<Metadata> {
  const [site, page] = await Promise.all([getSite(), getItem('page', slug)]);
  const hero = page?.data.blocks.find((b) => b.type === 'hero');
  return pageMetadata(
    {
      title: page?.data.seo?.title || page?.data.title || fallbackTitle,
      description: page?.data.seo?.description || page?.data.excerpt,
      path: pagePath(slug) ?? `/${slug}`,
      image: page ? ogImageFrom(page.media, page.data.seo?.imageId, page.data.coverId, hero?.type === 'hero' ? hero.data.mediaId : null) : null,
      noindex: page?.data.seo?.noindex,
    },
    site,
  );
}

export async function BlockPage({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  const [site, page] = await Promise.all([getSite(), getItem('page', slug)]);
  if (!page) {
    return (
      <>
        <PageIntro title={fallbackTitle} />
        <Container className="pb-20">
          <EmptyState title="Esta página se está preparando.">El equipo la publica pronto, revisada y aprobada.</EmptyState>
        </Container>
      </>
    );
  }
  const blocks = page.data.blocks;
  return (
    <>
      {opensWithHero(blocks) ? null : <PageIntro title={page.data.title} intro={page.data.excerpt} />}
      <Blocks blocks={blocks} site={site} media={page.media} />
      <Container className="pb-14 pt-4">
        <p className="text-[15px] text-text-2">
          Publicado el <time dateTime={page.publishedAt}>{fmtDay(page.publishedAt)}</time>
          {page.version > 1 ? ` · versión ${page.version}` : ''}
        </p>
      </Container>
    </>
  );
}
