'use client';

import { Input, Select, Textarea } from '@/components/ui/field';
import { MARK, type Mark } from '@/lib/data/ficha-labels';
import { marksOf, type FieldDef } from '@/lib/domain/ficha-fields';
import { cn } from '@/lib/cn';

// One field of a ficha: its control and, beside the label, two toggles «No aplica» and «Por confirmar» (§4.1:
// «cada uno admite No aplica o Por confirmar»). Marking disables and empties the control; what was typed stays in
// the form, so unmarking brings it back. 44 px targets.
export function FichaField({
  def,
  value,
  mark,
  onChange,
  onMark,
  municipalities = [],
  parishes,
  idPrefix,
}: {
  def: FieldDef;
  value: string;
  mark?: Mark;
  onChange: (v: string) => void;
  onMark: (m: Mark | undefined) => void;
  municipalities?: string[];
  parishes?: { strict: boolean; options: string[] };
  idPrefix: string;
}) {
  const id = `${idPrefix}-${def.key}`;
  const hintId = def.hint ? `${id}-hint` : undefined;
  const marks = marksOf(def);
  const marked = !!mark;
  const shown = marked ? '' : value;
  const common = { id, disabled: marked, 'aria-describedby': hintId, required: def.required } as const;
  const set = (e: { target: { value: string } }) => onChange(e.target.value);

  let control: React.ReactNode;
  switch (def.type) {
    case 'long':
      control = <Textarea {...common} rows={3} maxLength={def.max} value={shown} onChange={set} />;
      break;
    case 'int':
    case 'pct':
      control = <Input {...common} inputMode="numeric" value={shown} onChange={set} placeholder={def.type === 'pct' ? '0 a 100' : undefined} />;
      break;
    case 'date':
      control = <Input {...common} type="date" value={shown} onChange={set} />;
      break;
    case 'datetime':
      control = <Input {...common} type="datetime-local" value={shown} onChange={set} />;
      break;
    case 'phone':
      control = <Input {...common} type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={shown} onChange={set} />;
      break;
    case 'url':
      control = <Input {...common} type="url" inputMode="url" placeholder="https://" maxLength={def.max} value={shown} onChange={set} />;
      break;
    case 'choice':
      control = (
        <Select {...common} value={shown} onChange={set}>
          <option value="">Elige…</option>
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>{def.optionLabel?.[o] ?? o}</option>
          ))}
        </Select>
      );
      break;
    case 'municipality':
      control = (
        <Select {...common} value={shown} onChange={set}>
          <option value="">Elige el municipio…</option>
          {municipalities.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {value && !municipalities.includes(value) ? <option value={value}>{value}</option> : null}
        </Select>
      );
      break;
    case 'parish':
      control = parishes?.strict ? (
        <Select {...common} value={shown} onChange={set}>
          <option value="">Elige la parroquia…</option>
          {parishes.options.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      ) : (
        <>
          <Input {...common} list={`${id}-list`} maxLength={def.max} value={shown} onChange={set} autoComplete="off" />
          <datalist id={`${id}-list`}>
            {(parishes?.options ?? []).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </>
      );
      break;
    default:
      control = <Input {...common} maxLength={def.max} value={shown} onChange={set} />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-semibold text-text">
          {def.label}
          {def.required ? <span className="text-text-2"> (obligatorio)</span> : null}
        </label>
        {marks.length ? (
          <div role="group" aria-label={`Otra respuesta para «${def.label}»`} className="flex flex-wrap gap-1.5">
            {marks.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mark === m}
                onClick={() => onMark(mark === m ? undefined : m)}
                className={cn(
                  'min-h-11 rounded-full border px-3 text-sm font-semibold',
                  mark === m
                    ? m === 'to_confirm'
                      ? 'border-warn bg-warn-soft text-warn'
                      : 'border-text-2 bg-surface-2 text-text'
                    : 'border-border bg-surface text-text-2 hover:bg-surface-2',
                )}
              >
                {MARK[m].label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {control}
      {def.hint ? <p id={hintId} className="text-sm text-text-2">{def.hint}</p> : null}
    </div>
  );
}
