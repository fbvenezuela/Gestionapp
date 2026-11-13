import { History } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { HISTORY_FIELD_LABEL } from '@/lib/domain/agenda-merge';
import type { HistoryRow } from '@/lib/data/events';
import { BOSS_DECISION, WORK_STATUS } from '@/lib/data/labels';
import { dt, fmtDateTime, fmtDay, fmtTime } from '@/lib/time';
import { cn } from '@/lib/cn';

// «Historial» of an event (boss and despacho: all of it; Redes, the boss and administración: the storyboard's part.
// event_history() decides). Who changed what, with the value before, so nothing typed is lost when the last save
// wins; a storyboard block that was added or removed shows what it said. Only plain words reach the screen: a column
// without a name of its own, a link between rows or a code is left out, and a change with nothing left to say too.
const TABLE: Record<string, string> = {
  events: 'Datos del evento',
  event_schedule: 'Fecha, hora y lugar',
  event_brief: 'Ficha técnica',
  event_assignments: 'Quién graba',
  storyboards: 'Storyboard',
  storyboard_blocks: 'Bloque del storyboard',
};
const ACTION: Record<string, string> = { insert: 'creó', update: 'cambió', delete: 'quitó', soft_delete: 'borró' };
const HIDDEN = new Set([
  'user_id', 'duty', 'storyboard_id', 'position', 'origin', 'kind', 'deleted_at',
  // The ficha an event comes from, who cancelled it (the row says who) and the row's own bookkeeping.
  'obra_ficha_id', 'community_report_id', 'cancelled_by', 'created_by', 'updated_by', 'rev', 'code', 'id', 'event_id',
]);
// «Día en que se hizo» only here: the notices name the fields with FIELD_LABEL.
const LABEL: Record<string, string> = { ...HISTORY_FIELD_LABEL, done_on: 'Día en que se hizo' };
// The same words as the event's form (agenda/nuevo, «Prioridad para el equipo»).
const URGENCY: Record<string, string> = { 1: 'Urgente', 2: 'Normal', 3: 'Puede esperar' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Names = Record<string, string>;

/** A value as a person reads it, or null when all it has is an internal code (the line is then left out). */
function show(k: string, v: unknown, categories: Names): string | null {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (k === 'boss_decision') return BOSS_DECISION[String(v)]?.label ?? null;
  if (k === 'work_status') return WORK_STATUS[String(v)]?.label ?? null;
  if (k === 'urgency') return URGENCY[String(v)] ?? null;
  if (k === 'category_id') return categories[String(v)] ?? 'otra categoría';
  if (k === 'done_on') return fmtDay(String(v), "d 'de' LLLL") || null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return null;
  if (typeof v === 'string' && UUID.test(v)) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  return String(v);
}

// «Hora de fin» on the same day as before: the times alone («11:10 a. m. → 12:20 p. m.»).
function showChange(k: string, before: unknown, after: unknown, categories: Names): [string, string] | null {
  const [b, a] = [before, after].map((v) => (typeof v === 'string' ? dt(v)?.toISODate() : null));
  if (k === 'ends_at' && b && b === a) return [fmtTime(before as string), fmtTime(after as string)];
  const was = show(k, before, categories);
  const now = show(k, after, categories);
  return was === null || now === null ? null : [was, now];
}

type Line = { k: string; before: string; after: string };

function changeLines(r: HistoryRow, categories: Names): Line[] {
  return Object.entries(r.changes ?? {})
    .filter(([k]) => !HIDDEN.has(k) && k in LABEL)
    .flatMap(([k, v]) => {
      const pair = showChange(k, v?.before, v?.after, categories);
      return pair ? [{ k, before: pair[0], after: pair[1] }] : [];
    });
}

const BLOCK_ORDER = ['shot', 'angle', 'boss_line', 'broll', 'fact', 'fact_source'];

export function HistoryCard({ rows, title = 'Historial', categories = [] }: { rows: HistoryRow[]; title?: string; categories?: { id: string; name: string }[] }) {
  const names: Names = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  // A change whose every field was left out says nothing: it does not show.
  const shown = rows.map((r) => ({ r, lines: r.action === 'update' ? changeLines(r, names) : [] })).filter(({ r, lines }) => r.action !== 'update' || lines.length > 0);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><History className="h-4 w-4" aria-hidden /> {title}</span>} subtitle="Quién cambió qué. Lo de antes queda aquí." />
      {shown.length ? (
        // Scrolls on its own: reachable with the keyboard too.
        <ol className="max-h-[28rem] divide-y divide-border overflow-y-auto" tabIndex={0} aria-label="Cambios del evento, del más nuevo al más viejo">
          {shown.map(({ r, lines }, i) => (
            <li key={i} className="px-4 py-3 text-[15px]">
              <p>
                <b>{r.actor_name ?? 'La app'}</b> {ACTION[r.action] ?? 'cambió'} · {TABLE[r.table_name] ?? 'otro dato'}
              </p>
              <p className="text-sm text-text-2">{fmtDateTime(r.at)}</p>
              {r.block && (r.action === 'insert' || r.action === 'soft_delete') ? (
                <ul className={cn('mt-1 flex flex-col gap-1 text-sm', r.action === 'soft_delete' && 'text-text-2')}>
                  {BLOCK_ORDER.filter((k) => r.block?.[k]).map((k) => (
                    <li key={k} className="[overflow-wrap:anywhere]">
                      <span className="font-semibold">{LABEL[k]}:</span> {r.block![k]}
                    </li>
                  ))}
                </ul>
              ) : lines.length ? (
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {lines.slice(0, 8).map(({ k, before, after }) => (
                    <li key={k} className="[overflow-wrap:anywhere]">
                      <span className="font-semibold">{LABEL[k]}:</span> <span className="text-text-2 line-through">{before}</span> → {after}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-4 text-[15px] text-text-2">Todavía no hay cambios.</p>
      )}
    </Card>
  );
}
