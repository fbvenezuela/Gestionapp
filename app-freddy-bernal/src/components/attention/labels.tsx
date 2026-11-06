import { Chip } from '@/components/ui/chip';
import {
  PRIORITY_TONE,
  REQUEST_PRIORITY_LABEL,
  REQUEST_STATE_LABEL,
  REQUEST_TYPE_LABEL,
  STATE_TONE,
  type RequestPriority,
  type RequestState,
  type RequestType,
} from '@/lib/domain/attention';

// The small labels of the attention desk (state, priority, kind, due date, file check), always with words, never by
// colour alone (the chip's dot is decoration).

export function StateChip({ state }: { state: RequestState }) {
  return <Chip tone={STATE_TONE[state]}>{REQUEST_STATE_LABEL[state]}</Chip>;
}

export function PriorityChip({ priority, always }: { priority: RequestPriority; always?: boolean }) {
  if (!always && priority === 'normal') return null;
  return <Chip tone={PRIORITY_TONE[priority]}>Prioridad {REQUEST_PRIORITY_LABEL[priority].toLowerCase()}</Chip>;
}

export function TypeChip({ type }: { type: RequestType }) {
  return <Chip tone={type === 'denuncia' ? 'danger' : 'neutral'}>{REQUEST_TYPE_LABEL[type]}</Chip>;
}

export function OverdueChip({ overdue }: { overdue: boolean }) {
  return overdue ? <Chip tone="danger">Vencida</Chip> : null;
}

const SCAN: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  limpio: { label: 'Revisado: limpio', tone: 'ok' },
  sin_analizar: { label: 'Sin analizar', tone: 'warn' },
  cuarentena: { label: 'Revisándose', tone: 'neutral' },
  infectado: { label: 'Peligroso: no se abre', tone: 'danger' },
};

export function ScanChip({ status }: { status: string }) {
  const s = SCAN[status] ?? SCAN.cuarentena;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

/** The code of a request, in the monospaced face the team reads aloud and copies. */
export function Reference({ value, className = '' }: { value: string; className?: string }) {
  return <span className={`font-mono text-sm font-semibold tracking-wide ${className}`}>{value}</span>;
}
