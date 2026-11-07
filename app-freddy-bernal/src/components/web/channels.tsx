import { ArrowUpRightIcon, BadgeCheckIcon, InfoIcon } from './icons';
import type { PublicChannel, Site } from '@/lib/web/site-settings';
import { cn } from '@/lib/cn';
import { Badge, cardClass } from './ui';

// The official channels, from the ONE list of the site's settings (docs/diagnostico.md problem 3): the same in the
// footer, here and in the structured data. In production only the verified ones exist here; the test version also
// shows the ones nobody has confirmed yet, with one line that says so (never a mark on each of the governor's own
// accounts, which would read as doubtful). The old YouTube channel is inactive in the settings, so it never shows.

/** The line the test version shows when it lists accounts nobody has confirmed yet; null when there are none. */
export function pendingAccountsText(channels: readonly Pick<PublicChannel, 'verified'>[], demo: boolean): string | null {
  if (!demo || !channels.some((c) => !c.verified)) return null;
  return channels.some((c) => c.verified)
    ? 'Las cuentas sin la marca de verificación están en proceso de confirmación.'
    : 'Estas cuentas están en proceso de confirmación.';
}

export function PendingAccountsNote({ channels, demo, className }: { channels: readonly Pick<PublicChannel, 'verified'>[]; demo: boolean; className?: string }) {
  const text = pendingAccountsText(channels, demo);
  if (!text) return null;
  return (
    <p className={cn('flex items-start gap-2 text-[15px]', className)}>
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text}
    </p>
  );
}

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
            ) : null}
          </p>
          <a
            href={c.url}
            rel={c.verified ? 'noopener noreferrer' : 'noopener noreferrer nofollow'}
            className="inline-flex min-h-11 items-center gap-1 wrap-anywhere text-lg font-semibold text-text underline-offset-4 after:absolute after:inset-0 hover:underline"
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

/** The compact version (a block of a page): one pill per account; the full cards live on /canales. A long name wraps
 * inside its pill (a phone of 360 px never scrolls sideways). */
export function ChannelPills({ channels }: { channels: PublicChannel[] }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {channels.map((c) => (
        <li key={c.url} className="max-w-full">
          <a
            href={c.url}
            rel={c.verified ? 'noopener noreferrer' : 'noopener noreferrer nofollow'}
            className="inline-flex min-h-12 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-3xl border border-border bg-surface px-4 py-2 text-base text-text shadow-[var(--glass-shadow)] hover:border-accent"
          >
            <span className="font-semibold">{c.networkLabel}</span>
            <span className="min-w-0 wrap-anywhere text-text-2">{c.handle || c.label}</span>
            {c.verified ? (
              <span className="inline-flex items-center">
                <BadgeCheckIcon className="h-4 w-4 text-ok" />
                <span className="sr-only">verificada</span>
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
