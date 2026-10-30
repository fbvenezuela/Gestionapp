import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FilePlus2, MessageSquareWarning, Palette, Send, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import type { Activity as Item } from '@/lib/data/redes';
import { FORMAT, sectionHref } from '@/lib/domain/redes';
import { ACTIVITY_VERB, type ActivityKind } from '@/lib/domain/redes-dashboard';
import { agoText } from '@/components/redes/card/card-core';
import { cn } from '@/lib/cn';

// «Actividad reciente» of the board (R4, D-71): the latest twelve moves in Redes (created, a new version, the boss's
// decision, published, a design mark, a notice), read from the tables each person already reads (never the audit log).
// Relative times only («hace 5 min»): no hour, no date (D-75). Each line opens the card.
const ICON: Record<ActivityKind, { Icon: LucideIcon; tone: string }> = {
  created: { Icon: FilePlus2, tone: 'bg-surface-2 text-text-2' },
  version: { Icon: Upload, tone: 'bg-info-soft text-info' },
  approved: { Icon: CheckCircle2, tone: 'bg-ok-soft text-ok' },
  changes_requested: { Icon: MessageSquareWarning, tone: 'bg-warn-soft text-warn' },
  published: { Icon: Send, tone: 'bg-ok-soft text-ok' },
  design_ok: { Icon: Palette, tone: 'bg-accent-soft text-accent-ink' },
  design_bad: { Icon: Palette, tone: 'bg-danger-soft text-danger' },
  notice: { Icon: AlertTriangle, tone: 'bg-warn-soft text-warn' },
};

/** «Yorman subió una versión de «Reel nuevo»». */
export function activityText(a: Pick<Item, 'kind' | 'who' | 'title'>): string {
  return `${a.who?.trim() || 'Alguien'} ${ACTIVITY_VERB[a.kind] ?? 'cambió'} «${a.title}»`;
}

export function Activity({ items, fallbackMonthId }: { items: Item[]; fallbackMonthId: string | null }) {
  return (
    <Card data-tour="redes-activity" className="min-w-0">
      <CardHeader title="Actividad reciente" subtitle="Lo último que pasó en Redes." />
      <CardBody>
        {items.length ? (
          <ol className="flex flex-col gap-1">
            {items.map((a, i) => {
              const { Icon, tone } = ICON[a.kind] ?? ICON.created;
              return (
                <li key={`${a.kind}:${a.pieceId}:${i}`}>
                  <Link
                    href={sectionHref(FORMAT[a.format].slug, a.monthId ?? fallbackMonthId, a.pieceId)}
                    className="flex min-h-14 min-w-0 items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 hover:bg-surface-2"
                  >
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', tone)}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug [overflow-wrap:anywhere]">{activityText(a)}</span>
                      <span className="block text-sm text-text-2">
                        {FORMAT[a.format].label} · {agoText(a.at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-[15px] text-text-2">Sin actividad todavía.</p>
        )}
      </CardBody>
    </Card>
  );
}
