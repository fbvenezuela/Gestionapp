'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { saveSetting } from '@/lib/actions/settings';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

export function ScheduleSettings({ slots, perDay, lowStock, collaborators }: { slots: { from: string; to: string }[]; perDay: { min: number; max: number }; lowStock: number; collaborators: string[] }) {
  const { run, pending } = useAction();
  const [s, setS] = useState(slots);
  const [p, setP] = useState(perDay);
  const [low, setLow] = useState(lowStock);
  const [col, setCol] = useState(collaborators.join(', '));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Franjas para tweets" subtitle="Cada tweet cae en una franja distinta, con minutos variados." />
        <CardBody className="flex flex-col gap-2">
          {s.map((x, i) => (
            // Two columns that may shrink below the time inputs' natural width, and the trash button apart: at 360 px
            // the row fits the card (it used to push the page 24 px sideways).
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Field label="Desde" htmlFor={`f${i}`} className="min-w-0"><Input id={`f${i}`} type="time" className="w-full min-w-0" value={x.from} onChange={(e) => setS(s.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)))} /></Field>
              <Field label="Hasta" htmlFor={`t${i}`} className="min-w-0"><Input id={`t${i}`} type="time" className="w-full min-w-0" value={x.to} onChange={(e) => setS(s.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)))} /></Field>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Quitar franja" onClick={() => setS(s.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setS([...s, { from: '12:00', to: '13:00' }])}><Plus className="h-4 w-4" aria-hidden /> Agregar franja</Button>
          <Button disabled={pending} onClick={() => run(() => saveSetting({ key: 'tweets.slots', value: s }), { success: 'Franjas guardadas.' })}>Guardar franjas</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Cantidad y avisos" />
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo por día" htmlFor="pmin"><Input id="pmin" type="number" min={1} max={12} value={p.min} onChange={(e) => setP({ ...p, min: Number(e.target.value) })} /></Field>
            <Field label="Máximo por día" htmlFor="pmax"><Input id="pmax" type="number" min={1} max={12} value={p.max} onChange={(e) => setP({ ...p, max: Number(e.target.value) })} /></Field>
          </div>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => saveSetting({ key: 'tweets.per_day', value: p }), { success: 'Guardado.' })}>Guardar cantidad</Button>
          <Field label="Avisar cuando queden estos días de tweets" htmlFor="low"><Input id="low" type="number" min={1} max={30} value={low} onChange={(e) => setLow(Number(e.target.value))} /></Field>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => saveSetting({ key: 'tweets.low_stock_days', value: low }), { success: 'Guardado.' })}>Guardar aviso</Button>
          <Field label="Colaboradores que se invitan siempre" htmlFor="col" hint="Separados por coma. Aparecen marcados en cada publicación."><Input id="col" value={col} onChange={(e) => setCol(e.target.value)} /></Field>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => saveSetting({ key: 'publishing.default_collaborators', value: col.split(',').map((x) => x.trim()).filter(Boolean) }), { success: 'Guardado.' })}>Guardar colaboradores</Button>
        </CardBody>
      </Card>
    </div>
  );
}
