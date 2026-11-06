import { getImageProps } from 'next/image';
import { ImageIcon } from './icons';
import type { FrozenMedia } from '@/lib/web/public';
import { publicFileUrl } from '@/lib/storage/buckets';
import { cn } from '@/lib/cn';

// Photos of the media library on the public website (design §1, §2): next/image (AVIF/WebP of the right size, lazy
// below the fold) with the alternative text the library requires, the focal point the editor chose as the crop's center
// (object-position) and `sizes` so a phone never downloads a desktop photo. There are no photos in the repository
// (public repo, D-95): a missing photo is an editorial placeholder, never a stock or invented picture.

export const PLACEHOLDER_TEXT = 'Foto por subir desde el administrador';

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

/** The focal point as CSS object-position («50% 30%»). */
export function focalPosition(m: Pick<FrozenMedia, 'focalX' | 'focalY'>): string {
  return `${Math.round(clamp01(m.focalX) * 100)}% ${Math.round(clamp01(m.focalY) * 100)}%`;
}

/** The library's photo for this id, if it is an image the item froze when it was published. */
export function photoOf(media: Record<string, FrozenMedia>, id: string | null | undefined): FrozenMedia | null {
  if (!id) return null;
  const m = media[id];
  return m && m.kind === 'image' && m.mime.startsWith('image/') && publicFileUrl(m.key) ? m : null;
}

export function PhotoPlaceholder({ className, label = PLACEHOLDER_TEXT }: { className?: string; label?: string }) {
  return (
    <div
      className={cn(
        'relative flex items-end overflow-hidden bg-accent-soft bg-[image:repeating-linear-gradient(135deg,var(--c-accent-soft)_0_14px,var(--c-ivory)_14px_28px)]',
        className,
      )}
    >
      <span className="m-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text">
        <ImageIcon className="h-4 w-4 text-accent-ink" />
        {label}
      </span>
    </div>
  );
}

/** A photo filling its frame (the frame sets the shape: aspect ratio and corners), or the placeholder. */
export function MediaImage({
  media,
  sizes,
  className,
  eager = false,
  placeholder = true,
}: {
  media: FrozenMedia | null;
  sizes: string;
  className?: string;
  /** The page's main photo (above the fold): loaded first. */
  eager?: boolean;
  /** Without a photo: the placeholder (true) or nothing (false). */
  placeholder?: boolean;
}) {
  if (!media) return placeholder ? <PhotoPlaceholder className={className} /> : null;
  // getImageProps: the same srcset, sizes, lazy loading and optimizer of next/image, drawn on the server as a plain
  // <img> (the <Image> component is a client component: its JavaScript would reach every page that may show a photo).
  const { props } = getImageProps({
    src: publicFileUrl(media.key),
    alt: media.alt,
    fill: true,
    sizes,
    ...(eager ? { loading: 'eager' as const, fetchPriority: 'high' as const } : {}),
  });
  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the props come from next/image's getImageProps */}
      <img {...props} alt={media.alt} className="object-cover" style={{ ...props.style, objectPosition: focalPosition(media) }} />
    </div>
  );
}

/** A photo with its caption and credit (the caption from the block, else the library's). */
export function Figure({
  media,
  caption,
  sizes,
  frameClass,
  className,
}: {
  media: FrozenMedia | null;
  caption?: string;
  sizes: string;
  frameClass: string;
  className?: string;
}) {
  const text = caption || media?.caption || '';
  const credit = media?.credit || '';
  return (
    <figure className={className}>
      <MediaImage media={media} sizes={sizes} className={frameClass} />
      {text || credit ? (
        <figcaption className="mt-3 text-[15px] leading-relaxed text-text-2">
          {text}
          {credit ? <span className="ml-1 text-sm">({credit})</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
