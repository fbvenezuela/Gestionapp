'use client';

import { useState } from 'react';
import { DateTime } from 'luxon';
import { CheckCircle2, XCircle } from 'lucide-react';
import { assignCamera, bossDecide, markDone, setWorkStatus, updateBrief, updateEvent, updateSchedule } from '@/lib/actions/events';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CategorySelect } from '@/components/ui/category-select';
import type { CategoryOption } from '@/lib/data/common';
import type { EventFull } from '@/lib/data/events';
import { WORK_STATUS } from '@/lib/data/labels';
import { cn } from '@/lib/cn';
import { TZ } from '@/lib/time';

export function BossPanel({ id, priority, decision }: { id: string; priority: number | null; decision: string }) {
  const { run, pending } = useAction();
  const [p, setP] = useState<number | null>(priority);
  return (
    <Card className="mb-4">
      <CardHeader title="Tu decisión" subtitle="Califica de 1 a 10 qué tan importante es y acepta o rechaza." />
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Importancia de 1 a 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={p === n}
              onClick={() => setP(n)}
              className={cn('min-h-12 rounded-[var(--radius-control)] border text-lg font-bold', p === n ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface')}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" disabled={pending} onClick={() => run(() => bossDecide({ id, priority: p, decision: 'accepted' }), { success: 'Evento aceptado.' })} variant={decision === 'accepted' ? 'primary' : 'secondary'}>
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Aceptar
          </Button>
          <Button size="lg" disabled={pending} variant="danger" onClick={() => confirm('¿Rechazar este evento?') && run(() => bossDecide({ id, priority: p, decision: 'rejected' }), { success: 'Evento rechazado.' })}>
            <XCircle className="h-5 w-5" aria-hidden /> Rechazar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function MarkDone({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => markDone({ id }), { success: 'Marcado como realizado. Su material ya aparece en el registro por día.' })}>
      Marcar realizado
    </Button>
  );
}

export function ScheduleEditor({ id, schedule }: { id: string; schedule: NonNullable<EventFull['schedule']> }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const s = DateTime.fromJSDate(new Date(schedule.starts_at)).setZone(TZ);
  const e = DateTime.fromJSDate(new Date(schedule.ends_at)).setZone(TZ);
  const [f, setF] = useState({
    date: s.toISODate()!, time: s.toFormat('HH:mm'), durationMin: String(Math.round(e.diff(s, 'minutes').minutes)),
    exactAddress: schedule.exact_address, directions: schedule.directions, siteContacts: schedule.site_contacts,
  });
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Fecha, hora y lugar" trigger={<Button variant="secondary" size="sm">Cambiar fecha o lugar</Button>}>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); run(() => updateSchedule({ id, ...f }), { success: 'Guardado.', onOk: () => setOpen(false) }); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" htmlFor="sd"><Input id="sd" type="date" value={f.date} onChange={set('date')} required /></Field>
          <Field label="Hora" htmlFor="st"><Input id="st" type="time" value={f.time} onChange={set('time')} required /></Field>
        </div>
        <Field label="Duración (minutos)" htmlFor="sdur"><Input id="sdur" type="number" min={15} step={15} value={f.durationMin} onChange={set('durationMin')} /></Field>
        <Field label="Dirección exacta" htmlFor="sa"><Input id="sa" value={f.exactAddress} onChange={set('exactAddress')} /></Field>
        <Field label="Cómo se llega" htmlFor="sdi"><Textarea id="sdi" rows={2} value={f.directions} onChange={set('directions')} /></Field>
        <Field label="Contactos del sitio" htmlFor="sc"><Textarea id="sc" rows={2} value={f.siteContacts} onChange={set('siteContacts')} /></Field>
        <Button type="submit" disabled={pending}>Guardar</Button>
      </form>
    </Sheet>
  );
}

export function BriefEditor({ id, brief }: { id: string; brief: EventFull['brief'] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    workDescription: brief?.work_description ?? '', ledBy: brief?.led_by ?? '', inCharge: brief?.in_charge ?? '',
    achievements: brief?.achievements ?? '', keyFacts: brief?.key_facts ?? '', protocol: brief?.protocol ?? '', notes: brief?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Ficha técnica" trigger={<Button variant="secondary" size="sm">Editar</Button>}>
      <form className="flex flex-col gap-3" onSubmit={(ev) => { ev.preventDefault(); run(() => updateBrief({ id, ...f }), { success: 'Ficha guardada.', onOk: () => setOpen(false) }); }}>
        <Field label="De qué es la obra o el acto" htmlFor="bw"><Textarea id="bw" rows={2} value={f.workDescription} onChange={set('workDescription')} /></Field>
        <Field label="Quién la dirige" htmlFor="bl"><Input id="bl" value={f.ledBy} onChange={set('ledBy')} /></Field>
        <Field label="Encargado" htmlFor="bi"><Input id="bi" value={f.inCharge} onChange={set('inCharge')} /></Field>
        <Field label="Qué se está logrando" htmlFor="ba"><Textarea id="ba" rows={2} value={f.achievements} onChange={set('achievements')} /></Field>
        <Field label="Datos y cifras (con su fuente)" htmlFor="bk"><Textarea id="bk" rows={3} value={f.keyFacts} onChange={set('keyFacts')} /></Field>
        <Field label="Protocolo" htmlFor="bp"><Textarea id="bp" rows={2} value={f.protocol} onChange={set('protocol')} /></Field>
        <Field label="Notas" htmlFor="bn"><Textarea id="bn" rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <Button type="submit" disabled={pending}>Guardar ficha</Button>
      </form>
    </Sheet>
  );
}

export function EventEditor({ ev, categories, municipalities }: { ev: EventFull; categories: CategoryOption[]; municipalities: string[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: ev.title, placeName: ev.place_name, municipality: ev.municipality, summary: ev.summary, categoryId: ev.category_id ?? '', urgency: String(ev.urgency) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Datos del evento" trigger={<Button variant="secondary">Editar datos del evento</Button>}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => updateEvent({ id: ev.id, ...f }), { success: 'Guardado.', onOk: () => setOpen(false) }); }}>
        <Field label="Título" htmlFor="et"><Input id="et" value={f.title} onChange={set('title')} maxLength={140} required /></Field>
        <Field label="A dónde se va" htmlFor="ep"><Input id="ep" value={f.placeName} onChange={set('placeName')} /></Field>
        <Field label="Municipio" htmlFor="em">
          <Select id="em" value={f.municipality} onChange={set('municipality')}>
            <option value="">Elegir…</option>
            {municipalities.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="De qué se trata" htmlFor="es"><Textarea id="es" rows={2} value={f.summary} onChange={set('summary')} /></Field>
        <Field label="Categoría" htmlFor="ec"><CategorySelect id="ec" categories={categories} value={f.categoryId} onChange={set('categoryId')} /></Field>
        <Field label="Prioridad para el equipo" htmlFor="eu">
          <Select id="eu" value={f.urgency} onChange={set('urgency')}>
            <option value="1">Urgente</option><option value="2">Normal</option><option value="3">Puede esperar</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>Guardar</Button>
      </form>
    </Sheet>
  );
}

export function WorkStatusSelect({ id, status }: { id: string; status: string }) {
  const { run, pending } = useAction();
  return (
    <Card>
      <CardBody>
        <Field label="¿En qué va?" htmlFor="ws">
          <Select id="ws" value={status} disabled={pending} onChange={(e) => run(() => setWorkStatus({ id, status: e.target.value }), { success: 'Actualizado.' })}>
            {Object.entries(WORK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
      </CardBody>
    </Card>
  );
}

export function CameraAssign({ id, assigned, people }: { id: string; assigned: string[]; people: { id: string; full_name: string }[] }) {
  const { run, pending } = useAction();
  return (
    <ul className="flex flex-col gap-1">
      {people.map((p) => (
        <li key={p.id}>
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={assigned.includes(p.id)} disabled={pending} onChange={(e) => run(() => assignCamera({ id, userId: p.id, on: e.target.checked }))} />
            {p.full_name}
          </label>
        </li>
      ))}
    </ul>
  );
}
