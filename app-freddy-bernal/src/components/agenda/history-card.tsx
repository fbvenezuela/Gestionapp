import { History } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { FIELD_LABEL } from '@/lib/domain/agenda-merge';
import type { HistoryRow } from '@/lib/data/events';
import { fmtDateTime } from '@/lib/time';

// «Historial» of an event (boss and despacho only: event_history() returns nothing to anyone else). Who changed
// what, with the value before, so nothing typed is lost when the last save wins.
const TABLE: Record<string, string> = {
  events: 'Datos del evento',
  event_schedule: 'Fecha, hora y lugar',
  event_brief: 'Ficha técnica',
  event_assignments: 'Quién graba',
  storyboards: 'Storyboard',
  storyboard_blocks: 'Bloque del storyboard',
};
const ACTION: Record<string, string> = { insert: 'creó', update: 'cambió', delete: 'quitó', soft_delete: 'borró' };
const HIDDEN = new Set(['user_id', 'duty', 'storyboard_id', 'position', 'origin', 'kind', 'deleted_at']);

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  return String(v);
}

export function HistoryCard({ rows }: { rows: HistoryRow[] }) {
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><History className="h-4 w-4" aria-hidden /> Historial</span>} subtitle="Quién cambió qué. Lo de antes queda aquí." />
      {rows.length ? (
        // Scrolls on its own: reachable with the keyboard too.
        <ol className="max-h-[28rem] divide-y divide-border overflow-y-auto" tabIndex={0} aria-label="Cambios del evento, del más nuevo al más viejo">
          {rows.map((r, i) => {
            const fields = Object.entries(r.changes ?? {}).filter(([k]) => !HIDDEN.has(k));
            return (
              <li key={i} className="px-4 py-3 text-[15px]">
                <p>
                  <b>{r.actor_name ?? 'El sistema'}</b> {ACTION[r.action] ?? r.action} · {TABLE[r.table_name] ?? r.table_name}
                </p>
                <p className="text-sm text-text-2">{fmtDateTime(r.at)}</p>
                {r.action === 'update' && fields.length ? (
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {fields.slice(0, 8).map(([k, v]) => (
                      <li key={k} className="[overflow-wrap:anywhere]">
                        <span className="font-semibold">{FIELD_LABEL[k] ?? k}:</span> <span className="text-text-2 line-through">{show(v.before)}</span> → {show(v.after)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="p-4 text-[15px] text-text-2">Todavía no hay cambios.</p>
      )}
    </Card>
  );
}
