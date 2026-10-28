import { History } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { HISTORY_FIELD_LABEL as LABEL } from '@/lib/domain/agenda-merge';
import type { HistoryRow } from '@/lib/data/events';
import { dt, fmtDateTime, fmtTime } from '@/lib/time';
import { cn } from '@/lib/cn';

// «Historial» of an event (boss and despacho: all of it; Redes, the boss and administración: the storyboard's part.
// event_history() decides). Who changed what, with the value before, so nothing typed is lost when the last save
// wins; a storyboard block that was added or removed shows what it said.
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

// «Hora de fin» on the same day as before: the times alone («11:10 a. m. → 12:20 p. m.»).
function showChange(k: string, before: unknown, after: unknown): [string, string] {
  const [b, a] = [before, after].map((v) => (typeof v === 'string' ? dt(v)?.toISODate() : null));
  if (k === 'ends_at' && b && b === a) return [fmtTime(before as string), fmtTime(after as string)];
  return [show(before), show(after)];
}

const BLOCK_ORDER = ['shot', 'angle', 'boss_line', 'broll', 'fact', 'fact_source'];

export function HistoryCard({ rows, title = 'Historial' }: { rows: HistoryRow[]; title?: string }) {
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><History className="h-4 w-4" aria-hidden /> {title}</span>} subtitle="Quién cambió qué. Lo de antes queda aquí." />
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
                {r.block && (r.action === 'insert' || r.action === 'soft_delete') ? (
                  <ul className={cn('mt-1 flex flex-col gap-1 text-sm', r.action === 'soft_delete' && 'text-text-2')}>
                    {BLOCK_ORDER.filter((k) => r.block?.[k]).map((k) => (
                      <li key={k} className="[overflow-wrap:anywhere]">
                        <span className="font-semibold">{LABEL[k] ?? k}:</span> {r.block![k]}
                      </li>
                    ))}
                  </ul>
                ) : r.action === 'update' && fields.length ? (
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {fields.slice(0, 8).map(([k, v]) => {
                      const [before, after] = showChange(k, v.before, v.after);
                      return (
                        <li key={k} className="[overflow-wrap:anywhere]">
                          <span className="font-semibold">{LABEL[k] ?? k}:</span> <span className="text-text-2 line-through">{before}</span> → {after}
                        </li>
                      );
                    })}
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
