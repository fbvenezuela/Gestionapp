import { Fragment } from 'react';
import { ArrowRightIcon, ClockIcon, DownloadIcon, FileTextIcon, MapPinIcon } from './icons';
import type { WebItem } from '@/lib/web/cache';
import { DOCUMENT_CATEGORIES, NEWS_CATEGORIES, PROJECT_CATEGORIES, PROJECT_STATES, type Snapshot } from '@/lib/web/schema';
import { dayOf, fmtBytes, fmtDay, fmtNumber } from '@/lib/web/format';
import { itemPath } from '@/lib/web/routes';
import { publicFileUrl } from '@/lib/storage/buckets';
import { cn } from '@/lib/cn';
import { MediaImage, photoOf } from './media';
import { Badge, cardClass, WebLink } from './ui';

// The cards of the website's lists: news, projects, documents and episodes. Not a wall of identical cards (design §1):
// the first news item is a feature with its photo, the rest a typographic list; projects are cards with their state;
// documents are rows. A whole card can be tapped (its title's link stretches over it), and the link's text is the
// title, so a screen reader reads where it goes. A missing photo or file draws nothing on the public site (the card
// keeps its shape without it); the administrator's preview (`preview`) shows the placeholder.

export type MuniNames = ReadonlyMap<string, string>;

const stretched = 'after:absolute after:inset-0 after:content-[""] hover:underline decoration-2 underline-offset-4';

const capitalized = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1);

/** What a news item is about, as its eyebrow says it: its first topic (the official site's sections come as topics:
 * «Táchira», «Deportes», «Opinión»…), else its kind («Noticia», «Comunicado»…). */
export function newsLabel(d: Pick<Snapshot<'news'>, 'topics' | 'category'>): string {
  const topic = d.topics?.map((t) => t.trim()).find(Boolean);
  return topic ? capitalized(topic) : NEWS_CATEGORIES[d.category];
}

/** The news search for a topic (/actualidad?q=…): the site's way to list a section without a filter of its own. */
export function topicHref(topic: string): string {
  return `/actualidad?q=${encodeURIComponent(topic.trim())}`;
}

/** The day to show for an item: its display date, else the day it went live. */
export function itemDay(item: Pick<WebItem, 'date' | 'liveSince'>): string {
  return item.date ?? dayOf(item.liveSince);
}

export function Time({ day, className }: { day: string; className?: string }) {
  if (!day) return null;
  return (
    <time dateTime={day} className={className}>
      {fmtDay(day)}
    </time>
  );
}

// --- News ---------------------------------------------------------------------------------------------------------------
/** A news item in a list: its topic and day, the title and the summary. `withPhoto` puts its photo on top (two items
 * side by side); without a photo it is the light typographic card. */
export function NewsCard({
  item,
  as: H = 'h3',
  withPhoto = false,
  preview = false,
}: {
  item: WebItem<'news'>;
  as?: 'h2' | 'h3';
  withPhoto?: boolean;
  preview?: boolean;
}) {
  const d = item.data;
  const photo = withPhoto ? photoOf(item.media, d.coverId) : null;
  const framed = withPhoto && (!!photo || preview);
  return (
    <article className={cn('relative flex flex-col gap-2', framed ? '' : 'border-t border-border pt-5')}>
      {framed ? (
        <MediaImage media={photo} sizes="(min-width: 768px) 540px, 100vw" className="mb-3 aspect-[16/9] rounded-[var(--radius-card)]" placeholder={preview} />
      ) : null}
      <p className="text-sm font-semibold text-accent-ink">
        {newsLabel(d)} · <Time day={itemDay(item)} />
      </p>
      <H className="text-xl font-semibold leading-snug text-text">
        <WebLink href={itemPath('news', item.slug) ?? '/actualidad'} className={stretched}>
          {d.title}
        </WebLink>
      </H>
      {d.excerpt ? <p className="line-clamp-3 text-base leading-relaxed text-text-2">{d.excerpt}</p> : null}
    </article>
  );
}

