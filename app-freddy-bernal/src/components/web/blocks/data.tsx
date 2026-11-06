import { ExternalLinkIcon } from '../icons';
import { getAttended, getRequestCategories, getTerritories, itemsByIds, listItems, type WebItem } from '@/lib/web/cache';
import { ATTENTION } from '@/lib/web/links';
import type { FrozenMedia } from '@/lib/web/public';
import { indicatorShown, noticeActive } from '@/lib/web/schema';
import { DocumentRow, EpisodeMeta, NewsCard, NewsFeature, ProjectCard, type MuniNames } from '../cards';
import { ChannelPills, orderedChannels } from '../channels';
import { MediaImage, PhotoPlaceholder, photoOf } from '../media';
import { LiteYouTube } from '../lite-youtube';
import { ParticipationActions } from '../participation-actions';
import { EmptyState } from '../states';
import { Container, SectionHeading, UnverifiedMark, WebLink } from '../ui';
import type { BlockContext, BlockData } from './types';
import { AttendedView, DemoNote, FaqView, IndicatorsView, NoticesView } from './views';

// The blocks that read published content (as anon, cached, cache.ts): projects, news, the latest Reporte Bernal,
// documents, questions, indicators, notices, «lo atendido», the channels and the participation accesses. A block whose
// content is not there yet draws nothing (or says so, where saying it helps), never something invented.

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
        <SectionHeading title={data.title || 'Gestión y obras'} as={ctx.heading} more={{ href: '/gestion', label: 'Ver toda la gestión' }} />
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

export async function NewsBlock({ data, ctx }: { data: BlockData<'news'>; ctx: BlockContext }) {
  const { items } = await listItems({ kind: 'news', limit: data.limit ?? 4, category: data.category });
  if (!items.length) return null;
  const [first, ...rest] = items;
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <SectionHeading title={data.title || 'Actualidad'} as={ctx.heading} more={{ href: '/actualidad', label: 'Ver toda la actualidad' }} />
        <NewsFeature item={first} />
        {rest.length ? (
          <ul className="mt-8 grid gap-x-8 gap-y-6 md:grid-cols-3">
            {rest.map((n) => (
              <li key={n.id}>
                <NewsCard item={n} />
              </li>
            ))}
          </ul>
        ) : null}
      </Container>
    </section>
  );
}

/** The latest Reporte Bernal (or the episode or video the block names), lite: nothing of YouTube loads until a tap. */
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
  return (
    <section className="bg-charcoal py-14 text-on-charcoal sm:py-20">
      <Container className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
        <div className="lg:col-span-5">
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
              Ver todos los episodios
            </WebLink>
            {channel ? (
              <span className="inline-flex flex-wrap items-center">
                <a
                  href={channel.url}
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 font-semibold text-on-charcoal underline decoration-2 underline-offset-4 focus-visible:outline-on-charcoal"
                >
                  Canal de YouTube {channel.handle} <ExternalLinkIcon className="h-4 w-4" />
                </a>
                {channel.verified ? null : <UnverifiedMark dark />}
              </span>
            ) : null}
          </div>
        </div>
        <div className="lg:col-span-7">
          <VideoFrame youtubeId={youtubeId} title={title} poster={poster} />
        </div>
      </Container>
    </section>
  );
}

/** The 16:9 frame of a video: the lite player, or a clear placeholder while the video is not linked yet. */
export function VideoFrame({ youtubeId, title, poster }: { youtubeId: string | null; title: string; poster: FrozenMedia | null }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-[var(--radius-card)] bg-surface-2">
      {youtubeId ? (
        <LiteYouTube id={youtubeId} title={title}>
          {poster ? (
            <MediaImage media={poster} sizes="(min-width: 1024px) 640px, 100vw" className="absolute inset-0 h-full w-full" />
          ) : (
            <PhotoPlaceholder className="absolute inset-0 h-full w-full" label="Imagen del episodio por subir" />
          )}
        </LiteYouTube>
      ) : (
        <PhotoPlaceholder className="absolute inset-0 h-full w-full" label="Video por enlazar desde el administrador" />
      )}
    </div>
  );
}

export async function DocumentsBlock({ data, ctx }: { data: BlockData<'documents'>; ctx: BlockContext }) {
  const items = data.ids.length
    ? kindOf(await itemsByIds(data.ids), 'document')
    : (await listItems({ kind: 'document', limit: data.limit ?? 6, category: data.category })).items;
  if (!items.length) return null;
  return (
    <section className="py-12 sm:py-16">
      <Container>
        {data.title ? <SectionHeading title={data.title} as={ctx.heading} more={{ href: '/transparencia', label: 'Ver todos los documentos' }} /> : null}
        <ul className="border-b border-border">
          {items.map((d) => (
            <DocumentRow key={d.id} item={d} />
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
        <FaqView items={items} />
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
        <SectionHeading title={data.title || 'Lo hecho'} as={ctx.heading} intro="Cada cifra dice de dónde sale." />
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

export async function AttendedBlock({ data, ctx }: { data: BlockData<'attended'>; ctx: BlockContext }) {
  const [items, munis, categories] = await Promise.all([getAttended(data.limit ?? 6), municipalityNames(), getRequestCategories()]);
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <SectionHeading
          title={data.title || 'Lo atendido'}
          as={ctx.heading}
          intro="Casos resueltos que el equipo publica sin datos de nadie: el nombre solo si la persona lo permitió; si no, sus iniciales."
          more={items.length ? { href: ATTENTION.attended, label: 'Ver todo lo atendido' } : undefined}
        />
        {items.length ? (
          <AttendedView items={items} names={{ munis, categories: new Map(categories.map((c) => [c.id, c.name])) }} />
        ) : (
          <EmptyState title="Todavía no hay casos atendidos publicados.">Cuando el equipo resuelva solicitudes, aparecerán aquí.</EmptyState>
        )}
        <DemoNote show={ctx.site.demo && items.length > 0}>En la versión de prueba estos casos son inventados.</DemoNote>
      </Container>
    </section>
  );
}

export function ChannelsBlock({ data, ctx }: { data: BlockData<'channels'>; ctx: BlockContext }) {
  const channels = orderedChannels(ctx.site);
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <SectionHeading title={data.title || 'Canales oficiales'} as={ctx.heading} more={{ href: '/canales', label: 'Cómo reconocer los canales auténticos' }} />
        {channels.length ? (
          <ChannelPills channels={channels} />
        ) : (
          <EmptyState title="Las cuentas oficiales se publican aquí cuando el equipo las verifica." />
        )}
        <DemoNote show={ctx.site.demo && channels.some((c) => !c.verified)}>
          En la versión de prueba se ven también las cuentas «por confirmar». En la web publicada solo salen las verificadas.
        </DemoNote>
      </Container>
    </section>
  );
}

export function ParticipationBlock({ data, ctx }: { data: BlockData<'participation'>; ctx: BlockContext }) {
  return <ParticipationActions title={data.title || '¿Qué quieres hacer?'} emergencyNotice={ctx.site.emergencyNotice} as={ctx.heading} />;
}

