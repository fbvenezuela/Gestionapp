'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPiece } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { CategorySelect } from '@/components/ui/category-select';
import type { CategoryOption } from '@/lib/data/common';
import { FORMAT, FORMATS, type Format, type Month } from '@/lib/domain/redes';
import { cn } from '@/lib/cn';

type EventOption = { id: string; title: string; category_id: string | null; pieceTitle: string };

// The piece's format decides its section and its fields (D-61): chosen here once, with its help, as six big buttons
// (radio buttons underneath: arrows move between them). The month is the open one unless the person picks another.
export function NewPieceForm({ categories, events, eventId, months, monthId, format }: {
  categories: CategoryOption[]; events: EventOption[]; eventId: string; months: Month[]; monthId: string; format: Format;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const ev = events.find((e) => e.id === eventId);
  const [f, setF] = useState({ eventId, format, monthId, title: ev?.pieceTitle ?? '', categoryId: ev?.category_id ?? '' });
  return (
    <Card>
      <CardBody>
        <form
          className="grid min-w-0 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createPiece(f), { refresh: false, onOk: (r) => r.ok && router.push(`/piezas/${r.data!.id}`) });
          }}
        >
          <Field label="Evento" htmlFor="pe" className="sm:col-span-2">
            <Select id="pe" value={f.eventId} onChange={(e) => {
              const x = events.find((y) => y.id === e.target.value);
              setF({ ...f, eventId: e.target.value, title: f.title || x?.pieceTitle || '', categoryId: f.categoryId || x?.category_id || '' });
            }}>
              <option value="">Sin evento</option>
              {events.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          </Field>
          <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-semibold">Formato</legend>
            <p className="-mt-1 text-sm text-text-2">Cada formato tiene su sección en Redes y sus campos.</p>
            <div className="grid min-w-0 grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-3">
              {FORMATS.map((x) => {
                const on = f.format === x;
                return (
                  <label
                    key={x}
                    className={cn(
                      'flex min-h-16 min-w-0 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                      on ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
                    )}
                  >
                    <input type="radio" name="formato" value={x} checked={on} onChange={() => setF({ ...f, format: x })} className="mt-1 h-5 w-5 shrink-0 accent-accent" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{FORMAT[x].label}</span>
                      <span className="block text-sm text-text-2">{FORMAT[x].hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {months.length ? (
            <Field label="Mes" htmlFor="pm" hint="El mes de contenido donde va a vivir. Se puede mover después.">
              <Select id="pm" value={f.monthId} onChange={(e) => setF({ ...f, monthId: e.target.value })}>
                {months.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field label="Categoría" htmlFor="pc">
            <CategorySelect id="pc" categories={categories} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} />
          </Field>
          <Field label="Título" htmlFor="pt" className="sm:col-span-2" hint="Sin fecha ni hora: Redes lo lee.">
            <Input id="pt" required minLength={3} maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">Crear pieza</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