/** The first news item of a list: a card with its photo beside the words; without a photo, the words alone. */
export function NewsFeature({ item, as: H = 'h3', eager = false, preview = false }: { item: WebItem<'news'>; as?: 'h2' | 'h3'; eager?: boolean; preview?: boolean }) {
  const d = item.data;
  const photo = photoOf(item.media, d.coverId);
  const framed = !!photo || preview;
  return (
    <article className={cn(cardClass, 'relative grid overflow-hidden', framed ? 'md:grid-cols-2' : '')}>
      {framed ? (
        <MediaImage media={photo} sizes="(min-width: 768px) 560px, 100vw" className="aspect-[16/10] md:aspect-auto md:min-h-80" eager={eager} placeholder={preview} />
      ) : null}
      <div className={cn('flex flex-col gap-3 p-6 sm:p-8', framed ? '' : 'max-w-3xl lg:p-10')}>
        <p className="text-sm font-semibold text-accent-ink">
          {newsLabel(d)} · <Time day={itemDay(item)} />
        </p>
        <H className="text-2xl font-bold leading-tight tracking-tight text-text sm:text-3xl">
          <WebLink href={itemPath('news', item.slug) ?? '/actualidad'} className={stretched}>
            {d.title}
          </WebLink>
        </H>
        {d.excerpt ? <p className="text-lg leading-relaxed text-text-2">{d.excerpt}</p> : null}
        <p className="mt-auto inline-flex items-center gap-2 pt-2 font-semibold text-accent-ink" aria-hidden>
          Leer la nota <ArrowRightIcon className="h-4 w-4 shrink-0" />
        </p>
      </div>
    </article>
  );
}

// --- Projects -----------------------------------------------------------------------------------------------------------
const STATE_TONE = { anunciado: 'neutral', en_ejecucion: 'olive', concluido: 'ok' } as const;

export function StateBadge({ state }: { state: keyof typeof PROJECT_STATES }) {
  return <Badge tone={STATE_TONE[state]}>{PROJECT_STATES[state]}</Badge>;
}

/** A progress figure, only because it has a source (the schema requires it): the number, the bar and where it comes from. */
export function Progress({ progress }: { progress: NonNullable<Snapshot<'project'>['progress']> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-text">{fmtNumber(progress.percent)} % de avance</p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }} />
      </div>
      <p className="text-xs text-text-2">Fuente: {progress.source.label}</p>
    </div>
  );
}

export function ProjectCard({ item, munis, as: H = 'h3' }: { item: WebItem<'project'>; munis: MuniNames; as?: 'h2' | 'h3' }) {
  const d = item.data;
  const muni = d.municipalityId ? munis.get(d.municipalityId) : null;
  return (
    <article className={cn(cardClass, 'relative flex flex-col gap-3 p-6')}>
      <div className="flex flex-wrap gap-2">
        <StateBadge state={d.state} />
        <Badge>{PROJECT_CATEGORIES[d.category]}</Badge>
      </div>
      <H className="text-xl font-semibold leading-snug text-text">
        <WebLink href={itemPath('project', item.slug) ?? '/gestion'} className={stretched}>
          {d.title}
        </WebLink>
      </H>
      {d.excerpt ? <p className="text-base leading-relaxed text-text-2">{d.excerpt}</p> : null}
      <div className="mt-auto flex flex-col gap-3 pt-2">
        {muni || d.place ? (
          <p className="flex items-start gap-1.5 text-sm text-text-2">
            <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />
            <span>{[muni, d.place].filter(Boolean).join(' · ')}</span>
          </p>
        ) : null}
        {d.progress ? <Progress progress={d.progress} /> : null}
      </div>
    </article>
  );
}

