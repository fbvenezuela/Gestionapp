import { ExternalLinkIcon } from '../icons';
import { getAttended, getRequestCategories, getTerritories, itemsByIds, listItems, type WebItem } from '@/lib/web/cache';
import { ATTENTION } from '@/lib/web/links';
import { withQuery } from '@/lib/web/params';
import type { FrozenMedia } from '@/lib/web/public';
import { indicatorShown, noticeActive } from '@/lib/web/schema';
import { cn } from '@/lib/cn';
import { DocumentRow, EpisodeMeta, NewsCard, NewsFeature, ProjectCard, type MuniNames } from '../cards';
import { ChannelPills, orderedChannels } from '../channels';
import { MediaImage, PhotoPlaceholder, photoOf } from '../media';
import { LiteYouTube } from '../lite-youtube';
import { ParticipationActions } from '../participation-actions';
import { Container, SectionHeading, UnverifiedMark, WebLink } from '../ui';
import type { BlockContext, BlockData } from './types';
import { AttendedView, DemoNote, FaqView, IndicatorsView, NoticesView } from './views';

// The blocks that read published content (as anon, cached, cache.ts): projects, news, the latest Reporte Bernal,
// documents, questions, indicators, notices, the attended cases, the channels and the participation accesses. A block
// whose content is not there yet draws nothing, never something invented and never a note about how the site works.

const kindOf = <K extends WebItem['kind']>(items: WebItem[], kind: K) => items.filter((i): i is WebItem<K> => i.kind === kind);

export async function municipalityNames(): Promise<MuniNames> {
  return new Map((await getTerritories()).map((t) => [t.id, t.name]));
}

