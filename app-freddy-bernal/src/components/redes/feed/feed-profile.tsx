import { brand } from '@/lib/client-config';
import { profileCount } from './feed-core';

// The feed's profile header (R4, D-69, F18), read-only, with what the client's configuration already has: the circle
// with the logo's letters in the brand's colour (the accent token is the brand's themeColor, D-21; its text token keeps
// AA), the client's name and title, and how many pieces this month's feed holds. No Instagram user (it is not in the
// configuration and we do not make one up: question 12), no followers, no bio.
export function FeedProfile({ count, monthLabel }: { count: number; monthLabel: string }) {
  return (
    <div data-feed-profile="" className="mb-4 flex min-w-0 items-center gap-4 border-b border-border pb-4">
      <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-on-accent ring-2 ring-accent-soft ring-offset-2 ring-offset-surface sm:h-20 sm:w-20 sm:text-2xl">
        {brand.logoText}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight [overflow-wrap:anywhere]">{brand.clientName}</p>
        <p className="text-[15px] text-text-2 [overflow-wrap:anywhere]">{brand.clientTitle}</p>
        <p className="mt-1 text-sm font-semibold tabular">{profileCount(count, monthLabel || 'este mes')}</p>
      </div>
    </div>
  );
}
