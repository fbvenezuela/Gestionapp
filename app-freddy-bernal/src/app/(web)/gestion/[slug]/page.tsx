import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { MessageSquareTextIcon } from '@/components/web/icons';
import { ProjectCard, Progress, StateBadge, itemDay } from '@/components/web/cards';
import { municipalityNames, VideoFrame } from '@/components/web/blocks/data';
import { Figure, MediaImage, photoOf } from '@/components/web/media';
import { RichText } from '@/components/web/rich-text';
import { Breadcrumbs } from '@/components/web/states';
import { Badge, boxClass, ButtonLink, Container, SectionHeading } from '@/components/web/ui';
import { getItem, listItems } from '@/lib/web/cache';
import { fmtDay, fmtMoney } from '@/lib/web/format';
import { aboutHref } from '@/lib/web/links';
import { ogImageFrom } from '@/lib/web/meta';
import { findRedirectOrNull } from '@/lib/web/redirect-map';
import { PROJECT_CATEGORIES } from '@/lib/web/schema';
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
  const muni = d.municipalityId ? munis.get(d.municipalityId) : null;
  const evidences = (d.evidenceIds ?? []).map((id) => photoOf(item.media, id)).filter((m) => m !== null);
  const related = d.municipalityId
    ? (await listItems({ kind: 'project', municipalityId: d.municipalityId, limit: 4 })).items.filter((p) => p.id !== item.id).slice(0, 3)
    : [];
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