export async function ProjectsBlock({ data, ctx }: { data: BlockData<'projects'>; ctx: BlockContext }) {
  const [munis, items] = await Promise.all([
    municipalityNames(),
    data.ids?.length
      ? itemsByIds(data.ids).then((r) => kindOf(r, 'project'))
      : listItems({ kind: 'project', limit: data.limit ?? 6, municipalityId: data.municipalityId, category: data.category, state: data.state }).then((r) => r.items),
  ]);
  if (!items.length) return null;
  return (
    <section className="bg-surface py-14 sm:py-20">
      <Container>
        <SectionHeading title={data.title || 'Gestión y obras'} as={ctx.heading} more={{ href: '/gestion', label: 'Ver todas las obras' }} />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="flex">
              <ProjectCard item={p} munis={munis} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// «See everything» of a list of news: of the kind the block shows, when it shows one.
const NEWS_MORE: Record<string, string> = {
  noticia: 'Ver todas las noticias',
  comunicado: 'Ver todos los comunicados',
  articulo: 'Ver todos los artículos',
  entrevista: 'Ver todas las entrevistas',
};

/** The latest news (or of one kind): the first one as a feature with its photo and the rest as a light list; two
 * items go side by side, each with its photo (the home's «Opinión», for one). */
export async function NewsBlock({ data, ctx }: { data: BlockData<'news'>; ctx: BlockContext }) {
  const { items } = await listItems({ kind: 'news', limit: data.limit ?? 4, category: data.category });
  if (!items.length) return null;
  const more = data.category
    ? { href: withQuery('/actualidad', { categoria: data.category }), label: NEWS_MORE[data.category] ?? 'Ver todas las noticias' }
    : { href: '/actualidad', label: 'Ver todas las noticias' };
  const [first, ...rest] = items;
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <SectionHeading title={data.title || 'Últimas publicaciones'} as={ctx.heading} more={more} />
        {items.length === 2 ? (
          <ul className="grid gap-x-8 gap-y-10 md:grid-cols-2">
            {items.map((n) => (
              <li key={n.id}>
                <NewsCard item={n} withPhoto preview={ctx.preview} />
              </li>
            ))}
          </ul>
        ) : (
          <>
            <NewsFeature item={first} preview={ctx.preview} />
            {rest.length ? (
              <ul className={cn('mt-8 grid gap-x-8 gap-y-6', rest.length === 1 ? '' : rest.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
                {rest.map((n) => (
                  <li key={n.id}>
                    <NewsCard item={n} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Container>
    </section>
  );
}

/** The latest Reporte Bernal (or the episode or video the block names), lite: nothing of YouTube loads until a tap. An
 * episode without its video shows its title and the links (the public site draws no empty player). */
export async function VideoBlock({ data, ctx }: { data: BlockData<'video'>; ctx: BlockContext }) {
  let episode: WebItem<'episode'> | null = null;
  if (data.episodeId) episode = kindOf(await itemsByIds([data.episodeId]), 'episode')[0] ?? null;
  else if (data.latestEpisode || !data.youtubeId) episode = (await listItems({ kind: 'episode', limit: 1 })).items[0] ?? null;
  const youtubeId = data.youtubeId ?? episode?.data.youtubeId ?? null;
  if (!episode && !youtubeId) return null;
  const title = episode?.data.title ?? data.title ?? 'Video';
  const poster = episode ? photoOf(episode.media, episode.data.coverId) : null;
  const channel = ctx.site.youtube;
  const H = ctx.heading;
  const framed = !!youtubeId || !!ctx.preview;
  return (
    <section className="bg-charcoal py-14 text-on-charcoal sm:py-20">
      <Container className={framed ? 'grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12' : undefined}>
        <div className={framed ? 'lg:col-span-5' : 'max-w-3xl'}>
          <H className="text-[1.75rem] font-bold leading-tight tracking-tight sm:text-4xl">{data.title || 'Video'}</H>
          {episode ? (
            <div className="mt-5 flex flex-col gap-3">
              <h3 className="text-2xl font-semibold leading-snug">{episode.data.title}</h3>
              <EpisodeMeta item={episode} className="text-on-charcoal" />
              {episode.data.excerpt ? <p className="text-lg leading-relaxed">{episode.data.excerpt}</p> : null}
            </div>
          ) : null}
          <div className="mt-6 flex flex-col items-start gap-2">
            <WebLink href="/reporte-bernal" className="inline-flex min-h-11 items-center font-semibold text-on-charcoal underline decoration-2 underline-offset-4 focus-visible:outline-on-charcoal">
              Ver todas las emisiones
            </WebLink>
            {channel ? (
              <span className="flex flex-col items-start">
                <a
                  href={channel.url}
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 flex-wrap items-center gap-x-1 wrap-anywhere font-semibold text-on-charcoal underline decoration-2 underline-offset-4 focus-visible:outline-on-charcoal"
                >
                  Canal de YouTube {channel.handle} <ExternalLinkIcon className="h-4 w-4 shrink-0" />
                </a>
                {channel.verified ? null : <UnverifiedMark dark />}
              </span>
            ) : null}
          </div>
        </div>
        {framed ? (
          <div className="lg:col-span-7">
            <VideoFrame youtubeId={youtubeId} title={title} poster={poster} preview={ctx.preview} />
          </div>
        ) : null}
      </Container>
    </section>
  );
}

/** The 16:9 frame of a video: the lite player over the site's own poster. Without a video the public site draws no
 * frame at all; the administrator's preview draws the placeholders of what is still to link or upload. */
export function VideoFrame({ youtubeId, title, poster, preview = false }: { youtubeId: string | null; title: string; poster: FrozenMedia | null; preview?: boolean }) {
  if (!youtubeId && !preview) return null;
  return (
    <div className="relative aspect-video overflow-hidden rounded-[var(--radius-card)] bg-surface-2">
      {youtubeId ? (
        <LiteYouTube id={youtubeId} title={title}>
          {poster ? (
            <MediaImage media={poster} sizes="(min-width: 1024px) 640px, 100vw" className="absolute inset-0 h-full w-full" />
          ) : preview ? (
            <PhotoPlaceholder className="absolute inset-0 h-full w-full" label="Imagen del episodio por subir" />
          ) : (
            // No poster yet: a plain dark frame under the play button, nothing written on it.
            <div className="absolute inset-0 bg-slate" />
          )}
        </LiteYouTube>
      ) : (
        <PhotoPlaceholder className="absolute inset-0 h-full w-full" label="Video por enlazar desde el administrador" />
      )}
    </div>
  );
}

// «See everything» of a list of documents: the Semanario has its own page; the rest live in Transparencia.
function documentsMore(category: string | undefined): { href: string; label: string } {
  if (category === 'semanario') return { href: '/actualidad/semanario', label: 'Ver todas las ediciones' };
  return { href: category ? withQuery('/transparencia', { categoria: category }) : '/transparencia', label: 'Ver todos los documentos' };
}

export async function DocumentsBlock({ data, ctx }: { data: BlockData<'documents'>; ctx: BlockContext }) {
  const items = data.ids.length
    ? kindOf(await itemsByIds(data.ids), 'document')
    : (await listItems({ kind: 'document', limit: data.limit ?? 6, category: data.category })).items;
  if (!items.length) return null;
  return (
    <section className="py-12 sm:py-16">
      <Container>
        {data.title ? <SectionHeading title={data.title} as={ctx.heading} more={documentsMore(data.category)} /> : null}
        <ul className="border-b border-border">
          {items.map((d) => (
            <DocumentRow key={d.id} item={d} preview={ctx.preview} />
          ))}
        </ul>
      </Container>
    </section>
  );
}

export async function FaqBlock({ data, ctx }: { data: BlockData<'faq'>; ctx: BlockContext }) {
  const items = data.ids?.length
    ? kindOf(await itemsByIds(data.ids), 'faq')
    : (await listItems({ kind: 'faq', limit: 50, category: data.group })).items;
  if (!items.length) return null;
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-4xl">
        <SectionHeading title={data.title || 'Preguntas frecuentes'} as={ctx.heading} />
        <FaqView items={items} preview={ctx.preview} />
      </Container>
    </section>
  );
}

export async function IndicatorsBlock({ data, ctx }: { data: BlockData<'indicators'>; ctx: BlockContext }) {
  // Only the indicators with their source (design §3); without any, the block is not drawn.
  const items = kindOf(await itemsByIds(data.ids), 'indicator')
    .filter((i) => indicatorShown(i.data))
    .sort((a, b) => (a.data.order ?? 1000) - (b.data.order ?? 1000));
  if (!items.length) return null;
  return (
    <section className="bg-accent-soft py-14 sm:py-20">
      <Container>
        <SectionHeading title={data.title || 'Gestión en cifras'} as={ctx.heading} />
        <IndicatorsView items={items} />
      </Container>
    </section>
  );
}

export async function NoticesBlock({ data, ctx }: { data: BlockData<'notices'>; ctx: BlockContext }) {
  const [munis, { items }] = await Promise.all([municipalityNames(), listItems({ kind: 'notice', limit: data.limit ?? 12 })]);
  // Only while they apply (the page is drawn again at least every minute, tags.ts).
  const now = new Date();
  const active = items.filter((n) => noticeActive(n.data, now));
  if (!active.length) return null;
  return (
    <section className="bg-surface py-12 sm:py-16">
      <Container>
        <SectionHeading title={data.title || 'Avisos de servicio'} as={ctx.heading} />
        <NoticesView items={active} munis={munis} now={now} />
      </Container>
    </section>
  );
}

/** The resolved requests published without anyone's data (a name only with consent, else initials). Without any, the
 * block is not drawn. */
export async function AttendedBlock({ data, ctx }: { data: BlockData<'attended'>; ctx: BlockContext }) {
  const [items, munis, categories] = await Promise.all([getAttended(data.limit ?? 6), municipalityNames(), getRequestCategories()]);
  if (!items.length) return null;
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <SectionHeading
          title={data.title || 'Casos atendidos'}
          as={ctx.heading}
          intro="Solicitudes resueltas a través de Atención ciudadana."
          more={{ href: ATTENTION.attended, label: 'Ver todos los casos' }}
        />
        <AttendedView items={items} names={{ munis, categories: new Map(categories.map((c) => [c.id, c.name])) }} />
        <DemoNote show={ctx.site.demo}>Casos de ejemplo de la versión de prueba.</DemoNote>
      </Container>
    </section>
  );
}

/** The official channels as pills. Without any (production before the team verifies them), the block is not drawn. */
export function ChannelsBlock({ data, ctx }: { data: BlockData<'channels'>; ctx: BlockContext }) {
  const channels = orderedChannels(ctx.site);
  if (!channels.length) return null;
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <SectionHeading title={data.title || 'Canales oficiales'} as={ctx.heading} more={{ href: '/canales', label: 'Cómo identificar las cuentas oficiales' }} />
        <ChannelPills channels={channels} />
        <DemoNote show={ctx.site.demo && channels.some((c) => !c.verified)}>En la versión de prueba también se muestran cuentas sin verificar.</DemoNote>
      </Container>
    </section>
  );
}

export function ParticipationBlock({ data, ctx }: { data: BlockData<'participation'>; ctx: BlockContext }) {
  return <ParticipationActions title={data.title || 'Atención ciudadana'} emergencyNotice={ctx.site.emergencyNotice} as={ctx.heading} />;
}
