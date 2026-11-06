import { CalendarClockIcon, CircleCheckIcon, InfoIcon, MapPinIcon } from '../icons';
import type { AttendedItem, WebItem } from '@/lib/web/cache';
import { indicatorShown, noticeActive, NOTICE_CATEGORIES } from '@/lib/web/schema';
import { REQUEST_TYPE_LABEL, type RequestType } from '@/lib/participation/input';
import { fmtDay, fmtMoment, fmtNumber } from '@/lib/web/format';
import { ATTENTION } from '@/lib/web/links';
import { cn } from '@/lib/cn';
import type { MuniNames } from '../cards';
import { Time } from '../cards';
import { RichText } from '../rich-text';
import { Badge, boxClass, cardClass, SafeLink, WebLink } from '../ui';

// The synchronous views of the blocks that read data (the async blocks fetch, these draw; tests render these with fake
// items). Rules of design §3 live here: an indicator shows ONLY with its source, a notice ONLY while it applies (with
// when it was updated and until when), «lo atendido» carries no data of any person (the database publishes only the
// anonymized summary: a name only with consent, else initials; a denuncia only as «denuncia atendida en …»).

/** The list behind a figure that the platform counts by itself (the brief: «al tocarlos, la lista»); a figure written by
 * hand has no list of its own on the site, so it links nowhere. */
export function indicatorListHref(computedFrom: WebItem<'indicator'>['data']['computedFrom']): string | null {
  if (computedFrom === 'projects_concluded') return '/gestion?estado=concluido';
  if (computedFrom === 'attended_requests') return ATTENTION.attended;
  return null;
}

export function IndicatorsView({ items }: { items: WebItem<'indicator'>[] }) {
  const shown = items.filter((i) => indicatorShown(i.data));
  if (!shown.length) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((i) => {
        const d = i.data;
        const list = indicatorListHref(d.computedFrom);
        return (
          <li key={i.id} className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface p-6">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-text">
              <span className="text-5xl font-bold leading-none tracking-tight tabular">{fmtNumber(d.value)}</span>
              {d.unit ? <span className="text-xl font-semibold leading-tight">{d.unit}</span> : null}
            </p>
            <p className="text-lg font-semibold leading-snug text-text">{d.title}</p>
            {list ? (
              <WebLink href={list} className="inline-flex min-h-11 w-fit items-center font-semibold text-accent-ink underline decoration-2 underline-offset-4">
                Ver la lista<span className="sr-only">: {d.title}</span>
              </WebLink>
            ) : null}
            <p className="mt-auto text-sm leading-relaxed text-text-2">
              Fuente: {d.source!.url ? <SafeLink href={d.source!.url} className="underline underline-offset-4">{d.source!.label}</SafeLink> : d.source!.label}
              {d.asOf ? <> · al {fmtDay(d.asOf)}</> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function NoticesView({ items, munis, now = new Date() }: { items: WebItem<'notice'>[]; munis: MuniNames; now?: Date }) {
  const active = items.filter((n) => noticeActive(n.data, now));
  if (!active.length) return null;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {active.map((n) => {
        const d = n.data;
        const places = d.municipalityIds.map((id) => munis.get(id)).filter(Boolean);
        return (
          <li key={n.id} className={cn(cardClass, 'flex flex-col gap-3 border-l-4 border-l-action p-6')}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn">{NOTICE_CATEGORIES[d.category]}</Badge>
              <span className="inline-flex items-center gap-1 text-sm text-text-2">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                {places.length ? places.join(', ') : 'Todo el estado'}
              </span>
            </div>
            <h3 className="text-xl font-semibold leading-snug text-text">{d.title}</h3>
            <p className="text-base leading-relaxed text-text">{d.body}</p>
            <div className="mt-auto flex flex-col gap-1 text-sm leading-relaxed text-text-2">
              <p className="flex items-start gap-1.5">
                <CalendarClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Actualizado el <time dateTime={d.updatedAt}>{fmtMoment(d.updatedAt)}</time>
                </span>
              </p>
              <p className="pl-[22px]">
                {d.expiresAt ? (
                  <>
                    Vigente hasta el <time dateTime={d.expiresAt}>{fmtMoment(d.expiresAt)}</time>
                  </>
                ) : (
                  'Sin fecha de fin'
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FaqView({ items }: { items: WebItem<'faq'>[] }) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => (a.data.order ?? 1000) - (b.data.order ?? 1000) || a.data.title.localeCompare(b.data.title, 'es'));
  return (
    <ul className={cn(boxClass, 'divide-y divide-border')}>
      {sorted.map((f) => (
        <li key={f.id}>
          <details className="group px-5 sm:px-6">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold text-text [&::-webkit-details-marker]:hidden">
              {f.data.title}
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink transition-transform motion-safe:group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <div className="pb-5">
              <RichText nodes={f.data.answer} className="text-base sm:text-[17px]" />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export type Names = { munis: MuniNames; categories: ReadonlyMap<string, string> };

export function AttendedView({ items, names }: { items: AttendedItem[]; names: Names }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => {
        const muni = a.municipalityId ? names.munis.get(a.municipalityId) : null;
        const category = a.categoryId ? names.categories.get(a.categoryId) : null;
        const type = (REQUEST_TYPE_LABEL as Record<string, string>)[a.type as RequestType] ?? 'Solicitud';
        return (
          <li key={a.id} className={cn(cardClass, 'flex flex-col gap-3 p-6')}>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-ok">
              <CircleCheckIcon className="h-5 w-5" /> Atendido · {type}
              {category ? ` · ${category}` : ''}
            </p>
            <p className="text-lg leading-relaxed text-text">{a.summary}</p>
            {a.displayName ? <p className="text-base font-medium text-text-2">— {a.displayName}</p> : null}
            <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-2">
              {muni ? (
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4 shrink-0" /> {muni}
                </span>
              ) : null}
              {a.resolvedOn ? (
                <span>
                  Resuelto el <Time day={a.resolvedOn} />
                </span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** A small «this is invented» line for the demo's figures. */
export function DemoNote({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <p className="mt-4 inline-flex items-start gap-2 text-sm text-text-2">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}
