'use client';

import { useState } from 'react';
import { saveNetworkSpec } from '@/lib/actions/settings';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';

const FIELDS: [string, string][] = [
  ['min_duration_s', 'Duración mínima (s)'], ['max_duration_s', 'Duración máxima (s)'], ['min_width', 'Ancho mínimo (px)'], ['max_width', 'Ancho máximo (px)'],
  ['min_height', 'Alto mínimo (px)'], ['max_size_mb', 'Peso máximo (MB)'], ['min_fps', 'Cuadros/s mínimo'], ['max_fps', 'Cuadros/s máximo'],
];

type Row = { network: string; label: string; formats: Record<string, Record<string, unknown>>; copy_max_chars: number; notes: string; source_url: string; verified_on: string | Date | null };

export function SpecEditor({ row }: { row: Row }) {
  const { run, pending } = useAction();
  const [formats, setFormats] = useState(row.formats);
  const [max, setMax] = useState(row.copy_max_chars);
  const set = (fmt: string, k: string, v: string) => setFormats({ ...formats, [fmt]: { ...formats[fmt], [k]: v === '' ? undefined : Number(v) } });
  return (
    <Card>
      <CardHeader
        title={row.label}
        subtitle={row.notes}
        action={row.verified_on ? <Chip tone="ok">Verificado {new Date(row.verified_on).toISOString().slice(0, 10)}</Chip> : <Chip tone="warn">Verificar</Chip>}
      />
      <CardBody className="flex flex-col gap-4">
        <a href={row.source_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent-ink">Documentación de {row.label}</a>
        <Field label="Máximo de caracteres del copy" htmlFor={`mx-${row.network}`}><Input id={`mx-${row.network}`} type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} className="max-w-40" /></Field>
        {Object.entries(formats).map(([fmt, rule]) => (
          <fieldset key={fmt} className="rounded-[var(--radius-control)] border border-border p-3">
            <legend className="px-1 font-semibold">{fmt} {Array.isArray(rule.aspects) ? <span className="text-sm font-normal text-text-2">· {(rule.aspects as string[]).join(', ')}</span> : null}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FIELDS.map(([k, label]) => (
                <Field key={k} label={label} htmlFor={`${row.network}-${fmt}-${k}`}>
                  <Input id={`${row.network}-${fmt}-${k}`} type="number" step="any" value={rule[k] === undefined ? '' : String(rule[k])} onChange={(e) => set(fmt, k, e.target.value)} />
                </Field>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => run(() => saveNetworkSpec({ network: row.network, formats, copyMaxChars: max, notes: row.notes }), { success: 'Guardado.' })}>Guardar</Button>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => saveNetworkSpec({ network: row.network, formats, copyMaxChars: max, notes: row.notes, verified: true }), { success: 'Guardado y marcado como verificado hoy.' })}>Guardar y marcar verificado</Button>
        </div>
      </CardBody>
    </Card>
  );
}
