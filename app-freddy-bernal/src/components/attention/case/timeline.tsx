import { Lock, MessageSquare } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/time';
import { MESSAGE_LABEL, REDACT_FIELD_LABEL, REQUEST_PRIORITY_LABEL, REQUEST_STATE_LABEL, REQUEST_TYPE_LABEL, type RedactField, type RequestPriority, type RequestType } from '@/lib/domain/attention';
import type { CaseDetail, CaseEvent, CaseMessage } from '@/lib/data/attention';

// The whole history of a case (design §5): every change (with who, when and why), every message and every file, in
// order. The internal notes look different and say so: the person never sees them. What the person sees of all this
// is the shared part only (their consultation: states without the reason, replies, requests for information).

type Entry =
  | { at: Date; key: string; kind: 'event'; e: CaseEvent }
  | { at: Date; key: string; kind: 'message'; m: CaseMessage };

const who = (e: { actorKind: string; actorName: string | null }) =>
  e.actorKind === 'citizen' ? 'La persona' : e.actorKind === 'system' ? 'La app' : (e.actorName ?? 'El equipo');

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** One line for each kind of event, with the names behind the ids. */
export function eventText(e: CaseEvent, names: Record<string, string>): string {
  const d = e.detail as Record<string, Record<string, unknown> | unknown>;
  const name = (id: unknown, none: string) => (typeof id === 'string' ? (names[id] ?? 'alguien') : none);
  switch (e.kind) {
    case 'created':
      return 'Llegó la solicitud desde la web.';
    case 'state':
      return e.fromState ? `Pasó de «${REQUEST_STATE_LABEL[e.fromState]}» a «${e.toState ? REQUEST_STATE_LABEL[e.toState] : '—'}».` : `Quedó en «${e.toState ? REQUEST_STATE_LABEL[e.toState] : '—'}».`;
    case 'assigned': {
      const area = (d.area ?? {}) as Record<string, unknown>;
      const person = (d.assignee ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (area.from !== area.to) parts.push(`área: ${name(area.from, 'ninguna')} → ${name(area.to, 'ninguna')}`);
      if (person.from !== person.to) parts.push(`responsable: ${name(person.from, 'nadie')} → ${name(person.to, 'nadie')}`);
      return parts.length ? `Asignación (${parts.join('; ')}).` : 'Asignación revisada.';
    }
    case 'priority': {
      const from = str(d.from) as RequestPriority | null;
      const to = str(d.to) as RequestPriority | null;
      return `Prioridad: ${from ? REQUEST_PRIORITY_LABEL[from] : '—'} → ${to ? REQUEST_PRIORITY_LABEL[to] : '—'}.`;
    }
    case 'due': {
      const to = str(d.to);
      return to ? `Fecha comprometida: ${fmtDateTime(to)}.` : 'Se quitó la fecha comprometida.';
    }
    case 'reclassified': {
      const type = (d.type ?? {}) as Record<string, unknown>;
      const cat = (d.category ?? {}) as Record<string, unknown>;
      const tFrom = str(type.from) as RequestType | null;
      const tTo = str(type.to) as RequestType | null;
      return `Se corrigió: ${tFrom ? REQUEST_TYPE_LABEL[tFrom] : '—'} → ${tTo ? REQUEST_TYPE_LABEL[tTo] : '—'}; categoría ${name(cat.from, '—')} → ${name(cat.to, '—')}.`;
    }
    case 'merged':
      return str(d.intoReference) ? `Se unió al caso ${str(d.intoReference)} (es el mismo).` : str(d.fromReference) ? `Se le unió el caso ${str(d.fromReference)} (es el mismo).` : 'Unión de casos.';
    case 'support':
      return d.automatic ? 'Llegó otro reporte del mismo problema en el mismo lugar y se sumó solo.' : 'Otra persona se sumó a este reporte.';
    case 'citizen_message':
      return 'La persona agregó información.';
    case 'citizen_confirmed':
      return 'La persona confirmó que se resolvió.';
    case 'citizen_not_resolved':
      return 'La persona dice que no se resolvió.';
    case 'redacted': {
      const field = str(d.field) as RedactField | null;
      if (field) return `Se retiró un dato: ${(REDACT_FIELD_LABEL[field] ?? field).toLowerCase()}.`;
      if (d.message) return 'Se retiró el texto de un mensaje.';
      if (d.attachment) return 'Se retiró un archivo.';
      return 'Se retiró un dato.';
    }
    case 'spam':
      return 'Marcada como spam («No procede»).';
    case 'attended_published':
      return 'Se publicó en «Casos atendidos».';
    case 'attended_withdrawn':
      return 'Se retiró de «Casos atendidos».';
    case 'contact_erased':
      return 'Se borró el contacto de la persona.';
    case 'evidence':
      return d.shared ? 'Evidencia agregada (la ve la persona).' : 'Evidencia agregada (solo el equipo).';
    default:
      return e.kind;
  }
}

export function Timeline({ detail }: { detail: CaseDetail }) {
  const entries: Entry[] = [
    ...detail.events.map((e): Entry => ({ at: e.at, key: `e-${e.id}`, kind: 'event', e })),
    ...detail.messages.map((m): Entry => ({ at: m.at, key: `m-${m.id}`, kind: 'message', m })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || (a.kind === 'message' ? -1 : 1));
  return (
    <Card solid>
      <CardHeader title="Historial" subtitle="Todo lo que pasó, con quién y cuándo. Nada se borra." />
      <ol className="flex flex-col gap-3 p-4" aria-label="Historial del caso">
        {entries.map((x) =>
          x.kind === 'message' ? <MessageItem key={x.key} m={x.m} /> : (
            <li key={x.key} className="flex gap-3 text-[15px]">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-muted" aria-hidden />
              <div className="min-w-0">
                <p className="[overflow-wrap:anywhere]">{eventText(x.e, detail.names)}</p>
                {x.e.reason ? <p className="mt-0.5 text-sm text-text-2 [overflow-wrap:anywhere]">Motivo (interno): {x.e.reason}</p> : null}
                <p className="text-xs text-muted">
                  {who(x.e)} · {fmtDateTime(x.e.at)}
                </p>
              </div>
            </li>
          ),
        )}
      </ol>
    </Card>
  );
}

function MessageItem({ m }: { m: CaseMessage }) {
  const internal = m.kind === 'internal_note';
  const citizen = m.kind === 'citizen_message';
  return (
    <li
      className={cn(
        'rounded-[var(--radius-control)] border p-3 text-[15px]',
        internal ? 'border-warn/40 bg-warn-soft' : citizen ? 'border-info/30 bg-info-soft' : 'border-accent/30 bg-accent-soft',
      )}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {internal ? <Lock className="h-4 w-4" aria-hidden /> : <MessageSquare className="h-4 w-4" aria-hidden />}
        {MESSAGE_LABEL[m.kind]}
        <span className="font-normal text-text-2">{internal ? '· no la ve la persona' : citizen ? '' : '· la ve la persona'}</span>
      </p>
      <p className={cn('mt-1 whitespace-pre-line [overflow-wrap:anywhere]', m.redacted && 'italic text-text-2')}>{m.body}</p>
      <p className="mt-1 text-xs text-text-2">
        {citizen ? 'La persona' : (m.authorName ?? 'El equipo')} · {fmtDateTime(m.at)}
      </p>
    </li>
  );
}
