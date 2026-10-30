'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Hourglass, Send, Sparkles } from 'lucide-react';
import { sendToReview } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button, LinkButton } from '@/components/ui/button';
import { NETWORK_LABEL } from '@/lib/data/labels';
import { DESIGN_HELD, FORMAT, NO_APPROVAL, sectionHref } from '@/lib/domain/redes';
import { useCard } from './card-context';
import { PublishedDialog } from './published-dialog';

// The card's review row (D-62, D-63, F5, F8): «Revisado y listo para publicar» IS the boss's approval (review_piece),
// never another tick; «Publicado» is «Ya lo publiqué» with its link and screenshot. A draft or a piece with changes
// asked says «Enviar a aprobación» with what is still missing (the same list sendToReview checks) and «Generar copies»;
// in review the boss gets «Revisar» (his review room, coming back to this card), everyone else «Espera al jefe».
// «Ya lo publiqué» is off without the approval, and while the design stays disapproved after it (D-64).
export function reviewHref(pieceId: string, slug: string, monthId: string | null): string {
  return `/aprobar/${pieceId}?volver=${encodeURIComponent(sectionHref(slug, monthId, pieceId))}`;
}

export function ReviewRow({ first = false }: { first?: boolean }) {
  const { card, ctx } = useCard();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const draft = card.status === 'draft' || card.status === 'changes_requested';
  const inReview = card.status === 'in_review';
  const approved = card.status === 'approved';
  const done = card.pubs.filter((p) => p.status === 'published');
  const off = !approved ? NO_APPROVAL : card.designHold ? DESIGN_HELD : null;
  const blockersId = `pieza-${card.id}-blockers`;
  const offId = `pieza-${card.id}-publish-off`;

  const row = (
    <section aria-label="Revisión" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] border border-border p-3">
      <div className="flex min-w-0 flex-col gap-2">
        {draft ? (
          <>
            {card.changes ? <p className="text-sm font-semibold text-warn">Pidieron cambios: revísalos y vuelve a enviarla.</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {/* At /piezas/[id] the page's own «Enviar a aprobación» (with «Nivel de aprobación») goes here. */}
              {ctx.page ? ctx.page.send : (
                <Button
                  type="button"
                  disabled={pending || card.blockers.length > 0}
                  aria-describedby={card.blockers.length ? blockersId : undefined}
                  onClick={() => run(() => sendToReview({ pieceId: card.id }), { success: 'Enviada al jefe para aprobar.' })}
                >
                  <Send className="h-4 w-4" aria-hidden /> Enviar a aprobación
                </Button>
              )}
              {card.format !== 'story' ? (
                <LinkButton href={`/piezas/${card.id}#copies`} variant="secondary">
                  <Sparkles className="h-4 w-4" aria-hidden /> Generar copies
                </LinkButton>
              ) : null}
            </div>
            {card.blockers.length ? (
              <div id={blockersId} className="text-sm">
                <p className="font-semibold text-text">Falta para enviarla:</p>
                <ul className="ml-5 list-disc text-text-2">
                  {card.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {card.warnings.length ? (
              <ul className="ml-5 list-disc text-sm text-warn">
                {card.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : inReview ? (
          ctx.perms.boss ? (
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href={reviewHref(card.id, FORMAT[card.format].slug, card.monthId ?? ctx.monthId)}>Revisar</LinkButton>
              <span className="text-sm text-text-2">Te espera para aprobar.</span>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[15px] text-text-2">
              <Hourglass className="h-4 w-4" aria-hidden /> Espera al jefe
            </p>
          )
        ) : approved ? (
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ok">
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Revisado y listo para publicar
            <span className="font-normal text-text-2">· Aprobó el jefe</span>
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-3">
        {done.length ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-ok">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Publicado
            </p>
            <ul className="flex flex-wrap gap-2">
              {done.map((p) => (
                <li key={p.id}>
                  {p.url ? (
                    <Link href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink underline-offset-2 hover:underline">
                      {NETWORK_LABEL[p.network] ?? p.network} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold">{NETWORK_LABEL[p.network] ?? p.network}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" className="self-start" disabled={!!off} aria-describedby={off ? offId : undefined} onClick={() => setOpen(true)}>
              Ya lo publiqué
            </Button>
            {off ? (
              <p id={offId} className="text-sm text-text-2">
                {off}.
              </p>
            ) : null}
            {open ? <PublishedDialog open={open} onOpenChange={setOpen} /> : null}
          </>
        )}
      </div>
    </section>
  );
  // The tutorials point at the first card's checks only (each anchor once on the page).
  return first ? <div data-tour="card-checks">{row}</div> : row;
}
