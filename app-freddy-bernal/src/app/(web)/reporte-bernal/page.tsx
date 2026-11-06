import type { Metadata } from 'next';
import { ExternalLinkIcon } from '@/components/web/icons';
import { EpisodeMeta, Topics } from '@/components/web/cards';
import { VideoFrame } from '@/components/web/blocks/data';
import { photoOf } from '@/components/web/media';
import { EmptyState, Pagination } from '@/components/web/states';
import { cardClass, Container, PageIntro, SafeLink, UnverifiedMark } from '@/components/web/ui';
import { listItems, type WebItem } from '@/lib/web/cache';
import { pageParam, withQuery } from '@/lib/web/params';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { navLabel } from '@/lib/web/site-settings';
import { cn } from '@/lib/cn';

// The weekly program (design §2, docs/diagnostico.md problem 2): every episode with its date, topics and links; the video
// loads only when tapped (youtube-nocookie.com, src/components/web/lite-youtube.tsx), and the channel is the one the
// site's settings name (the active one: the old, abandoned channel is inactive there and never shows).
export const revalidate = 60;

const PER_PAGE = 12;

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  const name = navLabel(site, '/reporte-bernal', site.programName);
  return pageMetadata(
    {
      title: page > 1 ? `${name}, página ${page}` : name,
      description: `Los episodios de ${name}, el programa semanal del gobernador: fecha, temas y enlaces de cada uno.`,
      path: withQuery('/reporte-bernal', { pagina: page }),
    },
    site,
  );
}

function EpisodeLinks({ item }: { item: WebItem<'episode'> }) {
  if (!item.data.links?.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1">
      {item.data.links.map((l, i) => (
        <li key={`${l.url}-${i}`}>
          <SafeLink href={l.url} className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink underline underline-offset-4">
            {l.label} <ExternalLinkIcon className="h-4 w-4" />
          </SafeLink>
        </li>
      ))}
    </ul>
  );
}

export default async function ProgramPage({ searchParams }: { searchParams: Search }) {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  const name = navLabel(site, '/reporte-bernal', site.programName);
  const { items, total } = await listItems({ kind: 'episode', limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const [latest, ...rest] = page === 1 ? items : [undefined, ...items];
  const channel = site.youtube;

  return (
    <>
      <PageIntro eyebrow="El programa" title={name} intro="El programa semanal del gobernador. Cada episodio con su fecha, sus temas y sus enlaces; el video carga solo si lo tocas.">
        {channel ? (
          <p className="mt-6 flex flex-wrap items-center gap-2 text-lg">
            <a href={channel.url} rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink underline decoration-2 underline-offset-4">
              Ver el canal en YouTube: {channel.handle || channel.label} <ExternalLinkIcon className="h-4 w-4" />
            </a>
            {channel.verified ? null : <UnverifiedMark />}
          </p>
        ) : null}
      </PageIntro>
      <Container className="pb-20">
        {latest ? (
          <section aria-labelledby="ultimo" className="grid gap-8 rounded-[var(--radius-card)] bg-charcoal p-5 text-on-charcoal sm:p-8 lg:grid-cols-12 lg:items-center lg:gap-12">
            <div className="lg:col-span-7">
              <VideoFrame youtubeId={latest.data.youtubeId} title={latest.data.title} poster={photoOf(latest.media, latest.data.coverId)} />
            </div>
            <div className="flex flex-col gap-3 lg:col-span-5">
              <p className="text-sm font-semibold uppercase tracking-[0.08em]">El más reciente</p>
              <h2 id="ultimo" className="text-3xl font-bold leading-tight tracking-tight">
                {latest.data.title}
              </h2>
              <EpisodeMeta item={latest} className="text-on-charcoal" />
              {latest.data.excerpt ? <p className="text-lg leading-relaxed">{latest.data.excerpt}</p> : null}
            </div>
          </section>
        ) : null}
        {latest?.data.topics?.length || latest?.data.links?.length ? (
          <div className="mt-4 flex flex-col gap-3">
            <Topics topics={latest.data.topics} />
            <EpisodeLinks item={latest} />
          </div>
        ) : null}

        {rest.length ? (
          <section aria-labelledby="episodios" className="mt-14">
            <h2 id="episodios" className="mb-6 text-[1.75rem] font-bold tracking-tight sm:text-4xl">
              {page === 1 ? 'Episodios anteriores' : 'Episodios'}
            </h2>
            <ul className="grid gap-5 md:grid-cols-2">
              {rest.map((e) =>
                e ? (
                  <li key={e.id} className={cn(cardClass, 'flex flex-col gap-3 p-6')}>
                    <h3 className="text-xl font-semibold leading-snug text-text">{e.data.title}</h3>
                    <EpisodeMeta item={e} />
                    {e.data.excerpt ? <p className="text-base leading-relaxed text-text-2">{e.data.excerpt}</p> : null}
                    <Topics topics={e.data.topics} />
                    {e.data.youtubeId ? (
                      <div className="mt-2">
                        <VideoFrame youtubeId={e.data.youtubeId} title={e.data.title} poster={photoOf(e.media, e.data.coverId)} />
                      </div>
                    ) : (
                      <p className="text-[15px] text-text-2">Video por enlazar desde el administrador.</p>
                    )}
                    <EpisodeLinks item={e} />
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}
        {!items.length ? <EmptyState title="Todavía no hay episodios publicados.">Cada episodio aparece aquí cuando el equipo lo publica.</EmptyState> : null}
        <Pagination page={page} pages={pages} hrefFor={(p) => withQuery('/reporte-bernal', { pagina: p })} label="Páginas de episodios" />
      </Container>
    </>
  );
}
