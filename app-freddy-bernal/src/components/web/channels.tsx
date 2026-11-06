import { ArrowUpRightIcon, BadgeCheckIcon } from './icons';
import type { PublicChannel, Site } from '@/lib/web/site-settings';
import { cn } from '@/lib/cn';
import { Badge, cardClass, UnverifiedMark } from './ui';

// The official channels, from the ONE list of the site's settings (docs/diagnostico.md problem 3): the same in the
// footer, here and in the structured data. In production only the verified ones exist here; the test version also
// shows the «por confirmar» ones, marked. The old YouTube channel is inactive in the settings, so it never shows.

/** The channel of the program first, then the accounts, then WhatsApp; each address once. */
export function orderedChannels(site: Pick<Site, 'youtube' | 'accounts' | 'whatsapp'>): PublicChannel[] {
  const seen = new Set<string>();
  const out: PublicChannel[] = [];
  for (const c of [...(site.youtube ? [site.youtube] : []), ...site.accounts, ...(site.whatsapp ? [site.whatsapp] : [])]) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

export function ChannelCards({ channels, className }: { channels: PublicChannel[]; className?: string }) {
  return (
    <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {channels.map((c) => (
        <li key={c.url} className={cn(cardClass, 'relative flex flex-col gap-2 p-5')}>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-accent-ink">
            {c.networkLabel}
            {c.verified ? (
              <Badge tone="ok" className="gap-1 px-2 py-0.5 text-xs normal-case tracking-normal">
                <BadgeCheckIcon className="h-3.5 w-3.5" /> verificada
              </Badge>
            ) : (
              <UnverifiedMark />
            )}
          </p>
          <a
            href={c.url}
            rel={c.verified ? 'noopener noreferrer' : 'noopener noreferrer nofollow'}
            className="inline-flex min-h-11 items-center gap-1 break-all text-lg font-semibold text-text underline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {c.handle || c.label}
            <ArrowUpRightIcon className="h-4 w-4 shrink-0" />
          </a>
          {c.label && c.label !== c.networkLabel ? <p className="text-[15px] text-text-2">{c.label}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** The compact version (a block of a page): one pill per account; the full cards live on /canales. */
export function ChannelPills({ channels }: { channels: PublicChannel[] }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {channels.map((c) => (
        <li key={c.url}>
          <a
            href={c.url}
            rel={c.verified ? 'noopener noreferrer' : 'noopener noreferrer nofollow'}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface px-4 text-base text-text shadow-[var(--glass-shadow)] hover:border-accent"
          >
            <span className="font-semibold">{c.networkLabel}</span>
            <span className="text-text-2">{c.handle || c.label}</span>
            {c.verified ? <BadgeCheckIcon className="h-4 w-4 text-ok" /> : <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">por confirmar</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}
