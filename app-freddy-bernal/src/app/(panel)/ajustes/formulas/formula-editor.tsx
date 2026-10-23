'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { saveFormula } from '@/lib/actions/settings';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

type F = { id?: string; code: string; name: string; description: string; steps: { key: string; label: string; hint: string }[]; active: boolean };

export function FormulaEditor({ rows }: { rows: F[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((r) => <One key={r.id} initial={r} />)}
      <One initial={{ code: '', name: '', description: '', steps: [{ key: 'paso_1', label: 'Paso 1', hint: '' }], active: true }} isNew />
    </div>
  );
}

function One({ initial, isNew }: { initial: F; isNew?: boolean }) {
  const { run, pending } = useAction();
  const [f, setF] = useState(initial);
  return (
    <Card>
      <CardHeader title={isNew ? 'Nueva fórmula' : f.name} />
      <CardBody className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Código" htmlFor={`c-${f.id ?? 'n'}`}><Input id={`c-${f.id ?? 'n'}`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Nombre" htmlFor={`n-${f.id ?? 'n'}`} className="col-span-2"><Input id={`n-${f.id ?? 'n'}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        </div>
        <Field label="Para qué sirve" htmlFor={`d-${f.id ?? 'n'}`}><Input id={`d-${f.id ?? 'n'}`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <p className="label-caps">Pasos</p>
        {f.steps.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label="Paso" htmlFor={`l-${f.id ?? 'n'}-${i}`} className="w-1/3"><Input id={`l-${f.id ?? 'n'}-${i}`} value={s.label} onChange={(e) => setF({ ...f, steps: f.steps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></Field>
            <Field label="Indicación" htmlFor={`h-${f.id ?? 'n'}-${i}`} className="flex-1"><Input id={`h-${f.id ?? 'n'}-${i}`} value={s.hint} onChange={(e) => setF({ ...f, steps: f.steps.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)) })} /></Field>
            <Button variant="ghost" size="icon" aria-label="Quitar paso" onClick={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setF({ ...f, steps: [...f.steps, { key: `paso_${f.steps.length + 1}`, label: '', hint: '' }] })}><Plus className="h-4 w-4" aria-hidden /> Agregar paso</Button>
        {!isNew ? (
          <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5 accent-accent" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activa</label>
        ) : null}
        <Button disabled={pending} onClick={() => run(() => saveFormula({ ...f, steps: f.steps.map((s, i) => ({ ...s, key: s.key.replace(/[^a-z_]/g, '') || `paso_${i + 1}` })) }), { success: 'Fórmula guardada.' })}>Guardar</Button>
      </CardBody>
    </Card>
  );
}
