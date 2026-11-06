import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { MapPinIcon, MessageSquareTextIcon } from '@/components/web/icons';
import { NewsCard, Topics, itemDay } from '@/components/web/cards';
import { municipalityNames } from '@/components/web/blocks/data';
import { JsonLd } from '@/components/web/json-ld';
import { Figure, MediaImage, photoOf } from '@/components/web/media';
import { RichText } from '@/components/web/rich-text';
import { Breadcrumbs } from '@/components/web/states';
import { boxClass, ButtonLink, Container, SafeLink, SectionHeading } from '@/components/web/ui';
import { getItem, listItems } from '@/lib/web/cache';
import { fmtDay } from '@/lib/web/format';
import { aboutHref } from '@/lib/web/links';
import { absoluteUrl, ogImageFrom } from '@/lib/web/meta';
import { findRedirectOrNull } from '@/lib/web/redirect-map';
import { NEWS_CATEGORIES } from '@/lib/web/schema';
import { newsArticleJsonLd, pageMetadata } from '@/lib/web/seo';
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
  const day = itemDay(item);
  const muni = d.municipalityId ? munis.get(d.municipalityId) : null;
  const cover = photoOf(item.media, d.coverId);
  const gallery = (d.galleryIds ?? []).map((id) => photoOf(item.media, id)).filter((m) => m !== null);
  const url = absoluteUrl(site.baseUrl, `/actualidad/${item.slug}`);
  const image = ogImageFrom(item.media, d.seo?.imageId, d.coverId);

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: 'Actualidad', href: '/actualidad' }, { label: d.title }]} />
      <article>
        <Container className="max-w-4xl pb-8 pt-6 sm:pt-10">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">{NEWS_CATEGORIES[d.category]}</p>
          <h1 className="mt-3 text-[2.25rem] font-bold leading-[1.1] tracking-tight text-text sm:text-5xl">{d.title}</h1>
          {d.excerpt ? <p className="mt-5 text-xl leading-relaxed text-text-2">{d.excerpt}</p> : null}
          <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-border py-3 text-[15px] text-text-2">
            <time dateTime={day}>{fmtDay(day, { weekday: true })}</time>
            {d.author ? <span>Por {d.author}</span> : null}
            {muni ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-4 w-4 text-accent-ink" /> {muni}
              </span>
            ) : null}
          </p>
        </Container>
        <Container className="max-w-5xl">
          {cover ? (
            <Figure media={cover} sizes="(min-width: 1024px) 976px, 100vw" frameClass="aspect-[16/9] rounded-[var(--radius-card)]" />
          ) : (
            <MediaImage media={null} sizes="100vw" className="aspect-[16/7] rounded-[var(--radius-card)]" />
          )}
        </Container>
        <Container className="max-w-3xl py-10">
          <RichText nodes={d.body} />
          {gallery.length ? (
            <ul className="mt-10 grid grid-cols-2 gap-3">
              {gallery.map((m) => (
                <li key={m.key}>
                  <Figure media={m} sizes="(min-width: 768px) 360px, 50vw" frameClass="aspect-[4/3] rounded-2xl" />
                </li>
              ))}
            </ul>
          ) : null}
          {d.sources?.length ? (
            <section aria-labelledby="fuentes" className={`${boxClass} mt-10 p-6`}>
              <h2 id="fuentes" className="text-lg font-semibold text-text">
                Fuentes
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-base leading-relaxed text-text">
                {d.sources.map((s, i) => (
                  <li key={`${s.label}-${i}`}>{s.url ? <SafeLink href={s.url} className="underline underline-offset-4">{s.label}</SafeLink> : s.label}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {d.topics?.length ? (
            <div className="mt-8">
              <Topics topics={d.topics} />
            </div>
          ) : null}
          <div className="mt-10 flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-accent-soft p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-lg font-semibold text-text">
              <MessageSquareTextIcon className="mt-0.5 h-6 w-6 shrink-0 text-accent-ink" />
              ¿Tienes algo que decir sobre esta nota?
            </p>
            <ButtonLink href={aboutHref('news', item.slug)} variant="olive" className="shrink-0">
              Comentar esta noticia
            </ButtonLink>
          </div>
        </Container>
      </article>
      {related.length ? (
        <section className="bg-surface py-14">
          <Container>
            <SectionHeading title="Relacionadas" more={{ href: '/actualidad', label: 'Ver toda la actualidad' }} />
            <ul className="grid gap-x-10 gap-y-8 md:grid-cols-3">
              {related.map((n) => (
                <li key={n.id}>
                  <NewsCard item={n} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}
      <JsonLd
        data={newsArticleJsonLd(
          {
            url,
            title: d.title,
            description: d.excerpt,
            datePublished: item.date ?? item.liveSince,
            dateModified: item.publishedAt,
            author: d.author,
            images: image ? [absoluteUrl(site.baseUrl, image.url)] : undefined,
            section: NEWS_CATEGORIES[d.category],
          },
          site,
        )}
      />
    </>
  );
}
