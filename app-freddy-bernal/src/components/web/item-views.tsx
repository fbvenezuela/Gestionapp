import { MapPinIcon, MessageSquareTextIcon } from './icons';
import { NewsCard, ProjectCard, Progress, StateBadge, Topics, itemDay, type MuniNames } from './cards';
import { VideoFrame } from './blocks/data';
import { JsonLd } from './json-ld';
import { Figure, MediaImage, photoOf } from './media';
import { RichText } from './rich-text';
import { Breadcrumbs } from './states';
import { Badge, boxClass, ButtonLink, Container, SafeLink, SectionHeading } from './ui';
import type { WebItem } from '@/lib/web/cache';
import { fmtDay, fmtMoney } from '@/lib/web/format';
import { aboutHref } from '@/lib/web/links';
import { absoluteUrl, ogImageFrom } from '@/lib/web/meta';
import { NEWS_CATEGORIES, PROJECT_CATEGORIES } from '@/lib/web/schema';
import { newsArticleJsonLd } from '@/lib/web/seo';
import type { Site } from '@/lib/web/site';

// The pages of one item of the website, drawn from the item alone: the news article and the project's ficha. The public
// pages (src/app/(web)/actualidad/[slug], gestion/[slug]) give them what was published; the administrator's preview
// (/admin/web/vista-previa/[id]) gives them the draft, so the publisher sees exactly what the public would.

/** A news item (design §2): its date in the Táchira's time zone, who signs it, its sources, its photos, related notes,
 * «Comentar esta noticia» (a request linked to it) and the NewsArticle structured data. */
export function NewsArticle({ item, site, munis, related }: { item: WebItem<'news'>; site: Site; munis: MuniNames; related: WebItem<'news'>[] }) {
  const d = item.data;
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
                <MapPinIcon className="h-4 w-4 shrink-0 text-accent-ink" /> {muni}
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
          {d.youtubeId ? (
            <div className="mt-10">
              <VideoFrame youtubeId={d.youtubeId} title={d.title} poster={cover} />
            </div>
          ) : null}
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

/** The ficha of a project (design §2): where, what, for whom, who is responsible, the investment and the progress only
 * with their documented source, the dates, the state, the evidence, the last update, and «Hacer una observación sobre
 * esta obra» (a request linked to it). */
export function ProjectFicha({ item, munis, related }: { item: WebItem<'project'>; munis: MuniNames; related: WebItem<'project'>[] }) {
  const d = item.data;
  const muni = d.municipalityId ? munis.get(d.municipalityId) : null;
  const evidences = (d.evidenceIds ?? []).map((id) => photoOf(item.media, id)).filter((m) => m !== null);
  const dates = [
    ['Anunciada', d.dates?.announced],
    ['Inicio', d.dates?.started],
    ['Fin estimado', d.dates?.finished ? undefined : d.dates?.expected],
    ['Concluida', d.dates?.finished],
  ].filter((x): x is [string, string] => !!x[1]);

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: 'Gestión', href: '/gestion' }, { label: d.title }]} />
      <article>
        <Container className="pb-8 pt-6 sm:pt-10">
          <div className="flex flex-wrap gap-2">
            <StateBadge state={d.state} />
            <Badge>{PROJECT_CATEGORIES[d.category]}</Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-[2.25rem] font-bold leading-[1.1] tracking-tight text-text sm:text-5xl">{d.title}</h1>
          {d.excerpt ? <p className="mt-4 max-w-3xl text-xl leading-relaxed text-text-2">{d.excerpt}</p> : null}
        </Container>
        <Container>
          <MediaImage media={photoOf(item.media, d.coverId)} sizes="(min-width: 1152px) 1104px, 100vw" className="aspect-[16/9] rounded-[var(--radius-card)] sm:aspect-[21/9]" eager />
        </Container>
        <Container className="grid gap-10 py-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">De qué se trata</h2>
            {d.description.length ? <RichText nodes={d.description} /> : <p className="text-lg text-text-2">La descripción se publica pronto.</p>}
            {d.youtubeId ? (
              <div className="mt-10">
                <h2 className="mb-4 text-2xl font-bold tracking-tight">Video</h2>
                <VideoFrame youtubeId={d.youtubeId} title={d.title} poster={photoOf(item.media, d.coverId)} />
              </div>
            ) : null}
            {evidences.length ? (
              <div className="mt-10">
                <h2 className="mb-4 text-2xl font-bold tracking-tight">Evidencias</h2>
                <ul className="grid grid-cols-2 gap-3">
                  {evidences.map((m) => (
                    <li key={m.key}>
                      <Figure media={m} sizes="(min-width: 1024px) 320px, 50vw" frameClass="aspect-square rounded-2xl" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <aside className="flex flex-col gap-6 lg:col-span-5" aria-label="Datos de la obra">
            <dl className={`${boxClass} grid gap-4 p-6 text-base`}>
              <Fact label="Dónde">{[muni, d.place].filter(Boolean).join(' · ') || 'Por precisar'}</Fact>
              {d.beneficiaries ? <Fact label="Para quién">{d.beneficiaries}</Fact> : null}
              {d.organization ? <Fact label="Organismo responsable">{d.organization}</Fact> : null}
              {d.investment ? (
                <Fact label="Inversión">
                  {fmtMoney(d.investment.amount, d.investment.currency)}
                  <span className="mt-1 block text-sm text-text-2">Fuente: {d.investment.source.label}</span>
                </Fact>
              ) : null}
              {d.progress ? (
                <Fact label="Avance">
                  <Progress progress={d.progress} />
                </Fact>
              ) : null}
              {dates.map(([label, day]) => (
                <Fact key={label} label={label}>
                  <time dateTime={day}>{fmtDay(day)}</time>
                </Fact>
              ))}
              <Fact label="Última actualización">
                <time dateTime={d.updatedOn ?? itemDay(item)}>{fmtDay(d.updatedOn ?? itemDay(item))}</time>
              </Fact>
            </dl>
            <div className="rounded-[var(--radius-card)] bg-accent-soft p-6">
              <MessageSquareTextIcon className="h-7 w-7 text-accent-ink" />
              <p className="mt-3 text-lg font-semibold text-text">¿Conoces esta obra? ¿Algo no coincide con lo que ves?</p>
              <p className="mt-1 text-base leading-relaxed text-text">Cuéntaselo al equipo: tu observación queda ligada a esta obra y recibes un código para seguirla.</p>
              <ButtonLink href={aboutHref('project', item.slug)} variant="action" className="mt-5 w-full sm:w-auto">
                Hacer una observación sobre esta obra
              </ButtonLink>
            </div>
          </aside>
        </Container>
      </article>
      {related.length ? (
        <section className="bg-surface py-14">
          <Container>
            <SectionHeading title={muni ? `Más en ${muni}` : 'Más obras'} more={{ href: '/gestion', label: 'Ver toda la gestión' }} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.id} className="flex">
                  <ProjectCard item={p} munis={munis} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold uppercase tracking-[0.06em] text-accent-ink">{label}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
