import { ArrowRightIcon } from '../icons';
import { safeHref } from '@/lib/web/blocks';
import { cn } from '@/lib/cn';
import { Figure, MediaImage, photoOf } from '../media';
import { PendingSlot, RichText } from '../rich-text';
import { buttonClass, Container, SectionHeading, WebLink } from '../ui';
import type { BlockContext, BlockData } from './types';

// The blocks that need nothing but their own data (synchronous, so the tests render them directly): hero, text, photo,
// gallery and call to action. Text is escaped by React; links pass safeHref; photos come only from what the page froze.

// A short text that is still the team's «por completar» (the starting pages say so in words, D-95) shows as the empty
// slot it is, not as if it were the message.
const PENDING_PREFIX = /^por completar( desde el administrador)?\s*[:·-]?\s*/i;
export function isPendingText(text: string): boolean {
  return PENDING_PREFIX.test(text.trim());
}

/** A button to wherever an editor pointed (safeHref again here: a link that does not pass is not drawn). */
export function SafeButton({ href, label, variant = 'olive' }: { href: string; label: string; variant?: 'olive' | 'action' }) {
  const ok = safeHref.safeParse(href);
  if (!ok.success) return null;
  const cls = buttonClass(variant, 'lg');
  const inner = (
    <>
      {label} <ArrowRightIcon className="h-5 w-5" />
    </>
  );
  return ok.data.startsWith('/') ? (
    <WebLink href={ok.data} className={cls}>
      {inner}
    </WebLink>
  ) : (
    <a href={ok.data} className={cls} rel="noopener noreferrer">
      {inner}
    </a>
  );
}

export function HeroBlock({ data, ctx }: { data: BlockData<'hero'>; ctx: BlockContext }) {
  const H = ctx.heading;
  const photo = photoOf(ctx.media, data.mediaId);
  return (
    <section className="bg-ivory">
      <Container className="grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-12 lg:gap-14 lg:py-20">
        <div className="lg:col-span-6">
          <H className="text-[2.75rem] font-bold leading-[1.02] tracking-tight text-text sm:text-6xl lg:text-7xl">{data.title}</H>
          {data.text ? (
            isPendingText(data.text) ? (
              <PendingSlot text={data.text.replace(PENDING_PREFIX, '')} className="mt-6 max-w-xl" />
            ) : (
              <p className="mt-6 max-w-xl text-xl leading-relaxed text-text-2 sm:text-2xl">{data.text}</p>
            )
          ) : null}
          {data.ctaLabel && data.ctaHref ? (
            <div className="mt-8">
              <SafeButton href={data.ctaHref} label={data.ctaLabel} />
            </div>
          ) : null}
        </div>
        <div className="lg:col-span-6">
          <MediaImage
            media={photo}
            sizes="(min-width: 1152px) 540px, (min-width: 1024px) 46vw, 100vw"
            className="aspect-[4/3] rounded-[var(--radius-card)] lg:aspect-[5/4]"
            eager={ctx.first}
          />
        </div>
      </Container>
    </section>
  );
}

export function TextBlock({ data, ctx }: { data: BlockData<'text'>; ctx: BlockContext }) {
  const H = ctx.heading;
  return (
    <section className="py-10 sm:py-14">
      <Container>
        <div className="max-w-3xl">
          {data.title ? <H className="mb-6 text-[1.75rem] font-bold leading-tight tracking-tight text-text sm:text-4xl">{data.title}</H> : null}
          <RichText nodes={data.content} />
        </div>
      </Container>
    </section>
  );
}

export function ImageBlock({ data, ctx }: { data: BlockData<'image'>; ctx: BlockContext }) {
  const photo = photoOf(ctx.media, data.mediaId);
  return (
    <section className="py-8 sm:py-12">
      <Container className={cn(data.wide ? '' : 'max-w-4xl')}>
        <Figure
          media={photo}
          caption={data.caption}
          sizes={data.wide ? '(min-width: 1152px) 1104px, 100vw' : '(min-width: 896px) 848px, 100vw'}
          frameClass={cn('rounded-[var(--radius-card)]', data.wide ? 'aspect-[16/9]' : 'aspect-[3/2]')}
        />
      </Container>
    </section>
  );
}

export function GalleryBlock({ data, ctx }: { data: BlockData<'gallery'>; ctx: BlockContext }) {
  // Only the photos the page froze: a gallery is never a grid of empty frames.
  const photos = data.mediaIds.map((id) => photoOf(ctx.media, id)).filter((m) => m !== null);
  if (!photos.length) return null;
  return (
    <section className="py-10 sm:py-14">
      <Container>
        {data.title ? <SectionHeading title={data.title} as={ctx.heading} /> : null}
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {photos.map((m, i) => (
            <li key={`${m.key}-${i}`} className={cn(i === 0 && photos.length > 2 ? 'col-span-2 lg:col-span-2 lg:row-span-2' : '')}>
              <Figure
                media={m}
                sizes={i === 0 && photos.length > 2 ? '(min-width: 1024px) 736px, 100vw' : '(min-width: 1024px) 368px, 50vw'}
                frameClass={cn('rounded-2xl', i === 0 && photos.length > 2 ? 'aspect-[4/3] lg:aspect-square' : 'aspect-square')}
              />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function CtaBlock({ data, ctx }: { data: BlockData<'cta'>; ctx: BlockContext }) {
  const H = ctx.heading;
  return (
    <section className="py-10 sm:py-14">
      <Container>
        <div className="flex flex-col items-start gap-5 rounded-[var(--radius-card)] bg-accent-soft p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <H className="text-[1.75rem] font-bold leading-tight tracking-tight text-text sm:text-4xl">{data.title}</H>
            {data.text ? <p className="mt-3 text-lg leading-relaxed text-text">{data.text}</p> : null}
          </div>
          <SafeButton href={data.href} label={data.label} variant="olive" />
        </div>
      </Container>
    </section>
  );
}
