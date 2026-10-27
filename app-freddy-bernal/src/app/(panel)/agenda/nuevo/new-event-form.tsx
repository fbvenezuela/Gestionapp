'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createEvent } from '@/lib/actions/events';
import { useAction } from '@/lib/hooks/use-action';
import { useDraft } from '@/lib/hooks/use-draft';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { CategorySelect } from '@/components/ui/category-select';
import type { CategoryOption } from '@/lib/data/common';
import { DICTATE_HINT } from '@/lib/data/labels';
import { ScheduleFields } from '@/components/agenda/schedule-fields';

const EMPTY = {
  title: '', placeName: '', municipality: '', summary: '', categoryId: '', urgency: '2', cameraUserId: '',
  date: '', time: '09:00', durationMin: '60', exactAddress: '', directions: '', siteContacts: '',
  workDescription: '', ledBy: '', inCharge: '', achievements: '', keyFacts: '', protocol: '', notes: '',
};

export function NewEventForm({ kind, categories, municipalities, cameras }: { kind: 'event' | 'obra_visit'; categories: CategoryOption[]; municipalities: string[]; cameras: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const { value: f, setValue, restored, clear } = useDraft(kind === 'obra_visit' ? 'new-obra-visit' : 'new-event', EMPTY);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setValue({ ...f, [k]: e.target.value });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createEvent({ ...f, kind, allowOverlap }), {
          success: 'Evento guardado.',
          refresh: false,
          onOk: (r) => {
            clear();
            if (r.ok) router.push(`/eventos/${r.data!.id}`);
          },
        });
      }}
    >
      {restored ? <p className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-sm text-info" role="status">Recuperamos lo que estabas escribiendo.</p> : null}
      <Card>
        <CardHeader title="El evento" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field
            label="Título"
            htmlFor="title"
            hint={kind === 'obra_visit' ? 'La obra que se visita, sin fecha ni hora. Ej.: Visita de obra: asfaltado del sector El Mirador' : 'Corto y claro, sin fecha ni hora. Ej.: Entrega de la cancha techada de El Mirador'}
            className="sm:col-span-2"
          >
            <Input id="title" required maxLength={140} className="min-h-14 text-lg" value={f.title} onChange={set('title')} />
          </Field>
          <Field label="A dónde se va" htmlFor="place" hint="El nombre del sitio (lo ve todo el equipo)">
            <Input id="place" value={f.placeName} onChange={set('placeName')} />
          </Field>
          <Field label="Municipio" htmlFor="mun">
            <Select id="mun" value={f.municipality} onChange={set('municipality')}>
              <option value="">Elegir…</option>
              {municipalities.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="De qué se trata" htmlFor="summary" className="sm:col-span-2">
            <Textarea id="summary" rows={2} value={f.summary} onChange={set('summary')} />
          </Field>
          <Field label="Categoría" htmlFor="cat">
            <CategorySelect id="cat" categories={categories} value={f.categoryId} onChange={set('categoryId')} />
          </Field>
          <Field label="Prioridad para el equipo" htmlFor="urg">
            <Select id="urg" value={f.urgency} onChange={set('urgency')}>
              <option value="1">Urgente</option>
              <option value="2">Normal</option>
              <option value="3">Puede esperar</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Fecha, hora y lugar exacto"
          subtitle="Privado: solo lo ven el jefe, el despacho, administración y quien graba el evento."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <ScheduleFields idPrefix="ne" values={f} onChange={(k, v) => setValue({ ...f, [k]: v })} />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[15px] sm:col-span-3">
            <input type="checkbox" className="h-5 w-5 accent-accent" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
            Guardar aunque choque con otro evento
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ficha técnica" subtitle="Con esto se arma el storyboard y los copies. Solo cifras confirmadas." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="De qué es la obra o el acto" htmlFor="work" hint={DICTATE_HINT} className="sm:col-span-2">
            <Textarea id="work" rows={2} value={f.workDescription} onChange={set('workDescription')} />
          </Field>
          <Field label="Quién la dirige" htmlFor="led">
            <Input id="led" value={f.ledBy} onChange={set('ledBy')} />
          </Field>
          <Field label="Quién es el encargado" htmlFor="charge">
            <Input id="charge" value={f.inCharge} onChange={set('inCharge')} />
          </Field>
          <Field label="Qué se está logrando" htmlFor="ach" hint={DICTATE_HINT} className="sm:col-span-2">
            <Textarea id="ach" rows={2} value={f.achievements} onChange={set('achievements')} />
          </Field>
          <Field label="Datos y cifras (con su fuente)" htmlFor="facts" hint="Una por línea. Ej.: 600 m² de techo (Dirección de obras). Los copies solo usan estas cifras." className="sm:col-span-2">
            <Textarea id="facts" rows={3} value={f.keyFacts} onChange={set('keyFacts')} />
          </Field>
          <Field label="Protocolo" htmlFor="prot" className="sm:col-span-2">
            <Textarea id="prot" rows={2} value={f.protocol} onChange={set('protocol')} />
          </Field>
          {cameras.length ? (
            <Field label="Quién graba" htmlFor="cam">
              <Select id="cam" value={f.cameraUserId} onChange={set('cameraUserId')}>
                <option value="">Sin asignar</option>
                {cameras.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </Select>
            </Field>
          ) : null}
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex gap-2 lg:bottom-4">
        <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={pending}>
          {pending ? 'Guardando…' : kind === 'obra_visit' ? 'Guardar visita de obra' : 'Guardar evento'}
        </Button>
      </div>
    </form>
  );
}
