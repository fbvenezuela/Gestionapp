import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import type { Observation } from '@/lib/data/redes';
import { FORMAT, NOTICE_KINDS, sectionHref } from '@/lib/domain/redes';

// «Observaciones» of the board (R4, D-71): the designs disapproved (with the note) and the open compliance notices of the
// period, each opening its card. They are what someone has to look at before it goes out; nothing here approves.
export function Observations({ items, fallbackMonthId }: { items: Observation[]; fallbackMonthId: string | null }) {
  return (
    <Card data-tour="redes-observations" className="mb-5">
      <CardHeader
        title="Observaciones"
        subtitle={items.length ? `${items.length} ${items.length === 1 ? 'cosa por mirar' : 'cosas por mirar'}: diseños desaprobados y avisos abiertos.` : undefined}
      />
      <CardBody>
        {items.length ? (
          <ul className="flex flex-col gap-2">
            {items.map((o, i) => (
              <li key={`${o.kind}:${o.pieceId}:${i}`}>
                <Link
                  href={sectionHref(FORMAT[o.format].slug, o.monthId ?? fallbackMonthId, o.pieceId)}
                  className="flex min-h-14 min-w-0 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 hover:border-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-sm text-text-2">{FORMAT[o.format].plural} ·</span>
                      <span className="font-semibold [overflow-wrap:anywhere]">{o.title}</span>
                      {o.kind === 'design' ? (
                        <Chip tone="danger">Diseño desaprobado</Chip>
                      ) : (
                        <Chip tone="warn" className="whitespace-normal">Aviso: {NOTICE_KINDS[o.noticeKind ?? 'other'] ?? NOTICE_KINDS.other}</Chip>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-text-2 [overflow-wrap:anywhere]">{o.text}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-text-2">Sin observaciones: nadie desaprobó un diseño ni dejó un aviso abierto. Todo al día.</p>
        )}
      </CardBody>
    </Card>
  );
}