// --- Documents ----------------------------------------------------------------------------------------------------------
/** The document's PDF as the item froze it, if it was uploaded. */
export function documentFile(item: WebItem<'document'>): { url: string; bytes: number } | null {
  const id = item.data.fileId;
  const m = id ? item.media[id] : null;
  if (!m || m.kind !== 'document') return null;
  const url = publicFileUrl(m.key);
  return url ? { url, bytes: m.bytes } : null;
}

/** A document of a list: its cover when it has one (the Semanario's front page), its title, kind, day, version and
 * pages, and «Ver el PDF». Without its file the public row has no button (the preview says the file is missing). */
/** A document's row. In a list of one category (the Semanario's page, a block of one category) the category is not said
 * on each row, and a title that already says the day («Edición del 8 de octubre de 2026») does not get it again. */
export function DocumentRow({ item, as: H = 'h3', preview = false, inCategory = false }: { item: WebItem<'document'>; as?: 'h2' | 'h3'; preview?: boolean; inCategory?: boolean }) {
  const d = item.data;
  const file = documentFile(item);
  const cover = photoOf(item.media, d.coverId);
  const day = itemDay(item);
  const dated = fmtDay(day) !== '' && d.title.includes(fmtDay(day));
  const meta = [
    inCategory ? null : DOCUMENT_CATEGORIES[d.category],
    dated ? null : <Time key="dia" day={day} />,
    d.versionLabel || null,
    d.pages ? (d.pages === 1 ? '1 página' : `${fmtNumber(d.pages)} páginas`) : null,
  ].filter((x) => x !== null);
  return (
    <li className="flex flex-col gap-3 border-t border-border py-5 sm:flex-row sm:items-center sm:gap-6">
      {cover ? (
        <MediaImage media={cover} sizes="128px" className="aspect-[3/4] w-28 shrink-0 rounded-lg border border-border sm:w-32" />
      ) : (
        <FileTextIcon className="hidden h-8 w-8 shrink-0 text-accent-ink sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <H className="text-lg font-semibold leading-snug text-text">{d.title}</H>
        {meta.length ? (
          <p className="mt-1 text-[15px] text-text-2">
            {meta.map((part, i) => (
              <Fragment key={i}>
                {i ? ' · ' : null}
                {part}
              </Fragment>
            ))}
          </p>
        ) : null}
        {d.excerpt ? <p className="mt-1 text-[15px] leading-relaxed text-text-2">{d.excerpt}</p> : null}
      </div>
      {file ? (
        <a
          href={file.url}
          className="inline-flex min-h-12 shrink-0 items-center gap-2 self-start rounded-full border-2 border-accent bg-surface px-4 font-semibold text-text hover:bg-accent-soft sm:self-center"
        >
          <DownloadIcon className="h-4 w-4 shrink-0" />
          Ver el PDF <span className="sr-only">de «{d.title}»</span>
          <span className="text-sm font-normal text-text-2">({fmtBytes(file.bytes)})</span>
        </a>
      ) : preview ? (
        <p className="shrink-0 text-[15px] text-text-2">Archivo por subir</p>
      ) : null}
    </li>
  );
}

// --- Episodes -----------------------------------------------------------------------------------------------------------
export function EpisodeMeta({ item, className }: { item: WebItem<'episode'>; className?: string }) {
  const d = item.data;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-text-2', className)}>
      <Time day={itemDay(item)} />
      {d.minutes ? (
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="h-4 w-4 shrink-0" /> {d.minutes} min
        </span>
      ) : null}
    </p>
  );
}

/** The topics of an item; with `linked`, each one opens the news search for it. */
export function Topics({ topics, linked = false }: { topics?: string[]; linked?: boolean }) {
  const list = (topics ?? []).map((t) => t.trim()).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Temas">
      {list.map((t) => (
        <li key={t}>
          {linked ? (
            <WebLink href={topicHref(t)} className="inline-flex min-h-11 items-center rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent-ink hover:underline">
              {capitalized(t)}
            </WebLink>
          ) : (
            <Badge tone="olive" className="text-[13px]">
              {capitalized(t)}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
