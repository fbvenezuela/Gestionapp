import Link from 'next/link';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/time';
import { flowChips, isScheduled, type ItemFlow } from '@/lib/web/cms/status';
import { ADMIN_WEB, KIND_SECTIONS } from '@/lib/web/cms/kinds';
import type { WebCaps } from '@/lib/data/web-admin';
import type { WebKind } from '@/lib/web/schema';

// The frame of the website's administrator (/admin/web): its own row of sections under the panel's menu (the panel's
// «Más» and phone bar stay as they are), the chips of an item's state and small shared pieces. Server components.

export function FlowChips({ flow, className }: { flow: ItemFlow; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {flowChips(flow).map((c) => (
        <Chip key={c.label} tone={c.tone}>
          {c.label}
        </Chip>
      ))}
    </span>
  );
}

/** «Programado para el jue 7 de nov, 8:00 a. m.», «Publicado el …», for a list's meta line. */
export function flowLine(flow: ItemFlow & { publishedAt?: Date | string | null }): string | null {
  if (flow.archivedAt) return `Archivado el ${fmtDateTime(flow.archivedAt)}`;
  if (isScheduled(flow)) return `Sale el ${fmtDateTime(flow.publishAt)}`;
  if (flow.hasPublished && flow.publishedAt) return `Publicado el ${fmtDateTime(flow.publishedAt)}`;
  return null;
}

type Tab = { href: string; label: string; key: string };

export function CmsNav({ current, caps, waiting }: { current: string; caps: WebCaps; waiting?: number }) {
  const tabs: Tab[] = [
    { key: 'inicio', href: ADMIN_WEB.home, label: 'Inicio' },
    { key: 'por-aprobar', href: ADMIN_WEB.queue, label: waiting ? `Por aprobar (${waiting})` : 'Por aprobar' },
    { key: 'biblioteca', href: ADMIN_WEB.media, label: 'Biblioteca' },
    ...(caps.canManageSite
      ? [
          { key: 'ajustes', href: ADMIN_WEB.settings, label: 'Ajustes del sitio' },
          { key: 'redirecciones', href: ADMIN_WEB.redirects, label: 'Redirecciones' },
        ]
      : []),
  ];
  return (
    <nav aria-label="Secciones de la web" className="mb-5 -mx-1 overflow-x-auto pb-1">
      <ul className="flex w-max gap-1.5 px-1">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={current === t.key ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold',
                current === t.key ? 'bg-slate text-on-slate' : 'border border-border bg-surface text-text-2 hover:text-text',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The kinds of content, as chips that lead to their lists (with how many there are). */
export function KindTabs({ current, counts }: { current?: WebKind; counts: Partial<Record<WebKind, number>> }) {
  return (
    <nav aria-label="Tipos de contenido" className="mb-4">
      <ul className="flex flex-wrap gap-1.5">
        {KIND_SECTIONS.map((s) => (
          <li key={s.kind}>
            <Link
              href={ADMIN_WEB.list(s.kind)}
              aria-current={current === s.kind ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center gap-1.5 rounded-[var(--radius-chip)] px-3 text-sm font-semibold',
                current === s.kind ? 'bg-accent text-on-accent' : 'border border-border bg-surface text-text-2 hover:text-text',
              )}
            >
              {s.label}
              <span className="tabular text-xs opacity-80">{counts[s.kind] ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: string; children?: React.ReactNode }) {
  const tones = { info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger', ok: 'bg-ok-soft text-ok' } as const;
  return (
    <div className={cn('rounded-[var(--radius-control)] px-4 py-3 text-[15px]', tones[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-1', 'text-text')}>{children}</div> : null}
    </div>
  );
}
