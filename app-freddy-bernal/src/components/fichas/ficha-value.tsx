import { Chip } from '@/components/ui/chip';
import { MARK, type Mark } from '@/lib/data/ficha-labels';
import { isEmpty, type FieldDef } from '@/lib/domain/ficha-fields';
import { fmtDateTime, fmtDay } from '@/lib/time';
import { cn } from '@/lib/cn';

// How a field reads in the ficha: the value, or «No aplica» / «Por confirmar» (said on purpose), or «Falta este
// dato» (nobody answered it).
export function formatValue(def: FieldDef, value: unknown): string {
  if (isEmpty(value)) return '';
  switch (def.type) {
    case 'choice':
      return def.optionLabel?.[String(value)] ?? String(value);
    case 'date':
      return fmtDay(value as string | Date, "d 'de' LLLL 'de' yyyy");
    case 'datetime':
      return fmtDateTime(value as string | Date);
    case 'int':
      return Number(value).toLocaleString('es-VE');
    case 'pct':
      return `${value} %`;
    default:
      return String(value);
  }
}

export function FichaValue({ def, value, mark, wide, extra }: { def: FieldDef; value: unknown; mark?: Mark | string; wide?: boolean; extra?: React.ReactNode }) {
  const m = mark && mark in MARK ? MARK[mark as Mark] : null;
  const text = formatValue(def, value);
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="label-caps">{def.label}</dt>
      <dd className="mt-1 text-[15px] [overflow-wrap:anywhere]">
        {m ? (
          <Chip tone={m.tone}>{m.label}</Chip>
        ) : text ? (
          def.type === 'url' ? (
            <a href={text} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-ink underline">{text}</a>
          ) : def.type === 'phone' ? (
            <a href={`tel:${text.replace(/[^0-9+]/g, '')}`} className="font-semibold text-accent-ink underline">{text}</a>
          ) : (
            <span className="whitespace-pre-wrap">{text}</span>
          )
        ) : (
          <span className="text-muted">Falta este dato</span>
        )}
        {extra}
      </dd>
    </div>
  );
}
