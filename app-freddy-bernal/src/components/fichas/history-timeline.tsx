import { History } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FICHA_UPDATE_KIND, OBRA_STAGE, REPORT_STATUS, type ObraStage, type ReportStatus } from '@/lib/data/ficha-labels';
import { fieldLabel, type FichaKind } from '@/lib/domain/ficha-fields';
import type { FichaUpdate } from '@/lib/data/fichas';
import { fmtDateTime } from '@/lib/time';

// «Cada ficha guarda su historia: quién la creó, cada cambio de estado y cada actualización (nunca se pisa: se
// agrega)». Each line: who, what, when. For contacts only WHICH fields changed (the history never has a phone or
// a name), and never the visit's date.
function stateLabel(kind: FichaKind, v: string | null): string {
  if (!v) return '';
  return kind === 'obra' ? (OBRA_STAGE[v as ObraStage]?.label ?? v) : (REPORT_STATUS[v as ReportStatus]?.label ?? v);
}

export function describeUpdate(kind: FichaKind, u: Pick<FichaUpdate, 'kind' | 'from_value' | 'to_value' | 'fields'>): string {
  const fields = [...new Set((u.fields ?? []).map((f) => fieldLabel(kind, f)))];
  switch (u.kind) {
    case 'created':
      return u.to_value ? `${FICHA_UPDATE_KIND.created} (${stateLabel(kind, u.to_value)})` : FICHA_UPDATE_KIND.created;
    case 'status':
      return `cambió de «${stateLabel(kind, u.from_value)}» a «${stateLabel(kind, u.to_value)}»`;
    case 'update':
    case 'contact':
      return fields.length ? `${FICHA_UPDATE_KIND[u.kind]}: ${fields.join(', ')}` : FICHA_UPDATE_KIND[u.kind];
    default:
      return FICHA_UPDATE_KIND[u.kind] ?? u.kind;
  }
}

export function HistoryTimeline({ kind, rows, children }: { kind: FichaKind; rows: FichaUpdate[]; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title="Historia" subtitle="Quién hizo qué y cuándo. No se borra ni se cambia: solo se agrega." />
      <CardBody className="flex flex-col gap-4">
        {children}
        {rows.length ? (
          <ol className="flex flex-col gap-3">
            {rows.map((u) => (
              <li key={u.id} className="flex gap-3">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[15px] [overflow-wrap:anywhere]">
                    <span className="font-semibold">{u.actor_name ?? 'La plataforma'}</span> {describeUpdate(kind, u)}
                  </p>
                  {u.note ? <p className="mt-0.5 whitespace-pre-wrap text-[15px] text-text-2 [overflow-wrap:anywhere]">«{u.note}»</p> : null}
                  <p className="text-sm text-text-2 first-letter:uppercase">{fmtDateTime(u.created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-text-2">Todavía no hay nada en la historia.</p>
        )}
      </CardBody>
    </Card>
  );
}
