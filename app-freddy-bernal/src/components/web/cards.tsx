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
// title, so a screen reader reads where it goes.

export type MuniNames = ReadonlyMap<string, string>;

const stretched = 'after:absolute after:inset-0 after:content-[""] hover:underline decoration-2 underline-offset-4';

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
export function NewsCard({ item, as: H = 'h3' }: { item: WebItem<'news'>; as?: 'h2' | 'h3' }) {
  const d = item.data;
  return (
    <article className="relative flex flex-col gap-2 border-t border-border pt-5">
      <p className="text-sm font-semibold text-accent-ink">
        {NEWS_CATEGORIES[d.category]} · <Time day={itemDay(item)} />
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

export function NewsFeature({ item, as: H = 'h3', eager = false }: { item: WebItem<'news'>; as?: 'h2' | 'h3'; eager?: boolean }) {
  const d = item.data;
  return (
    <article className={cn(cardClass, 'relative grid overflow-hidden md:grid-cols-2')}>
      <MediaImage media={photoOf(item.media, d.coverId)} sizes="(min-width: 768px) 560px, 100vw" className="aspect-[16/10] md:aspect-auto md:min-h-80" eager={eager} />
      <div className="flex flex-col gap-3 p-6 sm:p-8">
        <p className="text-sm font-semibold text-accent-ink">
          {NEWS_CATEGORIES[d.category]} · <Time day={itemDay(item)} />
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

export function DocumentRow({ item, as: H = 'h3' }: { item: WebItem<'document'>; as?: 'h2' | 'h3' }) {
  const d = item.data;
  const file = documentFile(item);
  return (
    <li className="flex flex-col gap-3 border-t border-border py-5 sm:flex-row sm:items-center sm:gap-6">
      <FileTextIcon className="hidden h-8 w-8 shrink-0 text-accent-ink sm:block" />
      <div className="min-w-0 flex-1">
        <H className="text-lg font-semibold leading-snug text-text">{d.title}</H>
        <p className="mt-1 text-[15px] text-text-2">
          {DOCUMENT_CATEGORIES[d.category]} · <Time day={itemDay(item)} />
          {d.versionLabel ? ` · ${d.versionLabel}` : ''}
          {d.pages ? ` · ${d.pages === 1 ? '1 página' : `${fmtNumber(d.pages)} páginas`}` : ''}
        </p>
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
      ) : (
        <p className="shrink-0 text-[15px] text-text-2">Archivo por subir</p>
      )}
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

export function Topics({ topics }: { topics?: string[] }) {
  if (!topics?.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Temas">
      {topics.map((t) => (
        <li key={t}>
          <Badge tone="olive" className="text-[13px]">
            {t}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
